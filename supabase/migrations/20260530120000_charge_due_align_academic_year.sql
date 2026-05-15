-- Ajusta datas de vencimento nominais (make_date + year_part sobre start_month) para ficarem dentro
-- do intervalo [start_date, end_date] do ano letivo. Evita primeira parcela "fora do ano"
-- ou totalmente omitida quando start_month está antes do mês inicial do ano no calendário.

CREATE OR REPLACE FUNCTION public.charge_rule_adjust_due_to_academic_year(
  p_nominal_due date,
  p_year_start date,
  p_year_end date
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  d date;
  _guard integer := 0;
BEGIN
  IF p_nominal_due IS NULL OR p_year_start IS NULL THEN
    RETURN NULL;
  END IF;

  d := p_nominal_due;

  WHILE d < p_year_start LOOP
    d := (d + INTERVAL '12 months')::date;
    _guard := _guard + 1;
    IF _guard > 32 THEN
      RETURN NULL;
    END IF;
  END LOOP;

  IF p_year_end IS NOT NULL AND d > p_year_end THEN
    RETURN NULL;
  END IF;

  RETURN d;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_rule_adjust_due_to_academic_year(date, date, date) FROM PUBLIC;

-- ---- generate_student_fees_for_year ------------------------------------------
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

-- ---- generate_activity_fees (rama de activity_charge_rules) ----------------
CREATE OR REPLACE FUNCTION public.generate_activity_fees(_enrollment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enroll record;
  _activity record;
  _student record;
  _rule record;
  _year record;
  _billing_year uuid;
  _step integer := 1;
  _created_count integer := 0;
  _i integer;
  _due_date date;
  _month_idx integer;
  _year_part integer;
  _im integer;
  _insert_this boolean;
  _today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  _months_count integer;
BEGIN
  SELECT * INTO _enroll FROM public.extracurricular_enrollments WHERE id = _enrollment_id;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _activity FROM public.extracurricular_activities WHERE id = _enroll.activity_id;
  IF _activity IS NULL THEN RETURN 0; END IF;

  SELECT s.id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _enroll.student_id;

  IF _student IS NULL THEN RETURN 0; END IF;

  _billing_year := COALESCE(_activity.academic_year_id,
    (SELECT id FROM public.academic_years WHERE school_id = _enroll.school_id AND is_active LIMIT 1));

  _rule := NULL;

  SELECT r.* INTO _rule
  FROM public.activity_charge_rules r
  INNER JOIN public.activity_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _enroll.student_id
  WHERE r.school_id = _enroll.school_id
    AND r.activity_id = _activity.id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
  ORDER BY (r.academic_year_id IS NULL) ASC
  LIMIT 1;

  IF _rule IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.* INTO _rule
    FROM public.activity_charge_rules r
    INNER JOIN public.activity_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _enroll.school_id
      AND r.activity_id = _activity.id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _rule IS NULL THEN
    SELECT r.* INTO _rule
    FROM public.activity_charge_rules r
    WHERE r.school_id = _enroll.school_id
      AND r.activity_id = _activity.id
      AND r.target_scope = 'all_enrolled'
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  DELETE FROM public.activity_fees
  WHERE enrollment_id = _enrollment_id AND is_paid = false;

  IF _rule IS NOT NULL AND COALESCE(_rule.monthly_amount, 0) > 0 THEN
    SELECT * INTO _year FROM public.academic_years
    WHERE id = COALESCE(_rule.academic_year_id, _billing_year);
    IF _year IS NULL THEN RETURN 0; END IF;

    _step := CASE COALESCE(_rule.recurrence, 'monthly')
      WHEN 'quarterly' THEN 3
      WHEN 'semester' THEN 6
      WHEN 'yearly' THEN 12
      ELSE 1
    END;

    FOR _i IN 0..GREATEST(0, COALESCE(_rule.months_count, 1) - 1) LOOP
      _im := _i * _step;
      _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));

      _due_date := public.charge_rule_adjust_due_to_academic_year(
        _due_date, _year.start_date, _year.end_date
      );
      IF _due_date IS NULL THEN
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

      INSERT INTO public.activity_fees (
        enrollment_id, activity_id, student_id, school_id, academic_year_id,
        amount_due, due_date, month_index, is_paid
      )
      VALUES (
        _enrollment_id, _activity.id, _enroll.student_id, _enroll.school_id,
        COALESCE(_rule.academic_year_id, _billing_year),
        COALESCE(_rule.monthly_amount, 0), _due_date, _month_idx, false
      );
      _created_count := _created_count + 1;
    END LOOP;

    RETURN _created_count;
  END IF;

  IF COALESCE(_activity.enrollment_fee, 0) <= 0 THEN RETURN 0; END IF;

  IF COALESCE(_activity.billing_frequency, 'unica') = 'unica' OR _activity.billing_frequency IS NULL THEN
    INSERT INTO public.activity_fees (
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

  IF COALESCE(_activity.billing_frequency, '') = 'mensal' AND _activity.start_date IS NOT NULL AND _activity.end_date IS NOT NULL THEN
    _months_count := GREATEST(
      1,
      (EXTRACT(YEAR FROM age(date_trunc('month', _activity.end_date), date_trunc('month', _activity.start_date)))::int * 12)
      + EXTRACT(MONTH FROM age(date_trunc('month', _activity.end_date), date_trunc('month', _activity.start_date)))::int
      + 1
    );

    FOR _i IN 0.._months_count - 1 LOOP
      _month_idx := ((EXTRACT(MONTH FROM _activity.start_date)::int - 1 + _i) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _activity.start_date)::int + ((EXTRACT(MONTH FROM _activity.start_date)::int - 1 + _i) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(EXTRACT(DAY FROM _activity.start_date)::int, 28));

      INSERT INTO public.activity_fees (
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

REVOKE EXECUTE ON FUNCTION public.generate_activity_fees(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_activity_fees(uuid) TO authenticated;

-- ---- generate_transport_fees (rama charge_rules) -----------------------------
CREATE OR REPLACE FUNCTION public.generate_transport_fees(_enrollment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enroll record;
  _route record;
  _student record;
  _rule record;
  _year record;
  _billing_year uuid;
  _amount numeric;
  _i integer;
  _months_count integer;
  _start_month integer;
  _year_part integer;
  _month_idx integer;
  _due_day integer := 10;
  _due_date date;
  _start_date date;
  _end_date date;
  _created integer := 0;
  _step integer := 1;
  _im integer;
  _insert_this boolean;
  _today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO _enroll FROM public.transport_enrollments WHERE id = _enrollment_id;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _route FROM public.transport_routes WHERE id = _enroll.route_id;
  IF _route IS NULL THEN RETURN 0; END IF;

  SELECT s.id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _enroll.student_id;

  IF _student IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.transport_fees
  WHERE enrollment_id = _enrollment_id AND is_paid = false;

  _billing_year := (SELECT id FROM public.academic_years WHERE school_id = _enroll.school_id AND is_active LIMIT 1);

  _rule := NULL;

  SELECT r.* INTO _rule
  FROM public.transport_charge_rules r
  INNER JOIN public.transport_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _enroll.student_id
  WHERE r.school_id = _enroll.school_id
    AND r.route_id = _enroll.route_id
    AND (_billing_year IS NULL OR r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
  ORDER BY (r.academic_year_id IS NULL) ASC
  LIMIT 1;

  IF _rule IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.* INTO _rule
    FROM public.transport_charge_rules r
    INNER JOIN public.transport_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _enroll.school_id
      AND r.route_id = _enroll.route_id
      AND (_billing_year IS NULL OR r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _rule IS NULL THEN
    SELECT r.* INTO _rule
    FROM public.transport_charge_rules r
    WHERE r.school_id = _enroll.school_id
      AND r.route_id = _enroll.route_id
      AND r.target_scope = 'all_enrolled'
      AND (_billing_year IS NULL OR r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _rule IS NOT NULL AND COALESCE(_rule.monthly_amount, 0) > 0 THEN
    SELECT * INTO _year FROM public.academic_years WHERE id = COALESCE(_rule.academic_year_id, _billing_year);
    IF _year IS NULL THEN
      RETURN 0;
    END IF;

    _step := CASE COALESCE(_rule.recurrence, 'monthly')
      WHEN 'quarterly' THEN 3
      WHEN 'semester' THEN 6
      WHEN 'yearly' THEN 12
      ELSE 1
    END;

    FOR _i IN 0..GREATEST(0, COALESCE(_rule.months_count, 1) - 1) LOOP
      _im := _i * _step;
      _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));

      _due_date := public.charge_rule_adjust_due_to_academic_year(
        _due_date, _year.start_date, _year.end_date
      );
      IF _due_date IS NULL THEN
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

      INSERT INTO public.transport_fees (
        school_id, enrollment_id, student_id, route_id, academic_year_id,
        amount_due, due_date, month_index, is_paid
      ) VALUES (
        _enroll.school_id, _enroll.id, _enroll.student_id, _enroll.route_id,
        COALESCE(_rule.academic_year_id, _billing_year),
        _rule.monthly_amount, _due_date, _month_idx, false
      );
      _created := _created + 1;
    END LOOP;

    RETURN _created;
  END IF;

  _amount := COALESCE(_enroll.monthly_fee_override, _route.monthly_fee, 0);
  IF _amount <= 0 THEN RETURN 0; END IF;

  _start_date := _enroll.start_date;
  IF _enroll.end_date IS NOT NULL THEN
    _end_date := _enroll.end_date;
  ELSE
    SELECT * INTO _year FROM public.academic_years
    WHERE school_id = _enroll.school_id AND is_active = true LIMIT 1;
    IF _year IS NOT NULL AND _year.end_date > _start_date THEN
      _end_date := _year.end_date;
    ELSE
      _end_date := (_start_date + INTERVAL '10 months')::date;
    END IF;
  END IF;

  _months_count := GREATEST(
    1,
    (EXTRACT(YEAR FROM age(date_trunc('month', _end_date), date_trunc('month', _start_date)))::int * 12)
    + EXTRACT(MONTH FROM age(date_trunc('month', _end_date), date_trunc('month', _start_date)))::int
    + 1
  );

  _start_month := EXTRACT(MONTH FROM _start_date)::int;
  _due_day := LEAST(EXTRACT(DAY FROM _start_date)::int, 28);

  FOR _i IN 0.._months_count - 1 LOOP
    _month_idx := ((_start_month - 1 + _i) % 12) + 1;
    _year_part := EXTRACT(YEAR FROM _start_date)::int + ((_start_month - 1 + _i) / 12);
    _due_date := make_date(_year_part, _month_idx, _due_day);

    INSERT INTO public.transport_fees (
      school_id, enrollment_id, student_id, route_id, academic_year_id,
      amount_due, due_date, month_index, is_paid
    ) VALUES (
      _enroll.school_id, _enroll.id, _enroll.student_id, _enroll.route_id,
      _billing_year,
      _amount, _due_date, _month_idx, false
    );
    _created := _created + 1;
  END LOOP;

  RETURN _created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_transport_fees(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_transport_fees(uuid) TO authenticated;

-- ---- generate_meal_fees (rama meal_charge_rules) -----------------------------
CREATE OR REPLACE FUNCTION public.generate_meal_fees(_enrollment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enroll record;
  _program record;
  _student record;
  _rule record;
  _year record;
  _billing_year uuid;
  _amount numeric;
  _i integer;
  _step integer := 1;
  _im integer;
  _insert_this boolean;
  _today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
  _month_idx integer;
  _year_part integer;
  _due_date date;
  _created integer := 0;
  _start_date date;
  _end_date date;
  _months_count integer;
  _start_month integer;
  _due_day integer := 10;
BEGIN
  SELECT * INTO _enroll FROM public.meal_enrollments WHERE id = _enrollment_id;
  IF _enroll IS NULL THEN RETURN 0; END IF;
  IF COALESCE(_enroll.status, '') <> 'ACTIVE' THEN RETURN 0; END IF;

  SELECT * INTO _program FROM public.meal_programs WHERE id = _enroll.meal_program_id;
  IF _program IS NULL THEN RETURN 0; END IF;

  SELECT s.id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _enroll.student_id;

  IF _student IS NULL THEN RETURN 0; END IF;

  DELETE FROM public.meal_fees
  WHERE enrollment_id = _enrollment_id AND is_paid = false;

  _billing_year := COALESCE(_program.academic_year_id,
    (SELECT id FROM public.academic_years WHERE school_id = _enroll.school_id AND is_active LIMIT 1));

  _rule := NULL;

  SELECT r.* INTO _rule
  FROM public.meal_charge_rules r
  INNER JOIN public.meal_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _enroll.student_id
  WHERE r.school_id = _enroll.school_id
    AND r.meal_program_id = _program.id
    AND (_billing_year IS NULL OR r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
  ORDER BY (r.academic_year_id IS NULL) ASC
  LIMIT 1;

  IF _rule IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.* INTO _rule
    FROM public.meal_charge_rules r
    INNER JOIN public.meal_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _enroll.school_id
      AND r.meal_program_id = _program.id
      AND (_billing_year IS NULL OR r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _rule IS NULL THEN
    SELECT r.* INTO _rule
    FROM public.meal_charge_rules r
    WHERE r.school_id = _enroll.school_id
      AND r.meal_program_id = _program.id
      AND r.target_scope = 'all_enrolled'
      AND (_billing_year IS NULL OR r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _billing_year)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _rule IS NOT NULL AND COALESCE(_rule.monthly_amount, 0) > 0 THEN
    SELECT * INTO _year FROM public.academic_years WHERE id = COALESCE(_rule.academic_year_id, _billing_year);
    IF _year IS NULL THEN RETURN 0; END IF;

    _step := CASE COALESCE(_rule.recurrence, 'monthly')
      WHEN 'quarterly' THEN 3
      WHEN 'semester' THEN 6
      WHEN 'yearly' THEN 12
      ELSE 1
    END;

    FOR _i IN 0..GREATEST(0, COALESCE(_rule.months_count, 1) - 1) LOOP
      _im := _i * _step;
      _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));

      _due_date := public.charge_rule_adjust_due_to_academic_year(
        _due_date, _year.start_date, _year.end_date
      );
      IF _due_date IS NULL THEN
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

      INSERT INTO public.meal_fees (
        school_id, enrollment_id, student_id, meal_program_id, academic_year_id,
        amount_due, due_date, month_index, is_paid
      ) VALUES (
        _enroll.school_id, _enroll.id, _enroll.student_id, _program.id,
        COALESCE(_rule.academic_year_id, _billing_year),
        _rule.monthly_amount, _due_date, _month_idx, false
      );
      _created := _created + 1;
    END LOOP;

    RETURN _created;
  END IF;

  _amount := COALESCE(_enroll.monthly_fee_override, _program.default_monthly_fee, 0);
  IF _amount <= 0 THEN RETURN 0; END IF;

  _start_date := _enroll.start_date;
  IF _enroll.end_date IS NOT NULL THEN
    _end_date := _enroll.end_date;
  ELSE
    SELECT * INTO _year FROM public.academic_years
    WHERE school_id = _enroll.school_id AND is_active = true LIMIT 1;
    IF _year IS NOT NULL AND _year.end_date > _start_date THEN
      _end_date := _year.end_date;
    ELSE
      _end_date := (_start_date + INTERVAL '10 months')::date;
    END IF;
  END IF;

  _months_count := GREATEST(
    1,
    (EXTRACT(YEAR FROM age(date_trunc('month', _end_date), date_trunc('month', _start_date)))::int * 12)
    + EXTRACT(MONTH FROM age(date_trunc('month', _end_date), date_trunc('month', _start_date)))::int
    + 1
  );

  _start_month := EXTRACT(MONTH FROM _start_date)::int;
  _due_day := LEAST(EXTRACT(DAY FROM _start_date)::int, 28);

  FOR _i IN 0.._months_count - 1 LOOP
    _month_idx := ((_start_month - 1 + _i) % 12) + 1;
    _year_part := EXTRACT(YEAR FROM _start_date)::int + ((_start_month - 1 + _i) / 12);
    _due_date := make_date(_year_part, _month_idx, _due_day);

    INSERT INTO public.meal_fees (
      school_id, enrollment_id, student_id, meal_program_id, academic_year_id,
      amount_due, due_date, month_index, is_paid
    ) VALUES (
      _enroll.school_id, _enroll.id, _enroll.student_id, _program.id,
      _billing_year,
      _amount, _due_date, _month_idx, false
    );
    _created := _created + 1;
  END LOOP;

  RETURN _created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_meal_fees(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_meal_fees(uuid) TO authenticated;

-- ---- Eventos: várias parcelas (months_count > 1) + alinhamento ao ano ----------
CREATE OR REPLACE FUNCTION public.generate_event_fees(_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _evt RECORD;
  _rule RECORD;
  _due_date DATE;
  _last_day SMALLINT;
  _ins INTEGER := 0;
  _loop_ins INTEGER := 0;
  _billing_year UUID;
  _year RECORD;
  _step INTEGER := 1;
  _i INTEGER;
  _im INTEGER;
  _month_idx INTEGER;
  _year_part INTEGER;
  _insert_this BOOLEAN;
  _today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE;
BEGIN
  SELECT * INTO _evt FROM public.events WHERE id = _event_id;
  IF NOT FOUND OR _evt.school_id IS NULL THEN
    RETURN 0;
  END IF;

  IF upper(trim(coalesce(_evt.audience, ''))) = 'STAFF' THEN
    DELETE FROM public.event_fees ef WHERE ef.event_id = _event_id AND ef.is_paid = false;
    RETURN 0;
  END IF;

  SELECT r.* INTO _rule FROM public.event_charge_rules r WHERE r.event_id = _event_id LIMIT 1;
  IF NOT FOUND THEN
    DELETE FROM public.event_fees ef WHERE ef.event_id = _event_id AND ef.is_paid = false;
    RETURN 0;
  END IF;

  DELETE FROM public.event_fees ef WHERE ef.event_id = _event_id AND ef.is_paid = false;

  _billing_year := COALESCE(
    _rule.academic_year_id,
    (SELECT id FROM public.academic_years WHERE school_id = _evt.school_id AND is_active LIMIT 1)
  );

  SELECT * INTO _year FROM public.academic_years WHERE id = _billing_year;

  IF COALESCE(_rule.months_count, 1) > 1 THEN
    IF _year IS NULL THEN
      RETURN 0;
    END IF;

    _step := CASE COALESCE(_rule.recurrence, 'monthly')
      WHEN 'quarterly' THEN 3
      WHEN 'semester' THEN 6
      WHEN 'yearly' THEN 12
      ELSE 1
    END;

    FOR _i IN 0..GREATEST(0, COALESCE(_rule.months_count, 1) - 1) LOOP
      _im := _i * _step;
      _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));

      _due_date := public.charge_rule_adjust_due_to_academic_year(
        _due_date, _year.start_date, _year.end_date
      );
      IF _due_date IS NULL THEN
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

      _loop_ins := 0;

      IF _rule.target_scope = 'students' THEN
        INSERT INTO public.event_fees (school_id, event_id, student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
        SELECT DISTINCT _evt.school_id, _evt.id, q.student_id, _billing_year, _rule.monthly_amount::numeric,
          _due_date,
          _month_idx,
          false
        FROM (
          SELECT s.id AS student_id
          FROM public.students s
          INNER JOIN public.event_audience_student_ids(_evt.school_id, _evt.audience) aud ON aud.student_id = s.id
          INNER JOIN public.event_charge_rule_students rs ON rs.student_id = s.id AND rs.charge_rule_id = _rule.id
        ) q;
        GET DIAGNOSTICS _loop_ins = ROW_COUNT;
      ELSIF _rule.target_scope = 'classrooms' THEN
        INSERT INTO public.event_fees (school_id, event_id, student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
        SELECT DISTINCT _evt.school_id, _evt.id, q.student_id, _billing_year, _rule.monthly_amount::numeric,
          _due_date,
          _month_idx,
          false
        FROM (
          SELECT s.id AS student_id
          FROM public.students s
          INNER JOIN public.event_audience_student_ids(_evt.school_id, _evt.audience) aud ON aud.student_id = s.id
          INNER JOIN public.event_charge_rule_classrooms rc ON rc.classroom_id = s.classroom_id AND rc.charge_rule_id = _rule.id
        ) q;
        GET DIAGNOSTICS _loop_ins = ROW_COUNT;
      ELSE
        INSERT INTO public.event_fees (school_id, event_id, student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
        SELECT DISTINCT _evt.school_id, _evt.id, q.student_id, _billing_year, _rule.monthly_amount::numeric,
          _due_date,
          _month_idx,
          false
        FROM (
          SELECT s.id AS student_id
          FROM public.students s
          INNER JOIN public.event_audience_student_ids(_evt.school_id, _evt.audience) aud ON aud.student_id = s.id
        ) q;
        GET DIAGNOSTICS _loop_ins = ROW_COUNT;
      END IF;

      _ins := _ins + _loop_ins;
    END LOOP;

    RETURN _ins;
  END IF;

  _last_day := EXTRACT(DAY FROM (_evt.event_date::timestamp + INTERVAL '1 month - 1 day'))::SMALLINT;
  _due_date := make_date(
    EXTRACT(YEAR FROM _evt.event_date)::INT,
    EXTRACT(MONTH FROM _evt.event_date)::INT,
    LEAST(GREATEST(COALESCE(_rule.due_day, 10), 1), _last_day)
  );

  IF _due_date > _evt.event_date::date THEN
    _due_date := _evt.event_date::date;
  END IF;

  IF _rule.target_scope = 'students' THEN
    INSERT INTO public.event_fees (school_id, event_id, student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
    SELECT DISTINCT _evt.school_id, _evt.id, q.student_id, _billing_year, _rule.monthly_amount::numeric,
      _due_date,
      EXTRACT(MONTH FROM _evt.event_date)::INT,
      false
    FROM (
      SELECT s.id AS student_id
      FROM public.students s
      INNER JOIN public.event_audience_student_ids(_evt.school_id, _evt.audience) aud ON aud.student_id = s.id
      INNER JOIN public.event_charge_rule_students rs ON rs.student_id = s.id AND rs.charge_rule_id = _rule.id
    ) q;

    GET DIAGNOSTICS _ins = ROW_COUNT;
    RETURN _ins;
  END IF;

  IF _rule.target_scope = 'classrooms' THEN
    INSERT INTO public.event_fees (school_id, event_id, student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
    SELECT DISTINCT _evt.school_id, _evt.id, q.student_id, _billing_year, _rule.monthly_amount::numeric,
      _due_date,
      EXTRACT(MONTH FROM _evt.event_date)::INT,
      false
    FROM (
      SELECT s.id AS student_id
      FROM public.students s
      INNER JOIN public.event_audience_student_ids(_evt.school_id, _evt.audience) aud ON aud.student_id = s.id
      INNER JOIN public.event_charge_rule_classrooms rc ON rc.classroom_id = s.classroom_id AND rc.charge_rule_id = _rule.id
    ) q;

    GET DIAGNOSTICS _ins = ROW_COUNT;
    RETURN _ins;
  END IF;

  INSERT INTO public.event_fees (school_id, event_id, student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
  SELECT DISTINCT _evt.school_id, _evt.id, q.student_id, _billing_year, _rule.monthly_amount::numeric,
    _due_date,
    EXTRACT(MONTH FROM _evt.event_date)::INT,
    false
  FROM (
    SELECT s.id AS student_id
    FROM public.students s
    INNER JOIN public.event_audience_student_ids(_evt.school_id, _evt.audience) aud ON aud.student_id = s.id
  ) q;

  GET DIAGNOSTICS _ins = ROW_COUNT;
  RETURN _ins;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_event_fees(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_event_fees(uuid) FROM anon, authenticated;
