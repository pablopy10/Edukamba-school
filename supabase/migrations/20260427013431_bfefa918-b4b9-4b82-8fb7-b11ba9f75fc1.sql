-- 1) Campos novos em school_invoices para suportar comprovativos
ALTER TABLE public.school_invoices
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS proof_url TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID,
  ADD COLUMN IF NOT EXISTS cycle_key TEXT;

-- Estados possíveis: pending, submitted (com comprovativo), paid (validado), overdue
-- Mantemos o campo status existente

-- 2) Controlo de geração em saas_subscriptions
ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS last_generated_cycle_key TEXT;

-- 3) RLS adicional: admins podem fazer update das suas faturas (para anexar comprovativo)
DROP POLICY IF EXISTS "Admins can update their school invoices" ON public.school_invoices;
CREATE POLICY "Admins can update their school invoices"
  ON public.school_invoices FOR UPDATE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- Garantir SELECT para membros da escola (caso ainda não exista)
DROP POLICY IF EXISTS "School invoices viewable by school members" ON public.school_invoices;
CREATE POLICY "School invoices viewable by school members"
  ON public.school_invoices FOR SELECT TO authenticated
  USING (school_id = get_my_school());

ALTER TABLE public.school_invoices ENABLE ROW LEVEL SECURITY;

-- 4) Bucket para os comprovativos
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-invoice-proofs', 'school-invoice-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: cada escola só vê/insere/update os ficheiros na sua "pasta" (primeiro segmento = school_id)
DROP POLICY IF EXISTS "School admins can read invoice proofs" ON storage.objects;
CREATE POLICY "School admins can read invoice proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-invoice-proofs'
    AND get_auth_role() = 'ADMIN'::user_role
    AND (storage.foldername(name))[1] = get_my_school()::text
  );

DROP POLICY IF EXISTS "School admins can upload invoice proofs" ON storage.objects;
CREATE POLICY "School admins can upload invoice proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-invoice-proofs'
    AND get_auth_role() = 'ADMIN'::user_role
    AND (storage.foldername(name))[1] = get_my_school()::text
  );

DROP POLICY IF EXISTS "School admins can update invoice proofs" ON storage.objects;
CREATE POLICY "School admins can update invoice proofs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-invoice-proofs'
    AND get_auth_role() = 'ADMIN'::user_role
    AND (storage.foldername(name))[1] = get_my_school()::text
  );

-- 5) Função para gerar as cobranças conforme o ciclo
CREATE OR REPLACE FUNCTION public.generate_school_invoices(_school_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub RECORD;
  _student_count INTEGER;
  _price NUMERIC;
  _total NUMERIC;
  _now DATE := CURRENT_DATE;
  _year INT := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  _semester INT;
  _cycle_key TEXT;
  _invoice_count INTEGER := 0;
  _half NUMERIC;
  _i INT;
  _issue DATE;
  _due DATE;
  _num TEXT;
  _suffix TEXT;
BEGIN
  SELECT * INTO _sub FROM public.saas_subscriptions WHERE school_id = _school_id;
  IF _sub IS NULL OR COALESCE(_sub.status, 'ACTIVE') <> 'ACTIVE' THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO _student_count FROM public.students WHERE school_id = _school_id;
  IF _student_count = 0 THEN _student_count := 1; END IF;
  _price := COALESCE(_sub.price_per_student, 500);
  _total := _price * _student_count;

  IF COALESCE(_sub.billing_cycle, 'ANNUAL') = 'ANNUAL' THEN
    _cycle_key := _year::text || '-A';
    IF _sub.last_generated_cycle_key = _cycle_key THEN RETURN 0; END IF;

    _suffix := substr(_school_id::text, 1, 4);
    _num := 'INV-' || _year::text || '-' || _suffix || '-A';
    _issue := make_date(_year, 1, 10);
    _due := _issue + INTERVAL '30 days';

    IF NOT EXISTS (
      SELECT 1 FROM public.school_invoices
      WHERE school_id = _school_id AND cycle_key = _cycle_key
    ) THEN
      INSERT INTO public.school_invoices (
        school_id, invoice_number, amount, currency,
        issue_date, due_date, status, description, cycle_key
      ) VALUES (
        _school_id, _num, _total, 'EUR',
        _issue, _due, 'pending',
        'Subscrição anual Edukamba ' || _year::text || ' (' || _student_count || ' alunos)',
        _cycle_key
      );
      _invoice_count := 1;
    END IF;

    UPDATE public.saas_subscriptions SET last_generated_cycle_key = _cycle_key WHERE id = _sub.id;
  ELSE
    -- Semestral: 2 cobranças por ano
    _half := round(_total / 2, 2);
    FOR _i IN 1..2 LOOP
      _semester := _i;
      _cycle_key := _year::text || '-S' || _semester::text;
      IF _sub.last_generated_cycle_key = _cycle_key THEN CONTINUE; END IF;

      _suffix := substr(_school_id::text, 1, 4);
      _num := 'INV-' || _year::text || '-' || _suffix || '-S' || _semester::text;
      _issue := CASE WHEN _semester = 1 THEN make_date(_year, 1, 10) ELSE make_date(_year, 7, 10) END;
      _due := _issue + INTERVAL '30 days';

      IF NOT EXISTS (
        SELECT 1 FROM public.school_invoices
        WHERE school_id = _school_id AND cycle_key = _cycle_key
      ) THEN
        INSERT INTO public.school_invoices (
          school_id, invoice_number, amount, currency,
          issue_date, due_date, status, description, cycle_key
        ) VALUES (
          _school_id, _num, _half, 'EUR',
          _issue, _due, 'pending',
          'Subscrição semestral Edukamba ' || _year::text || ' - S' || _semester::text || ' (' || _student_count || ' alunos)',
          _cycle_key
        );
        _invoice_count := _invoice_count + 1;
      END IF;
    END LOOP;

    UPDATE public.saas_subscriptions SET last_generated_cycle_key = _year::text || '-S2' WHERE id = _sub.id;
  END IF;

  RETURN _invoice_count;
END;
$$;