-- Ao criar/actualizar uma regra de cobrança recorrente, gerar automaticamente os períodos
-- em atraso e o período do mês corrente (ex.: início em Março, estamos em Junho → Mar–Jun).

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
      _due_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
      OR (
        EXTRACT(YEAR FROM _due_date) = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
        AND EXTRACT(MONTH FROM _due_date) = EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
      )
  END;
$$;

-- ---- Propinas (fee_rules) ----------------------------------------------------
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
  _step integer := 1;
  _im integer;
  _month_idx integer;
  _year_part integer;
  _due_date date;
BEGIN
  SELECT * INTO _rule FROM public.fee_rules WHERE id = _fee_rule_id;
  IF _rule IS NULL OR COALESCE(_rule.monthly_amount, 0) <= 0 THEN
    RETURN 0;
  END IF;

  IF _rule.academic_year_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM public.academic_years WHERE id = _rule.academic_year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  _step := CASE COALESCE(_rule.recurrence, 'monthly')
    WHEN 'quarterly' THEN 3
    WHEN 'semester' THEN 6
    WHEN 'yearly' THEN 12
    ELSE 1
  END;

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
      _im := _period * _step;
      _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));
      _due_date := public.charge_rule_adjust_due_to_academic_year(
        _due_date, _year.start_date, _year.end_date
      );

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

REVOKE EXECUTE ON FUNCTION public.backfill_recurring_charges_for_fee_rule(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.backfill_recurring_charges_for_fee_rule(uuid) TO authenticated;

COMMENT ON FUNCTION public.backfill_recurring_charges_for_fee_rule(uuid) IS
  'Gera propinas em atraso e do mês corrente para todos os alunos abrangidos por uma regra de cobrança.';

-- ---- Extracurricular / transporte / refeições --------------------------------
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
  _step integer := 1;
  _im integer;
  _month_idx integer;
  _year_part integer;
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

  _entity_id := _rule.entity_id;

  IF _rule IS NULL OR COALESCE(_rule.monthly_amount, 0) <= 0 THEN
    RETURN 0;
  END IF;

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

  _step := CASE COALESCE(_rule.recurrence, 'monthly')
    WHEN 'quarterly' THEN 3
    WHEN 'semester' THEN 6
    WHEN 'yearly' THEN 12
    ELSE 1
  END;

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
      _im := _period * _step;
      _month_idx := ((_rule.start_month - 1 + _im) % 12) + 1;
      _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _im) / 12);
      _due_date := make_date(_year_part, _month_idx, LEAST(COALESCE(_rule.due_day, 10), 28));
      _due_date := public.charge_rule_adjust_due_to_academic_year(
        _due_date, _year.start_date, _year.end_date
      );

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

REVOKE EXECUTE ON FUNCTION public.backfill_recurring_charges_for_domain_rule(text, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.backfill_recurring_charges_for_domain_rule(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.backfill_recurring_charges_for_domain_rule(text, uuid) IS
  'Gera cobranças em atraso e do mês corrente para inscrições abrangidas por regra de extracurricular, transporte ou refeições.';
