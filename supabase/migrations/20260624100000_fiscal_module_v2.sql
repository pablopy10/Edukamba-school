-- ============================================================================
-- MÓDULO FISCAL V2 — Linhas de Documento, Conta Corrente, Tipos Expandidos
-- Compatível com SAF-T AO 1.01_01 e regras AGT Angola
-- ============================================================================

-- ─── 1. INVOICE_LINES: Linhas individuais de cada documento fiscal ──────────
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  product_code TEXT NOT NULL DEFAULT 'SERV-EDUC-01',
  product_description TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
  unit_of_measure TEXT NOT NULL DEFAULT 'UN',
  unit_price NUMERIC(14, 2) NOT NULL,
  credit_amount NUMERIC(14, 2) NOT NULL,
  debit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- IVA
  tax_type TEXT NOT NULL DEFAULT 'IVA',
  tax_country_region TEXT NOT NULL DEFAULT 'AO',
  tax_code TEXT NOT NULL DEFAULT 'ISE',
  tax_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  tax_exemption_code TEXT,
  tax_exemption_reason TEXT,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoice_lines_number_positive CHECK (line_number >= 1),
  CONSTRAINT invoice_lines_unit_price_positive CHECK (unit_price >= 0),
  CONSTRAINT invoice_lines_tax_valid CHECK (
    (tax_percentage > 0 AND tax_exemption_code IS NULL)
    OR (tax_percentage = 0 AND tax_exemption_code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_lines_invoice_line
  ON public.invoice_lines (invoice_id, line_number);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id
  ON public.invoice_lines (invoice_id);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage invoice lines" ON public.invoice_lines;
CREATE POLICY "Staff manage invoice lines"
ON public.invoice_lines FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.school_id = public.get_my_school()
      AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_lines.invoice_id
      AND i.school_id = public.get_my_school()
      AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
  )
);

DROP POLICY IF EXISTS "Parents read own invoice lines" ON public.invoice_lines;
CREATE POLICY "Parents read own invoice lines"
ON public.invoice_lines FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    JOIN public.payments py ON py.id = i.payment_id
    WHERE i.id = invoice_lines.invoice_id AND py.submitted_by = auth.uid()
  )
);

COMMENT ON TABLE public.invoice_lines IS 'Linhas individuais de documentos fiscais (SAF-T AO Line).';

-- ─── 2. EXPANDIR INVOICES: tipo de documento e referências ──────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'FT',
  ADD COLUMN IF NOT EXISTS net_total NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS tax_payable NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referenced_invoice_id UUID REFERENCES public.invoices(id),
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_date DATE;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_doc_type_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_doc_type_check
    CHECK (doc_type IN ('FT', 'FR', 'RC', 'NC', 'PP'));

COMMENT ON COLUMN public.invoices.doc_type IS 'FT=Fatura, FR=Fatura-Recibo, RC=Recibo, NC=Nota de Crédito, PP=Proforma';
COMMENT ON COLUMN public.invoices.referenced_invoice_id IS 'Para RC: referência à FT liquidada. Para NC: referência à FT retificada.';

-- ─── 3. CONTA CORRENTE (EXTRATO DO ALUNO) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  -- Movimento
  movement_type TEXT NOT NULL,
  description TEXT NOT NULL,
  debit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Metadata
  reference_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_statements_movement_check
    CHECK (movement_type IN ('FT', 'FR', 'RC', 'NC', 'AJUSTE')),
  CONSTRAINT account_statements_single_direction
    CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0) OR (debit_amount = 0 AND credit_amount = 0))
);

CREATE INDEX IF NOT EXISTS idx_account_statements_student
  ON public.account_statements (school_id, student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_statements_invoice
  ON public.account_statements (invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE public.account_statements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage account statements" ON public.account_statements;
CREATE POLICY "Staff manage account statements"
ON public.account_statements FOR ALL TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role)
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role)
);

DROP POLICY IF EXISTS "Parents read own account statements" ON public.account_statements;
CREATE POLICY "Parents read own account statements"
ON public.account_statements FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = account_statements.student_id AND s.parent_id = auth.uid()
  )
);

COMMENT ON TABLE public.account_statements IS 'Conta corrente do aluno: débitos (FT) e créditos (RC/NC).';

