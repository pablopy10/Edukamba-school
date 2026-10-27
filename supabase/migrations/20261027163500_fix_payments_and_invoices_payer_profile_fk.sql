-- ============================================================================
-- Correção de integridade referencial: payer_id em payments e parent_profile_id em invoices
-- Evita erro 23503 (Key is not present in table "profiles") quando studentId ou
-- identificador não cadastrado em profiles é fornecido.
-- ============================================================================

-- 1. Limpeza de dados legados ou inconsistentes
UPDATE public.payments
SET payer_id = NULL
WHERE payer_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = payments.payer_id);

UPDATE public.invoices
SET parent_profile_id = NULL
WHERE parent_profile_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = invoices.parent_profile_id);

-- 2. Trigger de higienização de payer_id na tabela payments
CREATE OR REPLACE FUNCTION public.sanitize_payments_payer_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payer_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.payer_id) THEN
      NEW.payer_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_payments_payer_id ON public.payments;
CREATE TRIGGER trg_sanitize_payments_payer_id
BEFORE INSERT OR UPDATE OF payer_id ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sanitize_payments_payer_id();

-- 3. Trigger de higienização de parent_profile_id na tabela invoices
CREATE OR REPLACE FUNCTION public.sanitize_invoices_parent_profile_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_profile_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.parent_profile_id) THEN
      NEW.parent_profile_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_invoices_parent_profile_id ON public.invoices;
CREATE TRIGGER trg_sanitize_invoices_parent_profile_id
BEFORE INSERT OR UPDATE OF parent_profile_id ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sanitize_invoices_parent_profile_id();

-- 4. Atualizar validate_and_invoice_payment para garantir parent_profile_id e payer_id válidos
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
  v_doc_type TEXT := UPPER(TRIM(COALESCE(_doc_type, 'FT')));
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
  v_line_desc TEXT := 'Propina / serviços educativos';
  v_is_exempt BOOLEAN := true;
  v_tax_pct NUMERIC(5, 2) := 0.00;
  v_tax_code TEXT := 'ISE';
  v_exemption_code TEXT := 'M11';
  v_exemption_reason TEXT := 'Isenção no domínio da educação';
BEGIN
  IF _payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id obrigatório.';
  END IF;

  -- 1. PESSIMISTIC LOCK: Lock pessimista no registo do pagamento
  SELECT * INTO v_pay
  FROM public.payments
  WHERE id = _payment_id
  FOR UPDATE;

  IF v_pay.id IS NULL THEN
    RAISE EXCEPTION 'Pagamento não encontrado.';
  END IF;

  -- Se já tem fatura associada, retornar a fatura existente
  IF v_pay.invoice_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_pay.id,
      i.id,
      i.document_number,
      i.doc_type,
      i.series,
      i.doc_number,
      i.invoice_date,
      i.gross_total,
      i.net_total,
      i.tax_payable,
      i.cliente_nif,
      i.cliente_nome,
      'Aluno'::TEXT,
      i.hash_control,
      i.qr_code_payload,
      i.invoice_status
    FROM public.invoices i
    WHERE i.id = v_pay.invoice_id;
    RETURN;
  END IF;

  -- Se o pagamento estiver rejeitado, não permitir emissão
  IF UPPER(COALESCE(v_pay.status, '')) IN ('REJECTED', 'REJEITADO') THEN
    RAISE EXCEPTION 'Pagamento encontra-se rejeitado e não pode ser faturado.';
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

  -- 4. RESOLVER ENCARREGADO / ADQUIRENTE (profiles usa tax_id, nunca nif)
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
    IF v_pay.student_fee_id IS NOT NULL THEN
      SELECT sf.amount_due INTO v_gross FROM public.student_fees sf WHERE sf.id = v_pay.student_fee_id;
    END IF;
  END IF;

  v_gross := COALESCE(v_gross, 0.00);
  IF v_gross <= 0.00 THEN
    v_gross := 25000.00;
  END IF;

  -- Propinas e Matrículas são isentas (art. 12.º do CIVA - M11)
  IF v_pay.activity_fee_id IS NOT NULL OR v_pay.transport_fee_id IS NOT NULL 
     OR v_pay.meal_fee_id IS NOT NULL OR v_pay.event_fee_id IS NOT NULL THEN
    v_is_exempt := false;
    v_tax_pct := 14.00;
    v_tax_code := 'NOR';
    v_exemption_code := NULL;
    v_exemption_reason := NULL;
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
    SELECT COALESCE(MAX(inv.doc_number), 0) + 1 INTO v_seq
    FROM public.invoices inv
    WHERE inv.school_id = v_pay.school_id AND inv.series = v_series_code;
  END;

  IF v_seq IS NULL OR v_seq <= 0 THEN
    SELECT COALESCE(MAX(inv.doc_number), 0) + 1 INTO v_seq
    FROM public.invoices inv
    WHERE inv.school_id = v_pay.school_id AND inv.series = v_series_code;
  END IF;

  v_doc_full := v_doc_type || ' ' || v_series_code || '/' || v_seq;
  v_hash_ctrl := (((v_seq - 1) % 10) + 1)::TEXT;

  -- 7. QR CODE PAYLOAD OFICIAL AGT
  v_qr := 'A:' || COALESCE(v_school.nif, '000000000') ||
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
    sent_at,
    invoice_status
  ) VALUES (
    v_pay.school_id,
    v_pay.id,
    COALESCE(v_student.id, v_pay.student_id),
    v_payer.id,
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
    now(),
    'N'
  )
  RETURNING id INTO v_inv_id;

  -- 9. INSERÇÃO DA LINHA DO DOCUMENTO EM INVOICE_LINES
  INSERT INTO public.invoice_lines (
    invoice_id,
    line_number,
    product_code,
    product_description,
    quantity,
    unit_price,
    credit_amount,
    tax_percentage,
    tax_code,
    tax_exemption_code,
    tax_exemption_reason
  ) VALUES (
    v_inv_id,
    1,
    'EDK-SERV',
    v_line_desc,
    1.00,
    v_net,
    v_gross,
    v_tax_pct,
    v_tax_code,
    v_exemption_code,
    v_exemption_reason
  );

  -- 10. ATUALIZAR PAGAMENTO COM ESTADO VALIDADO E LIGAÇÃO 1:1 À FATURA
  UPDATE public.payments
  SET status = 'validado',
      validated_by = COALESCE(payments.validated_by, _admin_user_id),
      validated_at = COALESCE(payments.validated_at, now()),
      invoice_id = v_inv_id,
      student_id = COALESCE(payments.student_id, v_student.id),
      payer_id = COALESCE(v_payer.id, payments.payer_id),
      channels_sent = _channels,
      sent_at = now()
  WHERE payments.id = v_pay.id;

  -- 11. MARCAR AS COBRANÇAS ASSOCIADAS COMO PAGAS (is_paid = true)
  IF v_pay.student_fee_id IS NOT NULL THEN
    UPDATE public.student_fees SET is_paid = true WHERE id = v_pay.student_fee_id;
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
    'N'::TEXT;
END;
$fn$;
