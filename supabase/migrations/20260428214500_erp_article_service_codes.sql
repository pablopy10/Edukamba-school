-- Códigos de artigo por tipo de serviço (faturação ERP)

ALTER TABLE public.erp_export_configs
  ADD COLUMN IF NOT EXISTS article_code_matricula TEXT,
  ADD COLUMN IF NOT EXISTS article_code_extracurricular TEXT,
  ADD COLUMN IF NOT EXISTS article_code_transporte TEXT;
