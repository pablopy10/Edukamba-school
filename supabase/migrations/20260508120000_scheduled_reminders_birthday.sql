-- ==============================================================================
-- Scheduled Reminders V2 + Birthday Events
--
-- Adds:
--   1. process_assessment_reminders()  — T-2 and day-of alerts to parents
--   2. process_event_reminders()       — T-1 and day-of alerts to all school users
--   3. process_material_reminders()    — T-1 before needed_date to parents
--   4. upsert_birthday_event()         — helper to create/update birthday events
--   5. trg_student_birthday_event()    — trigger: student insert/update → birthday event
--   6. trg_teacher_birthday_event()    — trigger: teacher insert/update → birthday event
--   7. refresh_birthday_events()       — yearly cron backfill
--   8. run_all_daily_reminders()       — master wrapper called by daily cron
--   9. Reschedules the existing cron to call the master wrapper
--  10. Patches trg_notify_event() to skip 'aniversario' events on INSERT
--       (they are handled by timed reminders, not instant spam)
-- ==============================================================================


-- ============================================================
-- 0. Patch event notification trigger: skip birthday events
--    on INSERT so backfill + new-student triggers don't spam
--    all users.  UPDATE changes still fire normally.
-- ============================================================

CREATE OR REPLACE FUNCTION trg_notify_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Birthday events are handled by daily reminders; skip instant notification
  IF NEW.type = 'aniversario' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM notify_all_users(
      NEW.school_id,
      'Novo Evento: ' || NEW.title,
      'Foi criado um novo evento marcado para ' ||
        TO_CHAR(NEW.event_date::date, 'DD/MM/YYYY') ||
        COALESCE(' às ' || TO_CHAR(NEW.start_time::time, 'HH24:MI'), '') || '.',
      '/eventos',
      'evento'
    );
  ELSIF TG_OP = 'UPDATE' AND (
    NEW.event_date  IS DISTINCT FROM OLD.event_date  OR
    NEW.start_time  IS DISTINCT FROM OLD.start_time  OR
    NEW.title       IS DISTINCT FROM OLD.title
  ) THEN
    PERFORM notify_all_users(
      NEW.school_id,
      'Evento Atualizado: ' || NEW.title,
      'Houve alterações num evento da escola.',
      '/eventos',
      'evento'
    );
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 1. ASSESSMENT REMINDERS
-- ============================================================

CREATE OR REPLACE FUNCTION process_assessment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 2 days before assessment
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT
    p.id,
    '📝 Avaliação em 2 dias',
    'A avaliação "' || a.title || '" está marcada para ' || TO_CHAR(a.date::date, 'DD/MM/YYYY') || '.',
    '/avaliacoes',
    'avaliacoes',
    a.school_id
  FROM public.assessments a
  JOIN public.students s
    ON s.classroom_id = a.classroom_id
   AND s.school_id    = a.school_id
  JOIN public.profiles p ON p.id = s.parent_id
  WHERE a.date::date = CURRENT_DATE + INTERVAL '2 days'
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id    = p.id
        AND n.title           = '📝 Avaliação em 2 dias'
        AND n.description     LIKE '%' || a.title || '%'
        AND n.created_at::date = CURRENT_DATE
    );

  -- On assessment day
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT
    p.id,
    '📝 Avaliação Hoje',
    'O seu educando tem avaliação de "' || a.title || '" hoje, ' || TO_CHAR(a.date::date, 'DD/MM/YYYY') || '.',
    '/avaliacoes',
    'avaliacoes',
    a.school_id
  FROM public.assessments a
  JOIN public.students s
    ON s.classroom_id = a.classroom_id
   AND s.school_id    = a.school_id
  JOIN public.profiles p ON p.id = s.parent_id
  WHERE a.date::date = CURRENT_DATE
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id    = p.id
        AND n.title           = '📝 Avaliação Hoje'
        AND n.description     LIKE '%' || a.title || '%'
        AND n.created_at::date = CURRENT_DATE
    );
END;
$$;


-- ============================================================
-- 2. EVENT REMINDERS
-- ============================================================

