-- Track which students brought the requested material.
CREATE TABLE public.material_request_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.material_requests(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,
  brought boolean NOT NULL DEFAULT false,
  marked_by uuid,
  marked_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (request_id, student_id)
);

CREATE INDEX idx_mrd_request ON public.material_request_deliveries(request_id);
CREATE INDEX idx_mrd_student ON public.material_request_deliveries(student_id);

ALTER TABLE public.material_request_deliveries ENABLE ROW LEVEL SECURITY;

-- View: school members of the same school. Parents only see deliveries for their own children.
CREATE POLICY "Deliveries viewable by school members"
ON public.material_request_deliveries
FOR SELECT
TO authenticated
USING (
  school_id = get_my_school()
  AND (
    get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
    OR student_id IN (SELECT s.id FROM public.students s WHERE s.parent_id = auth.uid())
  )
);

-- Insert: only ADMIN or TEACHER of same school
CREATE POLICY "Admins and teachers can insert deliveries"
ON public.material_request_deliveries
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = get_my_school()
  AND get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
);

-- Update: only ADMIN or TEACHER of same school
CREATE POLICY "Admins and teachers can update deliveries"
ON public.material_request_deliveries
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

-- Delete: ADMIN only
CREATE POLICY "Admins can delete deliveries"
ON public.material_request_deliveries
FOR DELETE
TO authenticated
USING (
  school_id = get_my_school()
  AND get_auth_role() = 'ADMIN'::user_role
);

CREATE TRIGGER trg_mrd_updated_at
BEFORE UPDATE ON public.material_request_deliveries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();