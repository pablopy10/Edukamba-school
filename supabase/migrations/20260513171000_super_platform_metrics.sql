-- =============================================================================
-- Super admin: SaaS métricas (MRR, engajamento, consumo placeholders), churn,
-- propostas (tracking email), política SELECT global em audit_logs.
-- =============================================================================

-- --- Schools: metadata SaaS facturação/contrato/consumo (placeholders ingestão futura)

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS saas_contract_number text,
  ADD COLUMN IF NOT EXISTS saas_billing_email text,
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamptz;

COMMENT ON COLUMN public.schools.saas_contract_number IS 'Referência do contrato Edukamba (uso interno / SUPER_ADMIN).';
COMMENT ON COLUMN public.schools.saas_billing_email IS 'Email de cobrança / financeiro opcional.';
COMMENT ON COLUMN public.schools.subscription_cancelled_at IS 'Data de cancelamento da subscrição (churn SaaS — preenchimento manual até automação).';

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS usage_brevo_emails_sent_mt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_proof_storage_bytes_estimate bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.schools.usage_brevo_emails_sent_mt IS 'Contagem mensal aproximada de emails enviados (Brevo) — atualizar manual ou job.';
COMMENT ON COLUMN public.schools.usage_proof_storage_bytes_estimate IS 'Armazenamento estimado para comprovativos (storage) por escola.';

-- --- Subscriptions: agrupador MRR (mensalidade plana por cliente)

ALTER TABLE public.saas_subscriptions
  ADD COLUMN IF NOT EXISTS monthly_recurring_amount numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.saas_subscriptions.monthly_recurring_amount IS 'Mensalidade plana SaaS (ex.: em Kz); soma sobre escolas pagadoras para MRR.';

-- --- Proposals: webhook Brevo pode preencher aberturas + id da mensagem

ALTER TABLE public.saas_sales_proposals
  ADD COLUMN IF NOT EXISTS brevo_message_id text,
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz;

COMMENT ON COLUMN public.saas_sales_proposals.email_opened_at IS 'Último open conhecido (webhook/email tracking Brevo, quando configurado).';
COMMENT ON COLUMN public.saas_sales_proposals.brevo_message_id IS 'ID devolvido pelo Brevo ao enviar; útil ligar aos eventos de tracking.';

-- --- Auditoria: SUPER_ADMIN lê todas as linhas da plataforma

DROP POLICY IF EXISTS "Super admin select all audit logs" ON public.audit_logs;
CREATE POLICY "Super admin select all audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.auth_is_platform_super_admin());

-- --- RPC alargada: lista de escolas com perfil SaaS/consolidado

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
       AND p.role NOT IN ('STUDENT'::public.user_role, 'PARENT'::public.user_role))
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

-- Métricas financeiras (visão SUPER_ADMIN — não confundir com receita tuition interna das escolas)

