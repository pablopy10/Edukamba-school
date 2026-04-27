CREATE POLICY "Admins can delete academic years"
ON public.academic_years
FOR DELETE
TO authenticated
USING (
  school_id = get_my_school()
  AND get_auth_role() IN ('ADMIN'::user_role, 'SUPER_ADMIN'::user_role)
);