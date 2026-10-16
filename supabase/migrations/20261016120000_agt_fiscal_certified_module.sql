-- ============================================================================
-- MÓDULO DE FATURAÇÃO CERTIFICADA AGT (ANGOLA) — EDUKAMBA
-- Conformidade estrita: Decreto Presidencial n.º 292/18 e SAF-T (AO) 1.01_01
-- ============================================================================

-- ─── 1. TABELA DE SÉRIES FISCAIS MULTI-TENANT ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fiscal_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  series_code TEXT NOT NULL,
  document_type TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  starting_number INTEGER NOT NULL DEFAULT 1,
  current_number INTEGER NOT NULL DEFAULT 0,
  last_hash TEXT NOT NULL DEFAULT '',
  last_document_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  documents_emitted_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Restrições
  CONSTRAINT fiscal_series_doc_type_check 
    CHECK (document_type IN ('FT', 'FR', 'NC', 'ND', 'PF', 'RC')),
  CONSTRAINT fiscal_series_starting_num_check 
    CHECK (starting_number >= 1),
  CONSTRAINT fiscal_series_current_num_check 
    CHECK (current_number >= 0),
  CONSTRAINT fiscal_series_emitted_count_check 
    CHECK (documents_emitted_count >= 0),
  CONSTRAINT fiscal_series_unique_school_series 
    UNIQUE (school_id, series_code, document_type, fiscal_year)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_series_school ON public.fiscal_series(school_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_series_lookup 
  ON public.fiscal_series(school_id, document_type, is_active);

ALTER TABLE public.fiscal_series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read fiscal_series" ON public.fiscal_series;
CREATE POLICY "Staff read fiscal_series"
ON public.fiscal_series FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  OR public.get_auth_role()::text = 'SUPER_ADMIN'
);

DROP POLICY IF EXISTS "Staff manage fiscal_series" ON public.fiscal_series;
CREATE POLICY "Staff manage fiscal_series"
ON public.fiscal_series FOR ALL TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role)
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role, 'TREASURER'::public.user_role)
);

-- ─── 2. TRIGGER DE BLOQUEIO RÍGIDO DE SÉRIE APÓS 1.º DOCUMENTO ──────────────
CREATE OR REPLACE FUNCTION public.prevent_fiscal_series_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- Se a série já emitiu documentos, campos estruturais e de início são estritamente só de leitura
  IF TG_OP = 'UPDATE' THEN
    IF OLD.documents_emitted_count > 0 THEN
      IF OLD.starting_number IS DISTINCT FROM NEW.starting_number
         OR OLD.series_code IS DISTINCT FROM NEW.series_code
         OR OLD.document_type IS DISTINCT FROM NEW.document_type
         OR OLD.fiscal_year IS DISTINCT FROM NEW.fiscal_year
         OR OLD.school_id IS DISTINCT FROM NEW.school_id THEN
        RAISE EXCEPTION 'A série fiscal já possui documentos emitidos. Configurações iniciais são imutáveis (Regra AGT).';
      END IF;

      -- Não permite retroceder numeração
      IF NEW.current_number < OLD.current_number THEN
        RAISE EXCEPTION 'Quebra de integridade: a numeração sequencial fiscal não pode retroceder.';
      END IF;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.documents_emitted_count > 0 THEN
      RAISE EXCEPTION 'Séries fiscais com documentos emitidos não podem ser eliminadas.';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trigger_prevent_fiscal_series_tampering ON public.fiscal_series;
CREATE TRIGGER trigger_prevent_fiscal_series_tampering
BEFORE UPDATE OR DELETE ON public.fiscal_series
FOR EACH ROW EXECUTE FUNCTION public.prevent_fiscal_series_tampering();

