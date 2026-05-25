-- Adicionar parâmetro _force_all à função generate_student_fees_for_year
-- Quando TRUE, gera todas as propinas do ano (ignora filtro de data)
-- Usado pelo botão "Gerar propinas do ano"

-- Criar overload com 3 parâmetros (mantém a versão de 2 parâmetros para compatibilidade)
CREATE OR REPLACE FUNCTION public.generate_student_fees_for_year(
  _student_id uuid,
  _academic_year_id uuid,
  _force_all boolean DEFAULT false
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

  -- Prioridade: aluno específico > turma > nível
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

  -- Descontos
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

    _due_date := public.charge_rule_adjust_due_to_academic_year(
      _due_date, _year.start_date, _year.end_date
    );
    IF _due_date IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.student_fees sf
      WHERE sf.student_id = _student_id
        AND sf.academic_year_id = _academic_year_id
        AND sf.month_index = _month_idx
    ) INTO _has_existing;

    IF _has_existing THEN
      CONTINUE;
    END IF;

    -- _force_all = true: gerar todas independentemente da data
    IF _force_all OR COALESCE(_rule.generate_all_upfront, false) THEN
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
