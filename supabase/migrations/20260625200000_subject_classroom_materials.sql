-- Materiais escolares por disciplina/turma/ano letivo (lista anual para alunos).

CREATE TABLE IF NOT EXISTS public.subject_classroom_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  title text NOT NULL,
  notes text,
  link_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_classroom_materials_title_not_empty CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_subject_classroom_materials_subject
  ON public.subject_classroom_materials(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_classroom_materials_classroom
  ON public.subject_classroom_materials(classroom_id);
CREATE INDEX IF NOT EXISTS idx_subject_classroom_materials_year
  ON public.subject_classroom_materials(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_subject_classroom_materials_school
  ON public.subject_classroom_materials(school_id);

DROP TRIGGER IF EXISTS trg_subject_classroom_materials_updated ON public.subject_classroom_materials;
CREATE TRIGGER trg_subject_classroom_materials_updated
  BEFORE UPDATE ON public.subject_classroom_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.subject_classroom_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View subject classroom materials" ON public.subject_classroom_materials;
CREATE POLICY "View subject classroom materials"
  ON public.subject_classroom_materials FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school()
    AND public.auth_can_view_subject_lesson_log(subject_id, classroom_id)
  );

DROP POLICY IF EXISTS "Insert subject classroom materials" ON public.subject_classroom_materials;
CREATE POLICY "Insert subject classroom materials"
  ON public.subject_classroom_materials FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Update subject classroom materials" ON public.subject_classroom_materials;
CREATE POLICY "Update subject classroom materials"
  ON public.subject_classroom_materials FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND created_by = auth.uid()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
  );

DROP POLICY IF EXISTS "Delete subject classroom materials" ON public.subject_classroom_materials;
CREATE POLICY "Delete subject classroom materials"
  ON public.subject_classroom_materials FOR DELETE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND created_by = auth.uid()
    AND public.auth_can_manage_subject_lesson_log(subject_id, classroom_id)
  );

COMMENT ON TABLE public.subject_classroom_materials IS
  'Materiais que os alunos devem ter numa disciplina/turma durante o ano letivo.';
