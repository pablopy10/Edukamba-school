-- Expanded event audiences:
-- ALL | STAFF | STUDENTS:<uuid>,<uuid>,... | EDUCATORS:<uuid>,<uuid>,... | CLASSROOM:<uuid> (legacy, same pupil scope as STUDENTS:single uuid; notifications unchanged from previous single-class helper)
--
-- Notifications: skipped entirely for type 'aniversario' (immediate trigger + scheduled reminders patch below).
--
-- STUDENTS:* — encarregados (toda a escola) + todos os direcção de turma (homeroom) da escola.
-- EDUCATORS:* — encarregados com educandos nas turmas indicadas + directores das turmas + docentes em horários dessas turmas.
-- Profile self-attendance table: event_profile_rsvp (ALL / STAFF / EDUCATORS).
-- STUDENTS / CLASSROOM continuam em event_student_rsvp (+ políticas extra para docente e aluno).

-- ---------------------------------------------------------------------------
-- 1) event_profile_rsvp
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_profile_rsvp (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response text NOT NULL DEFAULT 'unset' CHECK (response IN ('presente', 'ausente', 'unset')),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_event_profile_rsvp_event ON public.event_profile_rsvp(event_id);

ALTER TABLE public.event_profile_rsvp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Event profile RSVP selectable by school staff or self"
  ON public.event_profile_rsvp;
CREATE POLICY "Event profile RSVP selectable by school staff or self"
  ON public.event_profile_rsvp FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.school_id = public.get_my_school())
    AND (
      profile_id = auth.uid()
      OR public.get_auth_role() = ANY (
        ARRAY[
          'ADMIN'::public.user_role,
          'SUPER_ADMIN'::public.user_role,
          'DIRECTOR'::public.user_role,
          'SECRETARY'::public.user_role,
          'TREASURER'::public.user_role,
          'TEACHER'::public.user_role
        ]
      )
    )
  );

DROP POLICY IF EXISTS "Event profile RSVP insert self school"
  ON public.event_profile_rsvp;
CREATE POLICY "Event profile RSVP insert self school"
  ON public.event_profile_rsvp FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE e.id = event_id
        AND e.school_id = me.school_id
        AND COALESCE(me.is_active, true) = true
    )
  );

DROP POLICY IF EXISTS "Event profile RSVP update self school"
  ON public.event_profile_rsvp;
CREATE POLICY "Event profile RSVP update self school"
  ON public.event_profile_rsvp FOR UPDATE TO authenticated
  USING (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE e.id = event_id
        AND e.school_id = me.school_id
        AND COALESCE(me.is_active, true) = true
    )
  )
  WITH CHECK (
    profile_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE e.id = event_id AND e.school_id = me.school_id
    )
  );

COMMENT ON TABLE public.event_profile_rsvp IS
  'Presença declarada ao nível do perfil do utilizador / encarregado / funcionário.';

REVOKE ALL ON TABLE public.event_profile_rsvp FROM anon;

-- ---------------------------------------------------------------------------
-- 2) Helpers: STUDENTS público ampl (encarregados escola + directores turma escola)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_event_students_audience_wide(
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
    SELECT pr.id AS recipient_id
    FROM public.profiles pr
    WHERE pr.school_id = p_school_id
      AND COALESCE(pr.is_active, true) = true
      AND pr.role::text = 'PARENT'

    UNION

    SELECT pr2.id AS recipient_id
    FROM public.classrooms c
    JOIN public.profiles pr2 ON pr2.id = c.homeroom_teacher_id
    WHERE c.school_id = p_school_id
      AND c.homeroom_teacher_id IS NOT NULL
      AND COALESCE(pr2.is_active, true) = true
  ) u
  INNER JOIN public.profiles pf ON pf.id = u.recipient_id
  WHERE pf.school_id = p_school_id
    AND COALESCE(pf.is_active, true) = true;
END;
$$;

COMMENT ON FUNCTION public.notify_event_students_audience_wide IS
  'Evento com público Alunos: notifica todos os encarregados da escola e todos os directores de turma.';

