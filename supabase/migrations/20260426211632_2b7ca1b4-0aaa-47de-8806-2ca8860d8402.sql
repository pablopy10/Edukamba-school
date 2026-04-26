-- Allow teachers/admins to update grades
CREATE POLICY "Teachers can update grades"
ON public.grades
FOR UPDATE
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
)
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

-- Allow teachers/admins to delete grades
CREATE POLICY "Teachers can delete grades"
ON public.grades
FOR DELETE
TO authenticated
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

-- Prevent duplicates: one grade per student per assessment
CREATE UNIQUE INDEX IF NOT EXISTS grades_student_assessment_unique
ON public.grades (student_id, assessment_id)
WHERE student_id IS NOT NULL AND assessment_id IS NOT NULL;