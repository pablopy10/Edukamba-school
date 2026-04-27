-- Add link from a student record to its auth account (optional)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_user_id ON public.students(user_id);

-- Allow handle_new_user to create profile for new student logins as well
-- (the function already reads role from raw_user_meta_data; STUDENT enum value already exists)
-- Nothing to change there.

-- Allow a logged-in student to view their own student record (needed so they can navigate the app)
DROP POLICY IF EXISTS "Students can view their own record" ON public.students;
CREATE POLICY "Students can view their own record"
ON public.students
FOR SELECT
TO authenticated
USING (user_id = auth.uid());