-- Teachers may only update/delete assessments and events they created (created_by = auth.uid()).
-- Admins keep full access. New inserts get created_by from session when omitted.

-- ========== assessments ==========
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.assessments
SET created_by = teacher_id
WHERE created_by IS NULL AND teacher_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assessments_set_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assessments_set_created_by ON public.assessments;
CREATE TRIGGER trg_assessments_set_created_by
BEFORE INSERT ON public.assessments
FOR EACH ROW
EXECUTE FUNCTION public.assessments_set_created_by();

DROP POLICY IF EXISTS "Admins and teachers can update assessments" ON public.assessments;
CREATE POLICY "Admins and teachers can update assessments"
ON public.assessments FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND (
    public.get_auth_role() = 'ADMIN'::public.user_role
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by IS NOT NULL
      AND created_by = auth.uid()
    )
  )
)
WITH CHECK (
  school_id = public.get_my_school()
  AND (
    public.get_auth_role() = 'ADMIN'::public.user_role
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Teachers can delete own assessments" ON public.assessments;
CREATE POLICY "Teachers can delete own assessments"
ON public.assessments FOR DELETE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'TEACHER'::public.user_role
  AND created_by IS NOT NULL
  AND created_by = auth.uid()
);

-- ========== events ==========
CREATE OR REPLACE FUNCTION public.events_set_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_set_created_by ON public.events;
CREATE TRIGGER trg_events_set_created_by
BEFORE INSERT ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.events_set_created_by();

DROP POLICY IF EXISTS "Admins and teachers can update events" ON public.events;
CREATE POLICY "Admins and teachers can update events"
ON public.events FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND (
    public.get_auth_role() = 'ADMIN'::public.user_role
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by IS NOT NULL
      AND created_by = auth.uid()
    )
  )
)
WITH CHECK (
  school_id = public.get_my_school()
  AND (
    public.get_auth_role() = 'ADMIN'::public.user_role
    OR (
      public.get_auth_role() = 'TEACHER'::public.user_role
      AND created_by = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Teachers can delete own events" ON public.events;
CREATE POLICY "Teachers can delete own events"
ON public.events FOR DELETE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'TEACHER'::public.user_role
  AND created_by IS NOT NULL
  AND created_by = auth.uid()
);
