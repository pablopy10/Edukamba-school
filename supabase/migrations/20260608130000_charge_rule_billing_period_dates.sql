-- Período de cobrança com mês e ano explícitos (billing_start_date / billing_end_date).

ALTER TABLE public.fee_rules
  ADD COLUMN IF NOT EXISTS billing_start_date date,
  ADD COLUMN IF NOT EXISTS billing_end_date date;

ALTER TABLE public.activity_charge_rules
  ADD COLUMN IF NOT EXISTS billing_start_date date,
  ADD COLUMN IF NOT EXISTS billing_end_date date;

ALTER TABLE public.transport_charge_rules
  ADD COLUMN IF NOT EXISTS billing_start_date date,
  ADD COLUMN IF NOT EXISTS billing_end_date date;

ALTER TABLE public.meal_charge_rules
  ADD COLUMN IF NOT EXISTS billing_start_date date,
  ADD COLUMN IF NOT EXISTS billing_end_date date;

ALTER TABLE public.event_charge_rules
  ADD COLUMN IF NOT EXISTS billing_start_date date,
  ADD COLUMN IF NOT EXISTS billing_end_date date;

COMMENT ON COLUMN public.fee_rules.billing_start_date IS 'Primeiro mês/ano do período de cobrança (dia 1). Quando definido, substitui a inferência a partir de start_month + ano letivo.';
COMMENT ON COLUMN public.fee_rules.billing_end_date IS 'Último mês/ano do período de cobrança (dia 1).';

-- Preencher a partir de start_month/end_month + ano letivo (legado)
UPDATE public.fee_rules fr
SET
  billing_start_date = make_date(
    EXTRACT(YEAR FROM ay.start_date)::int
      + CASE WHEN fr.start_month < EXTRACT(MONTH FROM ay.start_date)::int THEN 1 ELSE 0 END,
    fr.start_month,
    1
  ),
  billing_end_date = make_date(
    EXTRACT(YEAR FROM ay.start_date)::int
      + CASE
        WHEN COALESCE(fr.end_month, fr.start_month) < fr.start_month THEN 1
        WHEN COALESCE(fr.end_month, fr.start_month) < EXTRACT(MONTH FROM ay.start_date)::int THEN 1
        ELSE 0
      END,
    COALESCE(fr.end_month, fr.start_month),
    1
  )
FROM public.academic_years ay
WHERE fr.academic_year_id = ay.id
  AND fr.billing_start_date IS NULL;

DO $$
DECLARE
  _tbl text;
BEGIN
  FOREACH _tbl IN ARRAY ARRAY[
    'activity_charge_rules',
    'transport_charge_rules',
    'meal_charge_rules',
    'event_charge_rules'
  ] LOOP
    EXECUTE format($sql$
      UPDATE public.%I r
      SET
        billing_start_date = make_date(
          EXTRACT(YEAR FROM COALESCE(ay.start_date, CURRENT_DATE))::int
            + CASE WHEN r.start_month < EXTRACT(MONTH FROM COALESCE(ay.start_date, CURRENT_DATE))::int THEN 1 ELSE 0 END,
          r.start_month,
          1
        ),
        billing_end_date = make_date(
          EXTRACT(YEAR FROM COALESCE(ay.start_date, CURRENT_DATE))::int
            + CASE
              WHEN COALESCE(r.end_month, r.start_month) < r.start_month THEN 1
              WHEN COALESCE(r.end_month, r.start_month) < EXTRACT(MONTH FROM COALESCE(ay.start_date, CURRENT_DATE))::int THEN 1
              ELSE 0
            END,
          COALESCE(r.end_month, r.start_month),
          1
        )
      FROM public.academic_years ay
      WHERE r.academic_year_id = ay.id
        AND r.billing_start_date IS NULL
    $sql$, _tbl);
  END LOOP;
END;
$$;

