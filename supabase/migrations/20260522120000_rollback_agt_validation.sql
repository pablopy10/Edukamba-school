-- Reverte migrações do pacote de validação AGT (20260520120000 + 20260521100000).
-- Aplicar após remover a função generate-agt-validation do projeto Supabase.

-- Faturas de teste da série VAGT / cenários AGT (opcional; não afeta FT operacional EDK)
DELETE FROM public.invoices
WHERE series = 'VAGT'
   OR agt_validation_scenario IS NOT NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_self_billing_valid,
  DROP CONSTRAINT IF EXISTS invoices_status_valid;

ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS agt_validation_scenario,
  DROP COLUMN IF EXISTS document_kind,
  DROP COLUMN IF EXISTS invoice_status,
  DROP COLUMN IF EXISTS global_settlement_amount,
  DROP COLUMN IF EXISTS exchange_rate,
  DROP COLUMN IF EXISTS accounting_period,
  DROP COLUMN IF EXISTS order_references,
  DROP COLUMN IF EXISTS credit_references,
  DROP COLUMN IF EXISTS fiscal_lines,
  DROP COLUMN IF EXISTS self_billing_indicator;
