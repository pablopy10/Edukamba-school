-- 1. Make helper functions SECURITY DEFINER so they bypass RLS
CREATE OR REPLACE FUNCTION public.get_my_school()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 2. Rewrite schools policies to use helper functions
DROP POLICY IF EXISTS "Users can view their own school" ON public.schools;
CREATE POLICY "Users can view their own school"
ON public.schools
FOR SELECT
TO authenticated
USING (id = public.get_my_school());

DROP POLICY IF EXISTS "Admins can update their own school" ON public.schools;
CREATE POLICY "Admins can update their own school"
ON public.schools
FOR UPDATE
TO authenticated
USING (id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

DROP POLICY IF EXISTS "Users without a school can create one" ON public.schools;
CREATE POLICY "Users without a school can create one"
ON public.schools
FOR INSERT
TO authenticated
WITH CHECK (public.get_my_school() IS NULL);

-- 3. Rewrite academic_years policies
DROP POLICY IF EXISTS "School members can view academic years" ON public.academic_years;
CREATE POLICY "School members can view academic years"
ON public.academic_years
FOR SELECT
TO authenticated
USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Admins can create academic years for their school" ON public.academic_years;
CREATE POLICY "Admins can create academic years for their school"
ON public.academic_years
FOR INSERT
TO authenticated
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

-- 4. Rewrite classrooms policies similarly (they also query profiles directly)
DROP POLICY IF EXISTS "Admins can manage classrooms" ON public.classrooms;
CREATE POLICY "Admins can manage classrooms"
ON public.classrooms
FOR ALL
TO authenticated
USING (public.get_auth_role() = 'ADMIN'::public.user_role)
WITH CHECK (public.get_auth_role() = 'ADMIN'::public.user_role AND school_id = public.get_my_school());

DROP POLICY IF EXISTS "Classrooms viewable by school members" ON public.classrooms;
CREATE POLICY "Classrooms viewable by school members"
ON public.classrooms
FOR SELECT
TO authenticated
USING (school_id = public.get_my_school());