-- 1) Default Enterprise subscription for every newly created school (trial gives full access)
CREATE OR REPLACE FUNCTION public.tg_school_default_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.saas_subscriptions (school_id, plan_type, billing_cycle, status, price_per_student)
  VALUES (NEW.id, 'Enterprise', 'ANNUAL', 'ACTIVE', 1300)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_default_subscription ON public.schools;
CREATE TRIGGER schools_default_subscription
AFTER INSERT ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.tg_school_default_subscription();

-- 2) Backfill: ensure every existing school has a subscription. Schools currently in trial get Enterprise.
INSERT INTO public.saas_subscriptions (school_id, plan_type, billing_cycle, status, price_per_student)
SELECT s.id,
       CASE WHEN s.subscription_status = 'trialing' AND s.trial_ends_at > now() THEN 'Enterprise'
            ELSE 'Enterprise' END,
       'ANNUAL', 'ACTIVE', 1300
FROM public.schools s
WHERE NOT EXISTS (SELECT 1 FROM public.saas_subscriptions ss WHERE ss.school_id = s.id);

-- 3) Force trialing schools to Enterprise (so they have full access during trial)
UPDATE public.saas_subscriptions ss
SET plan_type = 'Enterprise', price_per_student = 1300
FROM public.schools s
WHERE ss.school_id = s.id
  AND s.subscription_status = 'trialing'
  AND s.trial_ends_at > now()
  AND ss.plan_type <> 'Enterprise';

-- 4) Block schools (non-admins via RLS already restricts) from changing plan_type directly.
-- Restrict UPDATE on saas_subscriptions to only allow billing_cycle changes; plan_type changes must come from service role.
DROP POLICY IF EXISTS "Admins can update saas_subscriptions" ON public.saas_subscriptions;
CREATE POLICY "Admins can update billing cycle only"
ON public.saas_subscriptions FOR UPDATE TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
WITH CHECK (
  school_id = get_my_school()
  AND get_auth_role() = 'ADMIN'::user_role
  AND plan_type = (SELECT plan_type FROM public.saas_subscriptions WHERE id = saas_subscriptions.id)
);

-- 5) Plan change requests log (so platform team has a record in addition to email)
CREATE TABLE IF NOT EXISTS public.plan_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  current_plan text,
  requested_plan text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admins can view their plan requests"
ON public.plan_change_requests FOR SELECT TO authenticated
USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "School admins can create plan requests"
ON public.plan_change_requests FOR INSERT TO authenticated
WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role AND requested_by = auth.uid());
