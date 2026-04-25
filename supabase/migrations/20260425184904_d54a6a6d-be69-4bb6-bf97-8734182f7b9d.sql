-- 1. Update handle_new_user to default role = ADMIN (new signups create their own school)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data ->> 'role')::public.user_role, 'ADMIN'::public.user_role)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Allow admins to insert their own school + insert profile (already covered by trigger but allow upsert)
-- profiles INSERT is done by trigger as security definer, so no policy needed for that.
-- We need an INSERT policy on schools so any authenticated admin can create one.
CREATE POLICY "Authenticated users can create a school"
  ON public.schools
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow admins to update their own school
CREATE POLICY "Admins can update their own school"
  ON public.schools
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'::public.user_role
  );

-- 3. Allow admins to insert academic years for their school
CREATE POLICY "Admins can create academic years for their school"
  ON public.academic_years
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'::public.user_role
  );

CREATE POLICY "School members can view academic years"
  ON public.academic_years
  FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()));

-- 4. Storage bucket for school logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-logos', 'school-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read logos (public bucket but explicit policy for clarity)
CREATE POLICY "School logos are publicly accessible"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'school-logos');

-- Authenticated users can upload to their own folder (folder = user id)
CREATE POLICY "Users can upload their own school logo"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'school-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own school logo"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own school logo"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
