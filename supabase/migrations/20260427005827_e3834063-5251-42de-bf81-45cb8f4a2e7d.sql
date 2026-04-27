-- Permitir que ADMIN e TEACHER registem pagamentos (propinas e atividades) em nome dos educadores
DROP POLICY IF EXISTS "Staff can register payments" ON public.payments;
CREATE POLICY "Staff can register payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = get_my_school()
  AND submitted_by = auth.uid()
  AND get_auth_role() = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role])
  AND (
    (student_fee_id IS NOT NULL AND activity_fee_id IS NULL)
    OR (student_fee_id IS NULL AND activity_fee_id IS NOT NULL)
  )
);