-- Permitir que payments também referenciem activity_fees (atividades extracurriculares)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS activity_fee_id uuid NULL REFERENCES public.activity_fees(id) ON DELETE CASCADE;

-- Tornar student_fee_id opcional (já era nullable, garantimos)
ALTER TABLE public.payments ALTER COLUMN student_fee_id DROP NOT NULL;

-- Garantir que cada pagamento referencia exatamente uma das duas (propina OU atividade)
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_one_target_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_one_target_check CHECK (
    (student_fee_id IS NOT NULL AND activity_fee_id IS NULL)
    OR (student_fee_id IS NULL AND activity_fee_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_payments_activity_fee_id ON public.payments(activity_fee_id);

-- Política para encarregados submeterem comprovativos de pagamentos de atividades
DROP POLICY IF EXISTS "Parents can submit activity payments" ON public.payments;
CREATE POLICY "Parents can submit activity payments"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = get_my_school()
  AND submitted_by = auth.uid()
  AND activity_fee_id IN (
    SELECT af.id
    FROM activity_fees af
    JOIN students s ON s.id = af.student_id
    WHERE s.parent_id = auth.uid()
  )
);