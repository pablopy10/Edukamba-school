-- Sumários de aula e materiais por disciplina/turma/data (visíveis a encarregados e alunos).

CREATE TABLE IF NOT EXISTS public.subject_lesson_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  lesson_date date NOT NULL,
  summary text NOT NULL,
  homework text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_lesson_logs_summary_not_empty CHECK (char_length(trim(summary)) > 0),
  CONSTRAINT subject_lesson_logs_unique_day UNIQUE (subject_id, classroom_id, lesson_date)
);

CREATE INDEX IF NOT EXISTS idx_subject_lesson_logs_subject ON public.subject_lesson_logs(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_lesson_logs_classroom ON public.subject_lesson_logs(classroom_id);
CREATE INDEX IF NOT EXISTS idx_subject_lesson_logs_date ON public.subject_lesson_logs(lesson_date DESC);
CREATE INDEX IF NOT EXISTS idx_subject_lesson_logs_school ON public.subject_lesson_logs(school_id);

CREATE TABLE IF NOT EXISTS public.subject_lesson_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_log_id uuid NOT NULL REFERENCES public.subject_lesson_logs(id) ON DELETE CASCADE,
  title text NOT NULL,
  link_url text,
  content_text text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_lesson_materials_title_not_empty CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_subject_lesson_materials_log ON public.subject_lesson_materials(lesson_log_id);

DROP TRIGGER IF EXISTS trg_subject_lesson_logs_updated ON public.subject_lesson_logs;
CREATE TRIGGER trg_subject_lesson_logs_updated
  BEFORE UPDATE ON public.subject_lesson_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Helpers de acesso -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_teacher_teaches_subject_in_classroom(
  p_subject_id uuid,
  p_classroom_id uuid,
  p_teacher_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.schedules s
    WHERE s.school_id = public.get_my_school()
      AND s.subject_id = p_subject_id
      AND s.classroom_id = p_classroom_id
      AND s.teacher_id = p_teacher_id
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_has_student_in_classroom(p_classroom_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.auth_is_school_admin() THEN true
    WHEN public.get_auth_role() = 'PARENT'::public.user_role THEN
      EXISTS (
        SELECT 1 FROM public.students st
        WHERE st.school_id = public.get_my_school()
          AND st.parent_id = auth.uid()
          AND st.classroom_id = p_classroom_id
      )
    WHEN public.get_auth_role() = 'STUDENT'::public.user_role THEN
      EXISTS (
        SELECT 1 FROM public.students st
        WHERE st.school_id = public.get_my_school()
          AND st.user_id = auth.uid()
          AND st.classroom_id = p_classroom_id
      )
    ELSE false
  END;
$$;

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
  SELECT
    public.auth_is_school_admin()
    OR public.auth_teacher_teaches_subject_in_classroom(p_subject_id, p_classroom_id);
$$;

CREATE OR REPLACE FUNCTION public.subject_lesson_logs_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.teacher_id IS NULL THEN
    NEW.teacher_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subject_lesson_logs_set_created_by ON public.subject_lesson_logs;
CREATE TRIGGER trg_subject_lesson_logs_set_created_by
  BEFORE INSERT ON public.subject_lesson_logs
  FOR EACH ROW EXECUTE FUNCTION public.subject_lesson_logs_set_created_by();

ALTER TABLE public.subject_lesson_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_lesson_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View subject lesson logs" ON public.subject_lesson_logs;
CREATE POLICY "View subject lesson logs"
  ON public.subject_lesson_logs FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND public.auth_can_view_subject_lesson_log(subject_id, classroom_id)
  );

DROP POLICY IF EXISTS "Insert subject lesson logs" ON public.subject_lesson_logs;
CREATE POLICY "Insert subject lesson logs"
  ON public.subject_lesson_logs FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
    AND teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS "Update subject lesson logs" ON public.subject_lesson_logs;
CREATE POLICY "Update subject lesson logs"
  ON public.subject_lesson_logs FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.auth_is_school_admin()
      OR (created_by = auth.uid() AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id))
    )
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
  );

DROP POLICY IF EXISTS "Delete subject lesson logs" ON public.subject_lesson_logs;
CREATE POLICY "Delete subject lesson logs"
  ON public.subject_lesson_logs FOR DELETE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND (
      public.auth_is_school_admin()
      OR (created_by = auth.uid() AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id))
    )
  );

DROP POLICY IF EXISTS "View subject lesson materials" ON public.subject_lesson_materials;
CREATE POLICY "View subject lesson materials"
  ON public.subject_lesson_materials FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subject_lesson_logs l
      WHERE l.id = lesson_log_id
        AND l.school_id = public.get_my_school()
        AND public.auth_can_view_subject_lesson_log(l.subject_id, l.classroom_id)
    )
  );

DROP POLICY IF EXISTS "Manage subject lesson materials" ON public.subject_lesson_materials;
CREATE POLICY "Manage subject lesson materials"
  ON public.subject_lesson_materials FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subject_lesson_logs l
      WHERE l.id = lesson_log_id
        AND l.school_id = public.get_my_school()
        AND (
          public.auth_is_school_admin()
          OR (l.created_by = auth.uid() AND public.auth_can_manage_subject_lesson_log(l.subject_id, l.classroom_id))
        )
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

COMMENT ON TABLE public.subject_lesson_logs IS 'Sumário da matéria leccionada numa turma e data de aula.';
COMMENT ON TABLE public.subject_lesson_materials IS 'Materiais de estudo associados a um sumário de aula.';
