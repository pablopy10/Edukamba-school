-- Add signature and PDF fields to document_requests
ALTER TABLE document_requests
  ADD COLUMN IF NOT EXISTS signature_data    TEXT,        -- base64 PNG of drawn signature
  ADD COLUMN IF NOT EXISTS signed_pdf_url    TEXT,        -- URL of PDF with embedded signature
  ADD COLUMN IF NOT EXISTS signer_name       TEXT,        -- full name typed by signer
  ADD COLUMN IF NOT EXISTS ip_address        TEXT,        -- for audit trail
  ADD COLUMN IF NOT EXISTS signed_at         TIMESTAMPTZ; -- explicit sign timestamp (vs responded_at)

-- Add PDF and field-mapping columns to documents
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS pdf_template_url  TEXT,        -- original uploaded PDF
  ADD COLUMN IF NOT EXISTS signature_fields  JSONB,
  -- JSON array: [{ page, x, y, width, height, label }]
  ADD COLUMN IF NOT EXISTS content_text      TEXT,        -- rich text content (alternative to PDF)
  ADD COLUMN IF NOT EXISTS academic_year_id  UUID REFERENCES academic_years(id) ON DELETE SET NULL;

-- Index for looking up requests per document quickly
CREATE INDEX IF NOT EXISTS document_requests_status_idx ON document_requests(status);
