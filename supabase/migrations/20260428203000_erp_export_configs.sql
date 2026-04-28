-- ERP / faturação: mapeamento de colunas por escola e estado de exportação nos pagamentos

CREATE TABLE public.erp_export_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  header_student_id TEXT,
  header_student_name TEXT,
  header_tax_id TEXT,
  header_amount_paid TEXT,
  header_payment_date TEXT,
  header_article_code TEXT,
  header_payment_method TEXT,
  default_article_code_propina TEXT DEFAULT 'PROPINA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);

CREATE INDEX idx_erp_export_configs_school ON public.erp_export_configs(school_id);

ALTER TABLE public.erp_export_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage erp export configs in their school"
ON public.erp_export_configs FOR ALL TO authenticated
USING (
  get_auth_role() IN ('ADMIN','SUPER_ADMIN','TEACHER')
  AND school_id = get_my_school()
)
WITH CHECK (
  get_auth_role() IN ('ADMIN','SUPER_ADMIN','TEACHER')
  AND school_id = get_my_school()
);

CREATE TRIGGER update_erp_export_configs_updated_at
BEFORE UPDATE ON public.erp_export_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS erp_exported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payments_erp_exported_at ON public.payments(erp_exported_at);

-- NIF / contribuinte do aluno (opcional) para coluna NIF na exportação ERP
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS tax_id TEXT;
