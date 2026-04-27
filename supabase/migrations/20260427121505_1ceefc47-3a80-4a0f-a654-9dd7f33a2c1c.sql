
-- 1. Add useful columns to audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS record_id uuid,
  ADD COLUMN IF NOT EXISTS user_full_name text;

CREATE INDEX IF NOT EXISTS idx_audit_logs_school_created ON public.audit_logs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON public.audit_logs (table_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record ON public.audit_logs (record_id);

-- 2. Enable RLS + policies on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs of their school" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs of their school"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- Inserts only via SECURITY DEFINER trigger function; block direct writes
DROP POLICY IF EXISTS "No direct inserts on audit_logs" ON public.audit_logs;
CREATE POLICY "No direct inserts on audit_logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "No updates on audit_logs" ON public.audit_logs;
CREATE POLICY "No updates on audit_logs"
  ON public.audit_logs FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "No deletes on audit_logs" ON public.audit_logs;
CREATE POLICY "No deletes on audit_logs"
  ON public.audit_logs FOR DELETE TO authenticated
  USING (false);

-- 3. Generic audit trigger function
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_name text;
  v_school_id uuid;
  v_record_id uuid;
  v_action text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_new := to_jsonb(NEW);
    v_old := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_new := to_jsonb(NEW);
    v_old := to_jsonb(OLD);
    -- Skip if nothing actually changed
    IF v_new = v_old THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old := to_jsonb(OLD);
    v_new := NULL;
  END IF;

  -- Resolve record id (most tables use 'id')
  BEGIN
    v_record_id := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_record_id := NULL;
  END;

  -- Resolve school_id from row, fallback to current user's school
  BEGIN
    v_school_id := COALESCE((v_new->>'school_id')::uuid, (v_old->>'school_id')::uuid);
  EXCEPTION WHEN OTHERS THEN
    v_school_id := NULL;
  END;
  IF v_school_id IS NULL AND v_user_id IS NOT NULL THEN
    SELECT school_id INTO v_school_id FROM public.profiles WHERE id = v_user_id;
  END IF;

  -- Resolve user full name
  IF v_user_id IS NOT NULL THEN
    SELECT full_name INTO v_user_name FROM public.profiles WHERE id = v_user_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_full_name, school_id, action, table_name, record_id, old_data, new_data, created_at
  ) VALUES (
    v_user_id, v_user_name, v_school_id, v_action, TG_TABLE_NAME, v_record_id, v_old, v_new, now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Helper to attach trigger
CREATE OR REPLACE FUNCTION public._ensure_audit_trigger(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_trg text := 'audit_trg_' || p_table;
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', v_trg, p_table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();',
    v_trg, p_table
  );
END;
$$;

-- 5. Attach triggers to all relevant tables (only those that exist)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Academic
    'students','teachers','guardians','classrooms','courses','subjects',
    'enrollments','academic_years','academic_terms','schedules','time_slots',
    'assessments','grades','attendance','events',
    'extracurricular_activities','extracurricular_enrollments',
    -- Financial
    'payments','student_fees','fee_rules','fee_categories','family_discount_rules',
    'activity_fees','transport_fees','expenses','recurring_expenses','expense_categories',
    -- Resources
    'materials','material_requests','transport_routes','transport_stops','transport_enrollments',
    -- Config
    'school_settings','schools'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      PERFORM public._ensure_audit_trigger(t);
    END IF;
  END LOOP;
END $$;

-- 6. Retention: monthly cleanup of logs older than 12 months
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.audit_logs WHERE created_at < (now() - INTERVAL '12 months');
$$;

-- Unschedule existing job if present, then schedule fresh
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-audit-logs-monthly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-audit-logs-monthly',
  '0 3 1 * *',
  $$ SELECT public.cleanup_old_audit_logs(); $$
);