-- ---- Helper: data nominal de vencimento por período -------------------------
CREATE OR REPLACE FUNCTION public.charge_rule_period_due_date(
  p_billing_start_date date,
  p_start_month integer,
  p_academic_year_start date,
  p_academic_year_end date,
  p_period_index integer,
  p_recurrence text,
  p_due_day integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _step integer;
  _im integer;
  _nominal date;
  _month_idx integer;
  _year_part integer;
  _day integer;
BEGIN
  IF p_period_index IS NULL OR p_period_index < 0 THEN
    RETURN NULL;
  END IF;

  _day := LEAST(GREATEST(COALESCE(p_due_day, 10), 1), 28);
  _step := CASE COALESCE(p_recurrence, 'monthly')
    WHEN 'quarterly' THEN 3
    WHEN 'semester' THEN 6
    WHEN 'yearly' THEN 12
    ELSE 1
  END;
  _im := p_period_index * _step;

  IF p_billing_start_date IS NOT NULL THEN
    _nominal := (date_trunc('month', p_billing_start_date)::date + (_im || ' months')::interval)::date;
    RETURN public.charge_rule_adjust_due_to_academic_year(
      make_date(
        EXTRACT(YEAR FROM _nominal)::int,
        EXTRACT(MONTH FROM _nominal)::int,
        _day
      ),
      p_academic_year_start,
      p_academic_year_end
    );
  END IF;

  IF p_start_month IS NULL OR p_academic_year_start IS NULL THEN
    RETURN NULL;
  END IF;

  _month_idx := ((p_start_month - 1 + _im) % 12) + 1;
  _year_part := EXTRACT(YEAR FROM p_academic_year_start)::int + ((p_start_month - 1 + _im) / 12);
  _nominal := make_date(_year_part, _month_idx, _day);
  RETURN public.charge_rule_adjust_due_to_academic_year(
    _nominal,
    p_academic_year_start,
    p_academic_year_end
  );
END;
$$;

-- ---- generate_student_fees_for_year (3 parâmetros) --------------------------
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
  _created_count integer := 0;
  _insert_this boolean;
  _has_existing boolean;
  _today date := (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT s.id, s.school_id, s.parent_id, c.grade_level, s.classroom_id
  INTO _student
  FROM public.students s
  LEFT JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE s.id = _student_id;

  IF _student IS NULL THEN RETURN 0; END IF;

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

  IF _rule IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN RETURN 0; END IF;

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
      SELECT pos INTO _i FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS pos
        FROM public.students
        WHERE parent_id = _student.parent_id AND school_id = _student.school_id
      ) t WHERE id = _student_id;

      IF _i >= 2 THEN
        SELECT * INTO _family_rule
        FROM public.family_discount_rules
        WHERE school_id = _student.school_id AND sibling_position <= _i
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

  FOR _i IN 0.._rule.months_count - 1 LOOP
    _due_date := public.charge_rule_period_due_date(
      _rule.billing_start_date,
      _rule.start_month,
      _year.start_date,
      _year.end_date,
      _i,
      _rule.recurrence,
      _rule.due_day
    );
    IF _due_date IS NULL THEN CONTINUE; END IF;
    _month_idx := EXTRACT(MONTH FROM _due_date)::int;

    SELECT EXISTS (
      SELECT 1 FROM public.student_fees sf
      WHERE sf.student_id = _student_id
        AND sf.academic_year_id = _academic_year_id
        AND sf.month_index = _month_idx
    ) INTO _has_existing;
    IF _has_existing THEN CONTINUE; END IF;

    IF _force_all OR COALESCE(_rule.generate_all_upfront, false) THEN
      _insert_this := true;
    ELSE
      _insert_this := public.charge_rule_period_is_due_now(_due_date, _rule.generate_all_upfront);
    END IF;
    IF NOT _insert_this THEN CONTINUE; END IF;

    INSERT INTO public.student_fees (
      student_id, academic_year_id, amount_due, due_date, month_index, is_paid
    ) VALUES (
      _student_id, _academic_year_id, _final_amount, _due_date, _month_idx, false
    );
    _created_count := _created_count + 1;
  END LOOP;

  RETURN _created_count;
END;
$$;

-- ---- generate_student_fee_for_rule_period -----------------------------------
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
  _has_existing boolean;
BEGIN
  IF _period_index IS NULL OR _period_index < 0 THEN RETURN 0; END IF;

  SELECT s.id, s.school_id, s.parent_id, c.grade_level, s.classroom_id
  INTO _student
  FROM public.students s
  LEFT JOIN public.classrooms c ON c.id = s.classroom_id
  WHERE s.id = _student_id;
  IF _student IS NULL THEN RETURN 0; END IF;

  _rule := NULL;
  SELECT fr.* INTO _rule
  FROM public.fee_rules fr
  INNER JOIN public.fee_rule_students fs ON fs.fee_rule_id = fr.id AND fs.student_id = _student_id
  WHERE fr.school_id = _student.school_id
    AND (fr.academic_year_id = _academic_year_id OR fr.academic_year_id IS NULL)
  ORDER BY fr.academic_year_id NULLS LAST LIMIT 1;

  IF _rule IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT fr.* INTO _rule
    FROM public.fee_rules fr
    INNER JOIN public.fee_rule_classrooms fc ON fc.fee_rule_id = fr.id AND fc.classroom_id = _student.classroom_id
    WHERE fr.school_id = _student.school_id
      AND (fr.academic_year_id = _academic_year_id OR fr.academic_year_id IS NULL)
    ORDER BY fr.academic_year_id NULLS LAST LIMIT 1;
  END IF;

  IF _rule IS NULL AND _student.grade_level IS NOT NULL THEN
    SELECT fr.* INTO _rule
    FROM public.fee_rules fr
    WHERE fr.school_id = _student.school_id
      AND (fr.academic_year_id = _academic_year_id OR fr.academic_year_id IS NULL)
      AND fr.target_scope = 'grade_level' AND fr.grade_level = _student.grade_level
    ORDER BY fr.academic_year_id NULLS LAST LIMIT 1;
  END IF;

  IF _rule IS NULL OR _rule.id <> _fee_rule_id THEN RETURN 0; END IF;
  IF _period_index > _rule.months_count - 1 THEN RETURN 0; END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _override FROM public.student_discounts
  WHERE student_id = _student_id
    AND (academic_year_id = _academic_year_id OR academic_year_id IS NULL)
    AND is_active = true
  ORDER BY academic_year_id NULLS LAST LIMIT 1;

  IF _override IS NOT NULL THEN
    _discount_percentage := COALESCE(_override.discount_percentage, 0);
    _discount_fixed := COALESCE(_override.discount_fixed_amount, 0);
  ELSIF _student.parent_id IS NOT NULL THEN
    SELECT COUNT(*) INTO _sibling_count FROM public.students
    WHERE parent_id = _student.parent_id AND school_id = _student.school_id;
    IF _sibling_count >= 2 THEN
      SELECT pos INTO _pos FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS pos
        FROM public.students WHERE parent_id = _student.parent_id AND school_id = _student.school_id
      ) t WHERE id = _student_id;
      IF _pos >= 2 THEN
        SELECT * INTO _family_rule FROM public.family_discount_rules
        WHERE school_id = _student.school_id AND sibling_position <= _pos
        ORDER BY sibling_position DESC LIMIT 1;
        IF _family_rule IS NOT NULL THEN _discount_percentage := _family_rule.discount_percentage; END IF;
      END IF;
    END IF;
  END IF;

  _final_amount := _rule.monthly_amount * (1 - _discount_percentage / 100) - _discount_fixed;
  IF _final_amount < 0 THEN _final_amount := 0; END IF;

  _due_date := public.charge_rule_period_due_date(
    _rule.billing_start_date, _rule.start_month, _year.start_date, _year.end_date,
    _period_index, _rule.recurrence, _rule.due_day
  );
  IF _due_date IS NULL THEN RETURN 0; END IF;
  _month_idx := EXTRACT(MONTH FROM _due_date)::int;

  SELECT EXISTS (
    SELECT 1 FROM public.student_fees sf
    WHERE sf.student_id = _student_id AND sf.academic_year_id = _academic_year_id AND sf.month_index = _month_idx
  ) INTO _has_existing;
  IF _has_existing THEN RETURN 0; END IF;

  INSERT INTO public.student_fees (student_id, academic_year_id, amount_due, due_date, month_index, is_paid)
  VALUES (_student_id, _academic_year_id, _final_amount, _due_date, _month_idx, false);
  RETURN 1;
