CREATE POLICY "Parents can create pending enrollments for their children"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  get_auth_role() = 'PARENT'::user_role
  AND status = 'PENDING'
  AND classroom_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = enrollments.student_id
      AND s.parent_id = auth.uid()
  )
);