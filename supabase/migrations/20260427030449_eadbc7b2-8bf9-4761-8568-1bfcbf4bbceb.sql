-- =========================================
-- TRIMESTRES (academic_terms)
-- =========================================
CREATE TABLE IF NOT EXISTS public.academic_terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
  term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT academic_terms_dates_chk CHECK (end_date >= start_date),
  UNIQUE (school_id, academic_year_id, term_number)
);

ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view academic_terms of their school"
ON public.academic_terms FOR SELECT
USING (school_id = public.get_my_school());

CREATE POLICY "Admins can insert academic_terms"
ON public.academic_terms FOR INSERT
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE POLICY "Admins can update academic_terms"
ON public.academic_terms FOR UPDATE
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE POLICY "Admins can delete academic_terms"
ON public.academic_terms FOR DELETE
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE TRIGGER academic_terms_set_updated_at
BEFORE UPDATE ON public.academic_terms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_academic_terms_school ON public.academic_terms(school_id);
CREATE INDEX IF NOT EXISTS idx_academic_terms_year ON public.academic_terms(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_academic_terms_dates ON public.academic_terms(start_date, end_date);

-- =========================================
-- FÉRIAS (school_holidays)
-- =========================================
CREATE TABLE IF NOT EXISTS public.school_holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT school_holidays_dates_chk CHECK (end_date >= start_date)
);

ALTER TABLE public.school_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view school_holidays of their school"
ON public.school_holidays FOR SELECT
USING (school_id = public.get_my_school());

CREATE POLICY "Admins can insert school_holidays"
ON public.school_holidays FOR INSERT
WITH CHECK (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE POLICY "Admins can update school_holidays"
ON public.school_holidays FOR UPDATE
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE POLICY "Admins can delete school_holidays"
ON public.school_holidays FOR DELETE
USING (
  school_id = public.get_my_school()
  AND public.get_auth_role() = 'ADMIN'::public.user_role
);

CREATE TRIGGER school_holidays_set_updated_at
BEFORE UPDATE ON public.school_holidays
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_school_holidays_school ON public.school_holidays(school_id);
CREATE INDEX IF NOT EXISTS idx_school_holidays_dates ON public.school_holidays(start_date, end_date);

-- =========================================
-- Avaliações: term_id (override manual)
-- =========================================
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES public.academic_terms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assessments_term ON public.assessments(term_id);

-- =========================================
-- Helper: get_term_for_date
-- Devolve o term_id da escola que contém a data fornecida
-- =========================================
CREATE OR REPLACE FUNCTION public.get_term_for_date(_school_id UUID, _date DATE)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.academic_terms
  WHERE school_id = _school_id
    AND _date BETWEEN start_date AND end_date
  ORDER BY term_number ASC
  LIMIT 1;
$$;