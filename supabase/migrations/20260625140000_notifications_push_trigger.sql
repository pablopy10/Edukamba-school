-- Push notifications são disparadas via Database Webhook (configurado no Dashboard Supabase).
-- Tabela: public.notifications, Evento: INSERT
-- URL: https://<project-ref>.supabase.co/functions/v1/notifications-push
-- Headers: Authorization: Bearer <SERVICE_ROLE_KEY>, apikey: <SERVICE_ROLE_KEY>
--
-- Se o webhook já está configurado no Dashboard, este ficheiro não faz nada adicional.
-- Se NÃO está configurado, criar via supabase_functions.http_request (trigger interno):

DO $$
BEGIN
  -- Verificar se a extensão supabase_functions existe (disponível em projectos Supabase hosted)
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'supabase_functions') THEN
    -- Criar trigger que usa o mecanismo interno de webhooks do Supabase
    DROP TRIGGER IF EXISTS trg_notifications_push_webhook ON public.notifications;
    CREATE TRIGGER trg_notifications_push_webhook
      AFTER INSERT ON public.notifications
      FOR EACH ROW
      EXECUTE FUNCTION supabase_functions.http_request(
        'notifications-push',
        'POST',
        '{"Content-Type":"application/json"}',
        '{}',
        '5000'
      );
  END IF;
END;
$$;
