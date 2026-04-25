-- Reclamações (queixas/ocorrências) sobre alunos, professores ou funcionários
CREATE TABLE public.complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('STUDENT','TEACHER','STAFF')),
  target_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  target_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'NORMAL' CHECK (severity IN ('LOW','NORMAL','HIGH')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaints_school ON public.complaints(school_id, created_at DESC);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- View: members of the same school can read complaints
CREATE POLICY "Complaints viewable by school members"
ON public.complaints FOR SELECT
TO authenticated
USING (school_id = public.get_my_school());

-- Insert: any authenticated user from the same school can create a complaint for that school
CREATE POLICY "School members can create complaints"
ON public.complaints FOR INSERT
TO authenticated
WITH CHECK (school_id = public.get_my_school() AND reporter_id = auth.uid());

-- Update: only admins from the school can change status / details
CREATE POLICY "Admins can update complaints"
ON public.complaints FOR UPDATE
TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

-- Delete: only admins from the school
CREATE POLICY "Admins can delete complaints"
ON public.complaints FOR DELETE
TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_complaints_updated_at
BEFORE UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();