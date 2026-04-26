-- 1. Adicionar valor de inscrição à atividade
ALTER TABLE public.extracurricular_activities
  ADD COLUMN IF NOT EXISTS enrollment_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_frequency text NOT NULL DEFAULT 'unica';
-- billing_frequency: 'unica' (uma só cobrança) | 'mensal' (igual às propinas)

-- 2. Tabela de inscrições em atividades extracurriculares
CREATE TABLE IF NOT EXISTS public.extracurricular_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.extracurricular_activities(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativa',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_extra_enroll_activity ON public.extracurricular_enrollments(activity_id);
CREATE INDEX IF NOT EXISTS idx_extra_enroll_student ON public.extracurricular_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_extra_enroll_school ON public.extracurricular_enrollments(school_id);

ALTER TABLE public.extracurricular_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School members can view extra enrollments" ON public.extracurricular_enrollments;
DROP POLICY IF EXISTS "Admins and teachers can insert extra enrollments" ON public.extracurricular_enrollments;
DROP POLICY IF EXISTS "Admins and teachers can update extra enrollments" ON public.extracurricular_enrollments;
DROP POLICY IF EXISTS "Admins can delete extra enrollments" ON public.extracurricular_enrollments;

CREATE POLICY "School members can view extra enrollments"
ON public.extracurricular_enrollments FOR SELECT TO authenticated
USING (school_id = public.get_my_school());

CREATE POLICY "Admins and teachers can insert extra enrollments"
ON public.extracurricular_enrollments FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role]));

CREATE POLICY "Admins and teachers can update extra enrollments"
ON public.extracurricular_enrollments FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role]))
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role]));

CREATE POLICY "Admins can delete extra enrollments"
ON public.extracurricular_enrollments FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role);

-- 3. Tabela de propinas de atividades extracurriculares (separada de student_fees)
CREATE TABLE IF NOT EXISTS public.activity_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.extracurricular_enrollments(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.extracurricular_activities(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  month_index integer,
  is_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_fees_enrollment ON public.activity_fees(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_activity_fees_student ON public.activity_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_activity_fees_school ON public.activity_fees(school_id);
CREATE INDEX IF NOT EXISTS idx_activity_fees_due ON public.activity_fees(due_date);

ALTER TABLE public.activity_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School members can view activity fees" ON public.activity_fees;
DROP POLICY IF EXISTS "Admins can insert activity fees" ON public.activity_fees;
DROP POLICY IF EXISTS "Admins can update activity fees" ON public.activity_fees;
DROP POLICY IF EXISTS "Admins can delete activity fees" ON public.activity_fees;

CREATE POLICY "School members can view activity fees"
ON public.activity_fees FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  AND (
    public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
    OR student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
  )
);

CREATE POLICY "Admins can insert activity fees"
ON public.activity_fees FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update activity fees"
ON public.activity_fees FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role)
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete activity fees"
ON public.activity_fees FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role);

-- 4. Função para gerar propinas de uma inscrição
CREATE OR REPLACE FUNCTION public.generate_activity_fees(_enrollment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enroll record;
  _activity record;
  _year record;
  _months_count integer;
  _i integer;
  _due_date date;
  _month_idx integer;
  _year_part integer;
  _start_month integer;
  _created_count integer := 0;
BEGIN
  SELECT * INTO _enroll FROM extracurricular_enrollments WHERE id = _enrollment_id;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _activity FROM extracurricular_activities WHERE id = _enroll.activity_id;
  IF _activity IS NULL OR COALESCE(_activity.enrollment_fee, 0) <= 0 THEN RETURN 0; END IF;

  -- Apagar propinas anteriores ainda não pagas para evitar duplicação
  DELETE FROM activity_fees
  WHERE enrollment_id = _enrollment_id AND is_paid = false;

  IF _activity.billing_frequency = 'unica' OR _activity.billing_frequency IS NULL THEN
    INSERT INTO activity_fees (
      enrollment_id, activity_id, student_id, school_id, academic_year_id,
      amount_due, due_date, month_index, is_paid
    )
    VALUES (
      _enrollment_id, _activity.id, _enroll.student_id, _enroll.school_id, _activity.academic_year_id,
      _activity.enrollment_fee,
      COALESCE(_activity.start_date, _activity.single_date, CURRENT_DATE),
      NULL, false
    );
    RETURN 1;
  END IF;

  -- Mensal: gerar tantas mensalidades quantos meses entre start_date e end_date
  IF _activity.billing_frequency = 'mensal' AND _activity.start_date IS NOT NULL AND _activity.end_date IS NOT NULL THEN
    _months_count := GREATEST(
      1,
      (EXTRACT(YEAR FROM age(date_trunc('month', _activity.end_date), date_trunc('month', _activity.start_date)))::int * 12)
      + EXTRACT(MONTH FROM age(date_trunc('month', _activity.end_date), date_trunc('month', _activity.start_date)))::int
      + 1
    );

    _start_month := EXTRACT(MONTH FROM _activity.start_date)::int;
    _year_part := EXTRACT(YEAR FROM _activity.start_date)::int;

    FOR _i IN 0.._months_count - 1 LOOP
      _month_idx := ((_start_month - 1 + _i) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _activity.start_date)::int + ((_start_month - 1 + _i) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(EXTRACT(DAY FROM _activity.start_date)::int, 28));

      INSERT INTO activity_fees (
        enrollment_id, activity_id, student_id, school_id, academic_year_id,
        amount_due, due_date, month_index, is_paid
      )
      VALUES (
        _enrollment_id, _activity.id, _enroll.student_id, _enroll.school_id, _activity.academic_year_id,
        _activity.enrollment_fee, _due_date, _month_idx, false
      );
      _created_count := _created_count + 1;
    END LOOP;
  END IF;

  RETURN _created_count;
END;
$$;

-- 5. Trigger para updated_at
DROP TRIGGER IF EXISTS update_extracurricular_enrollments_updated_at ON public.extracurricular_enrollments;
CREATE TRIGGER update_extracurricular_enrollments_updated_at
BEFORE UPDATE ON public.extracurricular_enrollments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_activity_fees_updated_at ON public.activity_fees;
CREATE TRIGGER update_activity_fees_updated_at
BEFORE UPDATE ON public.activity_fees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();