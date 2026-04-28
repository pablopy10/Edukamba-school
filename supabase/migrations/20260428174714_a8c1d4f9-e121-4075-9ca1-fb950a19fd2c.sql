DROP POLICY IF EXISTS "Grades viewable by relevant parties" ON public.grades;

CREATE POLICY "Grades viewable by relevant parties"
ON public.grades
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'STUDENT'::user_role]))
  OR (student_id IN (SELECT students.id FROM students WHERE students.parent_id = auth.uid()))
);