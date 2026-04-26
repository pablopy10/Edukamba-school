ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subjects viewable by school members"
ON public.subjects FOR SELECT TO authenticated
USING (school_id = get_my_school());

CREATE POLICY "Admins can insert subjects"
ON public.subjects FOR INSERT TO authenticated
WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update subjects"
ON public.subjects FOR UPDATE TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete subjects"
ON public.subjects FOR DELETE TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);