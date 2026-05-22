-- Corrige todas as faturas existentes de M10 para M11
UPDATE public.invoices
SET exemption_code = 'M11',
    exemption_reason = 'nos termos do Artigo 12.º do CIVA - Isenção no domínio da educação.'
WHERE exemption_code = 'M10';

-- Altera o default da coluna para M11
ALTER TABLE public.invoices
ALTER COLUMN exemption_code SET DEFAULT 'M11';

ALTER TABLE public.invoices
ALTER COLUMN exemption_reason SET DEFAULT 'nos termos do Artigo 12.º do CIVA - Isenção no domínio da educação.';
