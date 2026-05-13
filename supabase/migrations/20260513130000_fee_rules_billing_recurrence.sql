-- Regras de cobrança: alvos (turmas/alunos/nível), recorrência e geração incremental de propinas.

-- ---- fee_rules: novos campos -------------------------------------------------
ALTER TABLE public.fee_rules
  ADD COLUMN IF NOT EXISTS target_scope text NOT NULL DEFAULT 'grade_level',
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS end_month integer,
  ADD COLUMN IF NOT EXISTS generate_all_upfront boolean NOT NULL DEFAULT false;

ALTER TABLE public.fee_rules
  DROP CONSTRAINT IF EXISTS fee_rules_target_scope_check;
ALTER TABLE public.fee_rules
  ADD CONSTRAINT fee_rules_target_scope_check
    CHECK (target_scope IN ('grade_level', 'classrooms', 'students'));

ALTER TABLE public.fee_rules
  DROP CONSTRAINT IF EXISTS fee_rules_recurrence_check;
ALTER TABLE public.fee_rules
  ADD CONSTRAINT fee_rules_recurrence_check
    CHECK (recurrence IN ('monthly', 'quarterly', 'semester', 'yearly'));

ALTER TABLE public.fee_rules
  DROP CONSTRAINT IF EXISTS fee_rules_end_month_check;
ALTER TABLE public.fee_rules
  ADD CONSTRAINT fee_rules_end_month_check
    CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12));

ALTER TABLE public.fee_rules
  DROP CONSTRAINT IF EXISTS fee_rules_target_grade_check;
ALTER TABLE public.fee_rules
  ADD CONSTRAINT fee_rules_target_grade_check
    CHECK (
      (target_scope = 'grade_level' AND grade_level IS NOT NULL)
      OR (target_scope IN ('classrooms', 'students'))
    );

ALTER TABLE public.fee_rules ALTER COLUMN grade_level DROP NOT NULL;

UPDATE public.fee_rules SET grade_level = NULL WHERE target_scope IN ('classrooms', 'students');

ALTER TABLE public.fee_rules DROP CONSTRAINT IF EXISTS fee_rules_school_id_academic_year_id_grade_level_key;

-- Preenche mês de fim (derivado) para linhas antigas
UPDATE public.fee_rules
SET end_month = ((start_month - 1 + months_count - 1) % 12) + 1
WHERE end_month IS NULL;

-- ---- Tabelas de alvo --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fee_rule_classrooms (
  fee_rule_id uuid NOT NULL REFERENCES public.fee_rules(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (fee_rule_id, classroom_id)
);

CREATE TABLE IF NOT EXISTS public.fee_rule_students (
  fee_rule_id uuid NOT NULL REFERENCES public.fee_rules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (fee_rule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_fee_rule_classrooms_classroom ON public.fee_rule_classrooms(classroom_id);
CREATE INDEX IF NOT EXISTS idx_fee_rule_students_student ON public.fee_rule_students(student_id);

ALTER TABLE public.fee_rule_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_rule_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fee rule classrooms viewable by school members" ON public.fee_rule_classrooms;
CREATE POLICY "Fee rule classrooms viewable by school members"
  ON public.fee_rule_classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.fee_rules fr WHERE fr.id = fee_rule_id AND fr.school_id = get_my_school())
  );

DROP POLICY IF EXISTS "Admins manage fee rule classrooms" ON public.fee_rule_classrooms;
CREATE POLICY "Admins manage fee rule classrooms"
  ON public.fee_rule_classrooms FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.fee_rules fr WHERE fr.id = fee_rule_id AND fr.school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.fee_rules fr WHERE fr.id = fee_rule_id AND fr.school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  );

DROP POLICY IF EXISTS "Fee rule students viewable by school members" ON public.fee_rule_students;
CREATE POLICY "Fee rule students viewable by school members"
  ON public.fee_rule_students FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.fee_rules fr WHERE fr.id = fee_rule_id AND fr.school_id = get_my_school())
  );

DROP POLICY IF EXISTS "Admins manage fee rule students" ON public.fee_rule_students;
CREATE POLICY "Admins manage fee rule students"
  ON public.fee_rule_students FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.fee_rules fr WHERE fr.id = fee_rule_id AND fr.school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.fee_rules fr WHERE fr.id = fee_rule_id AND fr.school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  );

