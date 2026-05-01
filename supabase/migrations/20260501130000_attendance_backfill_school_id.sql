-- Presenças com school_id NULL não passam em RLS (school_id = get_my_school()).
-- Alinhar com alunos/turmas para o painel e relatórios voltarem a ver os registos.

UPDATE public.attendance a
SET school_id = s.school_id
FROM public.students s
WHERE a.student_id IS NOT NULL
  AND a.school_id IS NULL
  AND s.id = a.student_id
  AND s.school_id IS NOT NULL;

UPDATE public.attendance a
SET school_id = c.school_id
FROM public.classrooms c
WHERE a.classroom_id IS NOT NULL
  AND a.school_id IS NULL
  AND c.id = a.classroom_id
  AND c.school_id IS NOT NULL;

-- Novos INSERTs (ex. API / integrações) sem school_id passam a ficar visíveis no RLS.
CREATE OR REPLACE FUNCTION public.attendance_set_school_id_from_student()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.school_id IS NULL AND NEW.student_id IS NOT NULL THEN
    SELECT s.school_id INTO NEW.school_id FROM public.students s WHERE s.id = NEW.student_id;
  END IF;
  IF NEW.school_id IS NULL AND NEW.classroom_id IS NOT NULL THEN
    SELECT c.school_id INTO NEW.school_id FROM public.classrooms c WHERE c.id = NEW.classroom_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_set_school_id ON public.attendance;
CREATE TRIGGER trg_attendance_set_school_id
BEFORE INSERT OR UPDATE OF student_id, classroom_id, school_id ON public.attendance
FOR EACH ROW
EXECUTE FUNCTION public.attendance_set_school_id_from_student();
