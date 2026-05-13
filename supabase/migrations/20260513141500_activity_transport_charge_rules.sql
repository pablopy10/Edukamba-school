-- Regras de cobrança para extracurricular (por atividade) e transporte (por rota), alinhadas com fee_rules (recorrência, alunos/turmas/todos).

-- Garantido aqui porque este ficheiro pode ser executado isoladamente ou antes de aplicar todas as migrações (equivale a `20260511140000_payments_rls_finance_roles.sql`).
CREATE OR REPLACE FUNCTION public.auth_can_manage_school_payments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_auth_role(), 'STUDENT'::public.user_role) = ANY (
    ARRAY[
      'ADMIN'::public.user_role,
      'SUPER_ADMIN'::public.user_role,
      'DIRECTOR'::public.user_role,
      'SECRETARY'::public.user_role,
      'TREASURER'::public.user_role
    ]
  );
$$;

COMMENT ON FUNCTION public.auth_can_manage_school_payments() IS 'Financeiro/acerto de cobranças: mutações em payments e políticas RLS relacionadas (ver migrações de pagamentos).';

-- ---- activity_charge_rules ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_charge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  activity_id uuid NOT NULL REFERENCES public.extracurricular_activities(id) ON DELETE CASCADE,
  target_scope text NOT NULL DEFAULT 'all_enrolled',
  monthly_amount numeric NOT NULL DEFAULT 0,
  due_day integer NOT NULL DEFAULT 10,
  months_count integer NOT NULL DEFAULT 1,
  start_month integer NOT NULL DEFAULT 9,
  end_month integer,
  recurrence text NOT NULL DEFAULT 'monthly',
  generate_all_upfront boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_charge_rules
  DROP CONSTRAINT IF EXISTS activity_charge_rules_target_scope_check;
ALTER TABLE public.activity_charge_rules
  ADD CONSTRAINT activity_charge_rules_target_scope_check
    CHECK (target_scope IN ('all_enrolled', 'classrooms', 'students'));

ALTER TABLE public.activity_charge_rules
  DROP CONSTRAINT IF EXISTS activity_charge_rules_recurrence_check;
ALTER TABLE public.activity_charge_rules
  ADD CONSTRAINT activity_charge_rules_recurrence_check
    CHECK (recurrence IN ('monthly', 'quarterly', 'semester', 'yearly'));

ALTER TABLE public.activity_charge_rules
  DROP CONSTRAINT IF EXISTS activity_charge_rules_end_month_check;
ALTER TABLE public.activity_charge_rules
  ADD CONSTRAINT activity_charge_rules_end_month_check
    CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12));

ALTER TABLE public.activity_charge_rules
  DROP CONSTRAINT IF EXISTS activity_charge_rules_scope_payload_check;
ALTER TABLE public.activity_charge_rules
  ADD CONSTRAINT activity_charge_rules_scope_payload_check
    CHECK (
      (target_scope = 'all_enrolled')
      OR (target_scope IN ('classrooms', 'students'))
    );

COMMENT ON TABLE public.activity_charge_rules IS 'Regra de valores e recorrência de cobrança por atividade extracurricular (complementar a enrollment_fee/billing_frequency da atividade).';

