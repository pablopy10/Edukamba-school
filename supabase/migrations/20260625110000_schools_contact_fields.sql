-- Campos de contacto da escola para documentos fiscais (cabeçalho PDF)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.schools.phone IS 'Telefone de contacto da escola (exibido em documentos fiscais).';
COMMENT ON COLUMN public.schools.email IS 'Email de contacto da escola (exibido em documentos fiscais).';
