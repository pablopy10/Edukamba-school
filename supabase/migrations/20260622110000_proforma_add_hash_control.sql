-- Adiciona hash_control à tabela proforma_invoices (4 chars do SHA-1 AGT)
ALTER TABLE public.proforma_invoices
ADD COLUMN IF NOT EXISTS hash_control TEXT;

COMMENT ON COLUMN public.proforma_invoices.hash_control IS 'Primeiros 4 caracteres (uppercase) do SHA-1 do plaintext AGT, gerado pela edge function sign-proforma.';
