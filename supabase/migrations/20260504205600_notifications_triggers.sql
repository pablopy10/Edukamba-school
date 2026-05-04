-- ==============================================================================
-- Notifications Helpers
-- ==============================================================================

CREATE OR REPLACE FUNCTION notify_users_by_role(p_school_id uuid, p_role text, p_title text, p_description text, p_link text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT id, p_title, p_description, p_link, p_category, p_school_id
  FROM public.profiles
  WHERE school_id = p_school_id AND role::text = p_role AND is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION notify_classroom_parents(p_classroom_id uuid, p_school_id uuid, p_title text, p_description text, p_link text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT p.id, p_title, p_description, p_link, p_category, p_school_id
  FROM public.profiles p
  JOIN public.students s ON s.parent_id = p.id
  WHERE s.classroom_id = p_classroom_id
    AND s.school_id = p_school_id
    AND p.is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION notify_all_users(p_school_id uuid, p_title text, p_description text, p_link text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT id, p_title, p_description, p_link, p_category, p_school_id
  FROM public.profiles
  WHERE school_id = p_school_id AND is_active = true;
END;
$$;


-- ==============================================================================
-- 1. Extracurricular Activities
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_extracurricular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_users_by_role(NEW.school_id, 'PARENT', 'Nova Atividade Extracurricular', 'A atividade ' || NEW.name || ' está agora disponível.', '/extracurriculares', 'extracurriculares');
  ELSIF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM notify_users_by_role(NEW.school_id, 'PARENT', 'Atividade Atualizada', 'A atividade ' || NEW.name || ' foi atualizada.', '/extracurriculares', 'extracurriculares');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_extracurricular_notify ON public.extracurricular_activities;
CREATE TRIGGER trg_extracurricular_notify
AFTER INSERT OR UPDATE ON public.extracurricular_activities
FOR EACH ROW EXECUTE FUNCTION trg_notify_extracurricular();


-- ==============================================================================
-- 2. Assessments (Avaliações)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_evaluation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_classroom_parents(NEW.classroom_id, NEW.school_id, 'Nova Avaliação Marcada', 'Avaliação de ' || NEW.title || ' marcada para ' || TO_CHAR(NEW.date::date, 'DD/MM/YYYY') || '.', '/avaliacoes', 'avaliacoes');
  ELSIF TG_OP = 'UPDATE' AND (NEW.date IS DISTINCT FROM OLD.date OR NEW.title IS DISTINCT FROM OLD.title) THEN
    PERFORM notify_classroom_parents(NEW.classroom_id, NEW.school_id, 'Avaliação Atualizada', 'A avaliação ' || NEW.title || ' foi atualizada.', '/avaliacoes', 'avaliacoes');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluation_notify ON public.assessments;
CREATE TRIGGER trg_evaluation_notify
AFTER INSERT OR UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION trg_notify_evaluation();


-- ==============================================================================
-- 3. Courses (Cursos)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_course()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_users_by_role(NEW.school_id, 'PARENT', 'Novo Curso Disponível', 'O curso ' || NEW.name || ' foi adicionado à escola.', '/cursos', 'cursos');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_course_notify ON public.courses;
CREATE TRIGGER trg_course_notify
AFTER INSERT ON public.courses
FOR EACH ROW EXECUTE FUNCTION trg_notify_course();


-- ==============================================================================
-- 4. Events (Eventos)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_all_users(NEW.school_id, 'Novo Evento: ' || NEW.title, 'Foi criado um novo evento marcado para ' || TO_CHAR(NEW.start_time::timestamp, 'DD/MM/YYYY HH24:MI') || '.', '/eventos', 'evento');
  ELSIF TG_OP = 'UPDATE' AND (NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.title IS DISTINCT FROM OLD.title) THEN
    PERFORM notify_all_users(NEW.school_id, 'Evento Atualizado: ' || NEW.title, 'Houve alterações num evento da escola.', '/eventos', 'evento');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_notify ON public.events;
CREATE TRIGGER trg_event_notify
AFTER INSERT OR UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION trg_notify_event();


-- ==============================================================================
-- 5. Enrollments (Matrícula Aprovada)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_enrollment_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id uuid;
  v_student_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status != 'approved' THEN
    SELECT parent_id, full_name INTO v_parent_id, v_student_name FROM public.students WHERE id = NEW.student_id;
    IF v_parent_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (v_parent_id, 'Matrícula Aprovada', 'A matrícula do educando ' || v_student_name || ' foi aprovada.', '/matriculas', 'matricula', NEW.school_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_approved_notify ON public.enrollments;
CREATE TRIGGER trg_enrollment_approved_notify
AFTER UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION trg_notify_enrollment_approved();


-- ==============================================================================
-- 6. Transport Routes (Rotas no Transporte Escolar)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_transport_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_users_by_role(NEW.school_id, 'PARENT', 'Nova Rota de Transporte', 'A rota ' || NEW.name || ' de transporte escolar foi criada.', '/transportes', 'transporte');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transport_route_notify ON public.transport_routes;
CREATE TRIGGER trg_transport_route_notify
AFTER INSERT ON public.transport_routes
FOR EACH ROW EXECUTE FUNCTION trg_notify_transport_route();

-- ==============================================================================
-- 7. Schedules (Horários)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_classroom_parents(NEW.classroom_id, NEW.school_id, 'Novo Horário', 'O horário da turma foi adicionado ou alterado.', '/horario', 'horario');
  ELSIF TG_OP = 'UPDATE' AND (NEW.start_time IS DISTINCT FROM OLD.start_time OR NEW.day_of_week IS DISTINCT FROM OLD.day_of_week) THEN
    PERFORM notify_classroom_parents(NEW.classroom_id, NEW.school_id, 'Horário Alterado', 'Houve uma alteração no horário da turma.', '/horario', 'horario');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_notify ON public.schedules;
CREATE TRIGGER trg_schedule_notify
AFTER INSERT OR UPDATE ON public.schedules
FOR EACH ROW EXECUTE FUNCTION trg_notify_schedule();


-- ==============================================================================
-- 8. Transport Enrollments (Inscrição no Transporte)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_transport_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id uuid;
  v_student_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT parent_id, full_name INTO v_parent_id, v_student_name FROM public.students WHERE id = NEW.student_id;
    IF v_parent_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (v_parent_id, 'Inscrição no Transporte', 'A inscrição de ' || v_student_name || ' no transporte foi registada.', '/transportes', 'transporte', NEW.school_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transport_enrollment_notify ON public.transport_enrollments;
CREATE TRIGGER trg_transport_enrollment_notify
AFTER INSERT ON public.transport_enrollments
FOR EACH ROW EXECUTE FUNCTION trg_notify_transport_enrollment();


-- ==============================================================================
-- 9. Attendance (Presença Atribuída)
-- ==============================================================================

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
    SELECT parent_id, full_name INTO v_parent_id, v_student_name FROM public.students WHERE id = NEW.student_id;
    IF v_parent_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (v_parent_id, 'Registo de Presença', 'A presença de ' || v_student_name || ' no dia ' || TO_CHAR(NEW.date::date, 'DD/MM/YYYY') || ' foi registada como: ' || NEW.status, '/presencas', 'presenca', NEW.school_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_notify ON public.attendance;
CREATE TRIGGER trg_attendance_notify
AFTER INSERT OR UPDATE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION trg_notify_attendance();


-- ==============================================================================
-- 10. Absence Requests (Pedidos de Ausência)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_absence_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM notify_users_by_role(NEW.school_id, 'SUPER_ADMIN', 'Novo Pedido de Ausência', 'Foi submetido um novo pedido de ausência.', '/pedidos', 'pedidos');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'approved' THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (NEW.requester_id, 'Pedido Aprovado', 'O seu pedido de ausência foi aprovado.', '/pedidos', 'pedidos', NEW.school_id);
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (NEW.requester_id, 'Pedido Rejeitado', 'O seu pedido de ausência foi rejeitado.', '/pedidos', 'pedidos', NEW.school_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_absence_request_notify ON public.staff_absences;
CREATE TRIGGER trg_absence_request_notify
AFTER INSERT OR UPDATE ON public.staff_absences
FOR EACH ROW EXECUTE FUNCTION trg_notify_absence_request();


-- ==============================================================================
-- 11. Disciplinary Records (Falta Disciplinar)
-- ==============================================================================

CREATE OR REPLACE FUNCTION trg_notify_disciplinary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id uuid;
  v_student_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT parent_id, full_name INTO v_parent_id, v_student_name FROM public.students WHERE id = NEW.student_id;
    IF v_parent_id IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (v_parent_id, 'Falta Disciplinar', 'Foi registada uma ocorrência disciplinar para ' || v_student_name || '.', '/presencas', 'disciplina', NEW.school_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disciplinary_notify ON public.behavior_logs;
CREATE TRIGGER trg_disciplinary_notify
AFTER INSERT ON public.behavior_logs
FOR EACH ROW EXECUTE FUNCTION trg_notify_disciplinary();
