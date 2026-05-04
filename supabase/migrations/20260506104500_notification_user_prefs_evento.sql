-- Preferências pessoais (Perfil): canais user_push, user_email, user_event_calendar
-- Respeitar "lembretes de eventos" = não criar linha para notificações escolares de calendário (category = evento).

CREATE OR REPLACE FUNCTION public.notification_user_pref_enabled(_user_id uuid, _channel text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT np.enabled
      FROM public.notification_preferences np
      WHERE np.user_id = _user_id
        AND np.channel = _channel
      LIMIT 1
    ),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.tg_notifications_respect_user_event_prefs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category = 'evento'
     AND NOT public.notification_user_pref_enabled(NEW.recipient_id, 'user_event_calendar')
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_respect_user_event_prefs ON public.notifications;
CREATE TRIGGER trg_notifications_respect_user_event_prefs
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notifications_respect_user_event_prefs();

REVOKE EXECUTE ON FUNCTION public.notification_user_pref_enabled(uuid, text) FROM PUBLIC, anon, authenticated;
