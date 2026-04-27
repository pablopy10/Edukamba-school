
-- =====================================================================
-- Helper function to insert notifications safely
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_user(
  _recipient_id uuid,
  _school_id uuid,
  _category text,
  _title text,
  _description text,
  _link text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _actor_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _recipient_id IS NULL THEN RETURN; END IF;
  -- Skip if recipient profile inactive or doesn't belong to school
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _recipient_id
      AND COALESCE(is_active, true) = true
      AND (school_id = _school_id OR _school_id IS NULL)
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    recipient_id, school_id, category, title, description, link, actor_id, actor_name, status
  ) VALUES (
    _recipient_id, _school_id, _category, _title, _description, _link, _actor_id, _actor_name, 'unread'
  );
END;
$$;

-- =====================================================================
-- 1. MESSAGES — notify receiver
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sender_name text;
BEGIN
  IF NEW.receiver_id IS NULL THEN RETURN NEW; END IF;
  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  PERFORM public.notify_user(
    NEW.receiver_id, NEW.school_id, 'mensagem',
    'Nova mensagem' || COALESCE(' de ' || _sender_name, ''),
    COALESCE(LEFT(NEW.content, 120), 'Recebeu uma nova mensagem.'),
    '/chat', NEW.sender_id, _sender_name
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_new_message();

-- =====================================================================
-- 2. ASSESSMENTS (created or edited) — notify parents of students in classroom
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_assessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
  _parent_id uuid;
  _subject_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'criada';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.title IS NOT DISTINCT FROM OLD.title
       AND NEW.date IS NOT DISTINCT FROM OLD.date
       AND NEW.description IS NOT DISTINCT FROM OLD.description
       AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
       AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
       AND NEW.subject_id IS NOT DISTINCT FROM OLD.subject_id THEN
      RETURN NEW;
    END IF;
    _action := 'atualizada';
  END IF;

  SELECT name INTO _subject_name FROM public.subjects WHERE id = NEW.subject_id;

  FOR _parent_id IN
    SELECT DISTINCT s.parent_id
    FROM public.students s
    WHERE s.classroom_id = NEW.classroom_id AND s.parent_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      _parent_id, NEW.school_id, 'academico',
      'Avaliação ' || _action || ': ' || NEW.title,
      COALESCE(_subject_name || ' — ', '') || 'Data: ' || to_char(NEW.date, 'DD/MM/YYYY'),
      '/avaliacoes', NULL, NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_assessment ON public.assessments;
CREATE TRIGGER trg_notify_assessment
AFTER INSERT OR UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_assessment();

-- =====================================================================
-- 3. ENROLLMENTS — approved (status ACTIVE) — notify parent
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student record;
  _classroom_name text;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN RETURN NEW; END IF;

  SELECT s.parent_id, s.full_name, s.school_id INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO _classroom_name FROM public.classrooms WHERE id = NEW.classroom_id;

  PERFORM public.notify_user(
    _student.parent_id, _student.school_id, 'administrativo',
    'Matrícula aprovada',
    _student.full_name || ' foi matriculado em ' || COALESCE(_classroom_name, 'turma') || '.',
    '/matriculas', NULL, NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_enrollment ON public.enrollments;
CREATE TRIGGER trg_notify_enrollment
AFTER INSERT OR UPDATE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_enrollment();

-- =====================================================================
-- 4. ATTENDANCE — notify parent
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_notify_attendance ON public.attendance;
CREATE TRIGGER trg_notify_attendance
AFTER INSERT ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_attendance();

-- =====================================================================
-- 5. SCHEDULES — edited — notify parents of classroom
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
  _classroom_name text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.day_of_week IS NOT DISTINCT FROM OLD.day_of_week
       AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
       AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
       AND NEW.subject_id IS NOT DISTINCT FROM OLD.subject_id
       AND NEW.teacher_id IS NOT DISTINCT FROM OLD.teacher_id
       AND NEW.room IS NOT DISTINCT FROM OLD.room THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT name INTO _classroom_name FROM public.classrooms WHERE id = NEW.classroom_id;

  FOR _parent_id IN
    SELECT DISTINCT s.parent_id FROM public.students s
    WHERE s.classroom_id = NEW.classroom_id AND s.parent_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      _parent_id, NEW.school_id, 'academico',
      'Horário atualizado',
      'O horário semanal da turma ' || COALESCE(_classroom_name, '') || ' foi atualizado.',
      '/horarios', NULL, NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_schedule ON public.schedules;
CREATE TRIGGER trg_notify_schedule
AFTER UPDATE ON public.schedules
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_schedule();

-- =====================================================================
-- 6. EVENTS — notify all school members
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
BEGIN
  FOR _user_id IN
    SELECT id FROM public.profiles
    WHERE school_id = NEW.school_id AND COALESCE(is_active, true) = true
  LOOP
    PERFORM public.notify_user(
      _user_id, NEW.school_id, 'evento',
      'Novo evento: ' || NEW.title,
      COALESCE(NEW.description, '') || ' — ' || to_char(NEW.event_date, 'DD/MM/YYYY'),
      '/eventos', NEW.created_by, NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_event ON public.events;
CREATE TRIGGER trg_notify_event
AFTER INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_event();

-- =====================================================================
-- 7. STAFF ABSENCES — notify admins (insert/update) and requester (decision)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_staff_absence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
  _requester_name text;
BEGIN
  SELECT full_name INTO _requester_name FROM public.profiles WHERE id = NEW.requester_id;

  IF TG_OP = 'INSERT' THEN
    FOR _admin_id IN
      SELECT id FROM public.profiles
      WHERE school_id = NEW.school_id AND role = 'ADMIN' AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public.notify_user(
        _admin_id, NEW.school_id, 'administrativo',
        'Novo pedido de ausência',
        COALESCE(_requester_name || ' — ', '') || NEW.reason || ' (' || to_char(NEW.start_date, 'DD/MM') || ' a ' || to_char(NEW.end_date, 'DD/MM') || ')',
        '/pedidos', NEW.requester_id, _requester_name
      );
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Decision changes
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved', 'rejected', 'APPROVED', 'REJECTED') THEN
      PERFORM public.notify_user(
        NEW.requester_id, NEW.school_id, 'administrativo',
        CASE WHEN lower(NEW.status) = 'approved' THEN 'Pedido de ausência aprovado' ELSE 'Pedido de ausência rejeitado' END,
        'Período: ' || to_char(NEW.start_date, 'DD/MM/YYYY') || ' a ' || to_char(NEW.end_date, 'DD/MM/YYYY'),
        '/pedidos', NEW.decided_by, NULL
      );
    ELSIF NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      FOR _admin_id IN
        SELECT id FROM public.profiles
        WHERE school_id = NEW.school_id AND role = 'ADMIN' AND COALESCE(is_active, true) = true
      LOOP
        PERFORM public.notify_user(
          _admin_id, NEW.school_id, 'administrativo',
          'Pedido de ausência editado',
          COALESCE(_requester_name || ' — ', '') || NEW.reason,
          '/pedidos', NEW.requester_id, _requester_name
        );
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_staff_absence ON public.staff_absences;
CREATE TRIGGER trg_notify_staff_absence
AFTER INSERT OR UPDATE ON public.staff_absences
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_staff_absence();

-- =====================================================================
-- 8. MATERIAL REQUESTS — notify parents of classroom or specific student
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_material_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    SELECT parent_id INTO _parent_id FROM public.students WHERE id = NEW.student_id;
    IF _parent_id IS NOT NULL THEN
      PERFORM public.notify_user(
        _parent_id, NEW.school_id, 'academico',
        'Pedido de material',
        NEW.item_name || ' (qtd: ' || NEW.quantity || ')',
        '/material', NEW.requester_id, NEW.teacher_name
      );
    END IF;
  ELSIF NEW.classroom_id IS NOT NULL THEN
    FOR _parent_id IN
      SELECT DISTINCT s.parent_id FROM public.students s
      WHERE s.classroom_id = NEW.classroom_id AND s.parent_id IS NOT NULL
    LOOP
      PERFORM public.notify_user(
        _parent_id, NEW.school_id, 'academico',
        'Pedido de material para a turma',
        NEW.item_name || ' (qtd: ' || NEW.quantity || ')',
        '/material', NEW.requester_id, NEW.teacher_name
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_material_request ON public.material_requests;
CREATE TRIGGER trg_notify_material_request
AFTER INSERT ON public.material_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_material_request();

-- =====================================================================
-- 9. MATERIALS — low stock — notify admins
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
BEGIN
  IF NEW.quantity <= NEW.min_quantity AND (TG_OP = 'INSERT' OR OLD.quantity > OLD.min_quantity OR OLD.quantity > NEW.quantity) THEN
    FOR _admin_id IN
      SELECT id FROM public.profiles
      WHERE school_id = NEW.school_id AND role = 'ADMIN' AND COALESCE(is_active, true) = true
    LOOP
      PERFORM public.notify_user(
        _admin_id, NEW.school_id, 'administrativo',
        'Stock baixo: ' || NEW.name,
        'Quantidade atual: ' || NEW.quantity || ' ' || NEW.unit || ' (mínimo: ' || NEW.min_quantity || ')',
        '/material', NULL, NULL
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_low_stock ON public.materials;
CREATE TRIGGER trg_notify_low_stock
AFTER INSERT OR UPDATE OF quantity, min_quantity ON public.materials
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_low_stock();

-- =====================================================================
-- 10. GRADES — notify parent
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student record;
  _assessment_title text;
  _school_id uuid;
BEGIN
  SELECT s.parent_id, s.full_name, s.school_id INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT title INTO _assessment_title FROM public.assessments WHERE id = NEW.assessment_id;

  PERFORM public.notify_user(
    _student.parent_id, _student.school_id, 'academico',
    'Nova nota atribuída',
    _student.full_name || ' — ' || COALESCE(_assessment_title, 'avaliação') || ': ' || NEW.score::text,
    '/avaliacoes', NULL, NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_grade ON public.grades;
CREATE TRIGGER trg_notify_grade
AFTER INSERT ON public.grades
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_grade();

-- =====================================================================
-- 11. PAYMENTS — validation/rejection — notify parent
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_payment_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
  _student_name text;
  _is_activity boolean;
  _label text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('validado', 'rejeitado', 'validated', 'rejected') THEN RETURN NEW; END IF;

  _is_activity := NEW.activity_fee_id IS NOT NULL;
  IF _is_activity THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.activity_fees af
    JOIN public.students s ON s.id = af.student_id
    WHERE af.id = NEW.activity_fee_id;
    _label := 'atividade extracurricular';
  ELSE
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.student_fees sf
    JOIN public.students s ON s.id = sf.student_id
    WHERE sf.id = NEW.student_fee_id;
    _label := 'propina';
  END IF;

  IF _parent_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.notify_user(
    _parent_id, NEW.school_id, 'administrativo',
    CASE WHEN lower(NEW.status) IN ('validado', 'validated')
         THEN 'Pagamento de ' || _label || ' validado'
         ELSE 'Pagamento de ' || _label || ' rejeitado' END,
    COALESCE(_student_name || ' — ', '') || 'Valor: ' || NEW.amount_paid::text || ' EUR' ||
      CASE WHEN lower(NEW.status) IN ('rejeitado', 'rejected') AND NEW.rejection_reason IS NOT NULL
           THEN E'\nMotivo: ' || NEW.rejection_reason ELSE '' END,
    '/pagamentos', NEW.validated_by, NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_validation ON public.payments;
CREATE TRIGGER trg_notify_payment_validation
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_payment_validation();

-- =====================================================================
-- 12. COMPLAINTS — target user receives notification
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_complaint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_user_id uuid;
  _label text;
BEGIN
  -- If target is a student, notify the parent
  IF NEW.target_student_id IS NOT NULL THEN
    SELECT parent_id INTO _target_user_id FROM public.students WHERE id = NEW.target_student_id;
  ELSIF NEW.target_profile_id IS NOT NULL THEN
    _target_user_id := NEW.target_profile_id;
  END IF;

  IF _target_user_id IS NULL THEN RETURN NEW; END IF;

  _label := CASE lower(NEW.kind) WHEN 'praise' THEN 'Elogio' WHEN 'compliment' THEN 'Elogio' ELSE 'Reclamação' END;

  PERFORM public.notify_user(
    _target_user_id, NEW.school_id, 'administrativo',
    _label || ' recebido: ' || NEW.subject,
    COALESCE(LEFT(NEW.description, 160), ''),
    '/pedidos', NEW.reporter_id, NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_complaint ON public.complaints;
CREATE TRIGGER trg_notify_complaint
AFTER INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_complaint();

-- =====================================================================
-- 13. PROFILES — activated/deactivated
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_profile_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NEW.is_active = true THEN
      PERFORM public.notify_user(
        NEW.id, NEW.school_id, 'sistema',
        'Conta ativada',
        'A sua conta foi ativada. Já pode aceder à plataforma.',
        NULL, NULL, NULL
      );
    ELSE
      PERFORM public.notify_user(
        NEW.id, NEW.school_id, 'sistema',
        'Conta desativada',
        'A sua conta foi desativada. Contacte o administrador para mais informação.',
        NULL, NULL, NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_profile_active ON public.profiles;
CREATE TRIGGER trg_notify_profile_active
AFTER UPDATE OF is_active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_profile_active();

-- =====================================================================
-- 14. EXPENSES — notify admins
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
BEGIN
  FOR _admin_id IN
    SELECT id FROM public.profiles
    WHERE school_id = NEW.school_id AND role = 'ADMIN' AND COALESCE(is_active, true) = true
  LOOP
    PERFORM public.notify_user(
      _admin_id, NEW.school_id, 'administrativo',
      'Nova despesa registada',
      NEW.description || ' — ' || NEW.amount::text || ' EUR (' || to_char(NEW.expense_date, 'DD/MM/YYYY') || ')',
      '/financas', NEW.created_by, NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_expense ON public.expenses;
CREATE TRIGGER trg_notify_expense
AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_expense();

-- =====================================================================
-- 15. SCHOOL INVOICES — notify admins (created and paid)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_school_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
  _title text;
  _desc text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _title := 'Nova cobrança Edukamba: ' || NEW.invoice_number;
    _desc := COALESCE(NEW.description, 'Subscrição') || ' — ' || NEW.amount::text || ' ' || NEW.currency || ' (vence ' || to_char(NEW.due_date, 'DD/MM/YYYY') || ')';
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'paid' THEN
    _title := 'Pagamento Edukamba validado: ' || NEW.invoice_number;
    _desc := 'O pagamento de ' || NEW.amount::text || ' ' || NEW.currency || ' foi validado.';
  ELSE
    RETURN NEW;
  END IF;

  FOR _admin_id IN
    SELECT id FROM public.profiles
    WHERE school_id = NEW.school_id AND role = 'ADMIN' AND COALESCE(is_active, true) = true
  LOOP
    PERFORM public.notify_user(
      _admin_id, NEW.school_id, 'administrativo',
      _title, _desc, '/definicoes', NULL, NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_school_invoice ON public.school_invoices;
CREATE TRIGGER trg_notify_school_invoice
AFTER INSERT OR UPDATE ON public.school_invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_school_invoice();

-- =====================================================================
-- 16. DAILY SCHEDULED CHECKS
--   - 3 days before / on due date for student_fees and activity_fees
--   - daily reminder to admins about pending payments
-- =====================================================================
CREATE OR REPLACE FUNCTION public.run_daily_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _count integer := 0;
  _pending integer;
  _admin_id uuid;
  _school record;
BEGIN
  -- Student fees due in 3 days
  FOR _row IN
    SELECT sf.id, sf.amount_due, sf.due_date, s.parent_id, s.full_name, s.school_id
    FROM public.student_fees sf
    JOIN public.students s ON s.id = sf.student_id
    WHERE sf.is_paid = false
      AND sf.due_date = (CURRENT_DATE + INTERVAL '3 days')::date
      AND s.parent_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      _row.parent_id, _row.school_id, 'administrativo',
      'Propina vence em 3 dias',
      _row.full_name || ' — ' || _row.amount_due::text || ' EUR (vence ' || to_char(_row.due_date, 'DD/MM/YYYY') || ')',
      '/pagamentos', NULL, NULL
    );
    _count := _count + 1;
  END LOOP;

  -- Student fees due today
  FOR _row IN
    SELECT sf.id, sf.amount_due, sf.due_date, s.parent_id, s.full_name, s.school_id
    FROM public.student_fees sf
    JOIN public.students s ON s.id = sf.student_id
    WHERE sf.is_paid = false
      AND sf.due_date = CURRENT_DATE
      AND s.parent_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      _row.parent_id, _row.school_id, 'administrativo',
      'Propina vence hoje',
      _row.full_name || ' — ' || _row.amount_due::text || ' EUR',
      '/pagamentos', NULL, NULL
    );
    _count := _count + 1;
  END LOOP;

  -- Activity fees due in 3 days
  FOR _row IN
    SELECT af.id, af.amount_due, af.due_date, s.parent_id, s.full_name, af.school_id, ea.name AS activity_name
    FROM public.activity_fees af
    JOIN public.students s ON s.id = af.student_id
    JOIN public.extracurricular_activities ea ON ea.id = af.activity_id
    WHERE af.is_paid = false
      AND af.due_date = (CURRENT_DATE + INTERVAL '3 days')::date
      AND s.parent_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      _row.parent_id, _row.school_id, 'administrativo',
      'Atividade extracurricular vence em 3 dias',
      _row.full_name || ' — ' || _row.activity_name || ': ' || _row.amount_due::text || ' EUR',
      '/pagamentos', NULL, NULL
    );
    _count := _count + 1;
  END LOOP;

  -- Activity fees due today
  FOR _row IN
    SELECT af.id, af.amount_due, af.due_date, s.parent_id, s.full_name, af.school_id, ea.name AS activity_name
    FROM public.activity_fees af
    JOIN public.students s ON s.id = af.student_id
    JOIN public.extracurricular_activities ea ON ea.id = af.activity_id
    WHERE af.is_paid = false
      AND af.due_date = CURRENT_DATE
      AND s.parent_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      _row.parent_id, _row.school_id, 'administrativo',
      'Atividade extracurricular vence hoje',
      _row.full_name || ' — ' || _row.activity_name || ': ' || _row.amount_due::text || ' EUR',
      '/pagamentos', NULL, NULL
    );
    _count := _count + 1;
  END LOOP;

  -- Daily admin reminder for pending payments
  FOR _school IN SELECT id FROM public.schools LOOP
    SELECT COUNT(*) INTO _pending
    FROM public.payments
    WHERE school_id = _school.id AND status IN ('pendente', 'pending');

    IF _pending > 0 THEN
      FOR _admin_id IN
        SELECT id FROM public.profiles
        WHERE school_id = _school.id AND role = 'ADMIN' AND COALESCE(is_active, true) = true
      LOOP
        PERFORM public.notify_user(
          _admin_id, _school.id, 'administrativo',
          'Pagamentos por validar',
          'Tem ' || _pending || ' pagamento(s) à espera de validação.',
          '/pagamentos', NULL, NULL
        );
        _count := _count + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN _count;
END;
$$;
