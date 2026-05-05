-- Enable Realtime for the notifications table

BEGIN;
  -- Remove the table from the publication if it already exists to avoid errors
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.notifications;
  
  -- Add the table to the supabase_realtime publication
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
COMMIT;
