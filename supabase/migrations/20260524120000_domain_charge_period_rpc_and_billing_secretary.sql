-- Secretário pode reservar número FT (alinhado a validação de pagamentos).
-- Geração manual de cobrança por período para regras de extracurricular / transporte / refeições.

CREATE OR REPLACE FUNCTION public.billing_reserve_next_invoice(_school_id uuid)
RETURNS TABLE (serie text, seq integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  IF public.get_my_school() IS DISTINCT FROM _school_id
     AND public.get_auth_role()::text IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  IF public.get_auth_role() IS NULL
     OR public.get_auth_role()::text NOT IN ('ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'TREASURER', 'SECRETARY') THEN
    RAISE EXCEPTION 'Sem permissão para emitir fatura';
  END IF;

  INSERT INTO public.billing_config (school_id, series, last_sequence)
  VALUES (_school_id, 'EDK', 0)
  ON CONFLICT (school_id) DO NOTHING;

  RETURN QUERY
  UPDATE public.billing_config bc
  SET
    last_sequence = bc.last_sequence + 1,
    updated_at = now()
  WHERE bc.school_id = _school_id
  RETURNING bc.series AS serie, bc.last_sequence AS seq;
END;
$$;

-- ---- generate_activity_fee_for_rule_period ----------------------------------
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
  _applicable_rule_id uuid;
  _step integer := 1;
  _im integer;
  _month_idx integer;
  _year_part integer;
  _due_date date;
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN
    RETURN 0;
  END IF;

  SELECT s.id, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN 0;
  END IF;

  SELECT r.* INTO _rule
  FROM public.activity_charge_rules r
  WHERE r.id = _charge_rule_id
    AND r.school_id = _student.school_id;

  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  IF _rule.academic_year_id IS NOT NULL AND _rule.academic_year_id IS DISTINCT FROM _academic_year_id THEN
    RETURN 0;
  END IF;

  IF _period_index > COALESCE(_rule.months_count, 1) - 1 THEN
    RETURN 0;
  END IF;

  _applicable_rule_id := NULL;

  SELECT r.id INTO _applicable_rule_id
  FROM public.activity_charge_rules r
  INNER JOIN public.activity_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id
    AND r.activity_id = _rule.activity_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NULL) ASC
  LIMIT 1;

  IF _applicable_rule_id IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _applicable_rule_id
    FROM public.activity_charge_rules r
    INNER JOIN public.activity_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id
      AND r.activity_id = _rule.activity_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _applicable_rule_id IS NULL THEN
    SELECT r.id INTO _applicable_rule_id
    FROM public.activity_charge_rules r
    WHERE r.school_id = _student.school_id
      AND r.activity_id = _rule.activity_id
      AND r.target_scope = 'all_enrolled'
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _applicable_rule_id IS DISTINCT FROM _charge_rule_id THEN
    RETURN 0;
  END IF;

  SELECT * INTO _enroll
  FROM public.extracurricular_enrollments e
  WHERE e.student_id = _student_id
    AND e.activity_id = _rule.activity_id
    AND e.school_id = _student.school_id
  LIMIT 1;

  IF _enroll IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  _step := CASE COALESCE(_rule.recurrence, 'monthly')
    WHEN 'quarterly' THEN 3
    WHEN 'semester' THEN 6
    WHEN 'yearly' THEN 12
    ELSE 1
  END;

  _im := _period_index * _step;
  _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
  _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
  _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));

  _due_date := public.charge_rule_adjust_due_to_academic_year(
    _due_date, _year.start_date, _year.end_date
  );
  IF _due_date IS NULL THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.activity_fees af
    WHERE af.enrollment_id = _enroll.id
      AND af.academic_year_id = _academic_year_id
      AND af.month_index = _month_idx
  ) INTO _has_existing;

  IF _has_existing THEN
    RETURN 0;
  END IF;

  INSERT INTO public.activity_fees (
    enrollment_id, activity_id, student_id, school_id, academic_year_id,
    amount_due, due_date, month_index, is_paid
  )
  VALUES (
    _enroll.id, _rule.activity_id, _student_id, _student.school_id, _academic_year_id,
    COALESCE(_rule.monthly_amount, 0), _due_date, _month_idx, false
  );

  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_activity_fee_for_rule_period(uuid, uuid, uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_activity_fee_for_rule_period(uuid, uuid, uuid, integer) TO authenticated;

-- ---- generate_transport_fee_for_rule_period ---------------------------------
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
  _applicable_rule_id uuid;
  _step integer := 1;
  _im integer;
  _month_idx integer;
  _year_part integer;
  _due_date date;
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN
    RETURN 0;
  END IF;

  SELECT s.id, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN 0;
  END IF;

  SELECT r.* INTO _rule
  FROM public.transport_charge_rules r
  WHERE r.id = _charge_rule_id
    AND r.school_id = _student.school_id;

  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  IF _rule.academic_year_id IS NOT NULL AND _rule.academic_year_id IS DISTINCT FROM _academic_year_id THEN
    RETURN 0;
  END IF;

  IF _period_index > COALESCE(_rule.months_count, 1) - 1 THEN
    RETURN 0;
  END IF;

  _applicable_rule_id := NULL;

  SELECT r.id INTO _applicable_rule_id
  FROM public.transport_charge_rules r
  INNER JOIN public.transport_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id
    AND r.route_id = _rule.route_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NULL) ASC
  LIMIT 1;

  IF _applicable_rule_id IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _applicable_rule_id
    FROM public.transport_charge_rules r
    INNER JOIN public.transport_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id
      AND r.route_id = _rule.route_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _applicable_rule_id IS NULL THEN
    SELECT r.id INTO _applicable_rule_id
    FROM public.transport_charge_rules r
    WHERE r.school_id = _student.school_id
      AND r.route_id = _rule.route_id
      AND r.target_scope = 'all_enrolled'
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _applicable_rule_id IS DISTINCT FROM _charge_rule_id THEN
    RETURN 0;
  END IF;

  SELECT * INTO _enroll
  FROM public.transport_enrollments e
  WHERE e.student_id = _student_id
    AND e.route_id = _rule.route_id
    AND e.school_id = _student.school_id
  LIMIT 1;

  IF _enroll IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  _step := CASE COALESCE(_rule.recurrence, 'monthly')
    WHEN 'quarterly' THEN 3
    WHEN 'semester' THEN 6
    WHEN 'yearly' THEN 12
    ELSE 1
  END;

  _im := _period_index * _step;
  _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
  _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
  _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));

  _due_date := public.charge_rule_adjust_due_to_academic_year(
    _due_date, _year.start_date, _year.end_date
  );
  IF _due_date IS NULL THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transport_fees tf
    WHERE tf.enrollment_id = _enroll.id
      AND tf.academic_year_id = _academic_year_id
      AND tf.month_index = _month_idx
  ) INTO _has_existing;

  IF _has_existing THEN
    RETURN 0;
  END IF;

  INSERT INTO public.transport_fees (
    enrollment_id, route_id, student_id, school_id, academic_year_id,
    amount_due, due_date, month_index, is_paid
  )
  VALUES (
    _enroll.id, _rule.route_id, _student_id, _student.school_id, _academic_year_id,
    COALESCE(_rule.monthly_amount, 0), _due_date, _month_idx, false
  );

  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_transport_fee_for_rule_period(uuid, uuid, uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_transport_fee_for_rule_period(uuid, uuid, uuid, integer) TO authenticated;

-- ---- generate_meal_fee_for_rule_period --------------------------------------
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
  _applicable_rule_id uuid;
  _step integer := 1;
  _im integer;
  _month_idx integer;
  _year_part integer;
  _due_date date;
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN
    RETURN 0;
  END IF;

  SELECT s.id, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s
  WHERE s.id = _student_id;

  IF _student IS NULL THEN
    RETURN 0;
  END IF;

  SELECT r.* INTO _rule
  FROM public.meal_charge_rules r
  WHERE r.id = _charge_rule_id
    AND r.school_id = _student.school_id;

  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  IF _rule.academic_year_id IS NOT NULL AND _rule.academic_year_id IS DISTINCT FROM _academic_year_id THEN
    RETURN 0;
  END IF;

  IF _period_index > COALESCE(_rule.months_count, 1) - 1 THEN
    RETURN 0;
  END IF;

  _applicable_rule_id := NULL;

  SELECT r.id INTO _applicable_rule_id
  FROM public.meal_charge_rules r
  INNER JOIN public.meal_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id
    AND r.meal_program_id = _rule.meal_program_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NULL) ASC
  LIMIT 1;

  IF _applicable_rule_id IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _applicable_rule_id
    FROM public.meal_charge_rules r
    INNER JOIN public.meal_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id
      AND r.meal_program_id = _rule.meal_program_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _applicable_rule_id IS NULL THEN
    SELECT r.id INTO _applicable_rule_id
    FROM public.meal_charge_rules r
    WHERE r.school_id = _student.school_id
      AND r.meal_program_id = _rule.meal_program_id
      AND r.target_scope = 'all_enrolled'
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC
    LIMIT 1;
  END IF;

  IF _applicable_rule_id IS DISTINCT FROM _charge_rule_id THEN
    RETURN 0;
  END IF;

  SELECT * INTO _enroll
  FROM public.meal_enrollments e
  WHERE e.student_id = _student_id
    AND e.meal_program_id = _rule.meal_program_id
    AND e.school_id = _student.school_id
  LIMIT 1;

  IF _enroll IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  _step := CASE COALESCE(_rule.recurrence, 'monthly')
    WHEN 'quarterly' THEN 3
    WHEN 'semester' THEN 6
    WHEN 'yearly' THEN 12
    ELSE 1
  END;

  _im := _period_index * _step;
  _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
  _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
  _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));

  _due_date := public.charge_rule_adjust_due_to_academic_year(
    _due_date, _year.start_date, _year.end_date
  );
  IF _due_date IS NULL THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.meal_fees mf
    WHERE mf.enrollment_id = _enroll.id
      AND mf.academic_year_id = _academic_year_id
      AND mf.month_index = _month_idx
  ) INTO _has_existing;

  IF _has_existing THEN
    RETURN 0;
  END IF;

  INSERT INTO public.meal_fees (
    enrollment_id, meal_program_id, student_id, school_id, academic_year_id,
    amount_due, due_date, month_index, is_paid
  )
  VALUES (
    _enroll.id, _rule.meal_program_id, _student_id, _student.school_id, _academic_year_id,
    COALESCE(_rule.monthly_amount, 0), _due_date, _month_idx, false
  );

  RETURN 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_meal_fee_for_rule_period(uuid, uuid, uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_meal_fee_for_rule_period(uuid, uuid, uuid, integer) TO authenticated;
