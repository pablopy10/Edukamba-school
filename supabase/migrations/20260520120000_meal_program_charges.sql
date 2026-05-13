-- Refeições escolares: planos, inscrições, mensalidades e regras de cobrança (alinhado a transporte/extracurricular).

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

-- ---- meal_programs ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Refeitório escolar',
  description text,
  default_monthly_fee numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_programs_school ON public.meal_programs(school_id);
CREATE INDEX IF NOT EXISTS idx_meal_programs_year ON public.meal_programs(academic_year_id);

CREATE TRIGGER trg_meal_programs_updated
  BEFORE UPDATE ON public.meal_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meal_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Meal programs viewable by school" ON public.meal_programs;
CREATE POLICY "Meal programs viewable by school"
  ON public.meal_programs FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Finance manages meal programs" ON public.meal_programs;
CREATE POLICY "Finance manages meal programs"
  ON public.meal_programs FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

-- ---- meal_enrollments -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_program_id uuid NOT NULL REFERENCES public.meal_programs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  monthly_fee_override numeric,
  notes text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_program_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_enroll_program ON public.meal_enrollments(meal_program_id);
CREATE INDEX IF NOT EXISTS idx_meal_enroll_student ON public.meal_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_meal_enroll_school ON public.meal_enrollments(school_id);

CREATE TRIGGER trg_meal_enrollments_updated
  BEFORE UPDATE ON public.meal_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meal_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School members view meal enrollments" ON public.meal_enrollments;
CREATE POLICY "School members view meal enrollments"
  ON public.meal_enrollments FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Staff manage meal enrollments" ON public.meal_enrollments;
CREATE POLICY "Staff manage meal enrollments"
  ON public.meal_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'SUPER_ADMIN'::user_role])
  );

DROP POLICY IF EXISTS "Staff update meal enrollments" ON public.meal_enrollments;
CREATE POLICY "Staff update meal enrollments"
  ON public.meal_enrollments FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'SUPER_ADMIN'::user_role])
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'SUPER_ADMIN'::user_role])
  );

DROP POLICY IF EXISTS "Admin delete meal enrollments" ON public.meal_enrollments;
CREATE POLICY "Admin delete meal enrollments"
  ON public.meal_enrollments FOR DELETE TO authenticated
  USING (school_id = public.get_my_school() AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'SUPER_ADMIN'::user_role]));

DROP POLICY IF EXISTS "Parents manage own children meal enrollments" ON public.meal_enrollments;
CREATE POLICY "Parents manage own children meal enrollments"
  ON public.meal_enrollments FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school()
    AND public.get_auth_role() = 'PARENT'::user_role
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.parent_id = auth.uid())
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.get_auth_role() = 'PARENT'::user_role
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.parent_id = auth.uid())
  );

-- ---- meal_fees --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.meal_enrollments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  meal_program_id uuid NOT NULL REFERENCES public.meal_programs(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  month_index integer,
  is_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meal_fees_enrollment ON public.meal_fees(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_meal_fees_student ON public.meal_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_meal_fees_school ON public.meal_fees(school_id);
CREATE INDEX IF NOT EXISTS idx_meal_fees_program ON public.meal_fees(meal_program_id);
CREATE INDEX IF NOT EXISTS idx_meal_fees_due ON public.meal_fees(due_date);

CREATE TRIGGER trg_meal_fees_updated
  BEFORE UPDATE ON public.meal_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meal_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School members view meal fees" ON public.meal_fees;
CREATE POLICY "School members view meal fees"
  ON public.meal_fees FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'SUPER_ADMIN'::user_role, 'DIRECTOR'::user_role, 'SECRETARY'::user_role, 'TREASURER'::user_role])
      OR student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Finance manages meal fees" ON public.meal_fees;
CREATE POLICY "Finance manages meal fees"
  ON public.meal_fees FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

-- ---- meal_charge_rules ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meal_charge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  meal_program_id uuid NOT NULL REFERENCES public.meal_programs(id) ON DELETE CASCADE,
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

ALTER TABLE public.meal_charge_rules
  DROP CONSTRAINT IF EXISTS meal_charge_rules_target_scope_check;
ALTER TABLE public.meal_charge_rules
  ADD CONSTRAINT meal_charge_rules_target_scope_check
  CHECK (target_scope IN ('all_enrolled', 'classrooms', 'students'));

ALTER TABLE public.meal_charge_rules
  DROP CONSTRAINT IF EXISTS meal_charge_rules_recurrence_check;
ALTER TABLE public.meal_charge_rules
  ADD CONSTRAINT meal_charge_rules_recurrence_check
  CHECK (recurrence IN ('monthly', 'quarterly', 'semester', 'yearly'));

ALTER TABLE public.meal_charge_rules
  DROP CONSTRAINT IF EXISTS meal_charge_rules_end_month_check;
ALTER TABLE public.meal_charge_rules
  ADD CONSTRAINT meal_charge_rules_end_month_check
  CHECK (end_month IS NULL OR (end_month >= 1 AND end_month <= 12));

ALTER TABLE public.meal_charge_rules
  DROP CONSTRAINT IF EXISTS meal_charge_rules_scope_payload_check;
ALTER TABLE public.meal_charge_rules
  ADD CONSTRAINT meal_charge_rules_scope_payload_check
  CHECK (
    (target_scope = 'all_enrolled')
    OR (target_scope IN ('classrooms', 'students'))
  );

COMMENT ON TABLE public.meal_charge_rules IS 'Regra de valores e recorrência de refeições por plano.';

CREATE INDEX IF NOT EXISTS idx_meal_charge_rules_program ON public.meal_charge_rules(meal_program_id);
CREATE INDEX IF NOT EXISTS idx_meal_charge_rules_year ON public.meal_charge_rules(academic_year_id);

