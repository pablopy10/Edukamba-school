
-- 1) Tornar classrooms.academic_year_id obrigatório (já está populado)
ALTER TABLE public.classrooms
  ALTER COLUMN academic_year_id SET NOT NULL;

-- 2) RPC para clonar dados de um ano letivo para outro
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

  -- Etapa 1: criar ano
  IF _set_active THEN
    UPDATE public.academic_years SET is_active = false WHERE school_id = _school_id;
  END IF;

  INSERT INTO public.academic_years (school_id, label, start_date, end_date, is_active)
  VALUES (_school_id, trim(_new_label), _new_start, _new_end, COALESCE(_set_active, false))
  RETURNING id INTO _new_year_id;

  -- Etapa 2: cursos (sem academic_year_id, apenas garantir existência por nome)
  -- Cursos são partilhados na escola; não são duplicados, contam-se os existentes
  IF _clone_courses THEN
    SELECT COUNT(*) INTO _courses_cloned FROM public.courses WHERE school_id = _school_id;
  END IF;

  -- Etapa 3: subjects (também partilhadas por escola)
  IF _clone_subjects THEN
    SELECT COUNT(*) INTO _subjects_cloned FROM public.subjects WHERE school_id = _school_id;
  END IF;

  -- Etapa 4: turmas
  IF _clone_classrooms AND _source_year_id IS NOT NULL THEN
    INSERT INTO public.classrooms (school_id, academic_year_id, course_id, name, grade_level, period)
    SELECT school_id, _new_year_id, course_id, name, grade_level, period
    FROM public.classrooms
    WHERE school_id = _school_id AND academic_year_id = _source_year_id;
    GET DIAGNOSTICS _classrooms_cloned = ROW_COUNT;
  END IF;

  -- Etapa 5: regras de propinas
  IF _clone_fee_rules AND _source_year_id IS NOT NULL THEN
    INSERT INTO public.fee_rules (school_id, academic_year_id, grade_level, monthly_amount, due_day, months_count, start_month, notes)
    SELECT school_id, _new_year_id, grade_level, monthly_amount, due_day, months_count, start_month, notes
    FROM public.fee_rules
    WHERE school_id = _school_id AND academic_year_id = _source_year_id;
    GET DIAGNOSTICS _fee_rules_cloned = ROW_COUNT;
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
