-- ============================================================================
-- Super Admin: gestão segura da integração Vendus por escola
-- ============================================================================

-- Impede que admins institucionais alterem a API Key via UPDATE directo
CREATE OR REPLACE FUNCTION public.protect_schools_vendus_api_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    NEW.vendus_api_key := OLD.vendus_api_key;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_schools_vendus_api_key ON public.schools;
CREATE TRIGGER trg_protect_schools_vendus_api_key
BEFORE UPDATE ON public.schools
FOR EACH ROW
WHEN (OLD.vendus_api_key IS DISTINCT FROM NEW.vendus_api_key)
EXECUTE FUNCTION public.protect_schools_vendus_api_key();

-- Leitura mascarada (SUPER_ADMIN)
CREATE OR REPLACE FUNCTION public.platform_super_get_school_vendus_config(_school_id uuid)
RETURNS TABLE (
  usa_faturacao_externa boolean,
  vendus_configured boolean,
  vendus_api_key_masked text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN';
  END IF;
  IF _school_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = _school_id) THEN
    RAISE EXCEPTION 'Escola inválida';
  END IF;

  SELECT s.usa_faturacao_externa, NULLIF(btrim(s.vendus_api_key), '')
    INTO usa_faturacao_externa, v_key
  FROM public.schools s
  WHERE s.id = _school_id;

  vendus_configured := v_key IS NOT NULL;
  vendus_api_key_masked := CASE
    WHEN v_key IS NULL THEN NULL
    WHEN length(v_key) <= 8 THEN repeat('*', length(v_key))
    ELSE repeat('*', greatest(length(v_key) - 4, 4)) || right(v_key, 4)
  END;

  RETURN NEXT;
END;
$$;

-- Gravação segura (SUPER_ADMIN)
CREATE OR REPLACE FUNCTION public.platform_super_set_school_vendus_config(_school_id uuid, _patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN';
  END IF;
  IF _school_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = _school_id) THEN
    RAISE EXCEPTION 'Escola inválida';
  END IF;

  UPDATE public.schools s
  SET
    usa_faturacao_externa = CASE
      WHEN _patch ? 'usa_faturacao_externa'
      THEN COALESCE((_patch ->> 'usa_faturacao_externa')::boolean, s.usa_faturacao_externa)
      ELSE s.usa_faturacao_externa
    END,
    vendus_api_key = CASE
      WHEN _patch ? 'vendus_api_key' THEN
        CASE
          WHEN COALESCE(btrim(_patch ->> 'vendus_api_key'), '') = '' THEN NULL
          ELSE btrim(_patch ->> 'vendus_api_key')
        END
      ELSE s.vendus_api_key
    END
  WHERE s.id = _school_id;

  SELECT NULLIF(btrim(s.vendus_api_key), '') INTO v_key
  FROM public.schools s WHERE s.id = _school_id;

  IF v_key IS NOT NULL AND NOT (
    SELECT COALESCE(s2.usa_faturacao_externa, false) FROM public.schools s2 WHERE s2.id = _school_id
  ) THEN
    UPDATE public.schools SET usa_faturacao_externa = true WHERE id = _school_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_super_get_school_vendus_config(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_super_set_school_vendus_config(uuid, jsonb) TO authenticated;

-- Lista de escolas: indicador Vendus
DROP FUNCTION IF EXISTS public.platform_saas_list_schools_with_counts();

CREATE OR REPLACE FUNCTION public.platform_saas_list_schools_with_counts()
RETURNS TABLE (
  school_id uuid,
  school_name text,
  subscription_status text,
  nif text,
  address text,
  created_at timestamptz,
  saas_contract_number text,
  saas_billing_email text,
  monthly_recurring_amount numeric,
  usage_brevo_emails_sent_mt integer,
  usage_proof_storage_bytes_estimate bigint,
  student_count bigint,
  staff_count bigint,
  usa_faturacao_externa boolean,
  vendus_configured boolean
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
    s.nif,
    s.address,
    s.created_at,
    s.saas_contract_number,
    s.saas_billing_email,
    COALESCE(ss.monthly_recurring_amount, 0)::numeric,
    COALESCE(s.usage_brevo_emails_sent_mt, 0),
    COALESCE(s.usage_proof_storage_bytes_estimate, 0)::bigint,
    (SELECT count(*)::bigint FROM public.students st WHERE st.school_id = s.id),
    (SELECT count(*)::bigint FROM public.profiles p
     WHERE p.school_id = s.id
       AND p.role IS NOT NULL
       AND p.role NOT IN ('STUDENT'::public.user_role, 'PARENT'::public.user_role)),
    COALESCE(s.usa_faturacao_externa, false),
    (NULLIF(btrim(s.vendus_api_key), '') IS NOT NULL)
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT ss2.*
    FROM public.saas_subscriptions ss2
    WHERE ss2.school_id = s.id
    ORDER BY ss2.id
    LIMIT 1
  ) ss ON true
  ORDER BY s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_saas_list_schools_with_counts() TO authenticated;
