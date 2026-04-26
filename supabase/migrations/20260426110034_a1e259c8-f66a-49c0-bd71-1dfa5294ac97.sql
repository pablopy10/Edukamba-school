-- Enable RLS for messages and add policies so school members can chat
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
ON public.messages FOR SELECT TO authenticated
USING (
  school_id = get_my_school()
  AND (sender_id = auth.uid() OR receiver_id = auth.uid())
);

CREATE POLICY "Users can send messages within their school"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  school_id = get_my_school()
  AND sender_id = auth.uid()
);

CREATE POLICY "Users can mark their received messages as read"
ON public.messages FOR UPDATE TO authenticated
USING (receiver_id = auth.uid())
WITH CHECK (receiver_id = auth.uid());

CREATE POLICY "Senders can delete their own messages"
ON public.messages FOR DELETE TO authenticated
USING (sender_id = auth.uid());

-- Helpful indexes for chat queries
CREATE INDEX IF NOT EXISTS idx_messages_pair_created
ON public.messages (school_id, sender_id, receiver_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_receiver
ON public.messages (receiver_id, is_read);