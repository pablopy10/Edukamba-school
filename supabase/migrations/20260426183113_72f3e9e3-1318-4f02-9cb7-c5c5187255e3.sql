
-- ============= 1. Allow admins to manage profiles in their school =============
CREATE POLICY "Admins can update profiles in their school"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

-- ============= 2. Block sign-in for inactive users via DB function (used by trigger on auth login is not possible; we keep client check + RLS via is_active) =============
-- Keep is_active flag; when false the user has no school view because RLS depends on get_my_school() but the user can still log in. Add guard: when profile is inactive, get_my_school returns NULL. (Achieved by selecting school_id only when active.)

CREATE OR REPLACE FUNCTION public.get_my_school()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_active, true) = true;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND COALESCE(is_active, true) = true;
$$;

-- ============= 3. Allow admins to update their school's academic_year =============
CREATE POLICY "Admins can update academic years"
ON public.academic_years
FOR UPDATE
TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

-- ============= 4. Role permissions table (per school + role) =============
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  module text NOT NULL,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, role, module)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role permissions viewable by school members"
ON public.role_permissions FOR SELECT TO authenticated
USING (school_id = public.get_my_school());

CREATE POLICY "Admins manage role permissions"
ON public.role_permissions FOR ALL TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

-- ============= 5. Per-user permission overrides =============
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_read boolean NOT NULL DEFAULT true,
  can_write boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User permissions viewable by self or admin"
ON public.user_permissions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
);

CREATE POLICY "Admins manage user permissions"
ON public.user_permissions FOR ALL TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);

-- ============= 6. Notification preferences (per user) =============
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notification prefs viewable by self or admin"
ON public.notification_preferences FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
);

CREATE POLICY "Self or admin can manage notification prefs"
ON public.notification_preferences FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role)
);

-- ============= 7. School invoices (platform billing - what the school owes Edukamba) =============
CREATE TABLE IF NOT EXISTS public.school_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AOA',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School invoices viewable by school admins"
ON public.school_invoices FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

-- ============= 8. Allow admins to update saas_subscriptions (billing_cycle) =============
CREATE POLICY "Admins view their subscription"
ON public.saas_subscriptions FOR SELECT TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE POLICY "Admins update their subscription cycle"
ON public.saas_subscriptions FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE POLICY "Admins insert their subscription"
ON public.saas_subscriptions FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

-- Update billing_cycle constraint values (semestral/annual)
ALTER TABLE public.saas_subscriptions
  ALTER COLUMN billing_cycle SET DEFAULT 'ANNUAL';

-- ============= 9. Auto-block inactive users at sign-in via auth hook is not available; we rely on client-side check + RLS returning no school. =============
