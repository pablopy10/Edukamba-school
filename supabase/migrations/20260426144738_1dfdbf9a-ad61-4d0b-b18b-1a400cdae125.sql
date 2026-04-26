CREATE TABLE public.extracurricular_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'academico',
  responsible TEXT,
  location TEXT,
  start_time TIME,
  end_time TIME,
  capacity INTEGER NOT NULL DEFAULT 20,
  description TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT true,
  weekdays INTEGER[] DEFAULT '{}'::integer[],
  start_date DATE,
  end_date DATE,
  single_date DATE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.extracurricular_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activities viewable by school members"
ON public.extracurricular_activities
FOR SELECT
TO authenticated
USING (school_id = get_my_school());

CREATE POLICY "Admins and teachers can insert activities"
ON public.extracurricular_activities
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = get_my_school()
  AND get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

CREATE POLICY "Admins and teachers can update activities"
ON public.extracurricular_activities
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

CREATE POLICY "Admins can delete activities"
ON public.extracurricular_activities
FOR DELETE
TO authenticated
USING (
  school_id = get_my_school()
  AND get_auth_role() = 'ADMIN'::user_role
);

CREATE TRIGGER update_extracurricular_activities_updated_at
BEFORE UPDATE ON public.extracurricular_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_extracurricular_school ON public.extracurricular_activities(school_id);