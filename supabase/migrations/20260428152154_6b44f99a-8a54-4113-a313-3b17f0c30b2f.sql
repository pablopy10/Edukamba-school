DROP POLICY IF EXISTS "Requester can delete own pending absences" ON public.staff_absences;

CREATE POLICY "Requester can delete own pending absences"
ON public.staff_absences
FOR DELETE TO authenticated
USING (
  school_id = public.get_my_school()
  AND requester_id = auth.uid()
  AND status = 'PENDING'
);