CREATE TABLE IF NOT EXISTS public.meal_charge_rule_classrooms (
  charge_rule_id uuid NOT NULL REFERENCES public.meal_charge_rules(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_charge_rule_classrooms_classroom ON public.meal_charge_rule_classrooms(classroom_id);

CREATE TABLE IF NOT EXISTS public.meal_charge_rule_students (
  charge_rule_id uuid NOT NULL REFERENCES public.meal_charge_rules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_meal_charge_rule_students_student ON public.meal_charge_rule_students(student_id);

CREATE TRIGGER trg_meal_charge_rules_updated
  BEFORE UPDATE ON public.meal_charge_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.meal_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_charge_rule_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_charge_rule_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Meal charge rules selectable by school" ON public.meal_charge_rules;
CREATE POLICY "Meal charge rules selectable by school"
  ON public.meal_charge_rules FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Finance manages meal charge rules" ON public.meal_charge_rules;
CREATE POLICY "Finance manages meal charge rules"
  ON public.meal_charge_rules FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

DROP POLICY IF EXISTS "Meal charge rule classrooms viewable by school" ON public.meal_charge_rule_classrooms;
CREATE POLICY "Meal charge rule classrooms viewable by school"
  ON public.meal_charge_rule_classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_charge_rules mcr WHERE mcr.id = charge_rule_id AND mcr.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages meal charge rule classrooms" ON public.meal_charge_rule_classrooms;
CREATE POLICY "Finance manages meal charge rule classrooms"
  ON public.meal_charge_rule_classrooms FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_charge_rules mcr WHERE mcr.id = charge_rule_id AND mcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_charge_rules mcr WHERE mcr.id = charge_rule_id AND mcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

DROP POLICY IF EXISTS "Meal charge rule students viewable by school" ON public.meal_charge_rule_students;
CREATE POLICY "Meal charge rule students viewable by school"
  ON public.meal_charge_rule_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_charge_rules mcr WHERE mcr.id = charge_rule_id AND mcr.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages meal charge rule students" ON public.meal_charge_rule_students;
CREATE POLICY "Finance manages meal charge rule students"
  ON public.meal_charge_rule_students FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_charge_rules mcr WHERE mcr.id = charge_rule_id AND mcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_charge_rules mcr WHERE mcr.id = charge_rule_id AND mcr.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

-- ---- payments.meal_fee_id ---------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS meal_fee_id uuid REFERENCES public.meal_fees(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_payments_meal_fee_id ON public.payments(meal_fee_id);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_one_target_check;

ALTER TABLE public.payments ADD CONSTRAINT payments_one_target_check CHECK (
  num_nonnulls(student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id) = 1
);

DROP POLICY IF EXISTS "Staff can register payments" ON public.payments;
CREATE POLICY "Staff can register payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND submitted_by = auth.uid()
  AND public.auth_can_manage_school_payments()
  AND num_nonnulls(student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id) = 1
);

-- ---- generate_meal_fees (espelha generate_transport_fees) --------------------
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

CREATE OR REPLACE FUNCTION public.tg_meal_enrollment_sync_fees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.generate_meal_fees(NEW.id);
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.meal_program_id IS DISTINCT FROM NEW.meal_program_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.start_date IS DISTINCT FROM NEW.start_date
    OR OLD.end_date IS DISTINCT FROM NEW.end_date
    OR OLD.monthly_fee_override IS DISTINCT FROM NEW.monthly_fee_override
  ) THEN
    PERFORM public.generate_meal_fees(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meal_enrollment_sync_fees ON public.meal_enrollments;
CREATE TRIGGER trg_meal_enrollment_sync_fees
  AFTER INSERT OR UPDATE ON public.meal_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.tg_meal_enrollment_sync_fees();

-- ---- Notificação quando validação/rejeição de pagamento ---------------------
CREATE OR REPLACE FUNCTION public.tg_notify_payment_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
  _student_name text;
  _label text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('validado', 'rejeitado', 'validated', 'rejected') THEN RETURN NEW; END IF;

  IF NEW.activity_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.activity_fees af JOIN public.students s ON s.id = af.student_id
    WHERE af.id = NEW.activity_fee_id;
    _label := 'atividade extracurricular';
  ELSIF NEW.transport_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.transport_fees tf JOIN public.students s ON s.id = tf.student_id
    WHERE tf.id = NEW.transport_fee_id;
    _label := 'transporte';
  ELSIF NEW.enrollment_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.enrollment_fees ef JOIN public.students s ON s.id = ef.student_id
    WHERE ef.id = NEW.enrollment_fee_id;
    _label := 'matrícula';
  ELSIF NEW.meal_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.meal_fees mf JOIN public.students s ON s.id = mf.student_id
    WHERE mf.id = NEW.meal_fee_id;
    _label := 'refeições';
  ELSE
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.student_fees sf JOIN public.students s ON s.id = sf.student_id
    WHERE sf.id = NEW.student_fee_id;
    _label := 'propina';
  END IF;

  IF _parent_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.notify_user(
    _parent_id, NEW.school_id, 'administrativo',
    CASE WHEN lower(NEW.status) IN ('validado', 'validated')
         THEN 'Pagamento de ' || _label || ' validado'
         ELSE 'Pagamento de ' || _label || ' rejeitado' END,
    COALESCE(_student_name || ' — ', '') || 'Valor: ' || NEW.amount_paid::text || ' EUR' ||
      CASE WHEN lower(NEW.status) IN ('rejeitado', 'rejected') AND NEW.rejection_reason IS NOT NULL
           THEN E'\nMotivo: ' || NEW.rejection_reason ELSE '' END,
    '/pagamentos', NEW.validated_by, NULL
  );
  RETURN NEW;
END;
$$;