CREATE OR REPLACE FUNCTION public.platform_saas_finance_metrics()
RETURNS TABLE (
  mrr numeric,
  arr numeric,
  paying_schools bigint,
  avg_ltv_estimate numeric,
  churn_schools_30d bigint,
  churn_rate_pct numeric,
  avg_tenure_months numeric,
  computed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mrr numeric;
  v_paying bigint;
  v_churn bigint;
  v_ltv numeric;
  v_tenure numeric;
  v_pct numeric;
  v_den bigint;
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Acesso reservado a SUPER_ADMIN';
  END IF;

  v_ltv := 0;
  v_tenure := 0;

  SELECT COALESCE(sum(ss.monthly_recurring_amount), 0)::numeric
    INTO v_mrr
  FROM public.saas_subscriptions ss
  INNER JOIN public.schools s ON s.id = ss.school_id
  WHERE lower(trim(coalesce(ss.status::text, ''))) IN ('active')
    AND lower(trim(coalesce(s.subscription_status::text, ''))) = 'active';

  SELECT COUNT(*)::bigint
    INTO v_paying
  FROM public.schools s
  INNER JOIN public.saas_subscriptions ss ON ss.school_id = s.id
  WHERE lower(trim(coalesce(ss.status::text, ''))) IN ('active')
    AND lower(trim(coalesce(s.subscription_status::text, ''))) = 'active';

  SELECT COUNT(*)::bigint
    INTO v_churn
  FROM public.schools s
  WHERE s.subscription_cancelled_at IS NOT NULL
    AND s.subscription_cancelled_at >= (timezone('utc', now()) - interval '30 days');

  v_den := COALESCE(v_paying, 0) + COALESCE(v_churn, 0);
  IF v_den > 0 AND v_churn IS NOT NULL THEN
    v_pct := round((100::numeric * v_churn::numeric) / v_den::numeric, 2);
  ELSE
    v_pct := NULL;
  END IF;

  -- LTV aprox.: mensalidade * meses desde adesão (activos) — substituir quando houver modelo por escola churned.
  SELECT
    ROUND(COALESCE(
      AVG(
        COALESCE(ss.monthly_recurring_amount, 0) * GREATEST(
          extract(epoch FROM (timezone('utc', now())::timestamptz - COALESCE(s.created_at, timezone('utc', now())::timestamptz)))
            / (30.4375::numeric * 86400::numeric),
          1::numeric
        )
      ),
      0::numeric
    ), 2),
    ROUND(COALESCE(
      AVG(GREATEST(
        extract(epoch FROM (timezone('utc', now())::timestamptz - COALESCE(s.created_at, timezone('utc', now())::timestamptz)))
          / (30.4375::numeric * 86400::numeric),
        1::numeric
      )),
      0::numeric
    ), 2)
  INTO v_ltv, v_tenure
  FROM public.schools s
  INNER JOIN public.saas_subscriptions ss ON ss.school_id = s.id
  WHERE lower(trim(coalesce(ss.status::text, ''))) IN ('active')
    AND lower(trim(coalesce(s.subscription_status::text, ''))) = 'active'
    AND COALESCE(ss.monthly_recurring_amount, 0) > 0;

  RETURN QUERY
  SELECT
    COALESCE(v_mrr, 0)::numeric AS mrr,
    (COALESCE(v_mrr, 0) * 12)::numeric AS arr,
    COALESCE(v_paying, 0)::bigint AS paying_schools,
    COALESCE(v_ltv, 0)::numeric AS avg_ltv_estimate,
    COALESCE(v_churn, 0)::bigint AS churn_schools_30d,
    v_pct AS churn_rate_pct,
    COALESCE(v_tenure, 0)::numeric AS avg_tenure_months,
    timezone('utc', now()) AS computed_at;
END;
$$;

-- Engajamento agregado (DAU usa proxy últimas 24h via auth.users.last_sign_in_at)

CREATE OR REPLACE FUNCTION public.platform_saas_engagement_metrics()
RETURNS TABLE (
  schools_total bigint,
  students_roster bigint,
  parents_total bigint,
  staff_logins_24h bigint,
  parent_logins_24h bigint,
  proofs_validated_payments_mt bigint,
  invoice_proofs_marked_mt bigint,
  computed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_month_start timestamptz := date_trunc(
    'month',
    timezone('utc', now())
  );

BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Acesso reservado a SUPER_ADMIN';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::bigint FROM public.schools) AS schools_total,
    (SELECT count(*)::bigint FROM public.students) AS students_roster,
    (SELECT count(*)::bigint FROM public.profiles p
     WHERE p.role = 'PARENT'::public.user_role AND p.school_id IS NOT NULL) AS parents_total,
    COALESCE((SELECT COUNT(DISTINCT u.id)::bigint
              FROM auth.users u
              INNER JOIN public.profiles pr ON pr.id = u.id
              WHERE pr.role NOT IN ('STUDENT'::public.user_role, 'PARENT'::public.user_role)
                AND u.last_sign_in_at IS NOT NULL
                AND u.last_sign_in_at >= (timezone('utc', now()) - interval '24 hours')), 0::bigint),
    COALESCE((SELECT COUNT(DISTINCT u.id)::bigint
              FROM auth.users u
              INNER JOIN public.profiles pr ON pr.id = u.id
              WHERE pr.role = 'PARENT'::public.user_role
                AND u.last_sign_in_at IS NOT NULL
                AND u.last_sign_in_at >= (timezone('utc', now()) - interval '24 hours')), 0::bigint),
    COALESCE((SELECT COUNT(*)::bigint
              FROM public.payments pm
              WHERE pm.proof_url IS NOT NULL
                AND trim(lower(pm.status)) = 'validated'::text
                AND pm.validated_at IS NOT NULL
                AND pm.validated_at >= v_month_start), 0::bigint),
    COALESCE((SELECT COUNT(*)::bigint
              FROM public.school_invoices si
              WHERE si.proof_url IS NOT NULL
                AND si.submitted_at IS NOT NULL
                AND si.submitted_at >= v_month_start), 0::bigint),
    timezone('utc', now()) AS computed_at;
END;
$$;

-- Atualização segura dos campos de meta SaaS diretamente sobre schools

CREATE OR REPLACE FUNCTION public.platform_super_patch_school_saas_meta(_school_id uuid, _patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN';
  END IF;
  IF _school_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = _school_id) THEN
    RAISE EXCEPTION 'Escola inválida';
  END IF;

  UPDATE public.schools s
  SET
    saas_contract_number = CASE WHEN _patch ? 'saas_contract_number'
       THEN NULLIF(btrim((_patch ->> 'saas_contract_number')), '')
       ELSE s.saas_contract_number END,
    saas_billing_email = CASE WHEN _patch ? 'saas_billing_email'
       THEN NULLIF(btrim(lower((_patch ->> 'saas_billing_email'))), '')
       ELSE s.saas_billing_email END,
    usage_brevo_emails_sent_mt = CASE WHEN _patch ? 'usage_brevo_emails_sent_mt'
       THEN COALESCE((_patch ->> 'usage_brevo_emails_sent_mt')::integer, s.usage_brevo_emails_sent_mt)
       ELSE s.usage_brevo_emails_sent_mt END,
    usage_proof_storage_bytes_estimate = CASE WHEN _patch ? 'usage_proof_storage_bytes_estimate'
       THEN COALESCE((_patch ->> 'usage_proof_storage_bytes_estimate')::bigint, s.usage_proof_storage_bytes_estimate)
       ELSE s.usage_proof_storage_bytes_estimate END,
    subscription_cancelled_at = CASE WHEN _patch ? 'subscription_cancelled_at'
       THEN CASE
         WHEN COALESCE((_patch ->> 'subscription_cancelled_at'), '') = '' THEN NULL
         ELSE (_patch ->> 'subscription_cancelled_at')::timestamptz
       END
       ELSE s.subscription_cancelled_at END
  WHERE s.id = _school_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_super_set_subscription_mrr(_school_id uuid, _monthly_recurring_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Apenas SUPER_ADMIN';
  END IF;
  IF _school_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = _school_id) THEN
    RAISE EXCEPTION 'Escola inválida';
  END IF;

  UPDATE public.saas_subscriptions ss
  SET monthly_recurring_amount = COALESCE(_monthly_recurring_amount, 0)
  WHERE ss.school_id = _school_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem linha em saas_subscriptions para esta escola';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_saas_finance_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_saas_engagement_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_super_patch_school_saas_meta(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_super_set_subscription_mrr(uuid, numeric) TO authenticated;
