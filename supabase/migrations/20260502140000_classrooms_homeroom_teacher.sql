-- Diretor de turma (funcionário da escola, perfil auth)
ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS homeroom_teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.classrooms.homeroom_teacher_id IS 'Perfil do diretor de turma (professor/admin responsável pela turma).';

CREATE INDEX IF NOT EXISTS idx_classrooms_homeroom_teacher_id ON public.classrooms(homeroom_teacher_id);
