-- 1. Extend messages table with attachment fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint;

-- Allow content to be empty when sending pure attachments
ALTER TABLE public.messages ALTER COLUMN content DROP NOT NULL;

-- Ensure type is one of the supported values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messages_message_type_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_message_type_check
      CHECK (message_type IN ('text','image','file'));
  END IF;
END $$;

-- 2. Replace INSERT policy to block students AND block teacher<->student DMs
DROP POLICY IF EXISTS "Users can send messages within their school" ON public.messages;

CREATE POLICY "Users can send messages within their school (no students, no teacher-student)"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND sender_id = auth.uid()
  -- sender cannot be a student
  AND public.get_auth_role() <> 'STUDENT'::public.user_role
  -- receiver cannot be a student
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = receiver_id AND p.role = 'STUDENT'::public.user_role
  )
  -- if sender is teacher, receiver cannot be student (already covered)
  -- if sender is anyone, receiver must belong to same school
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = receiver_id AND p.school_id = public.get_my_school()
  )
);

-- Replace SELECT policy to also hide messages from students entirely
DROP POLICY IF EXISTS "Users can view their own messages" ON public.messages;

CREATE POLICY "Users can view their own messages (no students)"
ON public.messages
FOR SELECT
TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() <> 'STUDENT'::public.user_role
  AND (sender_id = auth.uid() OR receiver_id = auth.uid())
);

-- 3. Storage bucket for chat attachments (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
-- Upload: must be school member (not student) and upload into own folder (uid as first path segment)
DROP POLICY IF EXISTS "Chat: upload own files" ON storage.objects;
CREATE POLICY "Chat: upload own files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.get_auth_role() <> 'STUDENT'::public.user_role
);

-- Read: sender or receiver of a message referencing this file may read
DROP POLICY IF EXISTS "Chat: read attachments of own messages" ON storage.objects;
CREATE POLICY "Chat: read attachments of own messages"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.file_url LIKE '%' || name
      AND (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
  )
);

-- Delete: only uploader (own folder)
DROP POLICY IF EXISTS "Chat: delete own files" ON storage.objects;
CREATE POLICY "Chat: delete own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);