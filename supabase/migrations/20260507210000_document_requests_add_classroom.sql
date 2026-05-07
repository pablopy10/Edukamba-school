-- Add classroom_id to document_requests so each request knows
-- which class the student belongs to (needed for notifications and emails).

ALTER TABLE public.document_requests
  ADD COLUMN IF NOT EXISTS classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.document_requests.classroom_id IS
  'Classroom of the student at the time the request was created.';
