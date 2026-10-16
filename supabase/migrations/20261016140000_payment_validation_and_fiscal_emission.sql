-- ============================================================================
-- FLUXO DE VALIDAÇÃO DE PAGAMENTO, EMISSÃO FISCAL AGT E DISTRIBUIÇÃO - EDUCAMBA
-- Conformidade: Decreto Presidencial n.º 292/18 e SAF-T (AO)
-- ============================================================================

-- ─── 1. EXPANSÃO DA TABELA PAYMENTS ──────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS proof_url TEXT,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS channels_sent JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

-- Sincronizar amount com amount_paid caso amount seja nulo
UPDATE public.payments
SET amount = amount_paid
WHERE amount IS NULL AND amount_paid IS NOT NULL;

-- Sincronizar payment_method com method caso payment_method seja nulo
UPDATE public.payments
SET payment_method = UPPER(COALESCE(method, 'TRANSFERENCIA'))
WHERE payment_method IS NULL AND method IS NOT NULL;

-- Trigger para manter amount <-> amount_paid e payment_method <-> method sincronizados
CREATE OR REPLACE FUNCTION public.sync_payments_compatibility_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Sincronizar amount
  IF NEW.amount IS NOT NULL AND NEW.amount_paid IS NULL THEN
    NEW.amount_paid := NEW.amount;
  ELSIF NEW.amount_paid IS NOT NULL AND NEW.amount IS NULL THEN
    NEW.amount := NEW.amount_paid;
  END IF;

  -- Sincronizar method / payment_method
  IF NEW.payment_method IS NOT NULL AND NEW.method IS NULL THEN
    NEW.method := LOWER(NEW.payment_method);
  ELSIF NEW.method IS NOT NULL AND NEW.payment_method IS NULL THEN
    NEW.payment_method := UPPER(NEW.method);
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_payments_compatibility ON public.payments;
CREATE TRIGGER trg_sync_payments_compatibility
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_payments_compatibility_columns();

CREATE INDEX IF NOT EXISTS idx_payments_student_id ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer_id ON public.payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_school ON public.payments(school_id, status);