-- ─── 3. RPC: RESERVA ATÓMICA DE NÚMERO COM PESSIMISTIC LOCK (FOR UPDATE) ─────
CREATE OR REPLACE FUNCTION public.billing_reserve_series_next_number(
  _school_id UUID,
  _doc_type TEXT,
  _series_code TEXT,
  _fiscal_year INTEGER,
  _document_date DATE
)
RETURNS TABLE (
  series_code TEXT,
  doc_number INTEGER,
  document_number_full TEXT,
  previous_document_hash TEXT,
  last_document_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_series RECORD;
  v_next_num INTEGER;
  v_doc_full TEXT;
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  -- Validação de Permissões
  IF public.get_my_school() IS DISTINCT FROM _school_id
     AND public.get_auth_role()::text IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  -- Lock pessimista na linha da série correspondente para evitar qualquer condição de corrida
  SELECT * INTO v_series
  FROM public.fiscal_series
  WHERE school_id = _school_id
    AND series_code = upper(trim(_series_code))
    AND document_type = upper(trim(_doc_type))
    AND fiscal_year = _fiscal_year
  FOR UPDATE;

  -- Se não existir série, cria série padrão inicial
  IF v_series.id IS NULL THEN
    INSERT INTO public.fiscal_series (
      school_id, series_code, document_type, fiscal_year, starting_number, current_number, documents_emitted_count, last_hash
    ) VALUES (
      _school_id, upper(trim(_series_code)), upper(trim(_doc_type)), _fiscal_year, 1, 0, 0, ''
    )
    RETURNING * INTO v_series;
  END IF;

  IF NOT v_series.is_active THEN
    RAISE EXCEPTION 'A série fiscal % encontra-se inativa.', v_series.series_code;
  END IF;

  IF v_series.is_closed THEN
    RAISE EXCEPTION 'A série fiscal % encontra-se encerrada.', v_series.series_code;
  END IF;

  -- Validação de cronologia fiscal AGT
  IF v_series.last_document_date IS NOT NULL AND _document_date < v_series.last_document_date THEN
    RAISE EXCEPTION 'Cronologia fiscal AGT violada: a data do documento (%) não pode ser anterior ao último documento emitido (%).',
      _document_date, v_series.last_document_date;
  END IF;

  -- Próximo número sequencial
  IF v_series.documents_emitted_count = 0 THEN
    v_next_num := v_series.starting_number;
  ELSE
    v_next_num := v_series.current_number + 1;
  END IF;

  v_doc_full := upper(trim(_doc_type)) || ' ' || upper(trim(_series_code)) || '/' || v_next_num;

  -- Atualizar contador atómico
  UPDATE public.fiscal_series
  SET current_number = v_next_num,
      documents_emitted_count = v_series.documents_emitted_count + 1,
      updated_at = now()
  WHERE id = v_series.id;

  RETURN QUERY
  SELECT 
    v_series.series_code,
    v_next_num,
    v_doc_full,
    v_series.last_hash,
    v_series.last_document_date;
END;
$fn$;

REVOKE ALL ON FUNCTION public.billing_reserve_series_next_number(UUID, TEXT, TEXT, INTEGER, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_reserve_series_next_number(UUID, TEXT, TEXT, INTEGER, DATE) TO authenticated;

-- ─── 4. RPC: CONFIRMAR EMISSÃO E ATUALIZAR CADEIA DE HASH ────────────────────
CREATE OR REPLACE FUNCTION public.billing_commit_series_emission(
  _school_id UUID,
  _doc_type TEXT,
  _series_code TEXT,
  _fiscal_year INTEGER,
  _new_hash TEXT,
  _doc_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.fiscal_series
  SET last_hash = trim(_new_hash),
      last_document_date = _doc_date,
      updated_at = now()
  WHERE school_id = _school_id
    AND series_code = upper(trim(_series_code))
    AND document_type = upper(trim(_doc_type))
    AND fiscal_year = _fiscal_year;
END;
$fn$;

REVOKE ALL ON FUNCTION public.billing_commit_series_emission(UUID, TEXT, TEXT, INTEGER, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_commit_series_emission(UUID, TEXT, TEXT, INTEGER, TEXT, DATE) TO authenticated;

-- ─── 5. RPC: SETUP INICIAL / ONBOARDING DE SÉRIE FISCAL ─────────────────────
CREATE OR REPLACE FUNCTION public.billing_setup_fiscal_series(
  _school_id UUID,
  _series_code TEXT,
  _doc_type TEXT,
  _fiscal_year INTEGER,
  _starting_number INTEGER DEFAULT 1,
  _last_document_date DATE DEFAULT NULL,
  _last_document_hash TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id UUID;
  v_existing RECORD;
BEGIN
  IF public.get_my_school() IS DISTINCT FROM _school_id
     AND public.get_auth_role()::text IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  SELECT * INTO v_existing
  FROM public.fiscal_series
  WHERE school_id = _school_id
    AND series_code = upper(trim(_series_code))
    AND document_type = upper(trim(_doc_type))
    AND fiscal_year = _fiscal_year;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.documents_emitted_count > 0 THEN
      RAISE EXCEPTION 'Esta série já emitiu documentos e não pode ser reconfigurada.';
    END IF;

    UPDATE public.fiscal_series
    SET starting_number = GREATEST(_starting_number, 1),
        current_number = GREATEST(_starting_number - 1, 0),
        last_document_date = _last_document_date,
        last_hash = COALESCE(trim(_last_document_hash), ''),
        updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.fiscal_series (
      school_id, series_code, document_type, fiscal_year, starting_number, current_number, last_document_date, last_hash
    ) VALUES (
      _school_id, upper(trim(_series_code)), upper(trim(_doc_type)), _fiscal_year,
      GREATEST(_starting_number, 1), GREATEST(_starting_number - 1, 0),
      _last_document_date, COALESCE(trim(_last_document_hash), '')
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.billing_setup_fiscal_series(UUID, TEXT, TEXT, INTEGER, INTEGER, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_setup_fiscal_series(UUID, TEXT, TEXT, INTEGER, INTEGER, DATE, TEXT) TO authenticated;

-- ─── 6. EXPANDIR CAMPOS EM INVOICES PARA SUPORTE TOTAL AGT ───────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS qr_code_payload TEXT,
  ADD COLUMN IF NOT EXISTS discount_global_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_global_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS original_document_number TEXT,
  ADD COLUMN IF NOT EXISTS original_document_date DATE,
  ADD COLUMN IF NOT EXISTS rectification_reason TEXT,
  ADD COLUMN IF NOT EXISTS system_entry_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS source_proforma_id UUID;

-- ─── 7. EXPANDIR CAMPOS EM INVOICE_LINES PARA DESCONTOS E RESUMO DE IVA ──────
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.invoice_lines
  DROP CONSTRAINT IF EXISTS invoice_lines_tax_valid;

ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_tax_valid CHECK (
    (tax_percentage > 0)
    OR (tax_percentage = 0 AND tax_exemption_code IS NOT NULL AND tax_exemption_reason IS NOT NULL)
  );

-- ─── 8. TRIGGER REFORÇADO DE IMUTABILIDADE FISCAL (DELETE / UPDATE BLOQUEADOS) ───
CREATE OR REPLACE FUNCTION public.prevent_fiscal_invoice_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Documentos fiscais emitidos JAMAIS podem ser eliminados (Decreto Presidencial 292/18).';
  END IF;

  IF TG_OP = 'UPDATE' THEN
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
       OR OLD.referenced_invoice_id IS DISTINCT FROM NEW.referenced_invoice_id THEN
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
