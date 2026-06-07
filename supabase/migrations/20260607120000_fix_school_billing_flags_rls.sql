-- Corrigir leitura da escola activa (SUPER_ADMIN em modo suporte) e expor flags de faturação
-- sem revelar vendus_api_key ao cliente.

DROP POLICY IF EXISTS "Users can view their own school" ON public.schools;
CREATE POLICY "Users can view their own school"
ON public.schools
FOR SELECT
TO authenticated
USING (id = public.get_my_school());

DROP POLICY IF EXISTS "Admins can update their own school" ON public.schools;
CREATE POLICY "Admins can update their own school"
ON public.schools
FOR UPDATE
TO authenticated
USING (
  id = public.get_my_school()
  AND public.get_auth_role() IN (
    'ADMIN'::public.user_role,
    'DIRECTOR'::public.user_role,
    'TREASURER'::public.user_role
  )
)
WITH CHECK (
  id = public.get_my_school()
  AND public.get_auth_role() IN (
    'ADMIN'::public.user_role,
    'DIRECTOR'::public.user_role,
    'TREASURER'::public.user_role
  )
);

CREATE OR REPLACE FUNCTION public.get_school_billing_flags(_school_id uuid)
RETURNS TABLE (
  usa_faturacao_externa boolean,
  vendus_configured boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  IF _school_id IS DISTINCT FROM public.get_my_school()
     AND NOT public.auth_is_platform_super_admin() THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(s.usa_faturacao_externa, false),
    (NULLIF(btrim(s.vendus_api_key), '') IS NOT NULL)
  FROM public.schools s
  WHERE s.id = _school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_billing_flags(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_school_billing_flags IS
  'Devolve usa_faturacao_externa e se Vendus está configurado (sem expor a API Key).';
