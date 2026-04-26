CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  role text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  check_in timestamptz,
  check_out timestamptz,
  hours_worked numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'em_curso',
  check_in_lat numeric,
  check_in_lng numeric,
  check_in_address text,
  check_out_lat numeric,
  check_out_lng numeric,
  check_out_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_school_date ON public.time_entries(school_id, date DESC);
CREATE INDEX idx_time_entries_profile ON public.time_entries(profile_id);
CREATE INDEX idx_time_entries_status ON public.time_entries(status);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Time entries viewable by school members"
ON public.time_entries
FOR SELECT
TO authenticated
USING (school_id = public.get_my_school());

CREATE POLICY "School members can insert time entries"
ON public.time_entries
FOR INSERT
TO authenticated
WITH CHECK (school_id = public.get_my_school());

CREATE POLICY "School members can update time entries"
ON public.time_entries
FOR UPDATE
TO authenticated
USING (school_id = public.get_my_school())
WITH CHECK (school_id = public.get_my_school());

CREATE POLICY "Admins can delete time entries"
ON public.time_entries
FOR DELETE
TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

CREATE TRIGGER update_time_entries_updated_at
BEFORE UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();