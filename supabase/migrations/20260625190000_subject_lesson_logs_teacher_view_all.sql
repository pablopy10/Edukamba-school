-- Professores da escola podem consultar sumários de qualquer disciplina (edição continua restrita ao horário).

CREATE OR REPLACE FUNCTION public.auth_can_view_subject_lesson_log(
  p_subject_id uuid,
  p_classroom_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_school_admin()
    OR public.get_auth_role() = 'TEACHER'::public.user_role
    OR public.auth_teacher_teaches_subject_in_classroom(p_subject_id, p_classroom_id)
    OR (
      public.auth_user_has_student_in_classroom(p_classroom_id)
      AND EXISTS (
        SELECT 1 FROM public.schedules s
        WHERE s.school_id = public.get_my_school()
          AND s.subject_id = p_subject_id
          AND s.classroom_id = p_classroom_id
      )
    );
$$;

COMMENT ON FUNCTION public.auth_can_view_subject_lesson_log(uuid, uuid) IS
  'Gestão, professores da escola, docente da turma/disciplina, ou encarregado/aluno com educando na turma.';
