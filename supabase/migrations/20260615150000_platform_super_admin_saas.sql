-- ============================================
-- Super admin: impersonation context, hardened admin RLS,
-- platform module locks, SaaS CRM leads & proposals RPCs.
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS support_context_school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_support_context_school_id_idx
  ON public.profiles (support_context_school_id)
  WHERE support_context_school_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.support_context_school_id IS
  'Quando preenchido por um SUPER_ADMIN, get_my_school() aponta para esta escola — suporte/impersonação técnica (RLS alinhada com ADMIN).';

-- --- Core RLS helpers (order matters: get_identity_role first) ---

CREATE OR REPLACE FUNCTION public.get_identity_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
    'STUDENT'::public.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_school()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.support_context_school_id, p.school_id)
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

-- Policies that check get_auth_role() = 'ADMIN' still work: super em contexto conta como ADMIN.
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role = 'SUPER_ADMIN'::public.user_role
     AND p.support_context_school_id IS NOT NULL
    THEN 'ADMIN'::public.user_role
    ELSE COALESCE(p.role, 'STUDENT'::public.user_role)
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

-- SUPER_ADMIN sem contexto deixa de ter privilégios de "gestor" em todas as linhas (fecha buraco USING só auth_is).
CREATE OR REPLACE FUNCTION public.auth_is_school_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      CASE
        WHEN p.role = 'SUPER_ADMIN'::public.user_role THEN p.support_context_school_id IS NOT NULL
        ELSE p.role = ANY (
          ARRAY[
            'ADMIN'::public.user_role,
            'DIRECTOR'::public.user_role,
            'SECRETARY'::public.user_role,
            'TREASURER'::public.user_role,
            'LIBRARIAN'::public.user_role,
            'STOCK_MANAGER'::public.user_role,
            'RECEPTIONIST'::public.user_role
          ]
        )
      END
    FROM public.profiles p
    WHERE p.id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.auth_is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_identity_role() = 'SUPER_ADMIN'::public.user_role;
$$;

DROP POLICY IF EXISTS "Schools selectable by platform super admins" ON public.schools;
CREATE POLICY "Schools selectable by platform super admins"
ON public.schools
FOR SELECT
TO authenticated
USING (public.auth_is_platform_super_admin());

-- --- Platform module locks (empresa desactiva módulos; escola não pode reverter sozinha) ---

CREATE TABLE IF NOT EXISTS public.saas_platform_module_locks (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  disabled_at timestamptz NOT NULL DEFAULT now(),
  disabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (school_id, module_key)
);

CREATE INDEX IF NOT EXISTS saas_platform_module_locks_school_idx
  ON public.saas_platform_module_locks (school_id);

ALTER TABLE public.saas_platform_module_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School staff read platform module locks" ON public.saas_platform_module_locks;
CREATE POLICY "School staff read platform module locks"
ON public.saas_platform_module_locks
FOR SELECT
TO authenticated
USING (school_id = public.get_my_school());

DROP POLICY IF EXISTS "Super admin manage platform module locks" ON public.saas_platform_module_locks;
CREATE POLICY "Super admin manage platform module locks"
ON public.saas_platform_module_locks
FOR ALL
TO authenticated
USING (public.auth_is_platform_super_admin())
WITH CHECK (public.auth_is_platform_super_admin());

-- --- CRM: assignable comerciais (expandido depois) ---

