-- Event audiences: structured values in events.audience
-- ALL | STAFF | CLASSROOM:<uuid>
-- Legacy / unknown text notifies the whole school (same as ALL).

CREATE OR REPLACE FUNCTION public.notify_event_school_staff(
  p_school_id uuid,
  p_title text,
  p_description text,
  p_link text,
  p_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT id, p_title, p_description, p_link, p_category, p_school_id
  FROM public.profiles
  WHERE school_id = p_school_id
    AND COALESCE(is_active, true) = true
    AND role::text NOT IN ('PARENT', 'STUDENT');
END;
$$;

COMMENT ON FUNCTION public.notify_event_school_staff IS
  'Notifica apenas perfis de funcionários da escola (exclui encarregados e alunos).';

CREATE OR REPLACE FUNCTION public.notify_event_classroom_recipients(
  p_classroom_id uuid,
  p_school_id uuid,
  p_title text,
  p_description text,
  p_link text,
  p_category text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT u.recipient_id, p_title, p_description, p_link, p_category, p_school_id
  FROM (
    SELECT s.user_id AS recipient_id
    FROM public.students s
    WHERE s.classroom_id = p_classroom_id
      AND s.school_id = p_school_id
      AND s.user_id IS NOT NULL

    UNION

    SELECT c.homeroom_teacher_id AS recipient_id
    FROM public.classrooms c
    WHERE c.id = p_classroom_id
      AND c.school_id = p_school_id
      AND c.homeroom_teacher_id IS NOT NULL

    UNION

    SELECT sch.teacher_id AS recipient_id
    FROM public.schedules sch
    WHERE sch.classroom_id = p_classroom_id
      AND sch.school_id = p_school_id
      AND sch.teacher_id IS NOT NULL
  ) u
  INNER JOIN public.profiles pf ON pf.id = u.recipient_id
  WHERE pf.school_id = p_school_id
    AND COALESCE(pf.is_active, true) = true;
END;
$$;

COMMENT ON FUNCTION public.notify_event_classroom_recipients IS
  'Envia para alunos com conta (user_id), diretor de turma e professores no horário da turma.';

CREATE OR REPLACE FUNCTION public.trg_notify_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text := trim(coalesce(NEW.audience, ''));
  v_up text := upper(v_raw);
  v_class uuid;
  v_fire boolean := false;
  v_title text;
  v_description text;
  v_match text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_fire := true;
  ELSIF TG_OP = 'UPDATE' THEN
    v_fire :=
      NEW.event_date IS DISTINCT FROM OLD.event_date
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.audience IS DISTINCT FROM OLD.audience;
  END IF;

  IF NOT v_fire THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_title := 'Novo Evento: ' || NEW.title;
    v_description :=
      'Foi criado um novo evento marcado para '
      || TO_CHAR(NEW.event_date::date, 'DD/MM/YYYY')
      || COALESCE(' às ' || TO_CHAR(NEW.start_time::time, 'HH24:MI'), '')
      || '.';
  ELSE
    v_title := 'Evento Atualizado: ' || NEW.title;
    v_description := 'Houve alterações num evento da escola.';
  END IF;

  IF v_raw = '' OR v_up = 'ALL' THEN
    PERFORM notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
    RETURN NEW;
  END IF;

  IF v_up = 'STAFF' THEN
    PERFORM notify_event_school_staff(
      NEW.school_id,
      v_title,
      v_description,
      '/eventos',
      'evento'
    );
    RETURN NEW;
  END IF;

  v_match := regexp_match(lower(v_raw), '^classroom:([0-9a-f\-]{36})$');
  IF v_match IS NOT NULL THEN
    v_class := (v_match[1])::uuid;
    IF EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = v_class AND c.school_id = NEW.school_id
    ) THEN
      PERFORM notify_event_classroom_recipients(
        v_class,
        NEW.school_id,
        v_title,
        v_description,
        '/eventos',
        'evento'
      );
    ELSE
      PERFORM notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
    END IF;
    RETURN NEW;
  END IF;

  PERFORM notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
  RETURN NEW;
END;
$$;
