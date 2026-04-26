-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  actor_id uuid,
  actor_name text,
  category text NOT NULL DEFAULT 'sistema',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'unread',
  link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX idx_notifications_school ON public.notifications(school_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Recipient can see their own notifications
CREATE POLICY "Recipients can view their own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- Recipient can update (mark as read / archived) their own notifications
CREATE POLICY "Recipients can update their own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Recipient can delete their own notifications
CREATE POLICY "Recipients can delete their own notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (recipient_id = auth.uid());

-- Any school member can create notifications for users in the same school
CREATE POLICY "School members can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = public.get_my_school()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = recipient_id
        AND p.school_id = public.get_my_school()
    )
  );

-- Trigger to keep updated_at in sync
CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();