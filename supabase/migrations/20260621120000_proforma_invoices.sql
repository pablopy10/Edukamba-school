-- Create proforma_invoices table
CREATE TABLE public.proforma_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_number TEXT NOT NULL UNIQUE,
    -- "PP 2026/1"
    issue_date DATE NOT NULL,
    validity_days INTEGER NOT NULL DEFAULT 30,
    -- Client information
    client_name TEXT NOT NULL,
    client_lines TEXT [] NOT NULL DEFAULT ARRAY []::TEXT [],
    -- Address lines
    client_nif TEXT,
    -- 10-digit NIF
    client_email TEXT,
    -- Items (JSON array)
    items JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Financial data
    subtotal TEXT NOT NULL,
    -- Formatted amount
    iva_percentage NUMERIC(5, 2) NOT NULL DEFAULT 14,
    iva_amount TEXT NOT NULL,
    total TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'AOA',
    -- Additional notes
    footer_note TEXT,
    -- PDF storage (optional, can be stored in storage bucket instead)
    pdf_base64 TEXT,
    -- Metadata
    created_by_id UUID REFERENCES auth.users(id) ON DELETE
    SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT valid_iva CHECK (
            iva_percentage >= 0
            AND iva_percentage <= 100
        )
);
-- Index for quick lookup
CREATE INDEX idx_proforma_invoices_created_at ON public.proforma_invoices(created_at DESC);
CREATE INDEX idx_proforma_invoices_issue_date ON public.proforma_invoices(issue_date);
-- Enable RLS
ALTER TABLE public.proforma_invoices ENABLE ROW LEVEL SECURITY;
-- RLS Policy: Super admin can create and view all proforma invoices
CREATE POLICY "super_admin_all_access" ON public.proforma_invoices FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM public.staff_roles
        WHERE staff_roles.user_id = auth.uid()
            AND staff_roles.school_id IS NULL
            AND staff_roles.role = 'super_admin'
    )
);
-- Optional: Allow viewing by staff in each school (if needed for specific use case)
-- For now, restrict to super_admin only
-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_proforma_invoices_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER proforma_invoices_updated_at_trigger BEFORE
UPDATE ON public.proforma_invoices FOR EACH ROW EXECUTE FUNCTION public.update_proforma_invoices_updated_at();
-- Add to billing_config if not exists (for sequence management)
-- Note: The PP series will use the same sequence as other invoices if needed
ALTER TABLE public.billing_config
ADD COLUMN pp_sequence INTEGER DEFAULT 0 NOT NULL;
COMMENT ON TABLE public.proforma_invoices IS 'Pro-forma invoices (Pró-formas/Orçamentos) - Non-fiscal reference documents for AGT testing and school quotes';
COMMENT ON COLUMN public.proforma_invoices.document_number IS 'Formatted document number like "PP 2026/1"';
COMMENT ON COLUMN public.proforma_invoices.items IS 'JSON array of items: {description, quantity, unit_amount, total_amount}';
COMMENT ON COLUMN public.proforma_invoices.pdf_base64 IS 'Base64-encoded PDF content (optional, for caching)';