-- ---- Geração de propinas (incremental por defeito) --------------------------
CREATE OR REPLACE FUNCTION public.generate_student_fees_for_year(
  _student_id uuid,
  _academic_year_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student record;
  _rule record;
  _year record;
  _discount_percentage numeric := 0;
  _discount_fixed numeric := 0;
  _final_amount numeric;
  _sibling_count integer;
  _family_rule record;
  _override record;
  _i integer;
  _due_date date;
  _month_idx integer;
  _year_part integer;
  _created_count integer := 0;
  _step integer := 1;
  _im integer;
  _insert_this boolean;
  _has_existing boolean;
  _today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT s.id, s.school_id, s.parent_id, c.grade_level, s.classroom_id
  INTO _student
  FROM public.students s
  LEFT JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN 0;
  END IF;

  _rule := NULL;

  SELECT fr.* INTO _rule
  FROM public.fee_rules fr
  INNER JOIN public.fee_rule_students fs ON fs.fee_rule_id = fr.id AND fs.student_id = _student_id
  WHERE fr.school_id = _student.school_id
    AND (fr.academic_year_id = _academic_year_id OR fr.academic_year_id IS NULL)
  ORDER BY fr.academic_year_id NULLS LAST
  LIMIT 1;

  IF _rule IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT fr.* INTO _rule
    FROM public.fee_rules fr
    INNER JOIN public.fee_rule_classrooms fc ON fc.fee_rule_id = fr.id AND fc.classroom_id = _student.classroom_id
    WHERE fr.school_id = _student.school_id
      AND (fr.academic_year_id = _academic_year_id OR fr.academic_year_id IS NULL)
    ORDER BY fr.academic_year_id NULLS LAST
    LIMIT 1;
  END IF;

  IF _rule IS NULL AND _student.grade_level IS NOT NULL THEN
    SELECT fr.* INTO _rule
    FROM public.fee_rules fr
    WHERE fr.school_id = _student.school_id
      AND (fr.academic_year_id = _academic_year_id OR fr.academic_year_id IS NULL)
      AND fr.target_scope = 'grade_level'
      AND fr.grade_level = _student.grade_level
    ORDER BY fr.academic_year_id NULLS LAST
    LIMIT 1;
  END IF;

  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _override
  FROM public.student_discounts
  WHERE student_id = _student_id
    AND (academic_year_id = _academic_year_id OR academic_year_id IS NULL)
    AND is_active = true
  ORDER BY academic_year_id NULLS LAST
  LIMIT 1;

  IF _override IS NOT NULL THEN
    _discount_percentage := COALESCE(_override.discount_percentage, 0);
    _discount_fixed := COALESCE(_override.discount_fixed_amount, 0);
  ELSIF _student.parent_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _sibling_count
    FROM public.students
    WHERE parent_id = _student.parent_id
      AND school_id = _student.school_id;

    IF _sibling_count >= 2 THEN
      SELECT pos INTO _i FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS pos
        FROM public.students
        WHERE parent_id = _student.parent_id
          AND school_id = _student.school_id
      ) t WHERE id = _student_id;

      IF _i >= 2 THEN
        SELECT * INTO _family_rule
        FROM public.family_discount_rules
        WHERE school_id = _student.school_id
          AND sibling_position <= _i
        ORDER BY sibling_position DESC
        LIMIT 1;

        IF _family_rule IS NOT NULL THEN
          _discount_percentage := _family_rule.discount_percentage;
        END IF;
      END IF;
    END IF;
  END IF;

  _final_amount := _rule.monthly_amount * (1 - _discount_percentage / 100) - _discount_fixed;
  IF _final_amount < 0 THEN _final_amount := 0; END IF;

  _step := CASE COALESCE(_rule.recurrence, 'monthly')
    WHEN 'quarterly' THEN 3
    WHEN 'semester' THEN 6
    WHEN 'yearly' THEN 12
    ELSE 1
  END;

  FOR _i IN 0.._rule.months_count - 1 LOOP
    _im := _i * _step;
    _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
    _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
    _due_date := make_date(_year_part, _month_idx, LEAST(_rule.due_day, 28));

    SELECT EXISTS (
      SELECT 1 FROM public.student_fees sf
      WHERE sf.student_id = _student_id
        AND sf.academic_year_id = _academic_year_id
        AND sf.month_index = _month_idx
    ) INTO _has_existing;

    IF _has_existing THEN
      CONTINUE;
    END IF;

    IF COALESCE(_rule.generate_all_upfront, false) THEN
      _insert_this := true;
    ELSE
      _insert_this := (_due_date <= _today)
        OR (
          EXTRACT(YEAR FROM _due_date) = EXTRACT(YEAR FROM _today)
          AND EXTRACT(MONTH FROM _due_date) = EXTRACT(MONTH FROM _today)
        );
    END IF;

    IF NOT _insert_this THEN
      CONTINUE;
    END IF;

    INSERT INTO public.student_fees (
      student_id, academic_year_id, amount_due, due_date, month_index, is_paid
    )
    VALUES (
      _student_id, _academic_year_id, _final_amount, _due_date, _month_idx, false
    );
    _created_count := _created_count + 1;
  END LOOP;

  RETURN _created_count;
