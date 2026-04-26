-- Add new columns
ALTER TABLE public.staff_absences
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS requester_id uuid,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Normalise status default
ALTER TABLE public.staff_absences
  ALTER COLUMN status SET DEFAULT 'PENDING';

-- Backfill school_id from profile_id when possible
UPDATE public.staff_absences sa
SET school_id = p.school_id
FROM public.profiles p
WHERE sa.profile_id = p.id AND sa.school_id IS NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_staff_absences_updated_at ON public.staff_absences;
CREATE TRIGGER update_staff_absences_updated_at
BEFORE UPDATE ON public.staff_absences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.staff_absences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Absences viewable by school members" ON public.staff_absences;
DROP POLICY IF EXISTS "School members can create absences" ON public.staff_absences;
DROP POLICY IF EXISTS "Requester or admin can update absences" ON public.staff_absences;
DROP POLICY IF EXISTS "Admins can delete absences" ON public.staff_absences;

CREATE POLICY "Absences viewable by school members"
ON public.staff_absences
FOR SELECT TO authenticated
USING (school_id = public.get_my_school());

CREATE POLICY "School members can create absences"
ON public.staff_absences
FOR INSERT TO authenticated
WITH CHECK (school_id = public.get_my_school());

CREATE POLICY "Requester or admin can update absences"
ON public.staff_absences
FOR UPDATE TO authenticated
USING (
  school_id = public.get_my_school()
  AND (
    public.get_auth_role() = 'ADMIN'::public.user_role
    OR (requester_id = auth.uid() AND status = 'PENDING')
  )
)
WITH CHECK (
  school_id = public.get_my_school()
  AND (
    public.get_auth_role() = 'ADMIN'::public.user_role
    OR (requester_id = auth.uid() AND status = 'PENDING')
  )
);

CREATE POLICY "Admins can delete absences"
ON public.staff_absences
FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::public.user_role);
