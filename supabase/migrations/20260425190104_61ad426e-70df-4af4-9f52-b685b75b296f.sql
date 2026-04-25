-- Drop the recursive policy
DROP POLICY IF EXISTS "Profiles are viewable by members of the same school" ON public.profiles;

-- Recreate it using the SECURITY DEFINER helper function which bypasses RLS
CREATE POLICY "Profiles are viewable by members of the same school"
ON public.profiles
FOR SELECT
TO authenticated
USING (school_id IS NOT NULL AND school_id = public.get_my_school());