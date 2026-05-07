-- =============================================================================
-- v2 — document_requests notifications
-- Includes turma (classroom) and student name in notification description.
-- =============================================================================


-- =============================================================================
-- 1. Notify recipient (Educador) when a new document_request is created
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_notify_document_sign_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_title   text;
  v_doc_cat     text;
  v_school_id   uuid;
  v_student     text;
  v_classroom   text;
  v_title       text;
  v_desc        text;
BEGIN
  IF NEW.recipient_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT title, category, school_id
  INTO v_doc_title, v_doc_cat, v_school_id
  FROM public.documents
  WHERE id = NEW.document_id;

  IF NEW.student_id IS NOT NULL THEN
    SELECT full_name INTO v_student
    FROM public.students WHERE id = NEW.student_id;
  END IF;

  IF NEW.classroom_id IS NOT NULL THEN
    SELECT name INTO v_classroom
    FROM public.classrooms WHERE id = NEW.classroom_id;
  END IF;

  v_title := CASE v_doc_cat
    WHEN 'assinatura' THEN '✍️ Documento para assinar'
    WHEN 'formulario' THEN '📋 Formulário para preencher'
    ELSE                   '📄 Documento para ler'
  END;

  v_desc := 'A escola enviou-lhe o documento: "' || v_doc_title || '".'
    || CASE WHEN v_classroom IS NOT NULL THEN E'\nTurma: ' || v_classroom ELSE '' END
    || CASE WHEN v_student   IS NOT NULL THEN E'\nAluno: '   || v_student   ELSE '' END
    || E'\nAbra para ver e responder.';

  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  VALUES (
    NEW.recipient_profile_id,
    v_title,
    v_desc,
    '/documentos/assinar/' || NEW.id::text,
    'DOCUMENT_SIGN_REQUEST',
    v_school_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_sign_request_notify ON public.document_requests;
CREATE TRIGGER trg_document_sign_request_notify
AFTER INSERT ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION trg_notify_document_sign_request();


-- =============================================================================
-- 2. Notify document creator when a recipient signs / submits
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_notify_document_signed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_title  text;
  v_school_id  uuid;
  v_created_by uuid;
  v_signer     text;
  v_action     text;
  v_student    text;
  v_classroom  text;
BEGIN
  IF NOT (NEW.status IN ('signed', 'submitted') AND OLD.status = 'pending') THEN
    RETURN NEW;
  END IF;

  SELECT title, school_id, created_by
  INTO v_doc_title, v_school_id, v_created_by
  FROM public.documents
  WHERE id = NEW.document_id;

  IF v_created_by IS NULL THEN
    RETURN NEW;
  END IF;

  v_signer := COALESCE(NEW.signer_name, 'Um utilizador');
  v_action := CASE NEW.status WHEN 'signed' THEN 'assinou' ELSE 'submeteu' END;

  IF NEW.student_id IS NOT NULL THEN
    SELECT full_name INTO v_student FROM public.students WHERE id = NEW.student_id;
  END IF;

  IF NEW.classroom_id IS NOT NULL THEN
    SELECT name INTO v_classroom FROM public.classrooms WHERE id = NEW.classroom_id;
  END IF;

  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  VALUES (
    v_created_by,
    '✅ Documento ' || CASE NEW.status WHEN 'signed' THEN 'assinado' ELSE 'submetido' END || ': ' || v_doc_title,
    v_signer || ' ' || v_action || ' o documento "' || v_doc_title || '".'
      || CASE WHEN v_classroom IS NOT NULL THEN E'\nTurma: ' || v_classroom ELSE '' END
      || CASE WHEN v_student   IS NOT NULL THEN E'\nAluno: '   || v_student   ELSE '' END,
    '/documentos',
    'DOCUMENT_SIGNED',
    v_school_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_signed_notify ON public.document_requests;
CREATE TRIGGER trg_document_signed_notify
AFTER UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION trg_notify_document_signed();
