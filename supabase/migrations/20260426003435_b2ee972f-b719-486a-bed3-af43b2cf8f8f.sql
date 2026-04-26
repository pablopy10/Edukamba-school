-- Add fields to students for richer profile management
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT 'blue',
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_students_classroom ON public.students(classroom_id);
CREATE INDEX IF NOT EXISTS idx_students_school ON public.students(school_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_students_updated_at ON public.students;
CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admin RLS policies for students
DROP POLICY IF EXISTS "Admins can insert students" ON public.students;
CREATE POLICY "Admins can insert students"
ON public.students
FOR INSERT
TO authenticated
WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

DROP POLICY IF EXISTS "Admins can update students" ON public.students;
CREATE POLICY "Admins can update students"
ON public.students
FOR UPDATE
TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

DROP POLICY IF EXISTS "Admins can delete students" ON public.students;
CREATE POLICY "Admins can delete students"
ON public.students
FOR DELETE
TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);