CREATE POLICY "Students can view classmates of their school"
ON public.students
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  get_auth_role() = 'STUDENT'::user_role
  AND school_id = get_my_school()
);