-- View: any school member can view enrollments of students in their school
DROP POLICY IF EXISTS "Enrollments viewable by school members" ON public.enrollments;
CREATE POLICY "Enrollments viewable by school members"
ON public.enrollments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = enrollments.student_id AND s.school_id = get_my_school()
  )
);

-- Insert / Update / Delete only for admins of the same school
DROP POLICY IF EXISTS "Admins can insert enrollments" ON public.enrollments;
CREATE POLICY "Admins can insert enrollments"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  get_auth_role() = 'ADMIN'::user_role AND
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = enrollments.student_id AND s.school_id = get_my_school()
  )
);

DROP POLICY IF EXISTS "Admins can update enrollments" ON public.enrollments;
CREATE POLICY "Admins can update enrollments"
ON public.enrollments
FOR UPDATE
TO authenticated
USING (
  get_auth_role() = 'ADMIN'::user_role AND
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = enrollments.student_id AND s.school_id = get_my_school()
  )
);

DROP POLICY IF EXISTS "Admins can delete enrollments" ON public.enrollments;
CREATE POLICY "Admins can delete enrollments"
ON public.enrollments
FOR DELETE
TO authenticated
USING (
  get_auth_role() = 'ADMIN'::user_role AND
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = enrollments.student_id AND s.school_id = get_my_school()
  )
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_classroom ON public.enrollments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_year ON public.enrollments(academic_year_id);