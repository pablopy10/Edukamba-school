-- Destinatários dos formulários de autorização: todos os professores na escola,
-- professores director de turma de turmas seleccionadas, ou pares (aluno + educador específico).

ALTER TABLE public.module_authorization_templates
  ADD COLUMN IF NOT EXISTS recipient_mode text NOT NULL DEFAULT 'school_all_teachers'
    CHECK (recipient_mode IN (
      'school_all_teachers',
      'classroom_homeroom_teachers',
      'named_student_assignee'
    ));

ALTER TABLE public.module_authorization_templates
  ADD COLUMN IF NOT EXISTS recipient_classroom_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.module_authorization_templates.recipient_mode IS 'Quem vê/recebe o pedido entre educadores.';
COMMENT ON COLUMN public.module_authorization_templates.recipient_classroom_ids IS 'Quando recipient_mode = classroom_homeroom_teachers; turmas cujos directores podem responder.';

CREATE TABLE IF NOT EXISTS public.module_authorization_named_recipients (
  template_id uuid NOT NULL REFERENCES public.module_authorization_templates(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  assignee_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, student_id, assignee_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_mod_auth_named_assignee ON public.module_authorization_named_recipients(assignee_profile_id);
CREATE INDEX IF NOT EXISTS idx_mod_auth_named_student ON public.module_authorization_named_recipients(student_id);

ALTER TABLE public.module_authorization_named_recipients ENABLE ROW LEVEL SECURITY;

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
      WHERE p.id = assignee_profile_id AND p.school_id = public.get_my_school()
    )
  );

DROP POLICY IF EXISTS "Assignees read own named rows" ON public.module_authorization_named_recipients;
CREATE POLICY "Assignees read own named rows"
  ON public.module_authorization_named_recipients FOR SELECT TO authenticated
  USING (
    assignee_profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.module_authorization_templates t
      WHERE t.id = template_id
        AND t.school_id = public.get_my_school()
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
          t.recipient_mode = 'school_all_teachers'
          AND public.get_auth_role() = 'TEACHER'::public.user_role
        )
        OR (
          t.recipient_mode = 'classroom_homeroom_teachers'
          AND public.get_auth_role() = 'TEACHER'::public.user_role
          AND EXISTS (
            SELECT 1
            FROM public.classrooms c
            WHERE c.school_id = t.school_id
              AND c.id = ANY (COALESCE(t.recipient_classroom_ids, '{}'::uuid[]))
              AND c.homeroom_teacher_id IS NOT DISTINCT FROM auth.uid()
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

DROP POLICY IF EXISTS "Templates readable by school" ON public.module_authorization_templates;
CREATE POLICY "Templates readable by school assignees"
  ON public.module_authorization_templates FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.auth_is_module_auth_staff_viewer()
      OR public.auth_module_auth_template_visible_to_me(id)
    )
  );

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
        AND c.homeroom_teacher_id IS NOT DISTINCT FROM auth.uid()
    );
  END IF;

  -- school_all_teachers: apenas professores como educadores ao nível das turmas
  IF tmpl.recipient_mode = 'school_all_teachers' THEN
    IF public.get_auth_role() = 'PARENT'::public.user_role THEN
      RETURN FALSE;
    END IF;
    RETURN public.auth_can_submit_module_auth_for_student(p_student_id);
  END IF;

  RETURN FALSE;
END;
$$;

DROP POLICY IF EXISTS "Insert module auth submission" ON public.module_authorization_submissions;
CREATE POLICY "Insert module auth submission"
  ON public.module_authorization_submissions FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school()
    AND submitted_by = auth.uid()
    AND public.auth_can_submit_module_auth_for_student(student_id)
    AND public.auth_module_auth_submission_allowed(template_id, student_id)
    AND EXISTS (
      SELECT 1 FROM public.module_authorization_templates t
      WHERE t.id = template_id
        AND t.school_id = public.get_my_school()
        AND t.is_active = true
    )
  );
