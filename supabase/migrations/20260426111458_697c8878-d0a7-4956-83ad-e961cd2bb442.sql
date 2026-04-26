-- Add status, classroom_id and school_id columns to attendance
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS status public.attendance_status NOT NULL DEFAULT 'PRESENT',
  ADD COLUMN IF NOT EXISTS classroom_id uuid,
  ADD COLUMN IF NOT EXISTS school_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Make notes nullable (already is) — ensure unique attendance per student per day
CREATE UNIQUE INDEX IF NOT EXISTS attendance_student_date_unique
  ON public.attendance (student_id, date);

CREATE INDEX IF NOT EXISTS attendance_school_date_idx
  ON public.attendance (school_id, date);

CREATE INDEX IF NOT EXISTS attendance_classroom_date_idx
  ON public.attendance (classroom_id, date);

-- Trigger to keep updated_at fresh
DROP TRIGGER IF EXISTS update_attendance_updated_at ON public.attendance;
CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Attendance viewable by school members" ON public.attendance;
DROP POLICY IF EXISTS "Admins and teachers can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins and teachers can update attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins and teachers can delete attendance" ON public.attendance;

-- View: any school member can view attendance for their school
CREATE POLICY "Attendance viewable by school members"
ON public.attendance FOR SELECT TO authenticated
USING (school_id = public.get_my_school());

-- Insert: admins and teachers within their school
CREATE POLICY "Admins and teachers can insert attendance"
ON public.attendance FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'TEACHER'::public.user_role)
);

-- Update: admins and teachers within their school
CREATE POLICY "Admins and teachers can update attendance"
ON public.attendance FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'TEACHER'::public.user_role)
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'TEACHER'::public.user_role)
);

-- Delete: admins and teachers within their school
CREATE POLICY "Admins and teachers can delete attendance"
ON public.attendance FOR DELETE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() IN ('ADMIN'::public.user_role, 'TEACHER'::public.user_role)
);