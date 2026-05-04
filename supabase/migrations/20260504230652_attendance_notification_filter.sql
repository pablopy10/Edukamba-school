-- Only notify parents on negative attendance (LATE, ABSENT, DISCIPLINARY)
-- Excludes PRESENT and JUSTIFIED from sending notifications

CREATE OR REPLACE FUNCTION trg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id uuid;
  v_student_name text;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NEW.status IN ('LATE', 'ABSENT', 'DISCIPLINARY') THEN
      SELECT parent_id, full_name INTO v_parent_id, v_student_name FROM public.students WHERE id = NEW.student_id;
      IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
        VALUES (v_parent_id, 'Registo de Presença', 'A presença de ' || v_student_name || ' no dia ' || TO_CHAR(NEW.date::date, 'DD/MM/YYYY') || ' foi registada como: ' || NEW.status, '/presencas', 'presenca', NEW.school_id);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
