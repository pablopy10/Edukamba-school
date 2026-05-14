-- Permitir que educadores autorizados pelo horário (schedules), não só directores de turma,
-- satisfaçam auth_can_submit_module_auth_for_student, alinhado com auth_module_auth_submission_allowed.

CREATE OR REPLACE FUNCTION public.auth_can_submit_module_auth_for_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.get_auth_role()
    WHEN 'PARENT'::public.user_role THEN EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = p_student_id
        AND s.school_id = public.get_my_school()
        AND s.parent_id = auth.uid()
    )
    WHEN 'TEACHER'::public.user_role THEN EXISTS (
      SELECT 1 FROM public.students st
      JOIN public.classrooms c ON c.id = st.classroom_id
      WHERE st.id = p_student_id
        AND st.school_id = public.get_my_school()
        AND c.school_id = public.get_my_school()
        AND (
          c.homeroom_teacher_id IS NOT DISTINCT FROM auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.schedules s
            WHERE s.school_id = public.get_my_school()
              AND s.classroom_id IS NOT DISTINCT FROM c.id
              AND s.teacher_id IS NOT DISTINCT FROM auth.uid()
          )
        )
    )
    WHEN 'ADMIN'::public.user_role THEN EXISTS (
      SELECT 1 FROM public.students st WHERE st.id = p_student_id AND st.school_id = public.get_my_school()
    )
    WHEN 'SUPER_ADMIN'::public.user_role THEN EXISTS (
      SELECT 1 FROM public.students st WHERE st.id = p_student_id AND st.school_id = public.get_my_school()
    )
    ELSE FALSE
  END;
$$;