CREATE OR REPLACE FUNCTION process_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1 day before event: all active school users
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT
    p.id,
    '📅 Evento Amanhã: ' || e.title,
    'Lembrete: "' || e.title || '" é amanhã, ' ||
      TO_CHAR(e.event_date, 'DD/MM/YYYY') ||
      COALESCE(' às ' || TO_CHAR(e.start_time, 'HH24:MI'), '') || '.',
    '/eventos',
    'evento',
    e.school_id
  FROM public.events e
  JOIN public.profiles p ON p.school_id = e.school_id
  WHERE e.event_date = CURRENT_DATE + INTERVAL '1 day'
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id    = p.id
        AND n.title           = '📅 Evento Amanhã: ' || e.title
        AND n.created_at::date = CURRENT_DATE
    );

  -- On event day: all active school users
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT
    p.id,
    '🎉 Evento Hoje: ' || e.title,
    '"' || e.title || '" é hoje' ||
      COALESCE(' às ' || TO_CHAR(e.start_time, 'HH24:MI'), '') ||
      COALESCE(' em ' || e.location, '') || '.',
    '/eventos',
    'evento',
    e.school_id
  FROM public.events e
  JOIN public.profiles p ON p.school_id = e.school_id
  WHERE e.event_date = CURRENT_DATE
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id    = p.id
        AND n.title           = '🎉 Evento Hoje: ' || e.title
        AND n.created_at::date = CURRENT_DATE
    );
END;
$$;


-- ============================================================
-- 3. MATERIAL REQUEST REMINDERS
--    Uses dynamic SQL so the function compiles even if the
--    needed_date column has not been added yet.
-- ============================================================

CREATE OR REPLACE FUNCTION process_material_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'material_requests'
      AND column_name  = 'needed_date'
  ) THEN
    RETURN;
  END IF;

  -- 1 day before needed_date: notify student's parent
  EXECUTE $q$
    INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
    SELECT DISTINCT
      p.id,
      '📦 Material para amanhã',
      'O seu educando ' || s.full_name || ' precisa de entregar "' || mr.item_name || '" amanhã.',
      '/material',
      'material',
      mr.school_id
    FROM public.material_requests mr
    JOIN public.students s ON s.id = mr.student_id
    JOIN public.profiles p ON p.id = s.parent_id
    WHERE mr.needed_date::date = CURRENT_DATE + INTERVAL '1 day'
      AND mr.status NOT IN ('entregue', 'cancelado')
      AND mr.student_id IS NOT NULL
      AND COALESCE(p.is_active, true) = true
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.recipient_id    = p.id
          AND n.category        = 'material'
          AND n.description     LIKE '%' || mr.item_name || '%'
          AND n.created_at::date = CURRENT_DATE
      )
  $q$;
END;
$$;


-- ============================================================
-- 4. BIRTHDAY EVENTS — helper
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_birthday_event(
  p_school_id   uuid,
  p_person_name text,
  p_birth_date  date,
  p_type        text   -- 'aluno' | 'professor'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int;
  v_bday date;
  v_title text;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::int;

  -- Construct birthday in the current year; handle Feb-29 on non-leap years
  BEGIN
    v_bday := make_date(
      v_year,
      EXTRACT(MONTH FROM p_birth_date)::int,
      EXTRACT(DAY   FROM p_birth_date)::int
    );
  EXCEPTION WHEN OTHERS THEN
    v_bday := make_date(v_year, 3, 1);   -- Feb 29 → Mar 1 fallback
  END;

  -- If birthday already passed this year, schedule for next year
  IF v_bday < CURRENT_DATE THEN
    v_year := v_year + 1;
    BEGIN
      v_bday := make_date(
        v_year,
        EXTRACT(MONTH FROM p_birth_date)::int,
        EXTRACT(DAY   FROM p_birth_date)::int
      );
    EXCEPTION WHEN OTHERS THEN
      v_bday := make_date(v_year, 3, 1);
    END;
  END IF;

  v_title := '🎂 Aniversário: ' || p_person_name;

  -- Insert only if no birthday event exists for this person in this year
  INSERT INTO public.events (school_id, title, type, event_date, description)
  SELECT
    p_school_id,
    v_title,
    'aniversario',
    v_bday,
    'Aniversário de ' || p_person_name || ' (' || p_type || ').'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE school_id  = p_school_id
      AND title      = v_title
      AND EXTRACT(YEAR FROM event_date)::int = v_year
  );
END;
$$;


-- ============================================================
-- 5. BIRTHDAY EVENTS — student trigger
-- ============================================================

