-- Preferências de pagamento por escola (encarregados: comprovativo vs presencial, IBAN).
CREATE TABLE IF NOT EXISTS public.school_payment_prefs (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  guardian_payment_mode text NOT NULL DEFAULT 'proof_attachment'
    CHECK (guardian_payment_mode IN ('proof_attachment', 'in_person')),
  bank_iban text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.school_payment_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School payment prefs readable by members"
ON public.school_payment_prefs
FOR SELECT
TO authenticated
USING (school_id = public.get_my_school());

CREATE POLICY "School payment prefs insert by admin staff"
ON public.school_payment_prefs
FOR INSERT
TO authenticated
WITH CHECK (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin()
);

CREATE POLICY "School payment prefs update by admin staff"
ON public.school_payment_prefs
FOR UPDATE
TO authenticated
USING (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin()
)
WITH CHECK (
  school_id = public.get_my_school()
  AND public.auth_is_school_admin()
);
