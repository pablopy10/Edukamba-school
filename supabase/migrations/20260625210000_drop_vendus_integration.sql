-- Remove integração Vendus (colunas, tabela, RPCs e trigger).
-- Mantém usa_faturacao_externa + webhook_billing_* (faturação externa genérica).

-- 1) Trigger / funções Vendus
DROP TRIGGER IF EXISTS trg_protect_schools_vendus_api_key ON public.schools;
DROP FUNCTION IF EXISTS public.protect_schools_vendus_api_key();
DROP FUNCTION IF EXISTS public.platform_super_get_school_vendus_config(uuid);
DROP FUNCTION IF EXISTS public.platform_super_set_school_vendus_config(uuid, jsonb);

-- 2) Flags de faturação sem Vendus (RETURNS muda → DROP + CREATE)
DROP FUNCTION IF EXISTS public.get_school_billing_flags(uuid);

CREATE OR REPLACE FUNCTION public.get_school_billing_flags(_school_id uuid)
RETURNS TABLE (
  usa_faturacao_externa boolean
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
  SELECT COALESCE(s.usa_faturacao_externa, false)
  FROM public.schools s
  WHERE s.id = _school_id;
END;
$$;

COMMENT ON FUNCTION public.get_school_billing_flags(uuid) IS
  'Devolve usa_faturacao_externa para a escola (sem dados de integrações de terceiros).';

GRANT EXECUTE ON FUNCTION public.get_school_billing_flags(uuid) TO authenticated;

-- 3) Tabela de logs Vendus
DROP TABLE IF EXISTS public.vendus_integration_logs CASCADE;

-- 4) Colunas Vendus
ALTER TABLE public.payment_receipts
  DROP COLUMN IF EXISTS vendus_document_id,
  DROP COLUMN IF EXISTS vendus_document_number,
  DROP COLUMN IF EXISTS vendus_pdf_url;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS vendus_client_id;

ALTER TABLE public.schools
  DROP COLUMN IF EXISTS vendus_api_key;
