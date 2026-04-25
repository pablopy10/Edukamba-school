CREATE TABLE public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  employee_id TEXT,
  hire_date DATE,
  avatar_color TEXT DEFAULT 'blue',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_id, employee_id)
);

CREATE INDEX idx_teachers_school ON public.teachers(school_id);
CREATE INDEX idx_teachers_profile ON public.teachers(profile_id);

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers viewable by school members"
ON public.teachers FOR SELECT TO authenticated
USING (school_id = get_my_school());

CREATE POLICY "Admins can insert teachers"
ON public.teachers FOR INSERT TO authenticated
WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update teachers"
ON public.teachers FOR UPDATE TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete teachers"
ON public.teachers FOR DELETE TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE TRIGGER update_teachers_updated_at
BEFORE UPDATE ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();