
-- Allow parents (of the student) and the student themselves to update attendance notes
-- and mark a record as JUSTIFIED. Restrict updates by these roles to only the
-- 'notes' and 'status' columns via a trigger that prevents other field changes.

-- 1) Helper: check whether current user is parent of a student
CREATE OR REPLACE FUNCTION public.is_parent_of_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id AND s.parent_id = auth.uid()
  );
$$;

-- 2) Helper: check whether current user IS the student
CREATE OR REPLACE FUNCTION public.is_self_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _student_id
      AND (s.profile_id = auth.uid() OR s.user_id = auth.uid())
  );
$$;

-- 3) RLS policy: parents/students can update their own attendance row (justification)
DROP POLICY IF EXISTS "Parents and students can justify attendance" ON public.attendance;
CREATE POLICY "Parents and students can justify attendance"
ON public.attendance
FOR UPDATE
USING (
  school_id = public.get_my_school()
  AND (
    public.is_parent_of_student(student_id)
    OR public.is_self_student(student_id)
  )
)
WITH CHECK (
  school_id = public.get_my_school()
  AND (
    public.is_parent_of_student(student_id)
    OR public.is_self_student(student_id)
  )
);

-- 4) Trigger to restrict what parents/students can change. Admins/teachers unaffected.
CREATE OR REPLACE FUNCTION public.attendance_restrict_justification_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.user_role;
BEGIN
  _role := public.get_auth_role();
  IF _role IN ('ADMIN','TEACHER','SUPER_ADMIN') THEN
    RETURN NEW;
  END IF;

  -- Non-staff: only allow notes change and status transitioning to JUSTIFIED on ABSENT
  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.classroom_id IS DISTINCT FROM OLD.classroom_id
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
     OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
    RAISE EXCEPTION 'Apenas a justificação pode ser alterada.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status NOT IN ('ABSENT','LATE') OR NEW.status <> 'JUSTIFIED' THEN
      RAISE EXCEPTION 'Apenas faltas/atrasos podem ser justificadas.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_restrict_justification_updates_trg ON public.attendance;
CREATE TRIGGER attendance_restrict_justification_updates_trg
BEFORE UPDATE ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.attendance_restrict_justification_updates();
