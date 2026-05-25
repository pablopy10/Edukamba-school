-- Push notifications: configurar Database Webhook no Dashboard do Supabase.
-- Tabela: public.notifications, Evento: INSERT
-- URL: https://mrjftwvygqoimexwgclm.supabase.co/functions/v1/notifications-push
-- Headers: Authorization: Bearer <SERVICE_ROLE_KEY>, apikey: <SERVICE_ROLE_KEY>, Content-Type: application/json
--
-- NOTA: supabase_functions.http_request não está disponível neste projecto.
-- O webhook DEVE ser configurado manualmente no Dashboard (Database → Webhooks).

-- Remover trigger que pode causar erro 500 se supabase_functions não existe
DROP TRIGGER IF EXISTS trg_notifications_push_webhook ON public.notifications;
DROP FUNCTION IF EXISTS public.tg_dispatch_notification_push();
