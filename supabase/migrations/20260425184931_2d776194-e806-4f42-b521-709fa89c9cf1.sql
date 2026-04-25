-- Tighten school INSERT policy: only users who don't yet have a school
DROP POLICY IF EXISTS "Authenticated users can create a school" ON public.schools;

CREATE POLICY "Users without a school can create one"
  ON public.schools
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT school_id FROM public.profiles WHERE id = auth.uid()) IS NULL
  );

-- Tighten storage SELECT policy: only owners can list files in their folder.
-- Public bucket means files are still accessible by direct URL via CDN.
DROP POLICY IF EXISTS "School logos are publicly accessible" ON storage.objects;

CREATE POLICY "Users can list their own school logo files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'school-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
