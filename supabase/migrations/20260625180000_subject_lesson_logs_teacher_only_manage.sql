-- Apenas professores que lecionam a disciplina na turma podem gerir sumários (não administração).

CREATE OR REPLACE FUNCTION public.auth_can_manage_subject_lesson_log(
  p_subject_id uuid,
  p_classroom_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_teacher_teaches_subject_in_classroom(p_subject_id, p_classroom_id);
$$;

DROP POLICY IF EXISTS "Update subject lesson logs" ON public.subject_lesson_logs;
CREATE POLICY "Update subject lesson logs"
  ON public.subject_lesson_logs FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND created_by = auth.uid()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
    AND teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS "Delete subject lesson logs" ON public.subject_lesson_logs;
CREATE POLICY "Delete subject lesson logs"
  ON public.subject_lesson_logs FOR DELETE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND created_by = auth.uid()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
  );

DROP POLICY IF EXISTS "Manage subject lesson materials" ON public.subject_lesson_materials;
CREATE POLICY "Manage subject lesson materials"
  ON public.subject_lesson_materials FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subject_lesson_logs l
      WHERE l.id = lesson_log_id
        AND l.school_id = public.get_my_school()
        AND l.created_by = auth.uid()
        AND public.auth_can_manage_subject_lesson_log(l.subject_id, l.classroom_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.subject_lesson_logs l
      WHERE l.id = lesson_log_id
        AND l.school_id = public.get_my_school()
        AND public.auth_can_manage_subject_lesson_log(l.subject_id, l.classroom_id)
    )
  );

COMMENT ON FUNCTION public.auth_can_manage_subject_lesson_log(uuid, uuid) IS
  'Professor com horário na disciplina/turma pode criar ou editar sumários de aula.';
