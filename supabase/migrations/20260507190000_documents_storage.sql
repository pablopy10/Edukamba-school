-- Create the documents storage bucket (public so signed PDFs can be served by URL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  52428800, -- 50 MB
  ARRAY['application/pdf','image/png','image/jpeg','image/jpg',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can read any file in this bucket
CREATE POLICY "documents_storage_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

-- Authenticated users can upload files
CREATE POLICY "documents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Authenticated users can delete their own files
CREATE POLICY "documents_storage_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
