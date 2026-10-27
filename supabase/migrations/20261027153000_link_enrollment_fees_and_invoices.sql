-- ============================================================================
-- VÍNCULO DIRETO ENTRE TAXAS DE MATRÍCULA (ENROLLMENT_FEES) E FATURAS (INVOICES)
-- Permite que documentos fiscais gerados (FT a crédito ou FR pronto pagamento)
-- sejam imediatamente indexados e exibidos na coluna FT de Pagamentos em Matrículas.
-- ============================================================================

-- 1. Adicionar invoice_id a enrollment_fees
ALTER TABLE public.enrollment_fees
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_enrollment_fees_invoice_id
  ON public.enrollment_fees(invoice_id);

-- 2. Adicionar enrollment_fee_id a invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS enrollment_fee_id UUID REFERENCES public.enrollment_fees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_enrollment_fee_id
  ON public.invoices(enrollment_fee_id);

-- 3. Backfill de registros existentes via tabela payments
UPDATE public.invoices i
SET enrollment_fee_id = p.enrollment_fee_id
FROM public.payments p
WHERE i.payment_id = p.id
  AND p.enrollment_fee_id IS NOT NULL
  AND i.enrollment_fee_id IS NULL;

UPDATE public.enrollment_fees ef
SET invoice_id = p.invoice_id
FROM public.payments p
WHERE p.enrollment_fee_id = ef.id
  AND p.invoice_id IS NOT NULL
  AND ef.invoice_id IS NULL;
