-- SUPER_ADMIN pode ler todas as faturas (necessário para download após conversão PP→FT)
DROP POLICY IF EXISTS "Super admin read all invoices" ON public.invoices;
CREATE POLICY "Super admin read all invoices"
ON public.invoices
FOR SELECT TO authenticated
USING (public.auth_is_platform_super_admin());
