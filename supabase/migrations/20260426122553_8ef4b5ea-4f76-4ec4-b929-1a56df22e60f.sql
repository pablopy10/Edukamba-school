
-- 1) Add new columns to schedules
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room text,
  ADD COLUMN IF NOT EXISTS shift text CHECK (shift IN ('MORNING','AFTERNOON','EVENING')),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill school_id from classroom
UPDATE public.schedules s
SET school_id = c.school_id
FROM public.classrooms c
WHERE s.classroom_id = c.id AND s.school_id IS NULL;

-- 2) Enable RLS on schedules
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Schedules viewable by school members" ON public.schedules;
CREATE POLICY "Schedules viewable by school members"
  ON public.schedules FOR SELECT
  TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Admins can insert schedules" ON public.schedules;
CREATE POLICY "Admins can insert schedules"
  ON public.schedules FOR INSERT
  TO authenticated
  WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

DROP POLICY IF EXISTS "Admins can update schedules" ON public.schedules;
CREATE POLICY "Admins can update schedules"
  ON public.schedules FOR UPDATE
  TO authenticated
  USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
  WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

DROP POLICY IF EXISTS "Admins can delete schedules" ON public.schedules;
CREATE POLICY "Admins can delete schedules"
  ON public.schedules FOR DELETE
  TO authenticated
  USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

-- updated_at trigger
DROP TRIGGER IF EXISTS schedules_set_updated_at ON public.schedules;
CREATE TRIGGER schedules_set_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Conflict-detection trigger
CREATE OR REPLACE FUNCTION public.check_schedule_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflict_count int;
BEGIN
  -- Same classroom overlap
  SELECT COUNT(*) INTO conflict_count
  FROM public.schedules s
  WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND s.classroom_id = NEW.classroom_id
    AND s.day_of_week = NEW.day_of_week
    AND s.start_time < NEW.end_time
    AND s.end_time > NEW.start_time;
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Conflito: a turma já tem uma aula neste horário.' USING ERRCODE = 'check_violation';
  END IF;

  -- Same teacher overlap
  IF NEW.teacher_id IS NOT NULL THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.schedules s
    WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.teacher_id = NEW.teacher_id
      AND s.day_of_week = NEW.day_of_week
      AND s.start_time < NEW.end_time
      AND s.end_time > NEW.start_time;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'Conflito: o professor já tem uma aula neste horário.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Same room overlap
  IF NEW.room IS NOT NULL AND length(trim(NEW.room)) > 0 THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.schedules s
    WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.school_id = NEW.school_id
      AND s.room = NEW.room
      AND s.day_of_week = NEW.day_of_week
      AND s.start_time < NEW.end_time
      AND s.end_time > NEW.start_time;
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'Conflito: a sala já está ocupada neste horário.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedules_conflict_check ON public.schedules;
CREATE TRIGGER schedules_conflict_check
  BEFORE INSERT OR UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.check_schedule_conflict();

-- 4) school_time_slots — configurable blocks per school/shift
CREATE TABLE IF NOT EXISTS public.school_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  shift text NOT NULL CHECK (shift IN ('MORNING','AFTERNOON','EVENING')),
  start_time time NOT NULL,
  end_time time NOT NULL,
  position int NOT NULL DEFAULT 0,
  is_break boolean NOT NULL DEFAULT false,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS school_time_slots_school_shift_idx
  ON public.school_time_slots (school_id, shift, position);

ALTER TABLE public.school_time_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Time slots viewable by school members" ON public.school_time_slots;
CREATE POLICY "Time slots viewable by school members"
  ON public.school_time_slots FOR SELECT
  TO authenticated
  USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Admins can insert time slots" ON public.school_time_slots;
CREATE POLICY "Admins can insert time slots"
  ON public.school_time_slots FOR INSERT
  TO authenticated
  WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

DROP POLICY IF EXISTS "Admins can update time slots" ON public.school_time_slots;
CREATE POLICY "Admins can update time slots"
  ON public.school_time_slots FOR UPDATE
  TO authenticated
  USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
  WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

DROP POLICY IF EXISTS "Admins can delete time slots" ON public.school_time_slots;
CREATE POLICY "Admins can delete time slots"
  ON public.school_time_slots FOR DELETE
  TO authenticated
  USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

-- Helper: seed default time slots for a school if none exist
CREATE OR REPLACE FUNCTION public.seed_default_time_slots(_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_time_slots WHERE school_id = _school_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.school_time_slots (school_id, shift, start_time, end_time, position, is_break, label) VALUES
    (_school_id, 'MORNING',  '07:30', '08:20', 1, false, 'Bloco 1'),
    (_school_id, 'MORNING',  '08:20', '09:10', 2, false, 'Bloco 2'),
    (_school_id, 'MORNING',  '09:10', '09:30', 3, true,  'Intervalo'),
    (_school_id, 'MORNING',  '09:30', '10:20', 4, false, 'Bloco 3'),
    (_school_id, 'MORNING',  '10:20', '11:10', 5, false, 'Bloco 4'),
    (_school_id, 'MORNING',  '11:10', '12:00', 6, false, 'Bloco 5'),
    (_school_id, 'AFTERNOON','13:00', '13:50', 1, false, 'Bloco 1'),
    (_school_id, 'AFTERNOON','13:50', '14:40', 2, false, 'Bloco 2'),
    (_school_id, 'AFTERNOON','14:40', '15:00', 3, true,  'Intervalo'),
    (_school_id, 'AFTERNOON','15:00', '15:50', 4, false, 'Bloco 3'),
    (_school_id, 'AFTERNOON','15:50', '16:40', 5, false, 'Bloco 4'),
    (_school_id, 'AFTERNOON','16:40', '17:30', 6, false, 'Bloco 5'),
    (_school_id, 'EVENING',  '18:30', '19:20', 1, false, 'Bloco 1'),
    (_school_id, 'EVENING',  '19:20', '20:10', 2, false, 'Bloco 2'),
    (_school_id, 'EVENING',  '20:10', '20:30', 3, true,  'Intervalo'),
    (_school_id, 'EVENING',  '20:30', '21:20', 4, false, 'Bloco 3'),
    (_school_id, 'EVENING',  '21:20', '22:10', 5, false, 'Bloco 4');
END;
$$;
