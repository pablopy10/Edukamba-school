
-- Revoke EXECUTE from anon and authenticated for notification helper/trigger functions.
-- They are only meant to be called internally by triggers (or by edge functions using service role).
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, uuid, text, text, text, text, uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_new_message() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_assessment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_enrollment() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_attendance() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_schedule() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_event() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_staff_absence() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_material_request() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_low_stock() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_grade() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_payment_validation() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_complaint() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_profile_active() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_expense() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_notify_school_invoice() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.run_daily_notifications() FROM anon, authenticated, public;
