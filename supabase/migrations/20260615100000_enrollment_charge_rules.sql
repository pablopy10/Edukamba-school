-- Matrículas: regras de cobrança (alvo por turma/aluno/todos) + módulo de autorizações «enrollment».

-- ---- module_authorization_templates: enrollment ---------------------------
ALTER TABLE public.module_authorization_templates
  DROP CONSTRAINT IF EXISTS module_authorization_templates_module_check;

ALTER TABLE public.module_authorization_templates
  ADD CONSTRAINT module_authorization_templates_module_check CHECK (
    module IN ('extracurricular', 'transport', 'meal', 'event', 'enrollment')
  );

-- ---- enrollment_charge_rules ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrollment_charge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  target_scope text NOT NULL DEFAULT 'all_enrolled',
  amount_new numeric NOT NULL DEFAULT 0,
  amount_renewal numeric NOT NULL DEFAULT 0,
  due_offset_days integer NOT NULL DEFAULT 15,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.enrollment_charge_rules
  DROP CONSTRAINT IF EXISTS enrollment_charge_rules_target_scope_check;
ALTER TABLE public.enrollment_charge_rules
  ADD CONSTRAINT enrollment_charge_rules_target_scope_check
  CHECK (target_scope IN ('all_enrolled', 'classrooms', 'students'));

ALTER TABLE public.enrollment_charge_rules
  DROP CONSTRAINT IF EXISTS enrollment_charge_rules_due_offset_check;
ALTER TABLE public.enrollment_charge_rules
  ADD CONSTRAINT enrollment_charge_rules_due_offset_check
  CHECK (due_offset_days >= 0 AND due_offset_days <= 365);

CREATE INDEX IF NOT EXISTS idx_enrollment_charge_rules_school ON public.enrollment_charge_rules(school_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_charge_rules_year ON public.enrollment_charge_rules(academic_year_id);

CREATE TABLE IF NOT EXISTS public.enrollment_charge_rule_classrooms (
  charge_rule_id uuid NOT NULL REFERENCES public.enrollment_charge_rules(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_charge_rule_classrooms_classroom
  ON public.enrollment_charge_rule_classrooms(classroom_id);

CREATE TABLE IF NOT EXISTS public.enrollment_charge_rule_students (
  charge_rule_id uuid NOT NULL REFERENCES public.enrollment_charge_rules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollment_charge_rule_students_student ON public.enrollment_charge_rule_students(student_id);

CREATE TRIGGER trg_enrollment_charge_rules_updated
  BEFORE UPDATE ON public.enrollment_charge_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.enrollment_charge_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_charge_rule_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_charge_rule_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enrollment charge rules selectable by school" ON public.enrollment_charge_rules;
CREATE POLICY "Enrollment charge rules selectable by school"
  ON public.enrollment_charge_rules FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Finance manages enrollment charge rules" ON public.enrollment_charge_rules;
CREATE POLICY "Finance manages enrollment charge rules"
  ON public.enrollment_charge_rules FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

DROP POLICY IF EXISTS "Enrollment charge rule classrooms viewable by school" ON public.enrollment_charge_rule_classrooms;
CREATE POLICY "Enrollment charge rule classrooms viewable by school"
  ON public.enrollment_charge_rule_classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollment_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages enrollment charge rule classrooms" ON public.enrollment_charge_rule_classrooms;
CREATE POLICY "Finance manages enrollment charge rule classrooms"
  ON public.enrollment_charge_rule_classrooms FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollment_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enrollment_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

DROP POLICY IF EXISTS "Enrollment charge rule students viewable by school" ON public.enrollment_charge_rule_students;
CREATE POLICY "Enrollment charge rule students viewable by school"
  ON public.enrollment_charge_rule_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollment_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages enrollment charge rule students" ON public.enrollment_charge_rule_students;
CREATE POLICY "Finance manages enrollment charge rule students"
  ON public.enrollment_charge_rule_students FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollment_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.enrollment_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

COMMENT ON TABLE public.enrollment_charge_rules IS 'Valores de taxa única de matrícula / renovação e prazo por alvo (ano letivo opcional); prioridade aluno específico > turma > todos.';

-- ---- Trigger: usar regra aplicável antes das definições globais na escola ----
CREATE OR REPLACE FUNCTION public.tg_generate_enrollment_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student record;
  _settings jsonb;
  _new_fee numeric;
  _renewal_fee numeric;
  _fee_type text;
  _amount numeric;
  _prior_count integer;
  _rule record;
  _due_days integer;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN RETURN NEW; END IF;

  SELECT s.id, s.school_id, s.classroom_id INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.school_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.enrollment_fees WHERE enrollment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO _prior_count
  FROM public.enrollments e
  WHERE e.student_id = NEW.student_id
    AND e.id <> NEW.id
    AND COALESCE(e.academic_year_id::text,'') <> COALESCE(NEW.academic_year_id::text,'');

  IF _prior_count > 0 THEN
    _fee_type := 'RENEWAL';
  ELSE
    _fee_type := 'NEW';
  END IF;

  SELECT r.*
  INTO _rule
  FROM public.enrollment_charge_rules r
  WHERE r.school_id = _student.school_id
    AND (r.academic_year_id IS NULL OR r.academic_year_id IS NOT DISTINCT FROM NEW.academic_year_id)
    AND (
      r.target_scope = 'all_enrolled'
      OR (
        r.target_scope = 'classrooms'
        AND _student.classroom_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.enrollment_charge_rule_classrooms c
          WHERE c.charge_rule_id = r.id AND c.classroom_id = _student.classroom_id
        )
      )
      OR (
        r.target_scope = 'students'
        AND EXISTS (
          SELECT 1 FROM public.enrollment_charge_rule_students s
          WHERE s.charge_rule_id = r.id AND s.student_id = NEW.student_id
        )
      )
    )
  ORDER BY
    CASE r.target_scope
      WHEN 'students' THEN 3
      WHEN 'classrooms' THEN 2
      ELSE 1
    END DESC,
    r.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    _due_days := COALESCE(_rule.due_offset_days, 15);
    IF _fee_type = 'RENEWAL' THEN
      _amount := COALESCE(_rule.amount_renewal, 0);
    ELSE
      _amount := COALESCE(_rule.amount_new, 0);
    END IF;
  ELSE
    _due_days := 15;
    SELECT settings INTO _settings FROM public.schools WHERE id = _student.school_id;
    _new_fee := COALESCE((_settings->>'enrollment_fee_new')::numeric, 0);
    _renewal_fee := COALESCE((_settings->>'enrollment_fee_renewal')::numeric, 0);
    IF _fee_type = 'RENEWAL' THEN
      _amount := _renewal_fee;
    ELSE
      _amount := _new_fee;
    END IF;
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.enrollment_fees (
    school_id, student_id, enrollment_id, academic_year_id,
    fee_type, amount_due, due_date, is_paid
  ) VALUES (
    _student.school_id, NEW.student_id, NEW.id, NEW.academic_year_id,
    _fee_type, _amount, CURRENT_DATE + _due_days, false
  );

  RETURN NEW;
END;
$$;
