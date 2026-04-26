-- Add trial fields to schools
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing';

-- Backfill existing schools so they get a trial from their creation date
UPDATE public.schools
SET trial_started_at = COALESCE(created_at, now()),
    trial_ends_at = COALESCE(created_at, now()) + interval '30 days'
WHERE trial_ends_at IS NULL OR trial_ends_at = trial_started_at;

-- Helper: is the current user's school within an active trial / subscription?
CREATE OR REPLACE FUNCTION public.is_school_active(_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schools s
    WHERE s.id = _school_id
      AND (
        s.subscription_status = 'active'
        OR (s.subscription_status = 'trialing' AND s.trial_ends_at > now())
      )
  );
$$;

-- Block data access (via get_my_school) when school trial expired and not active
CREATE OR REPLACE FUNCTION public.get_my_school()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.school_id
  FROM public.profiles p
  JOIN public.schools s ON s.id = p.school_id
  WHERE p.id = auth.uid()
    AND COALESCE(p.is_active, true) = true
    AND (
      s.subscription_status = 'active'
      OR (s.subscription_status = 'trialing' AND s.trial_ends_at > now())
    );
$$;

-- Same for role lookup (so RLS that uses get_auth_role also blocks)
CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  LEFT JOIN public.schools s ON s.id = p.school_id
  WHERE p.id = auth.uid()
    AND COALESCE(p.is_active, true) = true
    AND (
      p.school_id IS NULL -- onboarding state
      OR s.subscription_status = 'active'
      OR (s.subscription_status = 'trialing' AND s.trial_ends_at > now())
    );
$$;

-- Update create_school_with_admin to set trial defaults explicitly
CREATE OR REPLACE FUNCTION public.create_school_with_admin(
  _name text, _nif text, _address text, _logo_url text,
  _primary_color text, _secondary_color text,
  _year_label text, _year_start date, _year_end date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _existing_school uuid;
  _new_school_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT school_id INTO _existing_school FROM public.profiles WHERE id = _user_id;
  IF _existing_school IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to a school';
  END IF;

  IF _name IS NULL OR length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'School name is required';
  END IF;

  INSERT INTO public.schools (
    name, nif, address, logo_url, primary_color, secondary_color,
    trial_started_at, trial_ends_at, subscription_status
  )
  VALUES (
    trim(_name),
    NULLIF(trim(coalesce(_nif, '')), ''),
    NULLIF(trim(coalesce(_address, '')), ''),
    _logo_url,
    coalesce(_primary_color, '#2563eb'),
    coalesce(_secondary_color, '#1e293b'),
    now(),
    now() + interval '30 days',
    'trialing'
  )
  RETURNING id INTO _new_school_id;

  UPDATE public.profiles
  SET school_id = _new_school_id, role = 'ADMIN'::public.user_role
  WHERE id = _user_id;

  INSERT INTO public.academic_years (school_id, label, start_date, end_date, is_active)
  VALUES (_new_school_id, trim(_year_label), _year_start, _year_end, true);

  RETURN _new_school_id;
END;
$$;

-- Allow users to read minimal trial info of their own school even after expiry
-- (so the UI can show a "trial expired" screen instead of just an empty page)
DROP POLICY IF EXISTS "Users can view their own school" ON public.schools;
CREATE POLICY "Users can view their own school"
ON public.schools
FOR SELECT
TO authenticated
USING (
  id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
);
