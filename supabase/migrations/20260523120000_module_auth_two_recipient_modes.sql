-- Apenas dois modos de destino: turmas específicas (educadores dessas turmas) ou educador nominal por aluno.
-- Elimina recipient_mode school_all_teachers; turmas incluem director de turma + professores em schedules dessas turmas.

-- Migrar dados antigos para "todas as turmas da escola", para não deixar formulários órfãos.
UPDATE public.module_authorization_templates t
SET recipient_mode = 'classroom_homeroom_teachers',
    recipient_classroom_ids = COALESCE(
      (
        SELECT array_agg(DISTINCT c.id)
        FROM public.classrooms c
        WHERE c.school_id = t.school_id
      ),
      '{}'::uuid[]
    )
WHERE t.recipient_mode = 'school_all_teachers';

ALTER TABLE public.module_authorization_templates
  DROP CONSTRAINT IF EXISTS module_authorization_templates_recipient_mode_check;

ALTER TABLE public.module_authorization_templates
  ALTER COLUMN recipient_mode SET DEFAULT 'classroom_homeroom_teachers';

ALTER TABLE public.module_authorization_templates
  ADD CONSTRAINT module_authorization_templates_recipient_mode_check CHECK (
    recipient_mode IN ('classroom_homeroom_teachers', 'named_student_assignee')
  );

COMMENT ON COLUMN public.module_authorization_templates.recipient_mode IS
  'Turmas escolhidas (educadores = directores + horário) ou pares nomeados aluno/educador.';

COMMENT ON COLUMN public.module_authorization_templates.recipient_classroom_ids IS
  'Turmas quando recipient_mode = classroom_homeroom_teachers.';

CREATE OR REPLACE FUNCTION public.auth_module_auth_template_visible_to_me(p_template_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.module_authorization_templates t
    WHERE t.id = p_template_id
      AND t.school_id = public.get_my_school()
      AND (
        (
          t.recipient_mode = 'classroom_homeroom_teachers'
          AND public.get_auth_role() = 'TEACHER'::public.user_role
          AND (
            EXISTS (
              SELECT 1
              FROM public.classrooms c
              WHERE c.school_id = t.school_id
                AND c.id = ANY (COALESCE(t.recipient_classroom_ids, '{}'::uuid[]))
                AND c.homeroom_teacher_id IS NOT DISTINCT FROM auth.uid()
            )
            OR EXISTS (
              SELECT 1
              FROM public.schedules s
              WHERE s.school_id = t.school_id
                AND s.classroom_id IS NOT NULL
                AND s.classroom_id = ANY (COALESCE(t.recipient_classroom_ids, '{}'::uuid[]))
                AND s.teacher_id IS NOT DISTINCT FROM auth.uid()
            )
          )
        )
        OR (
          t.recipient_mode = 'named_student_assignee'
          AND EXISTS (
            SELECT 1
            FROM public.module_authorization_named_recipients n
            WHERE n.template_id = t.id
              AND n.assignee_profile_id = auth.uid()
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_module_auth_submission_allowed(p_template_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tmpl RECORD;
BEGIN
  IF public.auth_is_module_auth_staff_viewer() THEN
    RETURN TRUE;
  END IF;

  SELECT recipient_mode, recipient_classroom_ids, school_id
  INTO tmpl
  FROM public.module_authorization_templates
  WHERE id = p_template_id;

  IF NOT FOUND OR tmpl.school_id IS DISTINCT FROM public.get_my_school() THEN
    RETURN FALSE;
  END IF;

  IF tmpl.recipient_mode = 'named_student_assignee' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.module_authorization_named_recipients n
      WHERE n.template_id = p_template_id
        AND n.student_id = p_student_id
        AND n.assignee_profile_id = auth.uid()
    );
  END IF;

  IF tmpl.recipient_mode = 'classroom_homeroom_teachers' THEN
    IF public.get_auth_role() IS DISTINCT FROM 'TEACHER'::public.user_role THEN
      RETURN FALSE;
    END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.students st
      JOIN public.classrooms c ON c.id = st.classroom_id
      WHERE st.id = p_student_id
        AND st.school_id = public.get_my_school()
        AND c.school_id = public.get_my_school()
        AND c.id = ANY (COALESCE(tmpl.recipient_classroom_ids, '{}'::uuid[]))
        AND (
          c.homeroom_teacher_id IS NOT DISTINCT FROM auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.schedules s
            WHERE s.school_id = tmpl.school_id
              AND s.classroom_id = c.id
              AND s.teacher_id IS NOT DISTINCT FROM auth.uid()
          )
        )
    );
  END IF;

  RETURN FALSE;
END;
$$;
