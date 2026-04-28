-- Add new attendance status for disciplinary absences
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'DISCIPLINARY';

-- Update the trigger that restricts non-staff updates so it accepts DISCIPLINARY as a justifiable status
CREATE OR REPLACE FUNCTION public.attendance_restrict_justification_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.user_role;
BEGIN
  _role := public.get_auth_role();
  IF _role IN ('ADMIN','TEACHER','SUPER_ADMIN') THEN
    RETURN NEW;
  END IF;

  IF NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.classroom_id IS DISTINCT FROM OLD.classroom_id
     OR NEW.date IS DISTINCT FROM OLD.date
     OR NEW.schedule_id IS DISTINCT FROM OLD.schedule_id
     OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id THEN
    RAISE EXCEPTION 'Apenas a justificação pode ser alterada.';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status NOT IN ('ABSENT','LATE','DISCIPLINARY') OR NEW.status <> 'JUSTIFIED' THEN
      RAISE EXCEPTION 'Apenas faltas/atrasos podem ser justificadas.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Update notification trigger to label DISCIPLINARY status nicely
CREATE OR REPLACE FUNCTION public.tg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _student record;
  _status_label text;
BEGIN
  SELECT s.parent_id, s.full_name, s.school_id INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.parent_id IS NULL THEN RETURN NEW; END IF;

  _status_label := CASE NEW.status::text
    WHEN 'PRESENT' THEN 'Presente'
    WHEN 'ABSENT' THEN 'Ausente'
    WHEN 'JUSTIFIED' THEN 'Falta justificada'
    WHEN 'LATE' THEN 'Atrasado'
    WHEN 'DISCIPLINARY' THEN 'Falta indisciplinar'
    ELSE NEW.status::text
  END;

  PERFORM public.notify_user(
    _student.parent_id, _student.school_id, 'academico',
    'Presença registada: ' || _status_label,
    _student.full_name || ' — ' || to_char(NEW.date, 'DD/MM/YYYY'),
    '/presencas', NULL, NULL
  );
  RETURN NEW;
END;
$function$;