-- Adiciona campo NIF à tabela de leads (10 dígitos Angola ou NULL)
ALTER TABLE public.saas_sales_leads
ADD COLUMN IF NOT EXISTS nif TEXT;

COMMENT ON COLUMN public.saas_sales_leads.nif IS 'NIF fiscal da organização (10 dígitos Angola). NULL = usar 999999999 (consumidor final AGT).';
