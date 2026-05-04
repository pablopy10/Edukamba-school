-- Envio de push OneSignal em cada INSERT em public.notifications:
-- 1) Defina segredos da função (Dashboard → Edge Functions → secrets, ou CLI):
--    ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY (REST API Key do OneSignal; não use a chave do SDK web).
-- 2) Faça deploy da Edge Function notifications-push.
-- 3) Dashboard Supabase → Database → Webhooks → Create:
--    tabela public.notifications, evento INSERT, URL HTTPS:
--      https://<project-ref>.supabase.co/functions/v1/notifications-push
--    Método POST e cabeçalhos (como ao invocar a API REST do projeto):
--      Content-Type: application/json
--      apikey: <SUPABASE_SERVICE_ROLE_KEY>
--      Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
-- Opcional: defina na função o segredo NOTIFICATIONS_PUSH_WEBHOOK_SECRET e no webhook envie também:
--      x-notification-push-secret: <mesmo valor>
--
-- O utilizador deve estar com login no OneSignal com o mesmo id que recipient_id (Supabase auth user id).

SELECT 1;
