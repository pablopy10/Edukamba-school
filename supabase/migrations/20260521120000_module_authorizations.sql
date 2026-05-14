-- Formulários de autorização por módulo (extracurricular / transporte / refeições)
-- Igual espírito a documentos/formulários: escola define campos JSON; educadores/encarregados submetem com prova.

CREATE TABLE IF NOT EXISTS public.module_authorization_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('extracurricular', 'transport', 'meal')),
  title text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mod_auth_templates_school_module
  ON public.module_authorization_templates(school_id, module);

CREATE TRIGGER trg_mod_auth_templates_updated
  BEFORE UPDATE ON public.module_authorization_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.module_authorization_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.module_authorization_templates(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_data text,
  attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mod_auth_sub_tpl ON public.module_authorization_submissions(template_id);
CREATE INDEX IF NOT EXISTS idx_mod_auth_sub_student ON public.module_authorization_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_mod_auth_sub_school ON public.module_authorization_submissions(school_id);

-- ---- RLS helpers -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_is_module_auth_staff_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_auth_role(), 'STUDENT'::public.user_role) = ANY (
    ARRAY[
      'ADMIN'::public.user_role,
      'SUPER_ADMIN'::public.user_role,
      'DIRECTOR'::public.user_role,
      'SECRETARY'::public.user_role,
      'TREASURER'::public.user_role
    ]
  );
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
    WHEN 'TEACHER'::public.user_role THEN EXISTS (
      SELECT 1 FROM public.students st
      JOIN public.classrooms c ON c.id = st.classroom_id
      WHERE st.id = p_student_id
        AND st.school_id = public.get_my_school()
        AND c.homeroom_teacher_id = auth.uid()
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

-- ---- Templates RLS ------------------------------------------------------------

ALTER TABLE public.module_authorization_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Templates readable by school" ON public.module_authorization_templates;
CREATE POLICY "Templates readable by school"
  ON public.module_authorization_templates FOR SELECT TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Staff manage templates" ON public.module_authorization_templates;
CREATE POLICY "Staff manage templates"
  ON public.module_authorization_templates FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school()
    AND public.auth_is_module_auth_staff_viewer()
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_is_module_auth_staff_viewer()
  );

-- ---- Submissions RLS -----------------------------------------------------------

ALTER TABLE public.module_authorization_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff see module auth submissions" ON public.module_authorization_submissions;
CREATE POLICY "Staff see module auth submissions"
  ON public.module_authorization_submissions FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND public.auth_is_module_auth_staff_viewer()
  );

DROP POLICY IF EXISTS "Educators parents see relevant submissions" ON public.module_authorization_submissions;
CREATE POLICY "Educators parents see relevant submissions"
  ON public.module_authorization_submissions FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      submitted_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = student_id AND s.parent_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.students st
        JOIN public.classrooms c ON c.id = st.classroom_id
        WHERE st.id = student_id AND c.homeroom_teacher_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Insert module auth submission" ON public.module_authorization_submissions;
CREATE POLICY "Insert module auth submission"
  ON public.module_authorization_submissions FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school()
    AND submitted_by = auth.uid()
    AND public.auth_can_submit_module_auth_for_student(student_id)
    AND EXISTS (
      SELECT 1 FROM public.module_authorization_templates t
      WHERE t.id = template_id
        AND t.school_id = public.get_my_school()
        AND t.is_active = true
    )
  );

