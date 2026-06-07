-- ============================================================================
-- Integração Vendus Angola (Multi-Conta / Marca Branca)
-- Chave API por escola (schools) + ID cliente Vendus por encarregado (profiles)
-- ============================================================================

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS vendus_api_key TEXT;

COMMENT ON COLUMN public.schools.vendus_api_key IS
  'API Key Vendus da sub-conta da escola. Gerida pela plataforma Edukamba. Quando preenchida, emit-payment-receipt emite FR no Vendus.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vendus_client_id TEXT;

COMMENT ON COLUMN public.profiles.vendus_client_id IS
  'ID do cliente no Vendus (encarregado de educação), sincronizado na primeira fatura.';

ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS vendus_document_id TEXT,
  ADD COLUMN IF NOT EXISTS vendus_document_number TEXT,
  ADD COLUMN IF NOT EXISTS vendus_pdf_url TEXT;

COMMENT ON COLUMN public.payment_receipts.vendus_document_id IS 'ID do documento fiscal emitido no Vendus.';
COMMENT ON COLUMN public.payment_receipts.vendus_document_number IS 'Número oficial do documento Vendus (ex.: FR 01P2026/42).';
COMMENT ON COLUMN public.payment_receipts.vendus_pdf_url IS 'URL de referência do PDF Vendus (download via Edge Function com API Key).';

CREATE INDEX IF NOT EXISTS idx_profiles_vendus_client_id
  ON public.profiles (vendus_client_id)
  WHERE vendus_client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vendus_integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  http_status INTEGER,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendus_logs_school_created
  ON public.vendus_integration_logs (school_id, created_at DESC);

ALTER TABLE public.vendus_integration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read vendus logs" ON public.vendus_integration_logs;
CREATE POLICY "Staff read vendus logs"
ON public.vendus_integration_logs FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN (
    'ADMIN'::public.user_role,
    'SUPER_ADMIN'::public.user_role,
    'DIRECTOR'::public.user_role,
    'TREASURER'::public.user_role,
    'SECRETARY'::public.user_role
  )
);
