-- Coluna na proforma_invoices para marcar como convertida
ALTER TABLE public.proforma_invoices
ADD COLUMN IF NOT EXISTS converted_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.proforma_invoices.converted_invoice_id IS 'UUID da FT gerada a partir desta PP (NULL = ainda não convertida).';

-- Coluna na invoices para guardar a referência à PP original (OrderReferences AGT/SAF-T)
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS order_reference_pp TEXT;

COMMENT ON COLUMN public.invoices.order_reference_pp IS 'Número da Pró-Forma (PP) que originou esta fatura — tag <OrderReferences> no SAF-T.';
