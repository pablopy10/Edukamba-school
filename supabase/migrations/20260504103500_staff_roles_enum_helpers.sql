-- Paperwork / non-teaching roles (school staff with admin-like RLS helpers).
-- Enum literals are added in 20260504103000_staff_roles_user_role_enum_values.sql (separate commit).

COMMENT ON TYPE public.user_role IS 'Includes school staff besides TEACHER; auth_is_school_admin() bundles management roles for RLS.';

-- True when the logged-in profile role is allowed to manage the school like ADMIN/SUPER_ADMIN.
CREATE OR REPLACE FUNCTION public.auth_is_school_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_auth_role(), 'STUDENT'::public.user_role) = ANY (
    ARRAY[
      'ADMIN'::public.user_role,
      'SUPER_ADMIN'::public.user_role,
      'DIRECTOR'::public.user_role,
      'SECRETARY'::public.user_role,
      'TREASURER'::public.user_role,
      'LIBRARIAN'::public.user_role,
      'STOCK_MANAGER'::public.user_role,
      'RECEPTIONIST'::public.user_role
    ]
  );
$$;

-- ADMIN-like staff plus teachers (replacing ADMIN+TEACHER IN (...) checks).
CREATE OR REPLACE FUNCTION public.auth_is_school_admin_or_teacher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_school_admin()
    OR COALESCE(public.get_auth_role(), 'STUDENT'::public.user_role) = 'TEACHER'::public.user_role;
$$;

-- Clone ADMIN permission rows for each new role so Definições › Permissões has defaults.
INSERT INTO public.role_permissions (school_id, role, module, can_read, can_write, can_delete)
SELECT rp.school_id, nv.r::public.user_role, rp.module, rp.can_read, rp.can_write, rp.can_delete
FROM public.role_permissions rp
CROSS JOIN (
  VALUES
    ('DIRECTOR'),
    ('SECRETARY'),
    ('TREASURER'),
    ('LIBRARIAN'),
    ('STOCK_MANAGER'),
    ('RECEPTIONIST')
) AS nv(r)
WHERE rp.role = 'ADMIN'::public.user_role
ON CONFLICT (school_id, role, module) DO NOTHING;
