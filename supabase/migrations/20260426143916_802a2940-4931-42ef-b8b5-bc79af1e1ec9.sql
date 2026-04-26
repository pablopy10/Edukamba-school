-- Create events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'academico',
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  organizer TEXT,
  audience TEXT,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Events viewable by school members"
ON public.events
FOR SELECT
TO authenticated
USING (school_id = get_my_school());

CREATE POLICY "Admins and teachers can insert events"
ON public.events
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = get_my_school()
  AND get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

CREATE POLICY "Admins and teachers can update events"
ON public.events
FOR UPDATE
TO authenticated
USING (
  school_id = get_my_school()
  AND get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
)
WITH CHECK (
  school_id = get_my_school()
  AND get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

CREATE POLICY "Admins can delete events"
ON public.events
FOR DELETE
TO authenticated
USING (
  school_id = get_my_school()
  AND get_auth_role() = 'ADMIN'::user_role
);

-- Trigger for updated_at
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for date filtering
CREATE INDEX idx_events_school_date ON public.events(school_id, event_date);