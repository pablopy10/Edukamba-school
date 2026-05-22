-- Faturação escolar (sequência, faturas AGT) + NIF em encarregados (profiles.tax_id)
-- Alunos já dispõem de students.tax_id (migração ERP).

-- ─── Encarregados: NIF ──────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_id TEXT;

COMMENT ON COLUMN public.profiles.tax_id IS 'NIF / contribuinte do perfil (encarregado quando role=PARENT).';

-- ─── Configuração da série por escola ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_config (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  series TEXT NOT NULL DEFAULT 'EDK',
  last_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_config_series_nonempty CHECK (trim(series) <> ''),
  CONSTRAINT billing_config_last_seq_nonneg CHECK (last_sequence >= 0),
  PRIMARY KEY (school_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_config_school ON public.billing_config(school_id);

ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School staff manage billing_config" ON public.billing_config;
CREATE POLICY "School staff manage billing_config"
ON public.billing_config FOR ALL TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role)
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role)
);

DROP TRIGGER IF EXISTS update_billing_config_updated_at ON public.billing_config;
CREATE TRIGGER update_billing_config_updated_at
BEFORE UPDATE ON public.billing_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Reserva atómica do próximo número FT SÉRIE/n ───────────────────────────
CREATE OR REPLACE FUNCTION public.billing_reserve_next_invoice(_school_id uuid)
RETURNS TABLE (serie text, seq integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  IF public.get_my_school() IS DISTINCT FROM _school_id
     AND public.get_auth_role()::text IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  IF public.get_auth_role() IS NULL
     OR public.get_auth_role()::text NOT IN ('ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'TREASURER') THEN
    RAISE EXCEPTION 'Sem permissão para emitir fatura';
  END IF;

  INSERT INTO public.billing_config (school_id, series, last_sequence)
  VALUES (_school_id, 'EDK', 0)
  ON CONFLICT (school_id) DO NOTHING;

  RETURN QUERY
  UPDATE public.billing_config bc
  SET
    last_sequence = bc.last_sequence + 1,
    updated_at = now()
  WHERE bc.school_id = _school_id
  RETURNING bc.series AS serie, bc.last_sequence AS seq;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_reserve_next_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_reserve_next_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.billing_reserve_next_invoice IS
  'Incrementa last_sequence e devolve (series, novo número). SECURITY DEFINER — validar papel no caller.';

-- ─── Faturas emitidas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  parent_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  series TEXT NOT NULL,
  doc_number INTEGER NOT NULL,
  document_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  invoice_issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gross_total NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AOA',
  exemption_code TEXT NOT NULL DEFAULT 'M11',
  exemption_reason TEXT NOT NULL DEFAULT 'Isenção no domínio da educação',
  line_description TEXT NOT NULL DEFAULT 'Propina / serviços educativos',
  agt_signing_plaintext TEXT,
  digital_signature_sha1_b64 TEXT,
  document_hash TEXT,
  previous_document_hash TEXT,
  hash_control TEXT,
  cliente_nome TEXT NOT NULL,
  cliente_nif TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT invoices_doc_number_positive CHECK (doc_number >= 1),
  CONSTRAINT invoices_series_nonempty CHECK (trim(series) <> ''),
  CONSTRAINT invoices_currency_upper CHECK (currency = upper(currency))
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_school_series_doc_uq
  ON public.invoices (school_id, series, doc_number);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_payment_id_uq
  ON public.invoices (payment_id)
  WHERE payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_school_issue_date ON public.invoices (school_id, invoice_date);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School staff full invoices" ON public.invoices;
CREATE POLICY "School staff full invoices"
ON public.invoices FOR ALL TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
);

-- Encarregado: lê faturas ligadas a pagamentos que ele submeteu
DROP POLICY IF EXISTS "Parents read own submitted payment invoices" ON public.invoices;
CREATE POLICY "Parents read own submitted payment invoices"
ON public.invoices FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payments py
    WHERE py.id = invoices.payment_id AND py.submitted_by = auth.uid()
  )
);

COMMENT ON TABLE public.invoices IS 'FT escolar (SAF-T / AGT Angola). Séries e hash em document_hash / previous_document_hash.';
COMMENT ON TABLE public.billing_config IS 'Série fiscal e último número por escola.';

-- ─── Cron SAF-T ───────────────────────────────────────────────────────────
-- Agenda mensalmente (dia 1) um POST autorizado ao Edge Function `saft-export-reminder`
-- com cabecalho: x-saft-cron-secret: <valor de SAFT_CRON_SECRET>
-- Dashboard → Edge Functions → saft-export-reminder → Cron Triggers ou pg_cron + http.
