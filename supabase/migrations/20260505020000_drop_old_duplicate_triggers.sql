-- Drop old notification triggers that were replaced by the consolidated triggers in 20260504205600_notifications_triggers.sql
-- The new triggers have slightly different names, causing both the old and new triggers to run simultaneously.

DROP TRIGGER IF EXISTS trg_notify_assessment ON public.assessments;
DROP TRIGGER IF EXISTS trg_notify_enrollment ON public.enrollments;
DROP TRIGGER IF EXISTS trg_notify_attendance ON public.attendance;
DROP TRIGGER IF EXISTS trg_notify_schedule ON public.schedules;
DROP TRIGGER IF EXISTS trg_notify_event ON public.events;
DROP TRIGGER IF EXISTS trg_notify_staff_absence ON public.staff_absences;
