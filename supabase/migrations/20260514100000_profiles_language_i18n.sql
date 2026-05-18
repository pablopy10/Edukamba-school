-- User-facing locale for UI, transactional emails and push segmentation (OneSignal tags).
-- Canonical values: pt | en | fr

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language varchar(10);

UPDATE public.profiles
SET language = CASE
  WHEN language IS NULL OR btrim(language) = '' THEN 'pt'
  WHEN lower(btrim(language)) LIKE 'pt%' THEN 'pt'
  WHEN lower(btrim(language)) LIKE 'en%' THEN 'en'
  WHEN lower(btrim(language)) LIKE 'fr%' THEN 'fr'
  ELSE 'pt'
END;

ALTER TABLE public.profiles
  ALTER COLUMN language SET DEFAULT 'pt',
  ALTER COLUMN language SET NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_language_check CHECK (language IN ('pt', 'en', 'fr'));

COMMENT ON COLUMN public.profiles.language IS 'Preferred locale (pt=en+pt UI copy, en, fr); sync app / Brevo / OneSignal.';

-- Callable from authenticated clients (respects RLS via UPDATE on own row).
CREATE OR REPLACE FUNCTION public.set_my_language(p_language text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_language IS NULL OR p_language NOT IN ('pt', 'en', 'fr') THEN
    RAISE EXCEPTION 'invalid language';
  END IF;

  UPDATE public.profiles
  SET language = p_language
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_language(text) TO authenticated;
