-- 1. Adicionar colunas a payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_payments_school_id ON public.payments(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_student_fee_id ON public.payments(student_fee_id);

-- 2. Garantir RLS ativo
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 3. Policies em payments
DROP POLICY IF EXISTS "Parents can insert payments" ON public.payments;
DROP POLICY IF EXISTS "School members can view payments" ON public.payments;
DROP POLICY IF EXISTS "Parents can submit payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can delete payments" ON public.payments;

CREATE POLICY "School members can view payments"
ON public.payments
FOR SELECT
TO authenticated
USING (school_id = public.get_my_school());

CREATE POLICY "Parents can submit payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND submitted_by = auth.uid()
  AND student_fee_id IN (
    SELECT sf.id FROM public.student_fees sf
    JOIN public.students s ON s.id = sf.student_id
    WHERE s.parent_id = auth.uid()
  )
);

CREATE POLICY "Admins can update payments"
ON public.payments
FOR UPDATE
TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role)
WITH CHECK (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete payments"
ON public.payments
FOR DELETE
TO authenticated
USING (school_id = public.get_my_school() AND public.get_auth_role() = 'ADMIN'::user_role);

-- 4. Bucket de comprovativos
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage policies para payment-proofs
-- Estrutura de pastas: {school_id}/{student_id}/{file}
DROP POLICY IF EXISTS "School members can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload payment proofs to their school" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete payment proofs" ON storage.objects;

CREATE POLICY "School members can view payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.get_my_school()::text
);

CREATE POLICY "Authenticated users can upload payment proofs to their school"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.get_my_school()::text
);

CREATE POLICY "Admins can delete payment proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = public.get_my_school()::text
  AND public.get_auth_role() = 'ADMIN'::user_role
);