-- SUPER_ADMIN must be able to read grades like ADMIN (policy previously omitted it).
DROP POLICY IF EXISTS "Grades viewable by relevant parties" ON public.grades;

CREATE POLICY "Grades viewable by relevant parties"
ON public.grades
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  (public.get_auth_role() = ANY (
    ARRAY[
      'ADMIN'::public.user_role,
      'SUPER_ADMIN'::public.user_role,
      'TEACHER'::public.user_role,
      'STUDENT'::public.user_role
    ]
  ))
  OR (student_id IN (SELECT s.id FROM public.students s WHERE s.parent_id = auth.uid()))
);
