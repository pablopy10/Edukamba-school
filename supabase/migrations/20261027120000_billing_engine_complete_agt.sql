-- ============================================================================
-- MOTOR FISCAL COMPLETO AGT — EDUKAMBA
-- Suporte às 6 tipologias fiscais: FR, FT, RC, NC, ND, PF
-- Conformidade: Decreto Presidencial n.º 292/18 e SAF-T (AO) 1.01_01
-- ============================================================================

-- ─── 1. EXPANSÃO DA TABELA INVOICES ───────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source_document_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_document_number TEXT,
  ADD COLUMN IF NOT EXISTS source_document_date DATE,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_invoices_source_document_id ON public.invoices(source_document_id);

-- ─── 2. SINCRONIZAÇÃO DE CAMPOS DE DOCUMENTO DE ORIGEM ────────────────────────
CREATE OR REPLACE FUNCTION public.sync_invoice_source_document_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Sincronizar doc_type <-> document_type
  IF NEW.document_type IS NOT NULL AND NEW.doc_type IS NULL THEN
    NEW.doc_type := NEW.document_type;
  ELSIF NEW.doc_type IS NOT NULL AND NEW.document_type IS NULL THEN
    NEW.document_type := NEW.doc_type;
  END IF;

  -- Sincronizar source_document_id <-> original_invoice_id <-> referenced_invoice_id
  IF NEW.source_document_id IS NOT NULL THEN
    IF NEW.original_invoice_id IS NULL THEN NEW.original_invoice_id := NEW.source_document_id; END IF;
    IF NEW.referenced_invoice_id IS NULL THEN NEW.referenced_invoice_id := NEW.source_document_id; END IF;
  ELSIF NEW.original_invoice_id IS NOT NULL THEN
    NEW.source_document_id := NEW.original_invoice_id;
    IF NEW.referenced_invoice_id IS NULL THEN NEW.referenced_invoice_id := NEW.original_invoice_id; END IF;
  ELSIF NEW.referenced_invoice_id IS NOT NULL THEN
    NEW.source_document_id := NEW.referenced_invoice_id;
    IF NEW.original_invoice_id IS NULL THEN NEW.original_invoice_id := NEW.referenced_invoice_id; END IF;
  END IF;

  -- Sincronizar source_document_number <-> original_invoice_number <-> original_document_number
  IF NEW.source_document_number IS NOT NULL THEN
    IF NEW.original_invoice_number IS NULL THEN NEW.original_invoice_number := NEW.source_document_number; END IF;
    IF NEW.original_document_number IS NULL THEN NEW.original_document_number := NEW.source_document_number; END IF;
  ELSIF NEW.original_invoice_number IS NOT NULL THEN
    NEW.source_document_number := NEW.original_invoice_number;
    IF NEW.original_document_number IS NULL THEN NEW.original_document_number := NEW.original_invoice_number; END IF;
  ELSIF NEW.original_document_number IS NOT NULL THEN
    NEW.source_document_number := NEW.original_document_number;
    IF NEW.original_invoice_number IS NULL THEN NEW.original_invoice_number := NEW.original_document_number; END IF;
  END IF;

  -- Sincronizar source_document_date <-> original_invoice_date <-> original_document_date
  IF NEW.source_document_date IS NOT NULL THEN
    IF NEW.original_invoice_date IS NULL THEN NEW.original_invoice_date := NEW.source_document_date; END IF;
    IF NEW.original_document_date IS NULL THEN NEW.original_document_date := NEW.source_document_date; END IF;
  ELSIF NEW.original_invoice_date IS NOT NULL THEN
    NEW.source_document_date := NEW.original_invoice_date;
    IF NEW.original_document_date IS NULL THEN NEW.original_document_date := NEW.original_invoice_date; END IF;
  ELSIF NEW.original_document_date IS NOT NULL THEN
    NEW.source_document_date := NEW.original_document_date;
    IF NEW.original_invoice_date IS NULL THEN NEW.original_invoice_date := NEW.original_document_date; END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_invoice_source_document_fields ON public.invoices;
CREATE TRIGGER trg_sync_invoice_source_document_fields
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_source_document_fields();

-- ─── 3. EXPANSÃO DA TABELA INVOICE_LINES ──────────────────────────────────────
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS item_type TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

-- ─── 4. EXPANSÃO DA TABELA PAYMENTS ───────────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS linked_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_receipt_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_linked_invoice_id ON public.payments(linked_invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_linked_receipt_id ON public.payments(linked_receipt_id);

-- Sincronizar invoice_id <-> linked_invoice_id em payments
CREATE OR REPLACE FUNCTION public.sync_payments_linked_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.linked_invoice_id IS NOT NULL AND NEW.invoice_id IS NULL THEN
    NEW.invoice_id := NEW.linked_invoice_id;
  ELSIF NEW.invoice_id IS NOT NULL AND NEW.linked_invoice_id IS NULL THEN
    NEW.linked_invoice_id := NEW.invoice_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_payments_linked_invoice ON public.payments;
CREATE TRIGGER trg_sync_payments_linked_invoice
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_payments_linked_invoice();

-- Backfill inicial em payments
UPDATE public.payments
SET linked_invoice_id = invoice_id
WHERE linked_invoice_id IS NULL AND invoice_id IS NOT NULL;

-- ─── 5. IMUTABILIDADE FISCAL DAS LINHAS DE DOCUMENTOS ─────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_fiscal_invoice_lines_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_inv RECORD;
BEGIN
  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = COALESCE(OLD.invoice_id, NEW.invoice_id);

  -- Se a fatura existir e for um documento fiscal emitido, linhas não podem ser apagadas
  IF TG_OP = 'DELETE' THEN
    IF v_inv.id IS NOT NULL AND v_inv.invoice_status = 'N' THEN
      RAISE EXCEPTION 'Linhas de documentos fiscais emitidos não podem ser eliminadas (Decreto Presidencial 292/18).';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF v_inv.id IS NOT NULL AND v_inv.invoice_status = 'N' THEN
      IF OLD.unit_price IS DISTINCT FROM NEW.unit_price
         OR OLD.quantity IS DISTINCT FROM NEW.quantity
         OR OLD.credit_amount IS DISTINCT FROM NEW.credit_amount
         OR OLD.debit_amount IS DISTINCT FROM NEW.debit_amount
         OR OLD.tax_percentage IS DISTINCT FROM NEW.tax_percentage
         OR OLD.tax_code IS DISTINCT FROM NEW.tax_code
         OR OLD.tax_exemption_code IS DISTINCT FROM NEW.tax_exemption_code THEN
        RAISE EXCEPTION 'Linhas de documentos fiscais emitidos são imutáveis.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_prevent_invoice_lines_mutation ON public.invoice_lines;
CREATE TRIGGER trg_prevent_invoice_lines_mutation
BEFORE UPDATE OR DELETE ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.prevent_fiscal_invoice_lines_mutation();
