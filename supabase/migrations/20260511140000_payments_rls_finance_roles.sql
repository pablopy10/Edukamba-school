-- Pagamentos: apenas direção, secretaria e tesouraria (+ administração SaaS da escola) podem registar/atualizar/apagar pagamentos na escola.
-- Professores, bibliotecário, gestor de stock e receccionista ficam exclusamente de fora das mutações sobre `payments`.

CREATE OR REPLACE FUNCTION public.auth_can_manage_school_payments()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_auth_role(), 'STUDENT'::public.user_role) = ANY (
    ARRAY[
      'ADMIN'::public.user_role,
      'SUPER_ADMIN'::public.user_role,
      'DIRECTOR'::public.user_role,
      'SECRETARY'::public.user_role,
      'TREASURER'::public.user_role
    ]
  );
$$;

COMMENT ON FUNCTION public.auth_can_manage_school_payments() IS 'Financeiro/acerto de cobranças: mutações em payments (ver políticas RLS).';

DROP POLICY IF EXISTS "Staff can register payments" ON public.payments;
CREATE POLICY "Staff can register payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND submitted_by = auth.uid()
  AND public.auth_can_manage_school_payments()
  AND num_nonnulls(student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id) = 1
);

DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
CREATE POLICY "Admins can update payments"
ON public.payments FOR UPDATE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments())
WITH CHECK (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());

DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;
CREATE POLICY "Admins can delete payments"
ON public.payments FOR DELETE TO authenticated
USING (school_id = public.get_my_school() AND public.auth_can_manage_school_payments());
