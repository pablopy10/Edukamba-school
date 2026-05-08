-- Corrige o trigger de notificações de presença:
--   1. Corrige encoding UTF-8 nos textos portugueses
--   2. Altera categoria para 'ATTENDANCE' (alinhado com notifications-email)
--   3. Corrige link para /presencas (sem acento)
--   4. Inclui nome da turma na descrição

CREATE OR REPLACE FUNCTION trg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id   uuid;
  v_student_name text;
  v_classroom_name text;
  v_status_pt   text;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NEW.status IN ('LATE', 'ABSENT', 'DISCIPLINARY') THEN

      v_status_pt := CASE NEW.status::text
        WHEN 'ABSENT'       THEN 'Falta'
        WHEN 'LATE'         THEN 'Atraso'
        WHEN 'DISCIPLINARY' THEN 'Ocorr' || U&'\00EA' || 'ncia Disciplinar'
        ELSE NEW.status::text
      END;

      SELECT s.parent_id, s.full_name, c.name
        INTO v_parent_id, v_student_name, v_classroom_name
        FROM public.students s
        LEFT JOIN public.classrooms c ON c.id = s.classroom_id
       WHERE s.id = NEW.student_id;

      IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.notifications
          (recipient_id, title, description, link, category, school_id)
        VALUES (
          v_parent_id,
          'Registo de Presen' || U&'\00E7' || 'a',
          'A presen' || U&'\00E7' || 'a de ' || v_student_name
            || COALESCE(' (' || v_classroom_name || ')', '')
            || ' no dia ' || TO_CHAR(NEW.date::date, 'DD/MM/YYYY')
            || ' foi registada como: ' || v_status_pt,
          '/presencas',
          'ATTENDANCE',
          NEW.school_id
        );
      END IF;
    END IF;

    -- Remover notificação se o estado foi alterado para PRESENT ou JUSTIFIED
    IF TG_OP = 'UPDATE'
       AND OLD.status IN ('LATE', 'ABSENT', 'DISCIPLINARY')
       AND NEW.status IN ('PRESENT', 'JUSTIFIED') THEN

      SELECT parent_id INTO v_parent_id
        FROM public.students WHERE id = NEW.student_id;

      IF v_parent_id IS NOT NULL THEN
        DELETE FROM public.notifications
         WHERE recipient_id = v_parent_id
           AND category = 'ATTENDANCE'
           AND school_id = NEW.school_id
           AND description LIKE '%' || TO_CHAR(NEW.date::date, 'DD/MM/YYYY') || '%'
           AND created_at >= NOW() - INTERVAL '24 hours';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Garantir que o trigger existe na tabela attendance
DROP TRIGGER IF EXISTS trg_attendance_notify ON public.attendance;
CREATE TRIGGER trg_attendance_notify
  AFTER INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION trg_notify_attendance();
