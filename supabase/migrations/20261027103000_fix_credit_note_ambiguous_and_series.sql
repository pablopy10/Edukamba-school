-- ============================================================================
-- FIX: CORREÇÃO DE AMBIGUIDADE DE COLUNA E CONSTRAINT DE SÉRIE EM NOTAS DE CRÉDITO
-- Erros corrigidos:
-- 1. "column reference 'original_invoice_id' is ambiguous" (42702)
-- 2. "duplicate key value violates unique constraint 'invoices_school_series_doc_uq'"
-- ============================================================================

-- ─── 1. CORRIGIR ÍNDICE ÚNICO DE SÉRIE PARA DIFERENCIAR POR TIPO DE DOCUMENTO ─
DROP INDEX IF EXISTS public.invoices_school_series_doc_uq;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_school_series_doc_uq
  ON public.invoices (school_id, COALESCE(doc_type, 'FT'), series, doc_number);

-- ─── 2. AJUSTAR ÍNDICE DE PAYMENT_ID PARA NÃO COLIDIR COM NOTAS DE CRÉDITO ────
DROP INDEX IF EXISTS public.invoices_payment_id_uq;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_payment_id_uq
  ON public.invoices (payment_id)
  WHERE payment_id IS NOT NULL AND doc_type NOT IN ('NC', 'nc');

-- ─── 3. CORRIGIR RPC BILLING_PREPARE_CREDIT_NOTE_LOCK (QUALIFICAÇÃO DE ALIAS) ─
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

  -- 2. Calcular total já creditado em NCs anteriores com qualificação de tabela inv.
  -- para evitar ambiguidade com o nome do campo da tabela de retorno
  SELECT COALESCE(SUM(inv.gross_total), 0.00) INTO v_already_credited
  FROM public.invoices inv
  WHERE (inv.original_invoice_id = v_orig.id OR inv.referenced_invoice_id = v_orig.id)
    AND (inv.doc_type = 'NC' OR inv.document_type = 'NC');

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

-- ─── 4. CORRIGIR RPC BILLING_FINALIZE_CREDIT_NOTE_AUDIT (QUALIFICAÇÃO DE ALIAS) ─
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

  -- Calcular total acumulado de NCs com qualificação de tabela inv.
  SELECT COALESCE(SUM(inv.gross_total), 0.00) INTO v_already_credited
  FROM public.invoices inv
  WHERE (inv.original_invoice_id = v_orig.id OR inv.referenced_invoice_id = v_orig.id)
    AND (inv.doc_type = 'NC' OR inv.document_type = 'NC');

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
