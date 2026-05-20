-- Anulação directa de FT (estado A no SAF-T AO; sem nota de crédito nesta fase).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_status TEXT NOT NULL DEFAULT 'N',
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check CHECK (invoice_status IN ('N', 'A'));

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_cancelled_requires_reason;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_cancelled_requires_reason CHECK (
    invoice_status <> 'A'
    OR (cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) >= 6)
  );

COMMENT ON COLUMN public.invoices.invoice_status IS 'N = Normal, A = Anulada (SAF-T AO DocumentStatus/InvoiceStatus).';
COMMENT ON COLUMN public.invoices.cancellation_reason IS 'Motivo obrigatório quando invoice_status = A (auditoria AGT).';
COMMENT ON COLUMN public.invoices.cancelled_at IS 'Data/hora da anulação no sistema.';
COMMENT ON COLUMN public.invoices.cancelled_by IS 'Utilizador staff que anulou a fatura.';
