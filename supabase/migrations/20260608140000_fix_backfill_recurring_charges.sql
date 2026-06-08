-- Corrigir backfill automático: datas com billing_start_date, prioridade de regras, e valor 0.

CREATE OR REPLACE FUNCTION public.resolve_fee_rule_id_for_student(
  _student_id uuid,
  _academic_year_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student record;
  _rule_id uuid;
BEGIN
  SELECT s.id, s.school_id, s.classroom_id, c.grade_level
  INTO _student
  FROM public.students s
  LEFT JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT fr.id INTO _rule_id
  FROM public.fee_rules fr
  INNER JOIN public.fee_rule_students fs ON fs.fee_rule_id = fr.id AND fs.student_id = _student_id
  WHERE fr.school_id = _student.school_id
    AND (fr.academic_year_id IS NULL OR fr.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (fr.academic_year_id IS NOT NULL) DESC, fr.created_at DESC
  LIMIT 1;

  IF _rule_id IS NOT NULL THEN
    RETURN _rule_id;
  END IF;

  IF _student.classroom_id IS NOT NULL THEN
    SELECT fr.id INTO _rule_id
    FROM public.fee_rules fr
    INNER JOIN public.fee_rule_classrooms fc ON fc.fee_rule_id = fr.id AND fc.classroom_id = _student.classroom_id
    WHERE fr.school_id = _student.school_id
      AND (fr.academic_year_id IS NULL OR fr.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (fr.academic_year_id IS NOT NULL) DESC, fr.created_at DESC
    LIMIT 1;

    IF _rule_id IS NOT NULL THEN
      RETURN _rule_id;
    END IF;
  END IF;

  IF _student.grade_level IS NOT NULL THEN
    SELECT fr.id INTO _rule_id
    FROM public.fee_rules fr
    WHERE fr.school_id = _student.school_id
      AND fr.target_scope = 'grade_level'
      AND fr.grade_level = _student.grade_level
      AND (fr.academic_year_id IS NULL OR fr.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (fr.academic_year_id IS NOT NULL) DESC, fr.created_at DESC
    LIMIT 1;
  END IF;

  RETURN _rule_id;
END;
$$;

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
  _winning_rule_id uuid;
  _discount_percentage numeric := 0;
  _discount_fixed numeric := 0;
  _final_amount numeric;
  _sibling_count integer;
  _family_rule record;
  _override record;
  _pos integer;
  _due_date date;
  _month_idx integer;
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

  SELECT * INTO _rule
  FROM public.fee_rules
  WHERE id = _fee_rule_id AND school_id = _student.school_id;

  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  IF _rule.academic_year_id IS NOT NULL AND _rule.academic_year_id IS DISTINCT FROM _academic_year_id THEN
    RETURN 0;
  END IF;

  _winning_rule_id := public.resolve_fee_rule_id_for_student(_student_id, _academic_year_id);
  IF _winning_rule_id IS DISTINCT FROM _fee_rule_id THEN
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
    WHERE parent_id = _student.parent_id AND school_id = _student.school_id;

    IF _sibling_count >= 2 THEN
      SELECT pos INTO _pos FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS pos
        FROM public.students
        WHERE parent_id = _student.parent_id AND school_id = _student.school_id
      ) t WHERE id = _student_id;

      IF _pos >= 2 THEN
        SELECT * INTO _family_rule
        FROM public.family_discount_rules
        WHERE school_id = _student.school_id AND sibling_position <= _pos
        ORDER BY sibling_position DESC
        LIMIT 1;

        IF _family_rule IS NOT NULL THEN
          _discount_percentage := _family_rule.discount_percentage;
        END IF;
      END IF;
    END IF;
  END IF;

  _final_amount := _rule.monthly_amount * (1 - _discount_percentage / 100) - _discount_fixed;
  IF _final_amount < 0 THEN
    _final_amount := 0;
  END IF;

  _due_date := public.charge_rule_period_due_date(
    _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
    _period_index, _rule.recurrence, _rule.due_day
  );

  IF _due_date IS NULL THEN
    RETURN 0;
  END IF;

  _month_idx := EXTRACT(MONTH FROM _due_date)::int;

  SELECT EXISTS (
    SELECT 1 FROM public.student_fees sf
    WHERE sf.student_id = _student_id
      AND sf.academic_year_id = _academic_year_id
      AND sf.due_date = _due_date
  ) INTO _has_existing;

  IF _has_existing THEN
    RETURN 0;
  END IF;

  INSERT INTO public.student_fees (student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
  VALUES (_student_id, _academic_year_id, _final_amount, _due_date, _month_idx, false);

  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_recurring_charges_for_fee_rule(_fee_rule_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rule record;
  _year record;
  _student_id uuid;
  _created integer := 0;
  _period integer;
  _due_date date;
BEGIN
  SELECT * INTO _rule FROM public.fee_rules WHERE id = _fee_rule_id;
  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  IF _rule.academic_year_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _rule.academic_year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  FOR _student_id IN
    SELECT DISTINCT s.id
    FROM public.students s
    WHERE s.school_id = _rule.school_id
      AND (
        (
          _rule.target_scope = 'students'
          AND EXISTS (
            SELECT 1 FROM public.fee_rule_students fs
            WHERE fs.fee_rule_id = _rule.id AND fs.student_id = s.id
          )
        )
        OR (
          _rule.target_scope = 'classrooms'
          AND s.classroom_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.fee_rule_classrooms fc
            INNER JOIN public.classrooms c ON c.id = fc.classroom_id
            WHERE fc.fee_rule_id = _rule.id
              AND fc.classroom_id = s.classroom_id
              AND c.academic_year_id = _rule.academic_year_id
          )
        )
        OR (
          _rule.target_scope = 'grade_level'
          AND _rule.grade_level IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = s.classroom_id
              AND c.academic_year_id = _rule.academic_year_id
              AND c.grade_level = _rule.grade_level
          )
        )
      )
  LOOP
    FOR _period IN 0..GREATEST(0, COALESCE(_rule.months_count, 1) - 1) LOOP
      _due_date := public.charge_rule_period_due_date(
        _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
        _period, _rule.recurrence, _rule.due_day
      );

      IF _due_date IS NULL THEN
        CONTINUE;
      END IF;

      IF NOT public.charge_rule_period_is_due_now(_due_date, _rule.generate_all_upfront) THEN
        CONTINUE;
      END IF;

      _created := _created + public.generate_student_fee_for_rule_period(
        _student_id, _rule.academic_year_id, _fee_rule_id, _period
      );
    END LOOP;
  END LOOP;

  RETURN _created;
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_recurring_charges_for_domain_rule(
  _domain text,
  _charge_rule_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rule record;
  _year record;
  _enrollment_id uuid;
  _student_id uuid;
  _entity_id uuid;
  _created integer := 0;
  _period integer;
  _due_date date;
  _year_id uuid;
BEGIN
  IF _domain = 'activity' THEN
    SELECT r.*, r.activity_id AS entity_id INTO _rule
    FROM public.activity_charge_rules r WHERE r.id = _charge_rule_id;
  ELSIF _domain = 'transport' THEN
    SELECT r.*, r.route_id AS entity_id INTO _rule
    FROM public.transport_charge_rules r WHERE r.id = _charge_rule_id;
  ELSIF _domain = 'meal' THEN
    SELECT r.*, r.meal_program_id AS entity_id INTO _rule
    FROM public.meal_charge_rules r WHERE r.id = _charge_rule_id;
  ELSE
    RETURN 0;
  END IF;

  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  _entity_id := _rule.entity_id;
  _year_id := _rule.academic_year_id;

  IF _year_id IS NULL THEN
    SELECT id INTO _year_id
    FROM public.academic_years
    WHERE school_id = _rule.school_id AND is_active = true
    ORDER BY start_date DESC
    LIMIT 1;
  END IF;

  IF _year_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  FOR _enrollment_id, _student_id IN
    SELECT e.id, e.student_id
    FROM (
      SELECT te.id, te.student_id, te.school_id, te.route_id AS entity_id
      FROM public.transport_enrollments te
      WHERE _domain = 'transport'
      UNION ALL
      SELECT me.id, me.student_id, me.school_id, me.meal_program_id AS entity_id
      FROM public.meal_enrollments me
      WHERE _domain = 'meal' AND COALESCE(me.status, '') = 'ACTIVE'
      UNION ALL
      SELECT ae.id, ae.student_id, ae.school_id, ae.activity_id AS entity_id
      FROM public.extracurricular_enrollments ae
      WHERE _domain = 'activity'
    ) e
    INNER JOIN public.students s ON s.id = e.student_id
    WHERE e.school_id = _rule.school_id
      AND e.entity_id = _entity_id
      AND (
        _rule.target_scope = 'all_enrolled'
        OR (
          _rule.target_scope = 'students'
          AND (
            (_domain = 'activity' AND EXISTS (
              SELECT 1 FROM public.activity_charge_rule_students rs
              WHERE rs.charge_rule_id = _rule.id AND rs.student_id = e.student_id
            ))
            OR (_domain = 'transport' AND EXISTS (
              SELECT 1 FROM public.transport_charge_rule_students rs
              WHERE rs.charge_rule_id = _rule.id AND rs.student_id = e.student_id
            ))
            OR (_domain = 'meal' AND EXISTS (
              SELECT 1 FROM public.meal_charge_rule_students rs
              WHERE rs.charge_rule_id = _rule.id AND rs.student_id = e.student_id
            ))
          )
        )
        OR (
          _rule.target_scope = 'classrooms'
          AND s.classroom_id IS NOT NULL
          AND (
            (_domain = 'activity' AND EXISTS (
              SELECT 1 FROM public.activity_charge_rule_classrooms rc
              INNER JOIN public.classrooms c ON c.id = rc.classroom_id
              WHERE rc.charge_rule_id = _rule.id
                AND rc.classroom_id = s.classroom_id
                AND (c.academic_year_id IS NULL OR c.academic_year_id = _year_id)
            ))
            OR (_domain = 'transport' AND EXISTS (
              SELECT 1 FROM public.transport_charge_rule_classrooms rc
              INNER JOIN public.classrooms c ON c.id = rc.classroom_id
              WHERE rc.charge_rule_id = _rule.id
                AND rc.classroom_id = s.classroom_id
                AND (c.academic_year_id IS NULL OR c.academic_year_id = _year_id)
            ))
            OR (_domain = 'meal' AND EXISTS (
              SELECT 1 FROM public.meal_charge_rule_classrooms rc
              INNER JOIN public.classrooms c ON c.id = rc.classroom_id
              WHERE rc.charge_rule_id = _rule.id
                AND rc.classroom_id = s.classroom_id
                AND (c.academic_year_id IS NULL OR c.academic_year_id = _year_id)
            ))
          )
        )
      )
  LOOP
    FOR _period IN 0..GREATEST(0, COALESCE(_rule.months_count, 1) - 1) LOOP
      _due_date := public.charge_rule_period_due_date(
        _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
        _period, _rule.recurrence, _rule.due_day
      );

      IF _due_date IS NULL THEN
        CONTINUE;
      END IF;

      IF NOT public.charge_rule_period_is_due_now(_due_date, _rule.generate_all_upfront) THEN
        CONTINUE;
      END IF;

      IF _domain = 'activity' THEN
        _created := _created + public.generate_activity_fee_for_rule_period(
          _student_id, _year_id, _charge_rule_id, _period
        );
      ELSIF _domain = 'transport' THEN
        _created := _created + public.generate_transport_fee_for_rule_period(
          _student_id, _year_id, _charge_rule_id, _period
        );
      ELSE
        _created := _created + public.generate_meal_fee_for_rule_period(
          _student_id, _year_id, _charge_rule_id, _period
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN _created;
END;
$$;
