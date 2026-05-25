-- Trigger para garantir que push notifications são enviadas quando uma notificação é inserida.
-- Substitui a necessidade de configurar Database Webhook manualmente no Dashboard.
-- Usa pg_net para chamar a edge function notifications-push de forma assíncrona.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.tg_dispatch_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _service_key text;
BEGIN
  -- Apenas INSERT
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.recipient_id IS NULL OR NEW.title IS NULL THEN RETURN NEW; END IF;

  _url := current_setting('app.settings.supabase_url', true);
  _service_key := current_setting('app.settings.service_role_key', true);

  -- Se as settings não estão configuradas, tentar variáveis de ambiente
  IF _url IS NULL OR _url = '' THEN
    RETURN NEW; -- Não bloquear se pg_net não está configurado
  END IF;

  -- Disparar push de forma assíncrona (fire-and-forget)
  PERFORM net.http_post(
    url := _url || '/functions/v1/notifications-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key,
      'apikey', _service_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'record', jsonb_build_object(
        'id', NEW.id,
        'recipient_id', NEW.recipient_id,
        'title', NEW.title,
        'description', COALESCE(NEW.description, ''),
        'link', COALESCE(NEW.link, ''),
        'category', COALESCE(NEW.category, ''),
        'school_id', NEW.school_id
      )
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloquear a inserção da notificação por falha no push
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_notification_push ON public.notifications;
CREATE TRIGGER trg_dispatch_notification_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.tg_dispatch_notification_push();
