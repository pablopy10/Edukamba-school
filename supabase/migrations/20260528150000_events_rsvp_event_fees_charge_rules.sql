-- RSVP dos encarregados (por aluno) + regras de cobrança e event_fees (paridade com outros módulos).
-- Também atualiza tg_notify_payment_validation e payments.event_fee_id.

-- ---- RSVP ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_student_rsvp (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  response TEXT NOT NULL DEFAULT 'unset' CHECK (response IN ('presente', 'ausente', 'unset')),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_event_student_rsvp_student ON public.event_student_rsvp(student_id);

ALTER TABLE public.event_student_rsvp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event RSVP view school" ON public.event_student_rsvp;
CREATE POLICY "Event RSVP view school"
  ON public.event_student_rsvp FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.school_id = public.get_my_school())
    AND (
      EXISTS (
        SELECT 1 FROM public.students st
        WHERE st.id = student_id AND public.get_auth_role() = 'PARENT'::public.user_role AND st.parent_id = auth.uid()
      )
      OR public.get_auth_role() = ANY (
        ARRAY['ADMIN'::public.user_role, 'SUPER_ADMIN'::public.user_role, 'DIRECTOR'::public.user_role,
          'SECRETARY'::public.user_role, 'TREASURER'::public.user_role, 'TEACHER'::public.user_role]
      )
    )
  );

DROP POLICY IF EXISTS "Parent upserts own childrens RSVP" ON public.event_student_rsvp;
CREATE POLICY "Parent upserts own childrens RSVP"
  ON public.event_student_rsvp FOR INSERT TO authenticated
  WITH CHECK (
    public.get_auth_role() = 'PARENT'::public.user_role
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.school_id = public.get_my_school())
    AND EXISTS (SELECT 1 FROM public.students st WHERE st.id = student_id AND st.parent_id = auth.uid())
  );

DROP POLICY IF EXISTS "Parent updates own childrens RSVP" ON public.event_student_rsvp;
CREATE POLICY "Parent updates own childrens RSVP"
  ON public.event_student_rsvp FOR UPDATE TO authenticated
  USING (
    public.get_auth_role() = 'PARENT'::public.user_role
    AND EXISTS (
      SELECT 1 FROM public.students st WHERE st.id = student_id AND st.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.students st WHERE st.id = student_id AND st.parent_id = auth.uid())
  );

COMMENT ON TABLE public.event_student_rsvp IS 'Presença declarada pelo encarregado por aluno e evento.';

