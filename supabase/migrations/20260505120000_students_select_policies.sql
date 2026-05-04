-- SELECT em students: estava implícito em muitos ambientes; sem política explícita para
-- secretaria / tesoureiro / etc., o RLS pode bloquear a listagem (0 linhas).
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School management can view students in their school" ON public.students;
CREATE POLICY "School management can view students in their school"
ON public.students FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin()
);

DROP POLICY IF EXISTS "Parents can view their children as students" ON public.students;
CREATE POLICY "Parents can view their children as students"
ON public.students FOR SELECT TO authenticated
USING (
  parent_id = auth.uid()
  AND school_id = public.get_my_school()
);

-- Horário: schedules.teacher_id = profile id do docente (auth.uid()), ver teacherScheduleScope.ts
DROP POLICY IF EXISTS "Teachers can view students in scheduled classrooms" ON public.students;
CREATE POLICY "Teachers can view students in scheduled classrooms"
ON public.students FOR SELECT TO authenticated
USING (
  public.get_auth_role() = 'TEACHER'::public.user_role
  AND school_id = public.get_my_school()
  AND students.classroom_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.schedules sch
    WHERE sch.classroom_id = students.classroom_id
      AND sch.teacher_id = auth.uid()
  )
);
