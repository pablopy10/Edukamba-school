-- Adicionar campos de resultado/promoção às matrículas
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS result text,
  ADD COLUMN IF NOT EXISTS result_notes text,
  ADD COLUMN IF NOT EXISTS result_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_published_by uuid;

-- Constraint para valores válidos
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_result_check'
  ) THEN
    ALTER TABLE public.enrollments
      ADD CONSTRAINT enrollments_result_check
      CHECK (result IS NULL OR result IN ('APROVADO','REPROVADO','TRANSFERIDO','EM_CURSO'));
  END IF;
END $$;

-- Trigger: notificar encarregado quando o resultado é publicado
CREATE OR REPLACE FUNCTION public.tg_notify_enrollment_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student record;
  _classroom_name text;
  _year_label text;
  _title text;
  _desc text;
BEGIN
  -- Só notificar quando há transição para published (was null -> set)
  IF NEW.result_published_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.result_published_at IS NOT NULL
     AND OLD.result IS NOT DISTINCT FROM NEW.result THEN
    RETURN NEW;
  END IF;
  IF NEW.result IS NULL OR NEW.result = 'EM_CURSO' THEN
    RETURN NEW;
  END IF;

  SELECT s.parent_id, s.full_name, s.school_id INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO _classroom_name FROM public.classrooms WHERE id = NEW.classroom_id;
  SELECT label INTO _year_label FROM public.academic_years WHERE id = NEW.academic_year_id;

  _title := CASE NEW.result
    WHEN 'APROVADO' THEN 'Resultado: Aprovado'
    WHEN 'REPROVADO' THEN 'Resultado: Reprovado'
    WHEN 'TRANSFERIDO' THEN 'Resultado: Transferido'
    ELSE 'Resultado do ano lectivo'
  END;

  _desc := _student.full_name
    || COALESCE(' — Turma ' || _classroom_name, '')
    || COALESCE(' (' || _year_label || ')', '')
    || CASE WHEN NEW.result_notes IS NOT NULL AND length(NEW.result_notes) > 0
            THEN E'\n' || NEW.result_notes ELSE '' END;

  PERFORM public.notify_user(
    _student.parent_id, _student.school_id, 'academico',
    _title, _desc, '/alunos/' || NEW.student_id::text, NEW.result_published_by, NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_enrollment_result ON public.enrollments;
CREATE TRIGGER trg_notify_enrollment_result
AFTER INSERT OR UPDATE OF result, result_published_at ON public.enrollments
FOR EACH ROW
EXECUTE FUNCTION public.tg_notify_enrollment_result();