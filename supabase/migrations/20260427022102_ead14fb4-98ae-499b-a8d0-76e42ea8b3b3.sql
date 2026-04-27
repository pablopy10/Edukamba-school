-- =========================================
-- TRANSPORT MANAGEMENT (Giro Escolar)
-- =========================================

-- 1) Routes
CREATE TABLE public.transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  driver_name text,
  driver_phone text,
  vehicle_plate text,
  vehicle_model text,
  capacity integer NOT NULL DEFAULT 20,
  shift text NOT NULL DEFAULT 'BOTH', -- MORNING | AFTERNOON | BOTH
  monthly_fee numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transport_routes_school ON public.transport_routes(school_id);

-- 2) Stops
CREATE TABLE public.transport_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  pickup_time time,
  dropoff_time time,
  position integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transport_stops_route ON public.transport_stops(route_id);
CREATE INDEX idx_transport_stops_school ON public.transport_stops(school_id);

-- 3) Enrollments
CREATE TABLE public.transport_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  pickup_stop_id uuid REFERENCES public.transport_stops(id) ON DELETE SET NULL,
  dropoff_stop_id uuid REFERENCES public.transport_stops(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'BOTH', -- PICKUP | DROPOFF | BOTH
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  monthly_fee_override numeric,
  status text NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | CANCELLED
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, student_id, start_date)
);

CREATE INDEX idx_transport_enrollments_school ON public.transport_enrollments(school_id);
CREATE INDEX idx_transport_enrollments_route ON public.transport_enrollments(route_id);
CREATE INDEX idx_transport_enrollments_student ON public.transport_enrollments(student_id);

-- 4) Transport fees (monthly invoicing)
CREATE TABLE public.transport_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES public.transport_enrollments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  amount_due numeric NOT NULL DEFAULT 0,
  due_date date NOT NULL,
  month_index integer,
  is_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transport_fees_school ON public.transport_fees(school_id);
CREATE INDEX idx_transport_fees_enrollment ON public.transport_fees(enrollment_id);
CREATE INDEX idx_transport_fees_student ON public.transport_fees(student_id);
CREATE INDEX idx_transport_fees_due_date ON public.transport_fees(due_date) WHERE is_paid = false;

-- 5) Add transport_fee_id to payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS transport_fee_id uuid REFERENCES public.transport_fees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_transport_fee ON public.payments(transport_fee_id);

-- =========================================
-- updated_at triggers
-- =========================================
CREATE TRIGGER trg_transport_routes_updated
  BEFORE UPDATE ON public.transport_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_transport_enrollments_updated
  BEFORE UPDATE ON public.transport_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_transport_fees_updated
  BEFORE UPDATE ON public.transport_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RLS
-- =========================================
ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_fees ENABLE ROW LEVEL SECURITY;

-- Routes
CREATE POLICY "Routes viewable by school members"
  ON public.transport_routes FOR SELECT TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins manage routes"
  ON public.transport_routes FOR ALL TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- Stops
CREATE POLICY "Stops viewable by school members"
  ON public.transport_stops FOR SELECT TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins manage stops"
  ON public.transport_stops FOR ALL TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- Enrollments: staff sees all; parents see their child
CREATE POLICY "Transport enrollments viewable"
  ON public.transport_enrollments FOR SELECT TO authenticated
  USING (
    school_id = get_my_school()
    AND (
      get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
      OR student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
    )
  );

CREATE POLICY "Admins manage transport enrollments"
  ON public.transport_enrollments FOR ALL TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- Fees
CREATE POLICY "Transport fees viewable"
  ON public.transport_fees FOR SELECT TO authenticated
  USING (
    school_id = get_my_school()
    AND (
      get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
      OR student_id IN (SELECT id FROM public.students WHERE parent_id = auth.uid())
    )
  );

CREATE POLICY "Admins manage transport fees"
  ON public.transport_fees FOR ALL TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- =========================================
-- Allow parents to submit payments for transport fees
-- =========================================
CREATE POLICY "Parents can submit transport payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    school_id = get_my_school()
    AND submitted_by = auth.uid()
    AND transport_fee_id IN (
      SELECT tf.id FROM public.transport_fees tf
      JOIN public.students s ON s.id = tf.student_id
      WHERE s.parent_id = auth.uid()
    )
  );

-- =========================================
-- Function: generate transport fees for an enrollment
-- =========================================
CREATE OR REPLACE FUNCTION public.generate_transport_fees(_enrollment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enroll record;
  _route record;
  _year record;
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
BEGIN
  SELECT * INTO _enroll FROM public.transport_enrollments WHERE id = _enrollment_id;
  IF _enroll IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _route FROM public.transport_routes WHERE id = _enroll.route_id;
  IF _route IS NULL THEN RETURN 0; END IF;

  _amount := COALESCE(_enroll.monthly_fee_override, _route.monthly_fee, 0);
  IF _amount <= 0 THEN RETURN 0; END IF;

  -- Remove unpaid future fees to avoid duplicates
  DELETE FROM public.transport_fees
  WHERE enrollment_id = _enrollment_id AND is_paid = false;

  _start_date := _enroll.start_date;
  IF _enroll.end_date IS NOT NULL THEN
    _end_date := _enroll.end_date;
  ELSE
    -- Use active academic year end if any, otherwise +10 months
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
      (SELECT id FROM public.academic_years WHERE school_id = _enroll.school_id AND is_active = true LIMIT 1),
      _amount, _due_date, _month_idx, false
    );
    _created := _created + 1;
  END LOOP;

  RETURN _created;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_transport_fees(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_transport_fees(uuid) TO authenticated;

-- =========================================
-- Trigger: notify parent when transport payment validated/rejected
-- Extend existing tg_notify_payment_validation to handle transport
-- =========================================
CREATE OR REPLACE FUNCTION public.tg_notify_payment_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

REVOKE EXECUTE ON FUNCTION public.tg_notify_payment_validation() FROM anon, authenticated, public;