CREATE OR REPLACE FUNCTION public.create_school_with_admin(
  _name text,
  _nif text,
  _address text,
  _logo_url text,
  _primary_color text,
  _secondary_color text,
  _year_label text,
  _year_start date,
  _year_end date
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

  INSERT INTO public.schools (name, nif, address, logo_url, primary_color, secondary_color)
  VALUES (
    trim(_name),
    NULLIF(trim(coalesce(_nif, '')), ''),
    NULLIF(trim(coalesce(_address, '')), ''),
    _logo_url,
    coalesce(_primary_color, '#2563eb'),
    coalesce(_secondary_color, '#1e293b')
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

GRANT EXECUTE ON FUNCTION public.create_school_with_admin(text, text, text, text, text, text, text, date, date) TO authenticated;