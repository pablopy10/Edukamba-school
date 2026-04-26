ALTER TABLE public.complaints
ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'COMPLAINT';

-- Index for filtering by kind
CREATE INDEX IF NOT EXISTS idx_complaints_kind ON public.complaints(kind);

-- Allow reporters to update/delete their own entries (in addition to admins)
DROP POLICY IF EXISTS "Reporters can update their own complaints" ON public.complaints;
CREATE POLICY "Reporters can update their own complaints"
ON public.complaints
FOR UPDATE
TO authenticated
USING (school_id = get_my_school() AND reporter_id = auth.uid())
WITH CHECK (school_id = get_my_school() AND reporter_id = auth.uid());

DROP POLICY IF EXISTS "Reporters can delete their own complaints" ON public.complaints;
CREATE POLICY "Reporters can delete their own complaints"
ON public.complaints
FOR DELETE
TO authenticated
USING (school_id = get_my_school() AND reporter_id = auth.uid());