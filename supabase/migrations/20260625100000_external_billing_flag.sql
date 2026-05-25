-- ============================================================================
-- Flag para escolas que usam software de faturação externo (terceiros)
-- Quando TRUE: não gera documentos fiscais, apenas comprovativo interno + webhook
-- ============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS usa_faturacao_externa BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.schools.usa_faturacao_externa IS
  'Se TRUE, o sistema não gera FT/FR fiscais. Gera apenas comprovativo interno e dispara webhook para sistema externo.';

-- Tabela para comprovativos internos (não fiscais)
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  payment_method TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  cliente_nome TEXT NOT NULL,
  cliente_nif TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_receipts_amount_positive CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_receipts_payment
  ON public.payment_receipts (payment_id);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_school_student
  ON public.payment_receipts (school_id, student_id, created_at DESC);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage payment receipts" ON public.payment_receipts;
CREATE POLICY "Staff manage payment receipts"
ON public.payment_receipts FOR ALL TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role, 'SECRETARY'::public.user_role)
);

DROP POLICY IF EXISTS "Parents read own payment receipts" ON public.payment_receipts;
CREATE POLICY "Parents read own payment receipts"
ON public.payment_receipts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payments py
    WHERE py.id = payment_receipts.payment_id AND py.submitted_by = auth.uid()
  )
);

-- Sequência para comprovativos internos
ALTER TABLE public.billing_config
  ADD COLUMN IF NOT EXISTS receipt_sequence INTEGER NOT NULL DEFAULT 0;

-- Webhook config por escola (URL + secret para notificar sistema externo)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS webhook_billing_url TEXT,
  ADD COLUMN IF NOT EXISTS webhook_billing_secret TEXT;

COMMENT ON COLUMN public.schools.webhook_billing_url IS 'URL do webhook para notificar sistema de faturação externo quando um pagamento é validado.';
COMMENT ON COLUMN public.schools.webhook_billing_secret IS 'Secret/token para autenticação do webhook de faturação.';
