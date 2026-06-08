-- Backfill: gerar todos os períodos até ao mês corrente (inclusive).
-- Corrigir prioridade de regras de domínio (transporte/refeições/extracurricular).

CREATE OR REPLACE FUNCTION public.charge_rule_period_is_due_now(
  _due_date date,
  _generate_all_upfront boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _due_date IS NULL THEN false
    WHEN COALESCE(_generate_all_upfront, false) THEN true
    ELSE
      (EXTRACT(YEAR FROM _due_date)::int * 12 + EXTRACT(MONTH FROM _due_date)::int)
      <= (
        EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)::int * 12
        + EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)::int
      )
  END;
$$;

COMMENT ON FUNCTION public.charge_rule_period_is_due_now(date, boolean) IS
  'Período deve ser gerado quando o mês/ano de vencimento é <= mês/ano corrente (ou generate_all_upfront).';

-- ---- Resolver regra vencedora: transporte ------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_transport_charge_rule_id_for_student(
  _student_id uuid,
  _route_id uuid,
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
  SELECT s.id, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.id INTO _rule_id
  FROM public.transport_charge_rules r
  INNER JOIN public.transport_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id
    AND r.route_id = _route_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
  LIMIT 1;

  IF _rule_id IS NOT NULL THEN
    RETURN _rule_id;
  END IF;

  IF _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _rule_id
    FROM public.transport_charge_rules r
    INNER JOIN public.transport_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id
      AND r.route_id = _route_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
    LIMIT 1;

    IF _rule_id IS NOT NULL THEN
      RETURN _rule_id;
    END IF;
  END IF;

  SELECT r.id INTO _rule_id
  FROM public.transport_charge_rules r
  WHERE r.school_id = _student.school_id
    AND r.route_id = _route_id
    AND r.target_scope = 'all_enrolled'
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
  LIMIT 1;

  RETURN _rule_id;
END;
$$;

-- ---- Resolver regra vencedora: extracurricular ------------------------------
CREATE OR REPLACE FUNCTION public.resolve_activity_charge_rule_id_for_student(
  _student_id uuid,
  _activity_id uuid,
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
  SELECT s.id, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.id INTO _rule_id
  FROM public.activity_charge_rules r
  INNER JOIN public.activity_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id
    AND r.activity_id = _activity_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
  LIMIT 1;

  IF _rule_id IS NOT NULL THEN
    RETURN _rule_id;
  END IF;

  IF _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _rule_id
    FROM public.activity_charge_rules r
    INNER JOIN public.activity_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id
      AND r.activity_id = _activity_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
    LIMIT 1;

    IF _rule_id IS NOT NULL THEN
      RETURN _rule_id;
    END IF;
  END IF;

  SELECT r.id INTO _rule_id
  FROM public.activity_charge_rules r
  WHERE r.school_id = _student.school_id
    AND r.activity_id = _activity_id
    AND r.target_scope = 'all_enrolled'
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
  LIMIT 1;

  RETURN _rule_id;
END;
$$;

-- ---- Resolver regra vencedora: refeições ------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_meal_charge_rule_id_for_student(
  _student_id uuid,
  _meal_program_id uuid,
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
  SELECT s.id, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.id INTO _rule_id
  FROM public.meal_charge_rules r
  INNER JOIN public.meal_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id
    AND r.meal_program_id = _meal_program_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
  LIMIT 1;

  IF _rule_id IS NOT NULL THEN
    RETURN _rule_id;
  END IF;

  IF _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _rule_id
    FROM public.meal_charge_rules r
    INNER JOIN public.meal_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id
      AND r.meal_program_id = _meal_program_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
    LIMIT 1;

    IF _rule_id IS NOT NULL THEN
      RETURN _rule_id;
    END IF;
  END IF;

  SELECT r.id INTO _rule_id
  FROM public.meal_charge_rules r
  WHERE r.school_id = _student.school_id
    AND r.meal_program_id = _meal_program_id
    AND r.target_scope = 'all_enrolled'
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NOT NULL) DESC, r.created_at DESC
  LIMIT 1;

  RETURN _rule_id;
END;
$$;

-- ---- generate_transport_fee_for_rule_period ----------------------------------
CREATE OR REPLACE FUNCTION public.generate_transport_fee_for_rule_period(
  _student_id uuid,
  _academic_year_id uuid,
  _charge_rule_id uuid,
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
  _enroll record;
  _winning_rule_id uuid;
  _due_date date;
  _month_idx integer;
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN RETURN 0; END IF;

  SELECT s.id, s.school_id, s.classroom_id INTO _student FROM public.students s WHERE s.id = _student_id;
  IF _student IS NULL THEN RETURN 0; END IF;

  SELECT r.* INTO _rule FROM public.transport_charge_rules r
  WHERE r.id = _charge_rule_id AND r.school_id = _student.school_id;
  IF _rule IS NULL THEN RETURN 0; END IF;
  IF _rule.academic_year_id IS NOT NULL AND _rule.academic_year_id IS DISTINCT FROM _academic_year_id THEN RETURN 0; END IF;
  IF _period_index > COALESCE(_rule.months_count, 1) - 1 THEN RETURN 0; END IF;

  _winning_rule_id := public.resolve_transport_charge_rule_id_for_student(_student_id, _rule.route_id, _academic_year_id);
  IF _winning_rule_id IS DISTINCT FROM _charge_rule_id THEN RETURN 0; END IF;

  SELECT * INTO _enroll FROM public.transport_enrollments e
  WHERE e.student_id = _student_id AND e.route_id = _rule.route_id AND e.school_id = _student.school_id LIMIT 1;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN RETURN 0; END IF;

  _due_date := public.charge_rule_period_due_date(
    _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
    _period_index, _rule.recurrence, _rule.due_day
  );
  IF _due_date IS NULL THEN RETURN 0; END IF;
  _month_idx := EXTRACT(MONTH FROM _due_date)::int;

  SELECT EXISTS (
    SELECT 1 FROM public.transport_fees tf
    WHERE tf.enrollment_id = _enroll.id
      AND tf.academic_year_id = _academic_year_id
      AND tf.due_date = _due_date
  ) INTO _has_existing;
  IF _has_existing THEN RETURN 0; END IF;

  INSERT INTO public.transport_fees (
    enrollment_id, route_id, student_id, school_id, academic_year_id, amount_due, due_date, month_index, is_paid
  ) VALUES (
    _enroll.id, _rule.route_id, _student_id, _student.school_id, _academic_year_id,
    COALESCE(_rule.monthly_amount, 0), _due_date, _month_idx, false
  );
  RETURN 1;
END;
$$;

-- ---- generate_activity_fee_for_rule_period -----------------------------------
CREATE OR REPLACE FUNCTION public.generate_activity_fee_for_rule_period(
  _student_id uuid,
  _academic_year_id uuid,
  _charge_rule_id uuid,
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
  _enroll record;
  _winning_rule_id uuid;
  _due_date date;
  _month_idx integer;
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN RETURN 0; END IF;

  SELECT s.id, s.school_id, s.classroom_id INTO _student FROM public.students s WHERE s.id = _student_id;
  IF _student IS NULL THEN RETURN 0; END IF;

  SELECT r.* INTO _rule FROM public.activity_charge_rules r
  WHERE r.id = _charge_rule_id AND r.school_id = _student.school_id;
  IF _rule IS NULL THEN RETURN 0; END IF;
  IF _rule.academic_year_id IS NOT NULL AND _rule.academic_year_id IS DISTINCT FROM _academic_year_id THEN RETURN 0; END IF;
  IF _period_index > COALESCE(_rule.months_count, 1) - 1 THEN RETURN 0; END IF;

  _winning_rule_id := public.resolve_activity_charge_rule_id_for_student(_student_id, _rule.activity_id, _academic_year_id);
  IF _winning_rule_id IS DISTINCT FROM _charge_rule_id THEN RETURN 0; END IF;

  SELECT * INTO _enroll FROM public.extracurricular_enrollments e
  WHERE e.student_id = _student_id AND e.activity_id = _rule.activity_id AND e.school_id = _student.school_id LIMIT 1;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN RETURN 0; END IF;

  _due_date := public.charge_rule_period_due_date(
    _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
    _period_index, _rule.recurrence, _rule.due_day
  );
  IF _due_date IS NULL THEN RETURN 0; END IF;
  _month_idx := EXTRACT(MONTH FROM _due_date)::int;

  SELECT EXISTS (
    SELECT 1 FROM public.activity_fees af
    WHERE af.enrollment_id = _enroll.id
      AND af.academic_year_id = _academic_year_id
      AND af.due_date = _due_date
  ) INTO _has_existing;
  IF _has_existing THEN RETURN 0; END IF;

  INSERT INTO public.activity_fees (
    enrollment_id, activity_id, student_id, school_id, academic_year_id, amount_due, due_date, month_index, is_paid
  ) VALUES (
    _enroll.id, _rule.activity_id, _student_id, _student.school_id, _academic_year_id,
    COALESCE(_rule.monthly_amount, 0), _due_date, _month_idx, false
  );
  RETURN 1;
END;
$$;

-- ---- generate_meal_fee_for_rule_period ---------------------------------------
CREATE OR REPLACE FUNCTION public.generate_meal_fee_for_rule_period(
  _student_id uuid,
  _academic_year_id uuid,
  _charge_rule_id uuid,
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
  _enroll record;
  _winning_rule_id uuid;
  _due_date date;
  _month_idx integer;
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN RETURN 0; END IF;

  SELECT s.id, s.school_id, s.classroom_id INTO _student FROM public.students s WHERE s.id = _student_id;
  IF _student IS NULL THEN RETURN 0; END IF;

  SELECT r.* INTO _rule FROM public.meal_charge_rules r
  WHERE r.id = _charge_rule_id AND r.school_id = _student.school_id;
  IF _rule IS NULL THEN RETURN 0; END IF;
  IF _rule.academic_year_id IS NOT NULL AND _rule.academic_year_id IS DISTINCT FROM _academic_year_id THEN RETURN 0; END IF;
  IF _period_index > COALESCE(_rule.months_count, 1) - 1 THEN RETURN 0; END IF;

  _winning_rule_id := public.resolve_meal_charge_rule_id_for_student(_student_id, _rule.meal_program_id, _academic_year_id);
  IF _winning_rule_id IS DISTINCT FROM _charge_rule_id THEN RETURN 0; END IF;

  SELECT * INTO _enroll FROM public.meal_enrollments e
  WHERE e.student_id = _student_id AND e.meal_program_id = _rule.meal_program_id AND e.school_id = _student.school_id
    AND COALESCE(e.status, '') = 'ACTIVE'
  LIMIT 1;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN RETURN 0; END IF;

  _due_date := public.charge_rule_period_due_date(
    _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
    _period_index, _rule.recurrence, _rule.due_day
  );
  IF _due_date IS NULL THEN RETURN 0; END IF;
  _month_idx := EXTRACT(MONTH FROM _due_date)::int;

  SELECT EXISTS (
    SELECT 1 FROM public.meal_fees mf
    WHERE mf.enrollment_id = _enroll.id
      AND mf.academic_year_id = _academic_year_id
      AND mf.due_date = _due_date
  ) INTO _has_existing;
  IF _has_existing THEN RETURN 0; END IF;

  INSERT INTO public.meal_fees (
    enrollment_id, meal_program_id, student_id, school_id, academic_year_id, amount_due, due_date, month_index, is_paid
  ) VALUES (
    _enroll.id, _rule.meal_program_id, _student_id, _student.school_id, _academic_year_id,
    COALESCE(_rule.monthly_amount, 0), _due_date, _month_idx, false
  );
  RETURN 1;
END;
$$;

-- ---- generate_transport_fees: usar billing_start_date + is_due_now -----------
CREATE OR REPLACE FUNCTION public.generate_transport_fees(_enrollment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enroll record;
  _route record;
  _student record;
  _rule record;
  _year record;
  _billing_year uuid;
  _winning_rule_id uuid;
  _amount numeric;
  _i integer;
  _due_date date;
  _month_idx integer;
  _created integer := 0;
  _start_date date;
  _end_date date;
  _months_count integer;
  _start_month integer;
  _due_day integer := 10;
  _year_part integer;
BEGIN
  SELECT * INTO _enroll FROM public.transport_enrollments WHERE id = _enrollment_id;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _route FROM public.transport_routes WHERE id = _enroll.route_id;
  IF _route IS NULL THEN RETURN 0; END IF;

  SELECT s.id, s.classroom_id INTO _student FROM public.students s WHERE s.id = _enroll.student_id;
  IF _student IS NULL THEN RETURN 0; END IF;

  _billing_year := (SELECT id FROM public.academic_years WHERE school_id = _enroll.school_id AND is_active LIMIT 1);

  _winning_rule_id := NULL;
  IF _billing_year IS NOT NULL THEN
    _winning_rule_id := public.resolve_transport_charge_rule_id_for_student(
      _enroll.student_id, _enroll.route_id, _billing_year
    );
  END IF;

  IF _winning_rule_id IS NULL THEN
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
        _billing_year, _amount, _due_date, _month_idx, false
      );
      _created := _created + 1;
    END LOOP;

    RETURN _created;
  END IF;

  SELECT * INTO _rule FROM public.transport_charge_rules WHERE id = _winning_rule_id;
  IF _rule IS NULL OR COALESCE(_rule.monthly_amount, 0) <= 0 THEN RETURN 0; END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = COALESCE(_rule.academic_year_id, _billing_year);
  IF _year IS NULL THEN RETURN 0; END IF;

  FOR _i IN 0..GREATEST(0, COALESCE(_rule.months_count, 1) - 1) LOOP
    _due_date := public.charge_rule_period_due_date(
      _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
      _i, _rule.recurrence, _rule.due_day
    );
    IF _due_date IS NULL THEN CONTINUE; END IF;
    IF NOT public.charge_rule_period_is_due_now(_due_date, _rule.generate_all_upfront) THEN CONTINUE; END IF;

    _month_idx := EXTRACT(MONTH FROM _due_date)::int;

    IF EXISTS (
      SELECT 1 FROM public.transport_fees tf
      WHERE tf.enrollment_id = _enroll.id
        AND tf.academic_year_id = COALESCE(_rule.academic_year_id, _billing_year)
        AND tf.due_date = _due_date
    ) THEN
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
END;
$$;
