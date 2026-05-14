-- Após inserir submissão de formulário de autorização (módulo), notificar a equipa administrativa da escola.
-- As linhas em `public.notifications` disparam email (webhook) e push (notifications-push / OneSignal).

CREATE OR REPLACE FUNCTION public.tg_notify_module_authorization_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tpl_title text;
  _module text;
  _student_name text;
  _link text;
  _desc text;
BEGIN
  SELECT t.title, t.module
  INTO _tpl_title, _module
  FROM public.module_authorization_templates t
  WHERE t.id = NEW.template_id;

  SELECT s.full_name INTO _student_name
  FROM public.students s
  WHERE s.id = NEW.student_id;

  _link := CASE COALESCE(_module, '')
    WHEN 'transport' THEN '/transportes?tab=autorizacoes'
    WHEN 'meal' THEN '/refeicoes?tab=autorizacoes'
    ELSE '/extracurriculares?tab=autorizacoes'
  END;

  _desc := format(
    'Formulário: %s — Aluno: %s.',
    COALESCE(NULLIF(trim(both from _tpl_title), ''), 'Autorização'),
    COALESCE(NULLIF(trim(both from _student_name), ''), '—')
  );

  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT
    id,
    'Nova submissão de autorização',
    _desc,
    _link,
    'MODULE_AUTHORIZATION',
    NEW.school_id
  FROM public.profiles
  WHERE school_id = NEW.school_id
    AND COALESCE(is_active, true) = true
    AND role::text = ANY (
      ARRAY[
        'ADMIN',
        'SUPER_ADMIN',
        'DIRECTOR',
        'SECRETARY',
        'TREASURER'
      ]
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_module_auth_submission ON public.module_authorization_submissions;
CREATE TRIGGER trg_notify_module_auth_submission
  AFTER INSERT ON public.module_authorization_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notify_module_authorization_submission();

COMMENT ON FUNCTION public.tg_notify_module_authorization_submission() IS
  'Notifica perfis administrativos da escola quando há nova submissão de autorização (push/email via notifications).';

REVOKE EXECUTE ON FUNCTION public.tg_notify_module_authorization_submission() FROM anon, authenticated, public;
