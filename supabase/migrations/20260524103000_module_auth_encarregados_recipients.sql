-- Formulários de autorização: «educador» = encarregado de educação (perfil PARENT).
-- Notificações, visibilidade e preenchimento pelo encarregado; professores deixam de ser destinatários.

COMMENT ON COLUMN public.module_authorization_templates.recipient_mode IS
  'Turmas: encarregados dos alunos dessas turmas. Nominal: encarregado explícito por aluno.';

COMMENT ON COLUMN public.module_authorization_templates.recipient_classroom_ids IS
  'Turmas cujos encarregados de educação são notificados (recipient_mode = classroom_homeroom_teachers).';

DROP POLICY IF EXISTS "Staff manage named module auth recipients" ON public.module_authorization_named_recipients;
CREATE POLICY "Staff manage named module auth recipients"
  ON public.module_authorization_named_recipients FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.module_authorization_templates t
      WHERE t.id = template_id
        AND t.school_id = public.get_my_school()
        AND public.auth_is_module_auth_staff_viewer()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.module_authorization_templates t
      WHERE t.id = template_id
        AND t.school_id = public.get_my_school()
        AND public.auth_is_module_auth_staff_viewer()
    )
    AND EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.id = student_id AND st.school_id = public.get_my_school()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = assignee_profile_id
        AND p.school_id = public.get_my_school()
        AND p.role = 'PARENT'::public.user_role
    )
  );

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
          AND public.get_auth_role() = 'PARENT'::public.user_role
          AND EXISTS (
            SELECT 1
            FROM public.students s
            WHERE s.school_id = t.school_id
              AND s.parent_id IS NOT DISTINCT FROM auth.uid()
              AND s.classroom_id IS NOT NULL
              AND s.classroom_id = ANY (COALESCE(t.recipient_classroom_ids, '{}'::uuid[]))
          )
        )
        OR (
          t.recipient_mode = 'named_student_assignee'
          AND public.get_auth_role() = 'PARENT'::public.user_role
          AND EXISTS (
            SELECT 1
            FROM public.module_authorization_named_recipients n
            WHERE n.template_id = t.id
              AND n.assignee_profile_id IS NOT DISTINCT FROM auth.uid()
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
    IF public.get_auth_role() IS DISTINCT FROM 'PARENT'::public.user_role THEN
      RETURN FALSE;
    END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.module_authorization_named_recipients n
      WHERE n.template_id = p_template_id
        AND n.student_id = p_student_id
        AND n.assignee_profile_id IS NOT DISTINCT FROM auth.uid()
    );
  END IF;

  IF tmpl.recipient_mode = 'classroom_homeroom_teachers' THEN
    IF public.get_auth_role() IS DISTINCT FROM 'PARENT'::public.user_role THEN
      RETURN FALSE;
    END IF;
    RETURN EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.id = p_student_id
        AND st.school_id = public.get_my_school()
        AND st.parent_id IS NOT DISTINCT FROM auth.uid()
        AND st.classroom_id IS NOT NULL
        AND st.classroom_id = ANY (COALESCE(tmpl.recipient_classroom_ids, '{}'::uuid[]))
    );
  END IF;

  RETURN FALSE;
END;
$$;

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
    WHEN 'TEACHER'::public.user_role THEN FALSE
    WHEN 'ADMIN'::public.user_role THEN EXISTS (
      SELECT 1 FROM public.students st WHERE st.id = p_student_id AND st.school_id = public.get_my_school()
    )
    WHEN 'SUPER_ADMIN'::public.user_role THEN EXISTS (
      SELECT 1 FROM public.students st WHERE st.id = p_student_id AND st.school_id = public.get_my_school()
    )
    ELSE FALSE
  END;
$$;

DROP POLICY IF EXISTS "Educators parents see relevant submissions" ON public.module_authorization_submissions;
CREATE POLICY "Educators parents see relevant submissions"
  ON public.module_authorization_submissions FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.auth_is_module_auth_staff_viewer()
      OR submitted_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = student_id AND s.parent_id = auth.uid()
      )
    )
  );
