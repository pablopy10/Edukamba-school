-- =============================================================================
-- Enrich parent-facing notification messages with student name, turma,
-- disciplina (where applicable), date and school name.
-- Bold is not possible in plain push text, but the notification title (headings)
-- is rendered in bold by default on mobile devices. Key fields are clearly
-- labelled and separated by line breaks in the body.
-- =============================================================================


-- =============================================================================
-- Helper: build a structured block for student-related notifications
-- Usage: select build_student_context(student_name, classroom_name, school_name, date_text, subject_name)
-- Returns something like:
--   Aluno: João Silva
--   Turma: 7.ª A
--   Disciplina: Matemática        (omitted when NULL)
--   Data: 06/05/2026              (omitted when NULL)
--   Escola: Escola ABC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.build_student_context(
  _student_name  text,
  _classroom     text DEFAULT NULL,
  _school        text DEFAULT NULL,
  _date_text     text DEFAULT NULL,
  _subject       text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  _lines text[] := ARRAY[]::text[];
BEGIN
  IF _student_name IS NOT NULL AND length(trim(_student_name)) > 0 THEN
    _lines := array_append(_lines, 'Aluno: ' || trim(_student_name));
  END IF;
  IF _classroom IS NOT NULL AND length(trim(_classroom)) > 0 THEN
    _lines := array_append(_lines, 'Turma: ' || trim(_classroom));
  END IF;
  IF _subject IS NOT NULL AND length(trim(_subject)) > 0 THEN
    _lines := array_append(_lines, 'Disciplina: ' || trim(_subject));
  END IF;
  IF _date_text IS NOT NULL AND length(trim(_date_text)) > 0 THEN
    _lines := array_append(_lines, 'Data: ' || trim(_date_text));
  END IF;
  IF _school IS NOT NULL AND length(trim(_school)) > 0 THEN
    _lines := array_append(_lines, 'Escola: ' || trim(_school));
  END IF;
  RETURN array_to_string(_lines, E'\n');
END;
$$;


-- =============================================================================
-- 1. ASSESSMENTS — notify each parent with student name, turma, disciplina, date, escola
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_assessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action         text;
  _subject_name   text;
  _classroom_name text;
  _school_name    text;
  _row            record;
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

  SELECT name INTO _subject_name   FROM public.subjects    WHERE id = NEW.subject_id;
  SELECT name INTO _classroom_name FROM public.classrooms  WHERE id = NEW.classroom_id;
  SELECT name INTO _school_name    FROM public.schools     WHERE id = NEW.school_id;

  FOR _row IN
    SELECT DISTINCT s.parent_id, s.full_name AS student_name
    FROM public.students s
    WHERE s.classroom_id = NEW.classroom_id AND s.parent_id IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      _row.parent_id,
      NEW.school_id,
      'academico',
      CASE _action
        WHEN 'criada'      THEN 'Nova avaliação marcada: ' || NEW.title
        WHEN 'atualizada'  THEN 'Avaliação atualizada: '   || NEW.title
        ELSE                    'Avaliação: '              || NEW.title
      END,
      public.build_student_context(
        _row.student_name,
        _classroom_name,
        _school_name,
        to_char(NEW.date, 'DD/MM/YYYY'),
        _subject_name
      ),
      '/avaliacoes', NULL, NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- trigger already exists from previous migration; replace the function is enough


-- =============================================================================
-- 2. GRADES — notify parent with student name, turma, disciplina, date, escola
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student        record;
  _assessment     record;
  _subject_name   text;
  _classroom_name text;
  _school_name    text;
BEGIN
  SELECT s.parent_id, s.full_name, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT a.title, a.date, a.subject_id INTO _assessment
  FROM public.assessments a WHERE a.id = NEW.assessment_id;

  SELECT name INTO _subject_name   FROM public.subjects   WHERE id = _assessment.subject_id;
  SELECT name INTO _classroom_name FROM public.classrooms WHERE id = _student.classroom_id;
  SELECT name INTO _school_name    FROM public.schools    WHERE id = _student.school_id;

  PERFORM public.notify_user(
    _student.parent_id,
    _student.school_id,
    'academico',
    'Nova nota atribuída' || COALESCE(' — ' || COALESCE(_assessment.title, 'Avaliação'), '') || ': ' || NEW.score::text,
    public.build_student_context(
      _student.full_name,
      _classroom_name,
      _school_name,
      CASE WHEN _assessment.date IS NOT NULL THEN to_char(_assessment.date, 'DD/MM/YYYY') ELSE NULL END,
      _subject_name
    ),
    '/avaliacoes', NULL, NULL
  );
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 3. ATTENDANCE (tg_notify_attendance) — called by trg_notify_attendance trigger
--    Notify parent with student name, turma, status, date, escola
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student        record;
  _classroom_name text;
  _school_name    text;
  _status_label   text;
BEGIN
  SELECT s.parent_id, s.full_name, s.school_id, s.classroom_id
  INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.parent_id IS NULL THEN RETURN NEW; END IF;

  _status_label := CASE NEW.status::text
    WHEN 'PRESENT'      THEN 'Presente'
    WHEN 'ABSENT'       THEN 'Falta'
    WHEN 'JUSTIFIED'    THEN 'Falta justificada'
    WHEN 'LATE'         THEN 'Atraso'
    WHEN 'DISCIPLINARY' THEN 'Ocorrência disciplinar'
    ELSE NEW.status::text
  END;

  SELECT name INTO _classroom_name FROM public.classrooms WHERE id = _student.classroom_id;
  SELECT name INTO _school_name    FROM public.schools    WHERE id = _student.school_id;

  PERFORM public.notify_user(
    _student.parent_id,
    _student.school_id,
    'academico',
    'Presença registada: ' || _status_label,
    public.build_student_context(
      _student.full_name,
      _classroom_name,
      _school_name,
      to_char(NEW.date, 'DD/MM/YYYY'),
      NULL
    ),
    '/presencas', NULL, NULL
  );
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 4. ATTENDANCE (trg_notify_attendance) — legacy function kept in sync
--    Only fires for negative statuses (LATE, ABSENT, DISCIPLINARY)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_notify_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id     uuid;
  v_student_name  text;
  v_classroom_id  uuid;
  v_classroom     text;
  v_school_name   text;
  v_status_pt     text;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NEW.status IN ('LATE', 'ABSENT', 'DISCIPLINARY') THEN
      v_status_pt := CASE NEW.status::text
        WHEN 'ABSENT'       THEN 'Falta'
        WHEN 'LATE'         THEN 'Atraso'
        WHEN 'DISCIPLINARY' THEN 'Ocorrência Disciplinar'
        ELSE NEW.status::text
      END;

      SELECT parent_id, full_name, classroom_id
      INTO v_parent_id, v_student_name, v_classroom_id
      FROM public.students WHERE id = NEW.student_id;

      IF v_parent_id IS NOT NULL THEN
        SELECT name INTO v_classroom  FROM public.classrooms WHERE id = v_classroom_id;
        SELECT name INTO v_school_name FROM public.schools   WHERE id = NEW.school_id;

        INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
        VALUES (
          v_parent_id,
          'Presença registada: ' || v_status_pt,
          public.build_student_context(
            v_student_name,
            v_classroom,
            v_school_name,
            TO_CHAR(NEW.date::date, 'DD/MM/YYYY'),
            NULL
          ),
          '/presencas',
          'presenca',
          NEW.school_id
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 5. ENROLLMENTS — notify parent with student name, turma, escola
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_notify_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student        record;
  _classroom_name text;
  _school_name    text;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN RETURN NEW; END IF;

  SELECT s.parent_id, s.full_name, s.school_id INTO _student
  FROM public.students s WHERE s.id = NEW.student_id;
  IF _student.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO _classroom_name FROM public.classrooms WHERE id = NEW.classroom_id;
  SELECT name INTO _school_name    FROM public.schools    WHERE id = _student.school_id;

  PERFORM public.notify_user(
    _student.parent_id,
    _student.school_id,
    'administrativo',
    'Matrícula aprovada',
    public.build_student_context(
      _student.full_name,
      _classroom_name,
      _school_name,
      to_char(now(), 'DD/MM/YYYY'),
      NULL
    ),
    '/matriculas', NULL, NULL
  );
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 6. DISCIPLINARY — notify parent with student name, turma, escola
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_notify_disciplinary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parent_id    uuid;
  v_student_name text;
  v_classroom_id uuid;
  v_classroom    text;
  v_school_name  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT parent_id, full_name, classroom_id
    INTO v_parent_id, v_student_name, v_classroom_id
    FROM public.students WHERE id = NEW.student_id;

    IF v_parent_id IS NOT NULL THEN
      SELECT name INTO v_classroom   FROM public.classrooms WHERE id = v_classroom_id;
      SELECT name INTO v_school_name FROM public.schools    WHERE id = NEW.school_id;

      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (
        v_parent_id,
        'Ocorrência disciplinar registada',
        public.build_student_context(
          v_student_name,
          v_classroom,
          v_school_name,
          TO_CHAR(now()::date, 'DD/MM/YYYY'),
          NULL
        ),
        '/presencas',
        'disciplina',
        NEW.school_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