-- ─── 4. SÉRIES POR TIPO DE DOCUMENTO ────────────────────────────────────────
ALTER TABLE public.billing_config
  ADD COLUMN IF NOT EXISTS rc_sequence INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nc_sequence INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fr_sequence INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rc_series TEXT NOT NULL DEFAULT 'EDK',
  ADD COLUMN IF NOT EXISTS nc_series TEXT NOT NULL DEFAULT 'EDK',
  ADD COLUMN IF NOT EXISTS fr_series TEXT NOT NULL DEFAULT 'EDK';

-- ─── 5. RPC: Reservar número para qualquer tipo de documento ─────────────────
CREATE OR REPLACE FUNCTION public.billing_reserve_next_doc_number(
  _school_id UUID,
  _doc_type TEXT DEFAULT 'FT'
)
RETURNS TABLE (serie TEXT, seq INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  IF public.get_my_school() IS DISTINCT FROM _school_id
     AND public.get_auth_role()::text IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  IF public.get_auth_role() IS NULL
     OR public.get_auth_role()::text NOT IN ('ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'TREASURER', 'SECRETARY') THEN
    RAISE EXCEPTION 'Sem permissão para emitir documento fiscal';
  END IF;

  -- Garantir que existe config
  INSERT INTO public.billing_config (school_id, series, last_sequence)
  VALUES (_school_id, 'EDK', 0)
  ON CONFLICT (school_id) DO NOTHING;

  -- Advisory lock para evitar concorrência
  PERFORM pg_advisory_xact_lock(hashtext(_school_id::text || _doc_type));

  IF _doc_type = 'RC' THEN
    RETURN QUERY
    UPDATE public.billing_config bc
    SET rc_sequence = bc.rc_sequence + 1, updated_at = now()
    WHERE bc.school_id = _school_id
    RETURNING bc.rc_series AS serie, bc.rc_sequence AS seq;
  ELSIF _doc_type = 'NC' THEN
    RETURN QUERY
    UPDATE public.billing_config bc
    SET nc_sequence = bc.nc_sequence + 1, updated_at = now()
    WHERE bc.school_id = _school_id
    RETURNING bc.nc_series AS serie, bc.nc_sequence AS seq;
  ELSIF _doc_type = 'FR' THEN
    RETURN QUERY
    UPDATE public.billing_config bc
    SET fr_sequence = bc.fr_sequence + 1, updated_at = now()
    WHERE bc.school_id = _school_id
    RETURNING bc.fr_series AS serie, bc.fr_sequence AS seq;
  ELSE
    -- FT (default)
    RETURN QUERY
    UPDATE public.billing_config bc
    SET last_sequence = bc.last_sequence + 1, updated_at = now()
    WHERE bc.school_id = _school_id
    RETURNING bc.series AS serie, bc.last_sequence AS seq;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.billing_reserve_next_doc_number(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_reserve_next_doc_number(UUID, TEXT) TO authenticated;

-- ─── 6. FUNÇÃO: Calcular saldo actual do aluno ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_student_balance(
  _school_id UUID,
  _student_id UUID
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(SUM(debit_amount) - SUM(credit_amount), 0)
  FROM public.account_statements
  WHERE school_id = _school_id AND student_id = _student_id;
$fn$;

-- ─── 7. TRIGGER: Impedir DELETE/UPDATE em invoices (imutabilidade) ───────────
CREATE OR REPLACE FUNCTION public.prevent_invoice_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Permitir apenas UPDATE de campos de estado (anulação) e hash (resign)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.gross_total IS DISTINCT FROM NEW.gross_total
       OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date
       OR OLD.document_number IS DISTINCT FROM NEW.document_number
       OR OLD.doc_number IS DISTINCT FROM NEW.doc_number
       OR OLD.series IS DISTINCT FROM NEW.series
       OR OLD.cliente_nif IS DISTINCT FROM NEW.cliente_nif THEN
      RAISE EXCEPTION 'Documentos fiscais são imutáveis. Campos comerciais não podem ser alterados.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Documentos fiscais não podem ser eliminados (regra AGT).';
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS prevent_invoice_mutation_trigger ON public.invoices;
CREATE TRIGGER prevent_invoice_mutation_trigger
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_invoice_mutation();

-- ─── 8. CRON: Faturação recorrente mensal ────────────────────────────────────
-- Agenda no dia 1 de cada mês às 06:00 UTC — chama edge function via pg_net
-- (A edge function faz o bulk de FTs com assinatura RSA)
SELECT cron.schedule(
  'monthly_recurring_invoices',
  '0 6 1 * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/emit-recurring-invoices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
