ALTER TABLE public.payments DROP CONSTRAINT payments_one_target_check;

ALTER TABLE public.payments ADD CONSTRAINT payments_one_target_check CHECK (
  (
    (CASE WHEN student_fee_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN activity_fee_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN transport_fee_id IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1
);