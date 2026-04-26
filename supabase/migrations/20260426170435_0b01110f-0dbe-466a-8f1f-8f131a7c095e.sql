-- ============= MATERIALS =============
CREATE TABLE public.materials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'papelaria',
  sku text,
  quantity integer NOT NULL DEFAULT 0,
  min_quantity integer NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  location text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Materials viewable by school members"
  ON public.materials FOR SELECT
  TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins can insert materials"
  ON public.materials FOR INSERT
  TO authenticated
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update materials"
  ON public.materials FOR UPDATE
  TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete materials"
  ON public.materials FOR DELETE
  TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE TRIGGER update_materials_updated_at
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_materials_school ON public.materials(school_id);
CREATE INDEX idx_materials_category ON public.materials(category);

-- ============= MATERIAL REQUESTS =============
CREATE TABLE public.material_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.materials(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'papelaria',
  quantity integer NOT NULL DEFAULT 1,
  requester_id uuid,
  teacher_name text,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  recipient text,
  description text,
  status text NOT NULL DEFAULT 'pendente',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Material requests viewable by school members"
  ON public.material_requests FOR SELECT
  TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Teachers and admins can create material requests"
  ON public.material_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = get_my_school()
    AND get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
  );

CREATE POLICY "Requester or admin can update material requests"
  ON public.material_requests FOR UPDATE
  TO authenticated
  USING (
    school_id = get_my_school()
    AND (
      get_auth_role() = 'ADMIN'::user_role
      OR (requester_id = auth.uid() AND status = 'pendente')
    )
  )
  WITH CHECK (
    school_id = get_my_school()
    AND (
      get_auth_role() = 'ADMIN'::user_role
      OR (requester_id = auth.uid() AND status = 'pendente')
    )
  );

CREATE POLICY "Requester or admin can delete material requests"
  ON public.material_requests FOR DELETE
  TO authenticated
  USING (
    school_id = get_my_school()
    AND (
      get_auth_role() = 'ADMIN'::user_role
      OR (requester_id = auth.uid() AND status = 'pendente')
    )
  );

CREATE TRIGGER update_material_requests_updated_at
  BEFORE UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_material_requests_school ON public.material_requests(school_id);
CREATE INDEX idx_material_requests_status ON public.material_requests(status);
CREATE INDEX idx_material_requests_requester ON public.material_requests(requester_id);