-- Corrige «Documento anterior sem hash»: sincroniza numeração com faturas existentes
-- e preenche document_hash a partir de agt_signing_plaintext quando possível.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Preenche hash SHA-1 (hex) em linhas antigas que guardaram plaintext mas não hash.
UPDATE public.invoices
SET document_hash = lower(encode(digest(convert_to(agt_signing_plaintext, 'UTF8'), 'sha1'), 'hex'))
WHERE (document_hash IS NULL OR trim(document_hash) = '')
  AND agt_signing_plaintext IS NOT NULL
  AND trim(agt_signing_plaintext) <> '';

-- Alinha last_sequence ao último doc_number emitido por escola/série.
UPDATE public.billing_config bc
SET
  last_sequence = COALESCE((
    SELECT MAX(i.doc_number)
    FROM public.invoices i
    WHERE i.school_id = bc.school_id
      AND i.series = bc.series
  ), 0),
  updated_at = now();

CREATE OR REPLACE FUNCTION public.billing_reserve_next_invoice(_school_id uuid)
RETURNS TABLE (serie text, seq integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _serie text;
  _max_doc integer;
  _next integer;
BEGIN
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'school_id obrigatório';
  END IF;

  IF public.get_my_school() IS DISTINCT FROM _school_id
     AND public.get_auth_role()::text IS DISTINCT FROM 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'Sem acesso a esta escola';
  END IF;

  IF public.get_auth_role() IS NULL
     OR public.get_auth_role()::text NOT IN ('ADMIN', 'SUPER_ADMIN', 'DIRECTOR', 'TREASURER', 'SECRETARY') THEN
    RAISE EXCEPTION 'Sem permissão para emitir fatura';
  END IF;

  INSERT INTO public.billing_config (school_id, series, last_sequence)
  VALUES (_school_id, 'EDK', 0)
  ON CONFLICT (school_id) DO NOTHING;

  -- Evita números «saltados» quando uma emissão falhou após incrementar o contador.
  PERFORM pg_advisory_xact_lock(hashtext('billing_reserve:' || _school_id::text));

  SELECT bc.series INTO _serie
  FROM public.billing_config bc
  WHERE bc.school_id = _school_id;

  IF _serie IS NULL OR trim(_serie) = '' THEN
    _serie := 'EDK';
  END IF;

  SELECT COALESCE(MAX(i.doc_number), 0) INTO _max_doc
  FROM public.invoices i
  WHERE i.school_id = _school_id
    AND i.series = _serie;

  _next := _max_doc + 1;

  UPDATE public.billing_config bc
  SET
    last_sequence = _next,
    updated_at = now()
  WHERE bc.school_id = _school_id;

  RETURN QUERY SELECT _serie AS serie, _next AS seq;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_reserve_next_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_reserve_next_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.billing_reserve_next_invoice IS
  'Reserva o próximo número FT = MAX(doc_number)+1 na série da escola (evita buracos na cadeia de hashes).';
