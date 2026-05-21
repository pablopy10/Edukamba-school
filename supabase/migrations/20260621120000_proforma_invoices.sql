-- Create proforma_invoices table
CREATE TABLE IF NOT EXISTS public.proforma_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_number TEXT NOT NULL UNIQUE,
    issue_date DATE NOT NULL,
    validity_days INTEGER NOT NULL DEFAULT 30,
    client_name TEXT NOT NULL,
    client_lines TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    client_nif TEXT,
    client_email TEXT,
    items JSONB NOT NULL DEFAULT '[]'::JSONB,
    subtotal TEXT NOT NULL,
    iva_percentage NUMERIC(5, 2) NOT NULL DEFAULT 14,
    iva_amount TEXT NOT NULL,
    total TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'AOA',
    footer_note TEXT,
    pdf_base64 TEXT,
    hash_control TEXT,
    created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_iva CHECK (iva_percentage >= 0 AND iva_percentage <= 100)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_created_at ON public.proforma_invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_issue_date ON public.proforma_invoices(issue_date);

-- Enable RLS
ALTER TABLE public.proforma_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policy: only platform super admin
DROP POLICY IF EXISTS "super_admin_all_access" ON public.proforma_invoices;
CREATE POLICY "super_admin_all_access" ON public.proforma_invoices
FOR ALL TO authenticated
USING (public.auth_is_platform_super_admin())
WITH CHECK (public.auth_is_platform_super_admin());

-- Trigger: keep updated_at current
CREATE OR REPLACE FUNCTION public.update_proforma_invoices_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proforma_invoices_updated_at_trigger ON public.proforma_invoices;
CREATE TRIGGER proforma_invoices_updated_at_trigger
BEFORE UPDATE ON public.proforma_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_proforma_invoices_updated_at();

-- Add pp_sequence to billing_config (idempotent)
ALTER TABLE public.billing_config
ADD COLUMN IF NOT EXISTS pp_sequence INTEGER NOT NULL DEFAULT 0;

-- Comments
COMMENT ON TABLE public.proforma_invoices IS 'Faturas Pró-Forma (PP) — documentos de referência não-fiscais para testes AGT e orçamentos para escolas';
COMMENT ON COLUMN public.proforma_invoices.document_number IS 'Número do documento, ex: "PP 2026/1"';
COMMENT ON COLUMN public.proforma_invoices.items IS 'Array JSON de itens: {description, quantity, unit_amount, total_amount}';
COMMENT ON COLUMN public.proforma_invoices.pdf_base64 IS 'PDF em base64 (cache opcional)';