END;
$$;

-- ---- Domínio: período manual (activity / transport / meal) -----------------
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

  _applicable_rule_id := NULL;
  SELECT r.id INTO _applicable_rule_id FROM public.activity_charge_rules r
  INNER JOIN public.activity_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id AND r.activity_id = _rule.activity_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;

  IF _applicable_rule_id IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _applicable_rule_id FROM public.activity_charge_rules r
    INNER JOIN public.activity_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id AND r.activity_id = _rule.activity_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;
  END IF;

  IF _applicable_rule_id IS NULL THEN
    SELECT r.id INTO _applicable_rule_id FROM public.activity_charge_rules r
    WHERE r.school_id = _student.school_id AND r.activity_id = _rule.activity_id AND r.target_scope = 'all_enrolled'
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;
  END IF;

  IF _applicable_rule_id IS DISTINCT FROM _charge_rule_id THEN RETURN 0; END IF;

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
    WHERE af.enrollment_id = _enroll.id AND af.academic_year_id = _academic_year_id AND af.month_index = _month_idx
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

  _applicable_rule_id := NULL;
  SELECT r.id INTO _applicable_rule_id FROM public.transport_charge_rules r
  INNER JOIN public.transport_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id AND r.route_id = _rule.route_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;

  IF _applicable_rule_id IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _applicable_rule_id FROM public.transport_charge_rules r
    INNER JOIN public.transport_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id AND r.route_id = _rule.route_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;
  END IF;

  IF _applicable_rule_id IS NULL THEN
    SELECT r.id INTO _applicable_rule_id FROM public.transport_charge_rules r
    WHERE r.school_id = _student.school_id AND r.route_id = _rule.route_id AND r.target_scope = 'all_enrolled'
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;
  END IF;

  IF _applicable_rule_id IS DISTINCT FROM _charge_rule_id THEN RETURN 0; END IF;

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
    WHERE tf.enrollment_id = _enroll.id AND tf.academic_year_id = _academic_year_id AND tf.month_index = _month_idx
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

  _applicable_rule_id := NULL;
  SELECT r.id INTO _applicable_rule_id FROM public.meal_charge_rules r
  INNER JOIN public.meal_charge_rule_students rs ON rs.charge_rule_id = r.id AND rs.student_id = _student_id
  WHERE r.school_id = _student.school_id AND r.meal_program_id = _rule.meal_program_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
  ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;

  IF _applicable_rule_id IS NULL AND _student.classroom_id IS NOT NULL THEN
    SELECT r.id INTO _applicable_rule_id FROM public.meal_charge_rules r
    INNER JOIN public.meal_charge_rule_classrooms rc ON rc.charge_rule_id = r.id AND rc.classroom_id = _student.classroom_id
    WHERE r.school_id = _student.school_id AND r.meal_program_id = _rule.meal_program_id
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;
  END IF;

  IF _applicable_rule_id IS NULL THEN
    SELECT r.id INTO _applicable_rule_id FROM public.meal_charge_rules r
    WHERE r.school_id = _student.school_id AND r.meal_program_id = _rule.meal_program_id AND r.target_scope = 'all_enrolled'
      AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM _academic_year_id)
    ORDER BY (r.academic_year_id IS NULL) ASC LIMIT 1;
  END IF;

  IF _applicable_rule_id IS DISTINCT FROM _charge_rule_id THEN RETURN 0; END IF;

  SELECT * INTO _enroll FROM public.meal_enrollments e
  WHERE e.student_id = _student_id AND e.meal_program_id = _rule.meal_program_id AND e.school_id = _student.school_id LIMIT 1;
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
    WHERE mf.enrollment_id = _enroll.id AND mf.academic_year_id = _academic_year_id AND mf.month_index = _month_idx
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