CREATE TABLE IF NOT EXISTS public.saas_crm_assignable_profiles (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saas_crm_assignable_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin read crm assignable" ON public.saas_crm_assignable_profiles;
CREATE POLICY "Super admin read crm assignable"
ON public.saas_crm_assignable_profiles
FOR SELECT
TO authenticated
USING (public.auth_is_platform_super_admin());

DROP POLICY IF EXISTS "Super admin manage crm assignable" ON public.saas_crm_assignable_profiles;
CREATE POLICY "Super admin manage crm assignable"
ON public.saas_crm_assignable_profiles
FOR ALL
TO authenticated
USING (public.auth_is_platform_super_admin())
WITH CHECK (public.auth_is_platform_super_admin());

-- --- Leads ---

CREATE TABLE IF NOT EXISTS public.saas_sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name text NOT NULL,
  contact_name text,
  contact_email text,
  phone text,
  pipeline_stage text NOT NULL DEFAULT 'new'
    CHECK (pipeline_stage IN ('new','contacted','qualified','proposal','won','lost')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  estimated_seats integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saas_sales_leads_stage_idx ON public.saas_sales_leads (pipeline_stage);
CREATE INDEX IF NOT EXISTS saas_sales_leads_assigned_idx ON public.saas_sales_leads (assigned_to);

ALTER TABLE public.saas_sales_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manage leads" ON public.saas_sales_leads;
CREATE POLICY "Super admin manage leads"
ON public.saas_sales_leads
FOR ALL
TO authenticated
USING (public.auth_is_platform_super_admin())
WITH CHECK (public.auth_is_platform_super_admin());

-- --- Propostas ---

CREATE TABLE IF NOT EXISTS public.saas_sales_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.saas_sales_leads(id) ON DELETE SET NULL,
  recipient_email text,
  title text NOT NULL,
  summary text,
  body_text text NOT NULL DEFAULT '',
  amount_estimate numeric,
  currency text NOT NULL DEFAULT 'AOA',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  pdf_storage_url text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.saas_sales_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manage proposals" ON public.saas_sales_proposals;
CREATE POLICY "Super admin manage proposals"
ON public.saas_sales_proposals
FOR ALL
TO authenticated
USING (public.auth_is_platform_super_admin())
WITH CHECK (public.auth_is_platform_super_admin());

-- --- RPCs ---

CREATE OR REPLACE FUNCTION public.platform_super_set_support_context(_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN';
  END IF;
  IF _school_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = _school_id) THEN
    RAISE EXCEPTION 'Escola inválida';
  END IF;
  UPDATE public.profiles
  SET support_context_school_id = _school_id
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_super_clear_support_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN';
  END IF;
  UPDATE public.profiles
  SET support_context_school_id = NULL
  WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_module_lock(_school_id uuid, _module_key text, _locked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN';
  END IF;
  IF _school_id IS NULL OR LENGTH(TRIM(COALESCE(_module_key,''))) < 1 THEN
    RAISE EXCEPTION 'Argumentos inválidos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = _school_id) THEN
    RAISE EXCEPTION 'Escola inválida';
  END IF;

  IF _locked THEN
    INSERT INTO public.saas_platform_module_locks (school_id, module_key, disabled_by)
    VALUES (_school_id, TRIM(_module_key), auth.uid())
    ON CONFLICT (school_id, module_key) DO UPDATE SET
      disabled_at = now(),
      disabled_by = excluded.disabled_by;
  ELSE
    DELETE FROM public.saas_platform_module_locks
    WHERE school_id = _school_id AND module_key = TRIM(_module_key);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_saas_dashboard_overview()
RETURNS TABLE (
  total_schools bigint,
  active_schools bigint,
  total_student_profiles bigint,
  total_staff_profiles bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Acesso reservado a SUPER_ADMIN';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT count(*)::bigint FROM public.schools),
    (SELECT count(*)::bigint FROM public.schools s WHERE s.subscription_status IN ('active','trialing')),
    (SELECT count(*)::bigint FROM public.profiles p WHERE p.role = 'STUDENT'::public.user_role),
    (SELECT count(*)::bigint FROM public.profiles p
     WHERE p.role IS NOT NULL
       AND p.role NOT IN ('STUDENT'::public.user_role, 'PARENT'::public.user_role));
END;
$$;

DROP FUNCTION IF EXISTS public.platform_saas_list_schools_with_counts();
CREATE OR REPLACE FUNCTION public.platform_saas_list_schools_with_counts()
RETURNS TABLE (
  school_id uuid,
  school_name text,
  subscription_status text,
  student_count bigint,
  staff_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Acesso reservado a SUPER_ADMIN';
  END IF;
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    COALESCE(s.subscription_status::text, ''),
    (SELECT count(*)::bigint FROM public.students st WHERE st.school_id = s.id),
    (SELECT count(*)::bigint FROM public.profiles p
     WHERE p.school_id = s.id
       AND p.role IS NOT NULL
       AND p.role NOT IN ('STUDENT'::public.user_role, 'PARENT'::public.user_role))
  FROM public.schools s
  ORDER BY s.name;
END;
$$;

-- Auto: todo SUPER_ADMIN pode ser atribuído a leads (sem linhas na tabela = sem dropdown útil).
INSERT INTO public.saas_crm_assignable_profiles (profile_id)
SELECT p.id FROM public.profiles p
WHERE p.role = 'SUPER_ADMIN'::public.user_role
ON CONFLICT (profile_id) DO NOTHING;

-- PERFIL: SUPER_ADMIN pode consultar outros perfis (CRM: validação de UUID, assignações — RGPD apenas para contas da plataforma).
DROP POLICY IF EXISTS "Super admin read profiles lookup" ON public.profiles;
CREATE POLICY "Super admin read profiles lookup"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.auth_is_platform_super_admin());

