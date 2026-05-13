-- Gera manualmente uma propina (student_fees) para um período concreto da regra aplicável ao aluno.
-- Ignora incremental / generate_all_upfront: só cria se ainda não existir linha (student + ano + month_index).

CREATE OR REPLACE FUNCTION public.generate_student_fee_for_rule_period(
  _student_id uuid,
  _academic_year_id uuid,
  _fee_rule_id uuid,
  _period_index integer
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
  _pos integer;
  _due_date date;
  _month_idx integer;
  _year_part integer;
  _step integer := 1;
  _im integer;
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN
    RETURN 0;
  END IF;

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

  IF _rule.id <> _fee_rule_id THEN
    RETURN 0;
  END IF;

  IF _period_index > _rule.months_count - 1 THEN
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
      SELECT pos INTO _pos FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS pos
        FROM public.students
        WHERE parent_id = _student.parent_id
          AND school_id = _student.school_id
      ) t WHERE id = _student_id;

      IF _pos >= 2 THEN
        SELECT * INTO _family_rule
        FROM public.family_discount_rules
        WHERE school_id = _student.school_id
          AND sibling_position <= _pos
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

  _im := _period_index * _step;
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
    RETURN 0;
  END IF;

  INSERT INTO public.student_fees (
    student_id, academic_year_id, amount_due, due_date, month_index, is_paid
  )
  VALUES (
    _student_id, _academic_year_id, _final_amount, _due_date, _month_idx, false
  );

  RETURN 1;
END;
$$;

COMMENT ON FUNCTION public.generate_student_fee_for_rule_period(uuid, uuid, uuid, integer) IS
  'Cria uma propina para um período específico (índice 0-based) quando ainda não existe, desde que a regra indicada seja a aplicável ao aluno.';

