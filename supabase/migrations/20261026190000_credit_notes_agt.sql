-- ============================================================================
-- MÓDULO FISCAL AGT: NOTAS DE CRÉDITO (NC) E HISTÓRICO DE ESTORNO — EDUKAMBA
-- Conformidade: Decreto Presidencial n.º 292/18 e SAF-T (AO) 1.01_01
-- ============================================================================

-- ─── 1. EXPANSÃO DA TABELA INVOICES ───────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS original_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS original_invoice_date DATE,
  ADD COLUMN IF NOT EXISTS credit_reason TEXT,
  ADD COLUMN IF NOT EXISTS credit_status TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00;

-- Adicionar restrição de status de crédito
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_credit_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_credit_status_check
  CHECK (credit_status IN ('NONE', 'PARTIALLY_CREDITED', 'FULLY_CREDITED'));

-- Índices de consulta para auditoria e vinculação
CREATE INDEX IF NOT EXISTS idx_invoices_original_invoice_id ON public.invoices(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_credit_status ON public.invoices(school_id, credit_status);

-- ─── 2. TRIGGER DE SINCRONIZAÇÃO DE CAMPOS DE NC EM INVOICES ──────────────────
CREATE OR REPLACE FUNCTION public.sync_invoice_credit_note_fields()
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

  -- Sincronizar original_invoice_id <-> referenced_invoice_id
  IF NEW.original_invoice_id IS NOT NULL AND NEW.referenced_invoice_id IS NULL THEN
    NEW.referenced_invoice_id := NEW.original_invoice_id;
  ELSIF NEW.referenced_invoice_id IS NOT NULL AND NEW.original_invoice_id IS NULL THEN
    NEW.original_invoice_id := NEW.referenced_invoice_id;
  END IF;

  -- Sincronizar original_invoice_number <-> original_document_number
  IF NEW.original_invoice_number IS NOT NULL AND NEW.original_document_number IS NULL THEN
    NEW.original_document_number := NEW.original_invoice_number;
  ELSIF NEW.original_document_number IS NOT NULL AND NEW.original_invoice_number IS NULL THEN
    NEW.original_invoice_number := NEW.original_document_number;
  END IF;

  -- Sincronizar original_invoice_date <-> original_document_date
  IF NEW.original_invoice_date IS NOT NULL AND NEW.original_document_date IS NULL THEN
    NEW.original_document_date := NEW.original_invoice_date;
  ELSIF NEW.original_document_date IS NOT NULL AND NEW.original_invoice_date IS NULL THEN
    NEW.original_invoice_date := NEW.original_document_date;
  END IF;

  -- Sincronizar credit_reason <-> rectification_reason
  IF NEW.credit_reason IS NOT NULL AND NEW.rectification_reason IS NULL THEN
    NEW.rectification_reason := NEW.credit_reason;
  ELSIF NEW.rectification_reason IS NOT NULL AND NEW.credit_reason IS NULL THEN
    NEW.credit_reason := NEW.rectification_reason;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_invoice_credit_note_fields ON public.invoices;
CREATE TRIGGER trg_sync_invoice_credit_note_fields
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_credit_note_fields();

-- Backfill inicial de sincronização
UPDATE public.invoices
SET document_type = doc_type
WHERE document_type IS NULL AND doc_type IS NOT NULL;

-- ─── 3. EXPANSÃO DA TABELA PAYMENTS PARA AUDITORIA DE ESTORNO ─────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS has_credit_note BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_note_number TEXT,
  ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payments_credit_note_id ON public.payments(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_payments_has_credit_note ON public.payments(school_id, has_credit_note);

-- ─── 4. EXPANSÃO DA TABELA PAYMENT_ITEMS PARA ESTORNO DE LINHAS ───────────────
ALTER TABLE public.payment_items
  ADD COLUMN IF NOT EXISTS has_credit_note BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_note_number TEXT,
  ADD COLUMN IF NOT EXISTS credited_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_items_credit_note_id ON public.payment_items(credit_note_id);

-- ─── 5. AJUSTAR TRIGGER DE IMUTABILIDADE FISCAL PARA PERMITIR ESTADO DE CRÉDITO ─
CREATE OR REPLACE FUNCTION public.prevent_fiscal_invoice_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Documentos fiscais emitidos JAMAIS podem ser eliminados (Decreto Presidencial 292/18).';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- A fatura original retificada pode ter seu credit_status e credited_amount atualizados pelo motor fiscal
    -- Todos os dados fiscais de emissão (valores, assinaturas, datas, numeração) permanecem estritamente imutáveis
    IF OLD.gross_total IS DISTINCT FROM NEW.gross_total
       OR OLD.net_total IS DISTINCT FROM NEW.net_total
       OR OLD.tax_payable IS DISTINCT FROM NEW.tax_payable
       OR OLD.invoice_date IS DISTINCT FROM NEW.invoice_date
       OR OLD.document_number IS DISTINCT FROM NEW.document_number
       OR OLD.doc_number IS DISTINCT FROM NEW.doc_number
       OR OLD.series IS DISTINCT FROM NEW.series
       OR OLD.cliente_nif IS DISTINCT FROM NEW.cliente_nif
       OR OLD.digital_signature_sha1_b64 IS DISTINCT FROM NEW.digital_signature_sha1_b64
       OR OLD.agt_signing_plaintext IS DISTINCT FROM NEW.agt_signing_plaintext
       OR OLD.order_reference_pp IS DISTINCT FROM NEW.order_reference_pp
       OR (OLD.referenced_invoice_id IS NOT NULL AND OLD.referenced_invoice_id IS DISTINCT FROM NEW.referenced_invoice_id)
       OR (OLD.original_invoice_id IS NOT NULL AND OLD.original_invoice_id IS DISTINCT FROM NEW.original_invoice_id) THEN
      RAISE EXCEPTION 'Documentos fiscais emitidos são imutáveis. Valores, numeração, dados do adquirente e assinaturas não podem ser alterados.';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS prevent_invoice_mutation_trigger ON public.invoices;
CREATE TRIGGER prevent_invoice_mutation_trigger
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.prevent_fiscal_invoice_mutation();

-- ─── 6. RPC: BLOQUEIO ACID E RESERVA DE CRÉDITO COM LOCK PESSIMISTA ───────────
CREATE OR REPLACE FUNCTION public.billing_prepare_credit_note_lock(
  _original_invoice_id UUID,
  _credit_amount NUMERIC
)
RETURNS TABLE (
  school_id UUID,
  original_invoice_id UUID,
  original_document_number TEXT,
  original_invoice_date DATE,
  original_gross_total NUMERIC,
  already_credited_amount NUMERIC,
  remaining_balance NUMERIC,
  is_full_credit BOOLEAN,
  payment_id UUID,
  student_id UUID,
  parent_profile_id UUID,
  cliente_nome TEXT,
  cliente_nif TEXT,
  exemption_code TEXT,
  exemption_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_orig RECORD;
  v_already_credited NUMERIC(14, 2);
  v_remaining NUMERIC(14, 2);
  v_req_amount NUMERIC(14, 2);
BEGIN
  -- 1. Lock pessimista na fatura original
  SELECT * INTO v_orig
  FROM public.invoices
  WHERE id = _original_invoice_id
  FOR UPDATE;

  IF v_orig.id IS NULL THEN
    RAISE EXCEPTION 'Fatura original não encontrada.';
  END IF;

  -- Não permitir NC em fatura já anulada administrativamente
  IF v_orig.invoice_status = 'A' THEN
    RAISE EXCEPTION 'A fatura % encontra-se anulada.', v_orig.document_number;
  END IF;

  -- 2. Calcular total já creditado em NCs anteriores
  SELECT COALESCE(SUM(gross_total), 0.00) INTO v_already_credited
  FROM public.invoices
  WHERE (original_invoice_id = v_orig.id OR referenced_invoice_id = v_orig.id)
    AND (doc_type = 'NC' OR document_type = 'NC');

  v_remaining := v_orig.gross_total - v_already_credited;

  IF v_remaining <= 0.001 THEN
    RAISE EXCEPTION 'A fatura % já se encontra totalmente creditada.', v_orig.document_number;
  END IF;

  v_req_amount := COALESCE(_credit_amount, v_orig.gross_total);

  -- 3. Bloqueio de sobrecrédito
  IF v_req_amount > (v_remaining + 0.01) THEN
    RAISE EXCEPTION 'Sobrecrédito rejeitado: valor solicitado (% Kz) excede o saldo disponível (% Kz) da fatura original %.',
      v_req_amount, v_remaining, v_orig.document_number;
  END IF;

  RETURN QUERY
  SELECT 
    v_orig.school_id,
    v_orig.id,
    v_orig.document_number,
    v_orig.invoice_date,
    v_orig.gross_total,
    v_already_credited,
    v_remaining,
    (v_already_credited + v_req_amount) >= (v_orig.gross_total - 0.01),
    v_orig.payment_id,
    v_orig.student_id,
    v_orig.parent_profile_id,
    v_orig.cliente_nome,
    v_orig.cliente_nif,
    v_orig.exemption_code,
    v_orig.exemption_reason;
END;
$fn$;

REVOKE ALL ON FUNCTION public.billing_prepare_credit_note_lock(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_prepare_credit_note_lock(UUID, NUMERIC) TO authenticated;

-- ─── 7. RPC: FINALIZAR ESTORNO E ATUALIZAR AUDITORIA DE PAGAMENTOS ────────────
CREATE OR REPLACE FUNCTION public.billing_finalize_credit_note_audit(
  _original_invoice_id UUID,
  _credit_note_id UUID,
  _credit_note_number TEXT,
  _credited_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_orig RECORD;
  v_already_credited NUMERIC(14, 2);
  v_new_credit_status TEXT;
BEGIN
  -- Carregar fatura original com lock
  SELECT * INTO v_orig
  FROM public.invoices
  WHERE id = _original_invoice_id
  FOR UPDATE;

  IF v_orig.id IS NULL THEN
    RETURN;
  END IF;

  -- Calcular total acumulado de NCs
  SELECT COALESCE(SUM(gross_total), 0.00) INTO v_already_credited
  FROM public.invoices
  WHERE (original_invoice_id = v_orig.id OR referenced_invoice_id = v_orig.id)
    AND (doc_type = 'NC' OR document_type = 'NC');

  IF v_already_credited >= (v_orig.gross_total - 0.01) THEN
    v_new_credit_status := 'FULLY_CREDITED';
  ELSE
    v_new_credit_status := 'PARTIALLY_CREDITED';
  END IF;

  -- Atualizar fatura de origem
  UPDATE public.invoices
  SET credit_status = v_new_credit_status,
      credited_amount = v_already_credited
  WHERE id = v_orig.id;

  -- Atualizar pagamento associado (se houver)
  IF v_orig.payment_id IS NOT NULL THEN
    UPDATE public.payments
    SET has_credit_note = true,
        credit_note_id = _credit_note_id,
        credit_note_number = _credit_note_number,
        credited_amount = v_already_credited,
        credited_at = now()
    WHERE id = v_orig.payment_id;

    -- Atualizar payment_items
    UPDATE public.payment_items
    SET has_credit_note = true,
        credit_note_id = _credit_note_id,
        credit_note_number = _credit_note_number,
        credited_amount = v_already_credited,
        credited_at = now()
    WHERE payment_id = v_orig.payment_id;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.billing_finalize_credit_note_audit(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_finalize_credit_note_audit(UUID, UUID, TEXT, NUMERIC) TO authenticated;