CREATE INDEX IF NOT EXISTS idx_activity_charge_rules_activity ON public.activity_charge_rules(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_charge_rules_year ON public.activity_charge_rules(academic_year_id);

CREATE TABLE IF NOT EXISTS public.activity_charge_rule_classrooms (
  charge_rule_id uuid NOT NULL REFERENCES public.activity_charge_rules(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_charge_rule_classrooms_classroom ON public.activity_charge_rule_classrooms(classroom_id);

CREATE TABLE IF NOT EXISTS public.activity_charge_rule_students (
  charge_rule_id uuid NOT NULL REFERENCES public.activity_charge_rules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_charge_rule_students_student ON public.activity_charge_rule_students(student_id);

CREATE TRIGGER trg_activity_charge_rules_updated
  BEFORE UPDATE ON public.activity_charge_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.activity_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_charge_rule_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_charge_rule_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity charge rules selectable by school" ON public.activity_charge_rules;
CREATE POLICY "Activity charge rules selectable by school"
  ON public.activity_charge_rules FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Finance manages activity charge rules" ON public.activity_charge_rules;
CREATE POLICY "Finance manages activity charge rules"
  ON public.activity_charge_rules FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

DROP POLICY IF EXISTS "Activity charge rule classrooms viewable by school" ON public.activity_charge_rule_classrooms;
CREATE POLICY "Activity charge rule classrooms viewable by school"
  ON public.activity_charge_rule_classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_charge_rules acr WHERE acr.id = charge_rule_id AND acr.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages activity charge rule classrooms" ON public.activity_charge_rule_classrooms;
CREATE POLICY "Finance manages activity charge rule classrooms"
  ON public.activity_charge_rule_classrooms FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_charge_rules acr WHERE acr.id = charge_rule_id AND acr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.activity_charge_rules acr WHERE acr.id = charge_rule_id AND acr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

DROP POLICY IF EXISTS "Activity charge rule students viewable by school" ON public.activity_charge_rule_students;
CREATE POLICY "Activity charge rule students viewable by school"
  ON public.activity_charge_rule_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_charge_rules acr WHERE acr.id = charge_rule_id AND acr.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages activity charge rule students" ON public.activity_charge_rule_students;
CREATE POLICY "Finance manages activity charge rule students"
  ON public.activity_charge_rule_students FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.activity_charge_rules acr WHERE acr.id = charge_rule_id AND acr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.activity_charge_rules acr WHERE acr.id = charge_rule_id AND acr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

-- ---- transport_charge_rules --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transport_charge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  route_id uuid NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  target_scope text NOT NULL DEFAULT 'all_enrolled',
  monthly_amount numeric NOT NULL DEFAULT 0,
  due_day integer NOT NULL DEFAULT 10,
  months_count integer NOT NULL DEFAULT 1,
  start_month integer NOT NULL DEFAULT 9,
  end_month integer,
  recurrence text NOT NULL DEFAULT 'monthly',
  generate_all_upfront boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transport_charge_rules
  DROP CONSTRAINT IF EXISTS transport_charge_rules_target_scope_check;
ALTER TABLE public.transport_charge_rules
  ADD CONSTRAINT transport_charge_rules_target_scope_check
    CHECK (target_scope IN ('all_enrolled', 'classrooms', 'students'));

ALTER TABLE public.transport_charge_rules
  DROP CONSTRAINT IF EXISTS transport_charge_rules_recurrence_check;
ALTER TABLE public.transport_charge_rules
  ADD CONSTRAINT transport_charge_rules_recurrence_check
    CHECK (recurrence IN ('monthly', 'quarterly', 'semester', 'yearly'));

ALTER TABLE public.transport_charge_rules
  DROP CONSTRAINT IF EXISTS transport_charge_rules_end_month_check;
ALTER TABLE public.transport_charge_rules
  ADD CONSTRAINT transport_charge_rules_end_month_check
    CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12));

ALTER TABLE public.transport_charge_rules
  DROP CONSTRAINT IF EXISTS transport_charge_rules_scope_payload_check;
ALTER TABLE public.transport_charge_rules
  ADD CONSTRAINT transport_charge_rules_scope_payload_check
    CHECK (
      (target_scope = 'all_enrolled')
      OR (target_scope IN ('classrooms', 'students'))
    );

COMMENT ON TABLE public.transport_charge_rules IS 'Regra de valores e recorrência de mensalidades por rota de transporte.';

CREATE INDEX IF NOT EXISTS idx_transport_charge_rules_route ON public.transport_charge_rules(route_id);
CREATE INDEX IF NOT EXISTS idx_transport_charge_rules_year ON public.transport_charge_rules(academic_year_id);

CREATE TABLE IF NOT EXISTS public.transport_charge_rule_classrooms (
  charge_rule_id uuid NOT NULL REFERENCES public.transport_charge_rules(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_charge_rule_classrooms_classroom ON public.transport_charge_rule_classrooms(classroom_id);

CREATE TABLE IF NOT EXISTS public.transport_charge_rule_students (
  charge_rule_id uuid NOT NULL REFERENCES public.transport_charge_rules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_transport_charge_rule_students_student ON public.transport_charge_rule_students(student_id);

CREATE TRIGGER trg_transport_charge_rules_updated
  BEFORE UPDATE ON public.transport_charge_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.transport_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_charge_rule_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_charge_rule_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Transport charge rules selectable by school" ON public.transport_charge_rules;
CREATE POLICY "Transport charge rules selectable by school"
  ON public.transport_charge_rules FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Finance manages transport charge rules" ON public.transport_charge_rules;
CREATE POLICY "Finance manages transport charge rules"
  ON public.transport_charge_rules FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

DROP POLICY IF EXISTS "Transport charge rule classrooms viewable by school" ON public.transport_charge_rule_classrooms;
CREATE POLICY "Transport charge rule classrooms viewable by school"
  ON public.transport_charge_rule_classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transport_charge_rules tcr WHERE tcr.id = charge_rule_id AND tcr.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages transport charge rule classrooms" ON public.transport_charge_rule_classrooms;
CREATE POLICY "Finance manages transport charge rule classrooms"
  ON public.transport_charge_rule_classrooms FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transport_charge_rules tcr WHERE tcr.id = charge_rule_id AND tcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transport_charge_rules tcr WHERE tcr.id = charge_rule_id AND tcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

DROP POLICY IF EXISTS "Transport charge rule students viewable by school" ON public.transport_charge_rule_students;
CREATE POLICY "Transport charge rule students viewable by school"
  ON public.transport_charge_rule_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transport_charge_rules tcr WHERE tcr.id = charge_rule_id AND tcr.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages transport charge rule students" ON public.transport_charge_rule_students;
CREATE POLICY "Finance manages transport charge rule students"
  ON public.transport_charge_rule_students FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transport_charge_rules tcr WHERE tcr.id = charge_rule_id AND tcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transport_charge_rules tcr WHERE tcr.id = charge_rule_id AND tcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

-- ---- generate_activity_fees: regra ou fallback -------------------------------
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
    SELECT * INTO _year FROM public.academic_years WHERE id = _billing_year;
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
        _enrollment_id, _activity.id, _enroll.student_id, _enroll.school_id, _billing_year,
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

-- ---- generate_transport_fees: regra ou fallback ----------------------------
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
