-- Secretário pode reservar sequência fiscal (alinha com quem valida pagamentos + RLS em invoices).
CREATE OR REPLACE FUNCTION public.billing_reserve_next_invoice(_school_id uuid)
RETURNS TABLE (serie text, seq integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  IF public.get_my_school() IS DISTINCT FROM _school_id
     AND public.get_auth_role()::text IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  IF public.get_auth_role() IS NULL
     OR public.get_auth_role()::text NOT IN (
       'ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'TREASURER', 'SECRETARY'
     ) THEN
    RAISE EXCEPTION 'Sem permissão para emitir fatura';
  END IF;

  INSERT INTO public.billing_config (school_id, series, last_sequence)
  VALUES (_school_id, 'EDK', 0)
  ON CONFLICT (school_id) DO NOTHING;

  RETURN QUERY
  UPDATE public.billing_config bc
  SET
    last_sequence = bc.last_sequence + 1,
    updated_at = now()
  WHERE bc.school_id = _school_id
  RETURNING bc.series AS serie, bc.last_sequence AS seq;
END;
$$;

COMMENT ON FUNCTION public.billing_reserve_next_invoice(uuid) IS
  'Incrementa last_sequence e devolve (series, novo número). Inclui SECRETARY (emissão após validação).';
