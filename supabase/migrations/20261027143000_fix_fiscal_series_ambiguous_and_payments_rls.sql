-- ============================================================================
-- FIX: AMBIGUIDADE DE SÉRIE FISCAL E POLÍTICAS RLS DE PAGAMENTOS
-- Erros corrigidos:
-- 1. "column reference 'series_code' is ambiguous" (42702) em billing_reserve_series_next_number
-- 2. "new row violates row-level security policy for table 'payments'" (42501)
-- ============================================================================

-- ─── 1. CORRIGIR RPC BILLING_RESERVE_SERIES_NEXT_NUMBER (ALIAS FS.) ───────────
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

  -- Lock pessimista na linha da série correspondente com alias fs. para eliminar qualquer ambiguidade de coluna
  SELECT * INTO v_series
  FROM public.fiscal_series fs
  WHERE fs.school_id = _school_id
    AND fs.series_code = upper(trim(_series_code))
    AND fs.document_type = upper(trim(_doc_type))
    AND fs.fiscal_year = _fiscal_year
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
  UPDATE public.fiscal_series fs
  SET current_number = v_next_num,
      documents_emitted_count = v_series.documents_emitted_count + 1,
      updated_at = now()
  WHERE fs.id = v_series.id;

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

-- ─── 2. CORRIGIR RPC BILLING_COMMIT_SERIES_EMISSION (ALIAS FS.) ───────────────
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
  UPDATE public.fiscal_series fs
  SET last_hash = trim(_new_hash),
      last_document_date = _doc_date,
      updated_at = now()
  WHERE fs.school_id = _school_id
    AND fs.series_code = upper(trim(_series_code))
    AND fs.document_type = upper(trim(_doc_type))
    AND fs.fiscal_year = _fiscal_year;
END;
$fn$;

REVOKE ALL ON FUNCTION public.billing_commit_series_emission(UUID, TEXT, TEXT, INTEGER, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_commit_series_emission(UUID, TEXT, TEXT, INTEGER, TEXT, DATE) TO authenticated;

-- ─── 3. CORRIGIR RPC BILLING_SETUP_FISCAL_SERIES (ALIAS FS.) ──────────────────
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
  FROM public.fiscal_series fs
  WHERE fs.school_id = _school_id
    AND fs.series_code = upper(trim(_series_code))
    AND fs.document_type = upper(trim(_doc_type))
    AND fs.fiscal_year = _fiscal_year;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.documents_emitted_count > 0 THEN
      RAISE EXCEPTION 'Esta série já emitiu documentos e não pode ser reconfigurada.';
    END IF;

    UPDATE public.fiscal_series fs
    SET starting_number = GREATEST(_starting_number, 1),
        current_number = GREATEST(_starting_number - 1, 0),
        last_document_date = _last_document_date,
        last_hash = COALESCE(trim(_last_document_hash), ''),
        updated_at = now()
    WHERE fs.id = v_existing.id
    RETURNING fs.id INTO v_id;
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

-- ─── 4. DEFAULT E TRIGGER PARA SUBMITTED_BY EM PAYMENTS ───────────────────────
CREATE OR REPLACE FUNCTION public.set_payments_submitted_by_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.submitted_by IS NULL THEN
    NEW.submitted_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_set_payments_submitted_by_default ON public.payments;
CREATE TRIGGER trg_set_payments_submitted_by_default
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_payments_submitted_by_default();

-- ─── 5. AJUSTAR POLÍTICAS RLS EM PAYMENTS ─────────────────────────────────────
DROP POLICY IF EXISTS "Staff can register payments" ON public.payments;
CREATE POLICY "Staff can register payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  (school_id = public.get_my_school() OR public.get_auth_role()::text = 'SUPER_ADMIN')
  AND (submitted_by = auth.uid() OR submitted_by IS NULL)
  AND (public.auth_can_manage_school_payments() OR public.get_auth_role()::text = 'SUPER_ADMIN')
  AND num_nonnulls(
    student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id
  ) = 1
);

DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
CREATE POLICY "Admins can update payments"
ON public.payments FOR UPDATE TO authenticated
USING (
  (school_id = public.get_my_school() OR public.get_auth_role()::text = 'SUPER_ADMIN')
  AND (public.auth_can_manage_school_payments() OR public.get_auth_role()::text = 'SUPER_ADMIN')
)
WITH CHECK (
  (school_id = public.get_my_school() OR public.get_auth_role()::text = 'SUPER_ADMIN')
  AND (public.auth_can_manage_school_payments() OR public.get_auth_role()::text = 'SUPER_ADMIN')
);

DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
CREATE POLICY "Admins can delete payments"
ON public.payments FOR DELETE TO authenticated
USING (
  (school_id = public.get_my_school() OR public.get_auth_role()::text = 'SUPER_ADMIN')
  AND (public.auth_can_manage_school_payments() OR public.get_auth_role()::text = 'SUPER_ADMIN')
);
