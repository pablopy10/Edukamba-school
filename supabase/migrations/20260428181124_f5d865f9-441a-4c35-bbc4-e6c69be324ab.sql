
-- Add school_id to enrollments view via existing join is unnecessary; we'll fetch from students.

-- 1. Create enrollment_fees table for matrícula/renovação one-time fees
CREATE TABLE public.enrollment_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  enrollment_id UUID REFERENCES public.enrollments(id) ON DELETE SET NULL,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('NEW','RENEWAL')),
  amount_due NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollment_fees_school ON public.enrollment_fees(school_id);
CREATE INDEX idx_enrollment_fees_student ON public.enrollment_fees(student_id);
CREATE INDEX idx_enrollment_fees_year ON public.enrollment_fees(academic_year_id);

ALTER TABLE public.enrollment_fees ENABLE ROW LEVEL SECURITY;

-- Admin/staff manage everything in their school
CREATE POLICY "Staff manage enrollment fees in their school"
ON public.enrollment_fees FOR ALL TO authenticated
USING (
  get_auth_role() IN ('ADMIN','SUPER_ADMIN','TEACHER')
  AND school_id = get_my_school()
)
WITH CHECK (
  get_auth_role() IN ('ADMIN','SUPER_ADMIN','TEACHER')
  AND school_id = get_my_school()
);

-- Parents see fees for their children
CREATE POLICY "Parents view enrollment fees of their children"
ON public.enrollment_fees FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = enrollment_fees.student_id AND s.parent_id = auth.uid()
  )
);

-- Students see their own
CREATE POLICY "Students view their own enrollment fees"
ON public.enrollment_fees FOR SELECT TO authenticated
USING (is_self_student(student_id));

CREATE TRIGGER update_enrollment_fees_updated_at
BEFORE UPDATE ON public.enrollment_fees
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add enrollment_fee_id to payments
ALTER TABLE public.payments
  ADD COLUMN enrollment_fee_id UUID REFERENCES public.enrollment_fees(id) ON DELETE CASCADE;

CREATE INDEX idx_payments_enrollment_fee ON public.payments(enrollment_fee_id);

-- 3. Trigger to auto-generate enrollment fee when enrollment becomes ACTIVE
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
BEGIN
  IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN RETURN NEW; END IF;

  SELECT s.id, s.school_id INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.school_id IS NULL THEN RETURN NEW; END IF;

  -- Avoid duplicates for the same enrollment
  IF EXISTS (SELECT 1 FROM public.enrollment_fees WHERE enrollment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT settings INTO _settings FROM public.schools WHERE id = _student.school_id;
  _new_fee := COALESCE((_settings->>'enrollment_fee_new')::numeric, 0);
  _renewal_fee := COALESCE((_settings->>'enrollment_fee_renewal')::numeric, 0);

  -- Determine if this is a renewal: any prior enrollment for this student in another year
  SELECT COUNT(*) INTO _prior_count
  FROM public.enrollments e
  WHERE e.student_id = NEW.student_id
    AND e.id <> NEW.id
    AND COALESCE(e.academic_year_id::text,'') <> COALESCE(NEW.academic_year_id::text,'');

  IF _prior_count > 0 THEN
    _fee_type := 'RENEWAL';
    _amount := _renewal_fee;
  ELSE
    _fee_type := 'NEW';
    _amount := _new_fee;
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.enrollment_fees (
    school_id, student_id, enrollment_id, academic_year_id,
    fee_type, amount_due, due_date, is_paid
  ) VALUES (
    _student.school_id, NEW.student_id, NEW.id, NEW.academic_year_id,
    _fee_type, _amount, CURRENT_DATE + INTERVAL '15 days', false
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_enrollment_fee
AFTER INSERT OR UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.tg_generate_enrollment_fee();

-- 4. Update payment validation notification trigger to handle enrollment fees
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
