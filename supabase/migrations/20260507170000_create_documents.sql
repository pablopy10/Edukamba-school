-- Documents: created by the school, can request signatures/forms from parents/teachers
CREATE TABLE IF NOT EXISTS documents (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID        REFERENCES schools(id) ON DELETE CASCADE,
  title                TEXT        NOT NULL,
  description          TEXT,
  category             TEXT        NOT NULL DEFAULT 'assinatura',
  -- 'assinatura' | 'formulario' | 'informativo'
  file_url             TEXT,
  created_by           UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  target_role          TEXT        NOT NULL DEFAULT 'PARENT',
  -- 'PARENT' | 'TEACHER' | 'ALL'
  required             BOOLEAN     NOT NULL DEFAULT false,
  expires_at           DATE,
  status               TEXT        NOT NULL DEFAULT 'active',
  -- 'active' | 'archived'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Document requests: tracks each recipient's response
CREATE TABLE IF NOT EXISTS document_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recipient_profile_id  UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  student_id            UUID        REFERENCES students(id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'signed' | 'submitted' | 'declined'
  notes                 TEXT,
  responded_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS documents_school_id_idx          ON documents(school_id);
CREATE INDEX IF NOT EXISTS documents_status_idx             ON documents(status);
CREATE INDEX IF NOT EXISTS document_requests_document_id_idx ON document_requests(document_id);
CREATE INDEX IF NOT EXISTS document_requests_recipient_idx  ON document_requests(recipient_profile_id);

-- RLS
ALTER TABLE documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read documents from their school
CREATE POLICY "documents_read" ON documents
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow admin/staff to insert/update/delete
CREATE POLICY "documents_write" ON documents
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "document_requests_read" ON document_requests
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "document_requests_write" ON document_requests
  FOR ALL USING (auth.role() = 'authenticated');
