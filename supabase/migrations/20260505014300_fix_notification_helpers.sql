-- Fix helpers to correctly handle NULL is_active values in profiles table
-- Re-declaring functions that were modified in a previous migration after it was applied

CREATE OR REPLACE FUNCTION notify_users_by_role(p_school_id uuid, p_role text, p_title text, p_description text, p_link text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT id, p_title, p_description, p_link, p_category, p_school_id
  FROM public.profiles
  WHERE school_id = p_school_id AND role::text = p_role AND COALESCE(is_active, true) = true;
END;
$$;

CREATE OR REPLACE FUNCTION notify_classroom_parents(p_school_id uuid, p_classroom_id uuid, p_title text, p_description text, p_link text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT DISTINCT p.id, p_title, p_description, p_link, p_category, p_school_id
  FROM public.profiles p
  JOIN public.students s ON s.parent_id = p.id
  WHERE s.classroom_id = p_classroom_id
    AND s.school_id = p_school_id
    AND COALESCE(p.is_active, true) = true;
END;
$$;

CREATE OR REPLACE FUNCTION notify_all_users(p_school_id uuid, p_title text, p_description text, p_link text, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT id, p_title, p_description, p_link, p_category, p_school_id
  FROM public.profiles
  WHERE school_id = p_school_id AND COALESCE(is_active, true) = true;
END;
$$;
