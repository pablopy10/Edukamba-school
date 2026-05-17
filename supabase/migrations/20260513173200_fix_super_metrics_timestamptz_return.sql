-- Corrige erro 42P07/42804: "structure of query does not match function result type"
-- Causa: timezone('utc', now()) devolve timestamp (sem tz), não timestamptz → RETURN QUERY não coincide com RETURNS TABLE.
-- Aplicar em bases que já correram 20260513171000 com a versão antiga.

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
    AND s.subscription_cancelled_at >= (now() - interval '30 days');

  v_den := COALESCE(v_paying, 0) + COALESCE(v_churn, 0);
  IF v_den > 0 AND v_churn IS NOT NULL THEN
    v_pct := round((100::numeric * v_churn::numeric) / v_den::numeric, 2);
  ELSE
    v_pct := NULL;
  END IF;

  SELECT
    ROUND(COALESCE(
      AVG(
        COALESCE(ss.monthly_recurring_amount, 0) * GREATEST(
          extract(epoch FROM (now() - COALESCE(s.created_at, now())))
            / (30.4375::numeric * 86400::numeric),
          1::numeric
        )
      ),
      0::numeric
    ), 2),
    ROUND(COALESCE(
      AVG(GREATEST(
        extract(epoch FROM (now() - COALESCE(s.created_at, now())))
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
    now() AS computed_at;
END;
$$;

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
  v_month_start timestamptz;
BEGIN
  IF NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Acesso reservado a SUPER_ADMIN';
  END IF;

  v_month_start :=
    (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'utc') AT TIME ZONE 'utc');

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
                AND u.last_sign_in_at >= (now() - interval '24 hours')), 0::bigint),
    COALESCE((SELECT COUNT(DISTINCT u.id)::bigint
              FROM auth.users u
              INNER JOIN public.profiles pr ON pr.id = u.id
              WHERE pr.role = 'PARENT'::public.user_role
                AND u.last_sign_in_at IS NOT NULL
                AND u.last_sign_in_at >= (now() - interval '24 hours')), 0::bigint),
    COALESCE((SELECT COUNT(*)::bigint
              FROM public.payments pm
              WHERE pm.proof_url IS NOT NULL
                AND trim(lower(pm.status::text)) = 'validated'::text
                AND pm.validated_at IS NOT NULL
                AND pm.validated_at >= v_month_start), 0::bigint),
    COALESCE((SELECT COUNT(*)::bigint
              FROM public.school_invoices si
              WHERE si.proof_url IS NOT NULL
                AND si.submitted_at IS NOT NULL
                AND si.submitted_at >= v_month_start), 0::bigint),
    now() AS computed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_saas_finance_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_saas_engagement_metrics() TO authenticated;