-- ---- Alunos elegíveis por público do evento ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_audience_student_ids(p_school uuid, p_audience text)
RETURNS TABLE(student_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw text := trim(coalesce(p_audience, ''));
  cu text := upper(raw);
  m text[];
BEGIN
  IF cu = 'STAFF' THEN
    RETURN;
  END IF;
  IF raw = '' OR cu = 'ALL' THEN
    RETURN QUERY
    SELECT s.id FROM public.students s WHERE s.school_id = p_school;
    RETURN;
  END IF;
  m := regexp_match(lower(raw), '^classroom:([0-9a-f\-]{36})$');
  IF m IS NOT NULL THEN
    RETURN QUERY
    SELECT s.id
    FROM public.students s
    WHERE s.school_id = p_school AND s.classroom_id = (m[1])::uuid;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id FROM public.students s WHERE s.school_id = p_school;
END;
$$;

REVOKE ALL ON FUNCTION public.event_audience_student_ids(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.event_audience_student_ids(uuid, text) FROM anon, authenticated;

-- ---- Cobrança: uma regra opcional por evento ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_charge_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  target_scope TEXT NOT NULL DEFAULT 'all_enrolled',
  monthly_amount NUMERIC NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL DEFAULT 10,
  months_count INTEGER NOT NULL DEFAULT 1,
  start_month INTEGER NOT NULL DEFAULT 9,
  end_month INTEGER,
  recurrence TEXT NOT NULL DEFAULT 'monthly',
  generate_all_upfront BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

ALTER TABLE public.event_charge_rules DROP CONSTRAINT IF EXISTS event_charge_rules_target_scope_check;
ALTER TABLE public.event_charge_rules
  ADD CONSTRAINT event_charge_rules_target_scope_check
  CHECK (target_scope IN ('all_enrolled', 'classrooms', 'students'));

ALTER TABLE public.event_charge_rules DROP CONSTRAINT IF EXISTS event_charge_rules_recurrence_check;
ALTER TABLE public.event_charge_rules
  ADD CONSTRAINT event_charge_rules_recurrence_check
  CHECK (recurrence IN ('monthly', 'quarterly', 'semester', 'yearly'));

ALTER TABLE public.event_charge_rules DROP CONSTRAINT IF EXISTS event_charge_rules_scope_payload_check;
ALTER TABLE public.event_charge_rules
  ADD CONSTRAINT event_charge_rules_scope_payload_check
  CHECK (
    (target_scope = 'all_enrolled')
    OR (target_scope IN ('classrooms', 'students'))
  );

CREATE TRIGGER trg_event_charge_rules_updated
  BEFORE UPDATE ON public.event_charge_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_charge_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event charge rules selectable by school" ON public.event_charge_rules;
CREATE POLICY "Event charge rules selectable by school"
  ON public.event_charge_rules FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Finance manages event charge rules" ON public.event_charge_rules;
CREATE POLICY "Finance manages event charge rules"
  ON public.event_charge_rules FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

CREATE TABLE IF NOT EXISTS public.event_charge_rule_classrooms (
  charge_rule_id UUID NOT NULL REFERENCES public.event_charge_rules(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, classroom_id)
);

CREATE TABLE IF NOT EXISTS public.event_charge_rule_students (
  charge_rule_id UUID NOT NULL REFERENCES public.event_charge_rules(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  PRIMARY KEY (charge_rule_id, student_id)
);

ALTER TABLE public.event_charge_rule_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_charge_rule_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event rule classrooms selectable" ON public.event_charge_rule_classrooms;
CREATE POLICY "Event rule classrooms selectable"
  ON public.event_charge_rule_classrooms FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages event rule classrooms" ON public.event_charge_rule_classrooms;
CREATE POLICY "Finance manages event rule classrooms"
  ON public.event_charge_rule_classrooms FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

DROP POLICY IF EXISTS "Event rule students selectable" ON public.event_charge_rule_students;
CREATE POLICY "Event rule students selectable"
  ON public.event_charge_rule_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Finance manages event rule students" ON public.event_charge_rule_students;
CREATE POLICY "Finance manages event rule students"
  ON public.event_charge_rule_students FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_charge_rules r
      WHERE r.id = charge_rule_id AND r.school_id = public.get_my_school()
    )
    AND public.auth_can_manage_school_payments()
  );

-- ---- Parcelas -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  amount_due NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  month_index INTEGER,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_fees_event ON public.event_fees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_fees_student ON public.event_fees(student_id);

CREATE TRIGGER trg_event_fees_updated
  BEFORE UPDATE ON public.event_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.event_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event fees view school" ON public.event_fees;
CREATE POLICY "Event fees view school"
  ON public.event_fees FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.get_auth_role() = ANY (
        ARRAY['ADMIN'::public.user_role, 'TEACHER'::public.user_role, 'SUPER_ADMIN'::public.user_role,
          'DIRECTOR'::public.user_role, 'SECRETARY'::public.user_role, 'TREASURER'::public.user_role]
      )
      OR student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Finance manages event fees" ON public.event_fees;
CREATE POLICY "Finance manages event fees"
  ON public.event_fees FOR ALL TO authenticated
  USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
  WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

-- ---- payments -----------------------------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS event_fee_id UUID REFERENCES public.event_fees(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_payments_event_fee_id ON public.payments(event_fee_id);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_one_target_check;

ALTER TABLE public.payments ADD CONSTRAINT payments_one_target_check CHECK (
  num_nonnulls(
    student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id
  ) = 1
);

DROP POLICY IF EXISTS "Staff can register payments" ON public.payments;
CREATE POLICY "Staff can register payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND submitted_by = auth.uid()
  AND public.auth_can_manage_school_payments()
  AND num_nonnulls(
    student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id
  ) = 1
);

-- ---- Geração (uma cobrança por aluno/alvo para o evento) ---------------------------------------
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
  _billing_year UUID;
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

CREATE OR REPLACE FUNCTION public.tg_refresh_event_fees_after_charge_rule_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.generate_event_fees(OLD.event_id);
    RETURN OLD;
  END IF;
  PERFORM public.generate_event_fees(NEW.event_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_event_fees_aiud_charge_rules ON public.event_charge_rules;
CREATE TRIGGER trg_refresh_event_fees_aiud_charge_rules
  AFTER INSERT OR UPDATE OR DELETE ON public.event_charge_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_event_fees_after_charge_rule_mutation();

CREATE OR REPLACE FUNCTION public.tg_refresh_event_fees_from_rule_junction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid := COALESCE(NEW.charge_rule_id, OLD.charge_rule_id);
  e uuid;
BEGIN
  SELECT event_id INTO e FROM public.event_charge_rules WHERE id = rid LIMIT 1;
  IF e IS NOT NULL THEN
    PERFORM public.generate_event_fees(e);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_event_rule_class_refresh ON public.event_charge_rule_classrooms;
CREATE TRIGGER trg_event_rule_class_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.event_charge_rule_classrooms
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_event_fees_from_rule_junction();

DROP TRIGGER IF EXISTS trg_event_rule_student_refresh ON public.event_charge_rule_students;
CREATE TRIGGER trg_event_rule_student_refresh
  AFTER INSERT OR UPDATE OR DELETE ON public.event_charge_rule_students
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_event_fees_from_rule_junction();

CREATE OR REPLACE FUNCTION public.tg_refresh_event_fees_when_event_moves()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.event_date IS DISTINCT FROM NEW.event_date
    OR OLD.audience IS DISTINCT FROM NEW.audience
    OR OLD.school_id IS DISTINCT FROM NEW.school_id
  ) THEN
    PERFORM public.generate_event_fees(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_event_fees_when_event_moves ON public.events;
CREATE TRIGGER trg_refresh_event_fees_when_event_moves
  AFTER UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_event_fees_when_event_moves();

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
  ELSIF NEW.event_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.event_fees ef JOIN public.students s ON s.id = ef.student_id
    WHERE ef.id = NEW.event_fee_id;
    _label := 'evento escolar';
  ELSIF NEW.student_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.student_fees sf JOIN public.students s ON s.id = sf.student_id
    WHERE sf.id = NEW.student_fee_id;
    _label := 'propina';
  ELSE
    RETURN NEW;
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
