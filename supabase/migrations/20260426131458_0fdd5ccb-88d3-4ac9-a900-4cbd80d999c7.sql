
-- Add missing columns to assessments
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS room text,
  ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'teste',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill school_id from classroom -> school
UPDATE public.assessments a
SET school_id = c.school_id
FROM public.classrooms c
WHERE a.classroom_id = c.id AND a.school_id IS NULL;

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_assessments_school_date ON public.assessments(school_id, date);

-- Updated_at trigger
DROP TRIGGER IF EXISTS update_assessments_updated_at ON public.assessments;
CREATE TRIGGER update_assessments_updated_at
BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS (idempotent)
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Assessments viewable by school members" ON public.assessments;
CREATE POLICY "Assessments viewable by school members"
ON public.assessments FOR SELECT TO authenticated
USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Admins and teachers can insert assessments" ON public.assessments;
CREATE POLICY "Admins and teachers can insert assessments"
ON public.assessments FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

DROP POLICY IF EXISTS "Admins and teachers can update assessments" ON public.assessments;
CREATE POLICY "Admins and teachers can update assessments"
ON public.assessments FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

DROP POLICY IF EXISTS "Admins can delete assessments" ON public.assessments;
CREATE POLICY "Admins can delete assessments"
ON public.assessments FOR DELETE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::user_role
);