END;
$$;

-- ---- clone_academic_year: clonar regras e mapear turmas -----------------------
CREATE OR REPLACE FUNCTION public.clone_academic_year(
  _school_id uuid,
  _source_year_id uuid,
  _new_label text,
  _new_start date,
  _new_end date,
  _clone_courses boolean DEFAULT false,
  _clone_classrooms boolean DEFAULT false,
  _clone_fee_rules boolean DEFAULT false,
  _clone_subjects boolean DEFAULT false,
  _set_active boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_year_id uuid;
  _courses_cloned int := 0;
  _classrooms_cloned int := 0;
  _fee_rules_cloned int := 0;
  _subjects_cloned int := 0;
  r record;
  _new_rule_id uuid;
  _old_class uuid;
  _new_class uuid;
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id é obrigatório';
  END IF;
  IF _new_label IS NULL OR length(trim(_new_label)) = 0 THEN
    RAISE EXCEPTION 'Nome do ano letivo é obrigatório';
  END IF;
  IF _new_start IS NULL OR _new_end IS NULL OR _new_end <= _new_start THEN
    RAISE EXCEPTION 'Datas inválidas';
  END IF;

  IF _set_active THEN
    UPDATE public.academic_years SET is_active = false WHERE school_id = _school_id;
  END IF;

  INSERT INTO public.academic_years (school_id, label, start_date, end_date, is_active)
  VALUES (_school_id, trim(_new_label), _new_start, _new_end, COALESCE(_set_active, false))
  RETURNING id INTO _new_year_id;

  IF _clone_courses THEN
    SELECT COUNT(*) INTO _courses_cloned FROM public.courses WHERE school_id = _school_id;
  END IF;

  IF _clone_subjects THEN
    SELECT COUNT(*) INTO _subjects_cloned FROM public.subjects WHERE school_id = _school_id;
  END IF;

  IF _clone_classrooms AND _source_year_id IS NOT NULL THEN
    INSERT INTO public.classrooms (school_id, academic_year_id, course_id, name, grade_level, period)
    SELECT school_id, _new_year_id, course_id, name, grade_level, period
    FROM public.classrooms
    WHERE school_id = _school_id AND academic_year_id = _source_year_id;
    GET DIAGNOSTICS _classrooms_cloned = ROW_COUNT;
  END IF;

  IF _clone_fee_rules AND _source_year_id IS NOT NULL THEN
    FOR r IN
      SELECT * FROM public.fee_rules
      WHERE school_id = _school_id AND academic_year_id = _source_year_id
    LOOP
      INSERT INTO public.fee_rules (
        school_id,
        academic_year_id,
        grade_level,
        monthly_amount,
        due_day,
        months_count,
        start_month,
        end_month,
        notes,
        target_scope,
        recurrence,
        generate_all_upfront
      )
      VALUES (
        r.school_id,
        _new_year_id,
        r.grade_level,
        r.monthly_amount,
        r.due_day,
        r.months_count,
        r.start_month,
        r.end_month,
        r.notes,
        COALESCE(r.target_scope, 'grade_level'),
        COALESCE(r.recurrence, 'monthly'),
        COALESCE(r.generate_all_upfront, false)
      )
      RETURNING id INTO _new_rule_id;

      INSERT INTO public.fee_rule_students (fee_rule_id, student_id)
      SELECT _new_rule_id, frs.student_id
      FROM public.fee_rule_students frs
      WHERE frs.fee_rule_id = r.id;

      IF _clone_classrooms THEN
        FOR _old_class, _new_class IN
          SELECT oc.id, nc.id
          FROM public.classrooms oc
          INNER JOIN public.classrooms nc
            ON nc.school_id = oc.school_id
            AND nc.academic_year_id = _new_year_id
            AND nc.name = oc.name
            AND nc.course_id IS NOT DISTINCT FROM oc.course_id
            AND nc.grade_level IS NOT DISTINCT FROM oc.grade_level
          WHERE oc.school_id = _school_id
            AND oc.academic_year_id = _source_year_id
        LOOP
          IF EXISTS (
            SELECT 1 FROM public.fee_rule_classrooms frc
            WHERE frc.fee_rule_id = r.id AND frc.classroom_id = _old_class
          ) THEN
            INSERT INTO public.fee_rule_classrooms (fee_rule_id, classroom_id)
            VALUES (_new_rule_id, _new_class)
            ON CONFLICT DO NOTHING;
          END IF;
        END LOOP;
      END IF;

      _fee_rules_cloned := _fee_rules_cloned + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'new_year_id', _new_year_id,
    'courses', _courses_cloned,
    'subjects', _subjects_cloned,
    'classrooms', _classrooms_cloned,
    'fee_rules', _fee_rules_cloned
  );
END;
$$;