CREATE OR REPLACE FUNCTION trg_student_birthday_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.birth_date IS NOT NULL AND NEW.school_id IS NOT NULL THEN
    IF TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND NEW.birth_date IS DISTINCT FROM OLD.birth_date)
    THEN
      PERFORM public.upsert_birthday_event(NEW.school_id, NEW.full_name, NEW.birth_date, 'aluno');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_birthday ON public.students;
CREATE TRIGGER trg_student_birthday
AFTER INSERT OR UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION trg_student_birthday_event();


-- ============================================================
-- 6. BIRTHDAY EVENTS — teacher trigger
-- ============================================================

CREATE OR REPLACE FUNCTION trg_teacher_birthday_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
  v_full_name text;
BEGIN
  IF NEW.birth_date IS NOT NULL THEN
    IF TG_OP = 'INSERT'
    OR (TG_OP = 'UPDATE' AND NEW.birth_date IS DISTINCT FROM OLD.birth_date)
    THEN
      SELECT p.school_id, p.full_name
        INTO v_school_id, v_full_name
        FROM public.profiles p
       WHERE p.id = NEW.profile_id;

      IF v_school_id IS NOT NULL THEN
        PERFORM public.upsert_birthday_event(v_school_id, v_full_name, NEW.birth_date, 'professor');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teacher_birthday ON public.teachers;
CREATE TRIGGER trg_teacher_birthday
AFTER INSERT OR UPDATE ON public.teachers
FOR EACH ROW EXECUTE FUNCTION trg_teacher_birthday_event();


-- ============================================================
-- 7. BIRTHDAY EVENTS — backfill existing records
--    (trg_notify_event already patched above to skip
--     'aniversario' inserts, so no notification flood)
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT full_name, birth_date, school_id
    FROM public.students
    WHERE birth_date IS NOT NULL AND school_id IS NOT NULL
  LOOP
    PERFORM public.upsert_birthday_event(r.school_id, r.full_name, r.birth_date, 'aluno');
  END LOOP;
END;
$$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.full_name, t.birth_date, p.school_id
    FROM public.teachers t
    JOIN public.profiles p ON p.id = t.profile_id
    WHERE t.birth_date IS NOT NULL AND p.school_id IS NOT NULL
  LOOP
    PERFORM public.upsert_birthday_event(r.school_id, r.full_name, r.birth_date, 'professor');
  END LOOP;
END;
$$;


-- ============================================================
-- 8. BIRTHDAY EVENTS — yearly refresh (runs Jan 1 at 06:00)
-- ============================================================

CREATE OR REPLACE FUNCTION refresh_birthday_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT full_name, birth_date, school_id
    FROM public.students
    WHERE birth_date IS NOT NULL AND school_id IS NOT NULL
  LOOP
    PERFORM upsert_birthday_event(r.school_id, r.full_name, r.birth_date, 'aluno');
  END LOOP;

  FOR r IN
    SELECT p.full_name, t.birth_date, p.school_id
    FROM public.teachers t
    JOIN public.profiles p ON p.id = t.profile_id
    WHERE t.birth_date IS NOT NULL AND p.school_id IS NOT NULL
  LOOP
    PERFORM upsert_birthday_event(r.school_id, r.full_name, r.birth_date, 'professor');
  END LOOP;
END;
$$;

SELECT cron.unschedule('refresh_birthday_events')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_birthday_events');

SELECT cron.schedule(
  'refresh_birthday_events',
  '0 6 1 1 *',
  'SELECT public.refresh_birthday_events()'
);


-- ============================================================
-- 9. MASTER DAILY REMINDERS WRAPPER
-- ============================================================

CREATE OR REPLACE FUNCTION run_all_daily_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_daily_payment_reminders();
  PERFORM public.process_assessment_reminders();
  PERFORM public.process_event_reminders();
  PERFORM public.process_material_reminders();
END;
$$;


-- ============================================================
-- 10. RESCHEDULE CRON
--     Replace old payment-only job with the master wrapper
-- ============================================================

SELECT cron.unschedule('daily_payment_reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_payment_reminders');

SELECT cron.unschedule('daily_all_reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_all_reminders');

SELECT cron.schedule(
  'daily_all_reminders',
  '0 8 * * *',
  'SELECT public.run_all_daily_reminders()'
);