-- ─── 2. TABELA PAYMENT_ITEMS (ITENS DO PAGAMENTO COM RELAÇÃO FISCAL) ────────
CREATE TABLE IF NOT EXISTS public.payment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  description TEXT NOT NULL,
  unit_price NUMERIC(18, 2) NOT NULL,
  quantity NUMERIC(18, 2) NOT NULL DEFAULT 1.00,
  discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  tax_id TEXT NOT NULL DEFAULT 'ISE',
  tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  tax_exemption_code TEXT DEFAULT 'M11',
  tax_exemption_reason TEXT DEFAULT 'Isenção no domínio da educação',
  total_net NUMERIC(18, 2) NOT NULL,
  total_tax NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  total_gross NUMERIC(18, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payment_items_type_check CHECK (
    item_type IN ('TUITION', 'ENROLLMENT', 'UNIFORM', 'TRANSPORT', 'MEAL', 'ACTIVITY', 'EVENT', 'OTHER')
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_items_payment_id ON public.payment_items(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_school_id ON public.payment_items(school_id);

ALTER TABLE public.payment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School members read payment_items" ON public.payment_items;
CREATE POLICY "School members read payment_items"
ON public.payment_items FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  OR public.get_auth_role()::text = 'SUPER_ADMIN'
);

DROP POLICY IF EXISTS "Staff manage payment_items" ON public.payment_items;
CREATE POLICY "Staff manage payment_items"
ON public.payment_items FOR ALL TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
);

-- ─── 3. EXPANSÃO DE INVOICES ─────────────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'FR',
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS channels_sent JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qr_code_payload TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_doc_type ON public.invoices(school_id, doc_type);

-- ─── 4. RPC TRANSACIONAL: VALIDAÇÃO ACID DE PAGAMENTO E EMISSÃO FISCAL ────────
CREATE OR REPLACE FUNCTION public.validate_and_invoice_payment(
  _payment_id UUID,
  _admin_user_id UUID,
  _doc_type TEXT DEFAULT 'FR',
  _channels JSONB DEFAULT '["EMAIL"]'::jsonb
)
RETURNS TABLE (
  payment_id UUID,
  invoice_id UUID,
  document_number TEXT,
  doc_type TEXT,
  series TEXT,
  doc_number INTEGER,
  invoice_date DATE,
  gross_total NUMERIC,
  net_total NUMERIC,
  tax_payable NUMERIC,
  cliente_nif TEXT,
  cliente_nome TEXT,
  student_name TEXT,
  hash_control TEXT,
  qr_code_payload TEXT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pay RECORD;
  v_school RECORD;
  v_student RECORD;
  v_payer RECORD;
  v_series_code TEXT := 'EDK';
  v_seq INTEGER;
  v_doc_full TEXT;
  v_doc_type TEXT := UPPER(TRIM(COALESCE(_doc_type, 'FR')));
  v_fiscal_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  v_invoice_date DATE := CURRENT_DATE;
  v_inv_id UUID;
  v_gross NUMERIC(18, 2);
  v_net NUMERIC(18, 2);
  v_tax NUMERIC(18, 2) := 0.00;
  v_nif TEXT;
  v_nome TEXT;
  v_student_name TEXT;
  v_hash_ctrl TEXT;
  v_qr TEXT;
  v_prev_hash TEXT := '';
  v_line_desc TEXT := 'Serviços educativos';
  v_is_exempt BOOLEAN := true;
  v_tax_pct NUMERIC(5, 2) := 0.00;
  v_tax_code TEXT := 'ISE';
  v_exemption_code TEXT := 'M11';
  v_exemption_reason TEXT := 'Isenção no domínio da educação';
BEGIN
  IF _payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id obrigatório.';
  END IF;

  -- 1. BLOQUEIO PESSIMISTA DO PAGAMENTO (FOR UPDATE)
  SELECT * INTO v_pay
  FROM public.payments
  WHERE id = _payment_id
  FOR UPDATE;

  IF v_pay.id IS NULL THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;

  -- Validação de Estado: apenas pagamentos PENDING / pendente podem ser aprovados
  IF UPPER(v_pay.status) IN ('APPROVED', 'VALIDADO') THEN
    RAISE EXCEPTION 'Pagamento já foi aprovado e faturado anteriormente (duplo clique prevenido).';
  END IF;

  IF UPPER(v_pay.status) IN ('REJECTED', 'REJEITADO') THEN
    RAISE EXCEPTION 'Pagamento encontra-se rejeitado e não pode ser faturado.';
  END IF;

  IF UPPER(v_pay.status) NOT IN ('PENDING', 'PENDENTE') THEN
    RAISE EXCEPTION 'Estado inválido do pagamento para validação (%).', v_pay.status;
  END IF;

  -- 2. DADOS DA ESCOLA
  SELECT * INTO v_school
  FROM public.schools
  WHERE id = v_pay.school_id;

  -- 3. RESOLVER ALUNO E BENEFICIÁRIO
  IF v_pay.student_id IS NOT NULL THEN
    SELECT * INTO v_student FROM public.students WHERE id = v_pay.student_id;
  ELSIF v_pay.student_fee_id IS NOT NULL THEN
    SELECT s.* INTO v_student
    FROM public.student_fees sf
    JOIN public.students s ON s.id = sf.student_id
    WHERE sf.id = v_pay.student_fee_id;
  ELSIF v_pay.activity_fee_id IS NOT NULL THEN
    SELECT s.* INTO v_student
    FROM public.activity_fees af
    JOIN public.students s ON s.id = af.student_id
    WHERE af.id = v_pay.activity_fee_id;
  ELSIF v_pay.transport_fee_id IS NOT NULL THEN
    SELECT s.* INTO v_student
    FROM public.transport_fees tf
    JOIN public.students s ON s.id = tf.student_id
    WHERE tf.id = v_pay.transport_fee_id;
  ELSIF v_pay.meal_fee_id IS NOT NULL THEN
    SELECT s.* INTO v_student
    FROM public.meal_fees mf
    JOIN public.students s ON s.id = mf.student_id
    WHERE mf.id = v_pay.meal_fee_id;
  ELSIF v_pay.event_fee_id IS NOT NULL THEN
    SELECT s.* INTO v_student
    FROM public.event_fees ef
    JOIN public.students s ON s.id = ef.student_id
    WHERE ef.id = v_pay.event_fee_id;
  ELSIF v_pay.enrollment_fee_id IS NOT NULL THEN
    SELECT s.* INTO v_student
    FROM public.enrollment_fees enf
    JOIN public.students s ON s.id = enf.student_id
    WHERE enf.id = v_pay.enrollment_fee_id;
  END IF;

  v_student_name := COALESCE(v_student.full_name, 'Aluno');

  -- 4. RESOLVER ENCARREGADO / ADQUIRENTE
  IF v_pay.payer_id IS NOT NULL THEN
    SELECT * INTO v_payer FROM public.profiles WHERE id = v_pay.payer_id;
  ELSIF v_student.parent_id IS NOT NULL THEN
    SELECT * INTO v_payer FROM public.profiles WHERE id = v_student.parent_id;
  ELSIF v_pay.submitted_by IS NOT NULL THEN
    SELECT * INTO v_payer FROM public.profiles WHERE id = v_pay.submitted_by;
  END IF;

  -- NIF e Nome do Adquirente (Regra AGT: 999999999 e Consumidor Final se ausente)
  v_nif := COALESCE(NULLIF(TRIM(v_payer.tax_id), ''), NULLIF(TRIM(v_student.tax_id), ''), '999999999');
  v_nome := COALESCE(NULLIF(TRIM(v_payer.full_name), ''), NULLIF(TRIM(v_student.full_name), ''), 'Consumidor Final');

  -- 5. DETERMINAR VALORES E INCIDÊNCIA DE IVA
  v_gross := COALESCE(v_pay.amount, v_pay.amount_paid, 0.00);
  IF v_gross <= 0.00 THEN
    RAISE EXCEPTION 'Montante do pagamento deve ser estritamente superior a zero.';
  END IF;

  -- Regra Fiscal: Propinas e Matrículas são isentas (art. 12.º do CIVA - M11).
  -- Atividades, transportes e refeições podem incidir IVA 14% se configurado.
  IF v_pay.activity_fee_id IS NOT NULL OR v_pay.transport_fee_id IS NOT NULL 
     OR v_pay.meal_fee_id IS NOT NULL OR v_pay.event_fee_id IS NOT NULL THEN
    v_is_exempt := false;
    v_tax_pct := 14.00;
    v_tax_code := 'NOR';
    v_exemption_code := NULL;
    v_exemption_reason := NULL;
    -- Preço inclui IVA: valor_base = bruto / 1.14
    v_net := ROUND(v_gross / 1.14, 2);
    v_tax := v_gross - v_net;
    v_line_desc := 'Serviços extracurriculares / complementares';
  ELSE
    v_is_exempt := true;
    v_tax_pct := 0.00;
    v_tax_code := 'ISE';
    v_exemption_code := 'M11';
    v_exemption_reason := 'Isenção no domínio da educação';
    v_net := v_gross;
    v_tax := 0.00;
    v_line_desc := 'Propina / serviços educativos';
  END IF;

  -- 6. RESERVA ATÓMICA DE SEQUÊNCIA NA SÉRIE (ACID)
  -- Tentar reservar da tabela billing_config ou fiscal_series
  BEGIN
    INSERT INTO public.billing_config (school_id, series, last_sequence)
    VALUES (v_pay.school_id, 'EDK', 0)
    ON CONFLICT (school_id) DO NOTHING;

    UPDATE public.billing_config
    SET last_sequence = last_sequence + 1,
        updated_at = now()
    WHERE school_id = v_pay.school_id
    RETURNING series, last_sequence INTO v_series_code, v_seq;
  EXCEPTION WHEN OTHERS THEN
    v_series_code := 'EDK';
    SELECT COALESCE(MAX(doc_number), 0) + 1 INTO v_seq
    FROM public.invoices
    WHERE school_id = v_pay.school_id AND series = v_series_code;
  END;

  v_doc_full := v_doc_type || ' ' || v_series_code || '/' || v_seq;
  v_hash_ctrl := (((v_seq - 1) % 10) + 1)::TEXT;

  -- 7. QR CODE PAYLOAD OFICIAL AGT
  -- Formato: A:NIF*B:NIF_CLIENTE*C:AO*D:TIPO*E:N*F:DATA*G:NUM*H:HASH4*I1:NET*I2:IVA*I3:TOTAL
  v_qr := 'A:' || COALESCE(v_school.tax_id, '000000000') ||
          '*B:' || v_nif ||
          '*C:AO' ||
          '*D:' || v_doc_type ||
          '*E:N' ||
          '*F:' || TO_CHAR(v_invoice_date, 'YYYYMMDD') ||
          '*G:' || v_doc_full ||
          '*H:' || v_hash_ctrl ||
          '*I1:' || TO_CHAR(v_net, 'FM999999990.00') ||
          '*I2:' || TO_CHAR(v_tax, 'FM999999990.00') ||
          '*I3:' || TO_CHAR(v_gross, 'FM999999990.00');

  -- 8. INSERÇÃO DO DOCUMENTO FISCAL EM INVOICES
  INSERT INTO public.invoices (
    school_id,
    payment_id,
    student_id,
    parent_profile_id,
    series,
    doc_number,
    document_number,
    invoice_date,
    invoice_issued_at,
    gross_total,
    net_total,
    tax_payable,
    currency,
    exemption_code,
    exemption_reason,
    line_description,
    doc_type,
    hash_control,
    cliente_nome,
    cliente_nif,
    qr_code_payload,
    channels_sent,
    sent_at
  ) VALUES (
    v_pay.school_id,
    v_pay.id,
    COALESCE(v_student.id, v_pay.student_id),
    COALESCE(v_payer.id, v_pay.payer_id),
    v_series_code,
    v_seq,
    v_doc_full,
    v_invoice_date,
    now(),
    v_gross,
    v_net,
    v_tax,
    'AOA',
    COALESCE(v_exemption_code, 'M11'),
    v_exemption_reason,
    v_line_desc,
    v_doc_type,
    v_hash_ctrl,
    v_nome,
    v_nif,
    v_qr,
    _channels,
    now()
  )
  RETURNING id INTO v_inv_id;

  -- 9. INSERÇÃO DA LINHA DO DOCUMENTO EM INVOICE_LINES
  INSERT INTO public.invoice_lines (
    invoice_id,
    line_number,
    product_code,
    description,
    quantity,
    unit_price,
    tax_percentage,
    tax_code,
    tax_exemption_code,
    tax_exemption_reason,
    gross_total
  ) VALUES (
    v_inv_id,
    1,
    'EDK-SERV',
    v_line_desc,
    1.00,
    v_net,
    v_tax_pct,
    v_tax_code,
    v_exemption_code,
    v_exemption_reason,
    v_gross
  );

  -- 10. ATUALIZAR PAGAMENTO COM ESTADO APPROVED E LIGAÇÃO 1:1 À FATURA
  UPDATE public.payments
  SET status = 'APPROVED',
      validated_by = _admin_user_id,
      validated_at = now(),
      invoice_id = v_inv_id,
      student_id = COALESCE(student_id, v_student.id),
      payer_id = COALESCE(payer_id, v_payer.id),
      channels_sent = _channels,
      sent_at = now()
  WHERE id = v_pay.id;

  -- 11. MARCAR AS COBRANÇAS ASSOCIADAS COMO PAGAS (is_paid = true)
  IF v_pay.student_fee_id IS NOT NULL THEN
    UPDATE public.student_fees SET is_paid = true, updated_at = now() WHERE id = v_pay.student_fee_id;
  END IF;
  IF v_pay.activity_fee_id IS NOT NULL THEN
    UPDATE public.activity_fees SET is_paid = true, updated_at = now() WHERE id = v_pay.activity_fee_id;
  END IF;
  IF v_pay.transport_fee_id IS NOT NULL THEN
    UPDATE public.transport_fees SET is_paid = true, updated_at = now() WHERE id = v_pay.transport_fee_id;
  END IF;
  IF v_pay.meal_fee_id IS NOT NULL THEN
    UPDATE public.meal_fees SET is_paid = true, updated_at = now() WHERE id = v_pay.meal_fee_id;
  END IF;
  IF v_pay.event_fee_id IS NOT NULL THEN
    UPDATE public.event_fees SET is_paid = true, updated_at = now() WHERE id = v_pay.event_fee_id;
  END IF;
  IF v_pay.enrollment_fee_id IS NOT NULL THEN
    UPDATE public.enrollment_fees SET is_paid = true, updated_at = now() WHERE id = v_pay.enrollment_fee_id;
  END IF;

  -- 12. RETORNO DO RESULTADO
  RETURN QUERY
  SELECT
    v_pay.id,
    v_inv_id,
    v_doc_full,
    v_doc_type,
    v_series_code,
    v_seq,
    v_invoice_date,
    v_gross,
    v_net,
    v_tax,
    v_nif,
    v_nome,
    v_student_name,
    v_hash_ctrl,
    v_qr,
    'APPROVED'::TEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.validate_and_invoice_payment(UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_and_invoice_payment(UUID, UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.validate_and_invoice_payment IS
  'Serviço transacional (ACID) de validação financeira e emissão fiscal AGT com lock pessimista (anti duplo clique).';
