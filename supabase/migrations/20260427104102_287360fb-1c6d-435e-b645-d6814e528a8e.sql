
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Add late fee tracking column to student_fees
ALTER TABLE public.student_fees
  ADD COLUMN IF NOT EXISTS late_fee_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_fee_applied_at timestamptz;

-- ============================================================
-- Function: apply_monthly_late_fees
-- Iterates through all schools and applies late fees to overdue, unpaid student_fees
-- according to each school's settings. Idempotent: skips fees that already had a late fee applied.
-- School settings (in schools.settings JSONB):
--   late_fee_enabled (boolean) — default false
--   late_fee_type ('fixed' | 'percentage') — default 'fixed'
--   late_fee_value (numeric) — Kz when fixed, % when percentage
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_monthly_late_fees()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school RECORD;
  v_enabled boolean;
  v_type text;
  v_value numeric;
  v_total_schools integer := 0;
  v_total_fees integer := 0;
  v_school_count integer;
BEGIN
  FOR v_school IN
    SELECT id, settings FROM public.schools
  LOOP
    v_enabled := COALESCE((v_school.settings->>'late_fee_enabled')::boolean, false);
    IF NOT v_enabled THEN
      CONTINUE;
    END IF;

    v_type := COALESCE(v_school.settings->>'late_fee_type', 'fixed');
    v_value := COALESCE((v_school.settings->>'late_fee_value')::numeric, 0);

    IF v_value <= 0 THEN
      CONTINUE;
    END IF;

    v_total_schools := v_total_schools + 1;

    WITH updated AS (
      UPDATE public.student_fees sf
      SET
        late_fee_amount = CASE
          WHEN v_type = 'percentage' THEN ROUND(sf.amount_due * v_value / 100.0, 2)
          ELSE v_value
        END,
        late_fee_applied_at = now()
      FROM public.students s
      WHERE sf.student_id = s.id
        AND s.school_id = v_school.id
        AND sf.is_paid = false
        AND sf.due_date < CURRENT_DATE
        AND sf.late_fee_applied_at IS NULL
      RETURNING sf.id
    )
    SELECT count(*) INTO v_school_count FROM updated;

    v_total_fees := v_total_fees + v_school_count;
  END LOOP;

  RETURN jsonb_build_object(
    'schools_processed', v_total_schools,
    'fees_with_late_charge', v_total_fees,
    'run_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_monthly_late_fees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_monthly_late_fees() TO authenticated, service_role;

-- ============================================================
-- Function: notify_low_stock_materials
-- For each school, finds materials below their min_quantity threshold and
-- creates a notification for every admin of that school.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_low_stock_materials()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school RECORD;
  v_admin RECORD;
  v_low_count integer;
  v_items_text text;
  v_total_notifications integer := 0;
  v_total_schools integer := 0;
BEGIN
  FOR v_school IN
    SELECT DISTINCT m.school_id AS id
    FROM public.materials m
    WHERE m.school_id IS NOT NULL
      AND m.min_quantity > 0
      AND m.quantity < m.min_quantity
  LOOP
    SELECT
      count(*),
      string_agg(name || ' (' || quantity || '/' || min_quantity || ' ' || unit || ')', ', ' ORDER BY name)
    INTO v_low_count, v_items_text
    FROM public.materials
    WHERE school_id = v_school.id
      AND min_quantity > 0
      AND quantity < min_quantity;

    IF v_low_count = 0 THEN
      CONTINUE;
    END IF;

    v_total_schools := v_total_schools + 1;

    FOR v_admin IN
      SELECT id FROM public.profiles
      WHERE school_id = v_school.id
        AND role = 'ADMIN'
        AND is_active = true
    LOOP
      INSERT INTO public.notifications (
        school_id, recipient_id, category, title, description, link, status
      ) VALUES (
        v_school.id,
        v_admin.id,
        'sistema',
        'Stock baixo: ' || v_low_count || ' materiais',
        'Materiais abaixo do mínimo: ' || left(v_items_text, 500),
        '/material',
        'unread'
      );
      v_total_notifications := v_total_notifications + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'schools_with_low_stock', v_total_schools,
    'notifications_sent', v_total_notifications,
    'run_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_low_stock_materials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_low_stock_materials() TO authenticated, service_role;

-- ============================================================
-- Schedule cron jobs
-- ============================================================

-- Unschedule existing jobs if present (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('apply-monthly-late-fees');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('notify-low-stock-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Day 11 of every month at 03:00
SELECT cron.schedule(
  'apply-monthly-late-fees',
  '0 3 11 * *',
  $cron$ SELECT public.apply_monthly_late_fees(); $cron$
);

-- Every Monday at 08:00
SELECT cron.schedule(
  'notify-low-stock-weekly',
  '0 8 * * 1',
  $cron$ SELECT public.notify_low_stock_materials(); $cron$
);