-- ---------------------------------------------------------------------------
-- 3) EDUCATORS multi-turma: encarregados + directores + docentes de horário
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_event_educators_scoped_multi(
  p_school_id uuid,
  p_classroom_ids uuid[],
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
  IF p_classroom_ids IS NULL OR array_length(p_classroom_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT u.recipient_id, p_title, p_description, p_link, p_category, p_school_id
  FROM (
    SELECT s.parent_id AS recipient_id
    FROM public.students s
    WHERE s.school_id = p_school_id
      AND s.classroom_id = ANY (p_classroom_ids)
      AND s.parent_id IS NOT NULL

    UNION

    SELECT c.homeroom_teacher_id AS recipient_id
    FROM public.classrooms c
    WHERE c.id = ANY (p_classroom_ids)
      AND c.school_id = p_school_id
      AND c.homeroom_teacher_id IS NOT NULL

    UNION

    SELECT sch.teacher_id AS recipient_id
    FROM public.schedules sch
    WHERE sch.classroom_id = ANY (p_classroom_ids)
      AND sch.school_id = p_school_id
      AND sch.teacher_id IS NOT NULL
  ) u
  INNER JOIN public.profiles pf ON pf.id = u.recipient_id
  WHERE pf.school_id = p_school_id
    AND COALESCE(pf.is_active, true) = true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Parser: lista de UUIDs de turmas após prefixo (students:/educators:)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_audience_classroom_uuid_array(p_audience text, p_prefix text)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  raw text := lower(trim(coalesce(p_audience, '')));
  pfx text := lower(trim(p_prefix));
  rest text;
  arr uuid[];
BEGIN
  IF pfx IS NULL OR pfx = '' OR position(pfx || ':' IN raw) <> 1 THEN
    RETURN NULL;
  END IF;
  rest := trim(substring(raw from (length(pfx) + 2)));
  SELECT coalesce(array_agg(DISTINCT z), ARRAY[]::uuid[])
  INTO arr
  FROM (
    SELECT trim(t.x)::uuid AS z
    FROM unnest(string_to_array(rest, ',')) AS t(x)
    WHERE trim(t.x) ~ '^[0-9a-fA-F\-]{36}$'
  ) q;
  IF arr IS NULL OR array_length(arr, 1) IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  RETURN arr;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) event_audience_student_ids (lista de alunos cobertos por público declarado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.event_audience_student_ids(p_school uuid, p_audience text)
RETURNS TABLE(student_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw text := trim(coalesce(p_audience, ''));
  cu text := upper(raw);
  lo text := lower(raw);
  m text[];
  v_classrooms uuid[];
BEGIN
  IF cu = 'STAFF' OR lo ~ '^educators:' THEN
    RETURN;
  END IF;

  IF raw = '' OR cu = 'ALL' THEN
    RETURN QUERY
      SELECT s.id FROM public.students s WHERE s.school_id = p_school;
    RETURN;
  END IF;

  IF lo ~ '^students:' THEN
    v_classrooms := public.event_audience_classroom_uuid_array(p_audience, 'students');
    IF v_classrooms IS NULL OR array_length(v_classrooms, 1) IS NULL THEN
      RETURN;
    END IF;
    RETURN QUERY
      SELECT s.id
      FROM public.students s
      WHERE s.school_id = p_school AND s.classroom_id = ANY (v_classrooms);
    RETURN;
  END IF;

  m := regexp_match(lo, '^classroom:([0-9a-f\-]{36})$');
  IF m IS NOT NULL THEN
    RETURN QUERY
      SELECT s.id
      FROM public.students s
      WHERE s.school_id = p_school
        AND s.classroom_id = (m[1])::uuid;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT s.id FROM public.students s WHERE s.school_id = p_school;
END;
$$;

REVOKE ALL ON FUNCTION public.event_audience_classroom_uuid_array(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.event_audience_classroom_uuid_array(text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Main trigger — audience routing + ignorar aniversários
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text := trim(coalesce(NEW.audience, ''));
  v_low text := lower(v_raw);
  v_up text := upper(v_raw);
  v_class uuid;
  v_fire boolean := false;
  v_title text;
  v_description text;
  v_match text[];
  v_ids uuid[];
  v_valid boolean;
BEGIN
  IF lower(coalesce(NEW.type, '')) = 'aniversario' THEN
    RETURN NEW;
  END IF;

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
    PERFORM public.notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
    RETURN NEW;
  END IF;

  IF v_up = 'STAFF' THEN
    PERFORM public.notify_event_school_staff(NEW.school_id, v_title, v_description, '/eventos', 'evento');
    RETURN NEW;
  END IF;

  IF v_low ~ '^students:' THEN
    v_ids := coalesce(public.event_audience_classroom_uuid_array(NEW.audience, 'students'), ARRAY[]::uuid[]);
    IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
      PERFORM public.notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
      RETURN NEW;
    END IF;
    SELECT NOT EXISTS (
        SELECT 1
        FROM unnest(v_ids) AS z(cid)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.classrooms c
            WHERE c.id = z.cid AND c.school_id = NEW.school_id
          )
      )
    INTO v_valid;
    IF v_valid THEN
      PERFORM public.notify_event_students_audience_wide(
        NEW.school_id,
        v_title,
        v_description,
        '/eventos',
        'evento'
      );
    ELSE
      PERFORM public.notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
    END IF;
    RETURN NEW;
  END IF;

  IF v_low ~ '^educators:' THEN
    v_ids := coalesce(public.event_audience_classroom_uuid_array(NEW.audience, 'educators'), ARRAY[]::uuid[]);
    IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
      PERFORM public.notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
      RETURN NEW;
    END IF;
    SELECT NOT EXISTS (
        SELECT 1
        FROM unnest(v_ids) AS z(cid)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.classrooms c
            WHERE c.id = z.cid AND c.school_id = NEW.school_id
          )
      )
    INTO v_valid;
    IF v_valid THEN
      PERFORM public.notify_event_educators_scoped_multi(
        NEW.school_id,
        v_ids,
        v_title,
        v_description,
        '/eventos',
        'evento'
      );
    ELSE
      PERFORM public.notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
    END IF;
    RETURN NEW;
  END IF;

  v_match := regexp_match(v_low, '^classroom:([0-9a-f\-]{36})$');
  IF v_match IS NOT NULL THEN
    v_class := (v_match[1])::uuid;
    IF EXISTS (
      SELECT 1 FROM public.classrooms c
      WHERE c.id = v_class AND c.school_id = NEW.school_id
    ) THEN
      PERFORM public.notify_event_classroom_recipients(
        v_class,
        NEW.school_id,
        v_title,
        v_description,
        '/eventos',
        'evento'
      );
    ELSE
      PERFORM public.notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.notify_all_users(NEW.school_id, v_title, v_description, '/eventos', 'evento');
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Lembretes agendados: não enviar mail/push tipo aniversário
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    AND COALESCE(lower(e.type), '') <> 'aniversario'
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id    = p.id
        AND n.title           = '📅 Evento Amanhã: ' || e.title
        AND n.created_at::date = CURRENT_DATE
    );

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
    AND COALESCE(lower(e.type), '') <> 'aniversario'
    AND COALESCE(p.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.recipient_id    = p.id
        AND n.title           = '🎉 Evento Hoje: ' || e.title
        AND n.created_at::date = CURRENT_DATE
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Docentes e alunos podem marcar presença de aluno (público Com alunos)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teacher upserts RSVP for classroom students"
  ON public.event_student_rsvp;
CREATE POLICY "Teacher upserts RSVP for classroom students"
  ON public.event_student_rsvp FOR INSERT TO authenticated
  WITH CHECK (
    public.get_auth_role()::text = 'TEACHER'
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.school_id = public.get_my_school())
    AND EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.id = student_id
        AND st.school_id = public.get_my_school()
        AND (
          EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = st.classroom_id
              AND c.homeroom_teacher_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.classroom_id = st.classroom_id
              AND sch.school_id = st.school_id
              AND sch.teacher_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Teacher updates RSVP for classroom students"
  ON public.event_student_rsvp;
CREATE POLICY "Teacher updates RSVP for classroom students"
  ON public.event_student_rsvp FOR UPDATE TO authenticated
  USING (
    public.get_auth_role()::text = 'TEACHER'
    AND EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.id = student_id
        AND (
          EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = st.classroom_id
              AND c.homeroom_teacher_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.classroom_id = st.classroom_id
              AND sch.school_id = st.school_id
              AND sch.teacher_id = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    public.get_auth_role()::text = 'TEACHER'
    AND EXISTS (
      SELECT 1
      FROM public.students st
      WHERE st.id = student_id
        AND (
          EXISTS (
            SELECT 1 FROM public.classrooms c
            WHERE c.id = st.classroom_id
              AND c.homeroom_teacher_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.schedules sch
            WHERE sch.classroom_id = st.classroom_id
              AND sch.school_id = st.school_id
              AND sch.teacher_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Student upserts own RSVP"
  ON public.event_student_rsvp;
CREATE POLICY "Student upserts own RSVP"
  ON public.event_student_rsvp FOR INSERT TO authenticated
  WITH CHECK (
    public.get_auth_role()::text = 'STUDENT'
    AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.school_id = public.get_my_school())
    AND EXISTS (
      SELECT 1 FROM public.students st
      WHERE st.id = student_id AND st.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Student updates own RSVP"
  ON public.event_student_rsvp;
CREATE POLICY "Student updates own RSVP"
  ON public.event_student_rsvp FOR UPDATE TO authenticated
  USING (
    public.get_auth_role()::text = 'STUDENT'
    AND EXISTS (SELECT 1 FROM public.students st WHERE st.id = student_id AND st.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.students st WHERE st.id = student_id AND st.user_id = auth.uid())
  );
