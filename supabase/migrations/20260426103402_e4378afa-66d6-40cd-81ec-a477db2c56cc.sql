-- Enable RLS on courses table and add policies
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Courses viewable by school members"
ON public.courses
FOR SELECT
TO authenticated
USING (school_id = get_my_school());

CREATE POLICY "Admins can insert courses"
ON public.courses
FOR INSERT
TO authenticated
WITH CHECK ((school_id = get_my_school()) AND (get_auth_role() = 'ADMIN'::user_role));

CREATE POLICY "Admins can update courses"
ON public.courses
FOR UPDATE
TO authenticated
USING ((school_id = get_my_school()) AND (get_auth_role() = 'ADMIN'::user_role));

CREATE POLICY "Admins can delete courses"
ON public.courses
FOR DELETE
TO authenticated
USING ((school_id = get_my_school()) AND (get_auth_role() = 'ADMIN'::user_role));

-- Add admin delete policy for classrooms (already has ALL via "Admins can manage classrooms" but let's ensure consistency)
-- It's already covered by the existing policy.