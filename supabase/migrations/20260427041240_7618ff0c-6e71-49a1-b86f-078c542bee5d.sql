-- Add academic_year_id to assessments to make year filtering robust and explicit
ALTER TABLE public.assessments
ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assessments_academic_year_id ON public.assessments(academic_year_id);

-- Helper function: derive academic_year_id from term_id, or from school active year, or from date
CREATE OR REPLACE FUNCTION public.assessments_set_academic_year()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year uuid;
BEGIN
  -- Priority 1: explicit term_id
  IF NEW.term_id IS NOT NULL THEN
    SELECT academic_year_id INTO v_year FROM public.academic_terms WHERE id = NEW.term_id;
    IF v_year IS NOT NULL THEN
      NEW.academic_year_id := v_year;
      RETURN NEW;
    END IF;
  END IF;

  -- Priority 2: derive from date by matching against academic_years window for this school
  IF NEW.school_id IS NOT NULL AND NEW.date IS NOT NULL THEN
    SELECT id INTO v_year
    FROM public.academic_years
    WHERE school_id = NEW.school_id
      AND NEW.date >= start_date
      AND NEW.date <= end_date
    ORDER BY is_active DESC NULLS LAST, start_date DESC
    LIMIT 1;
    IF v_year IS NOT NULL THEN
      NEW.academic_year_id := v_year;
      RETURN NEW;
    END IF;
  END IF;

  -- Priority 3: school's active year
  IF NEW.academic_year_id IS NULL AND NEW.school_id IS NOT NULL THEN
    SELECT id INTO v_year
    FROM public.academic_years
    WHERE school_id = NEW.school_id AND is_active = true
    ORDER BY start_date DESC
    LIMIT 1;
    NEW.academic_year_id := v_year;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assessments_set_academic_year ON public.assessments;
CREATE TRIGGER trg_assessments_set_academic_year
BEFORE INSERT OR UPDATE OF term_id, date, school_id ON public.assessments
FOR EACH ROW
EXECUTE FUNCTION public.assessments_set_academic_year();

-- Backfill existing rows
UPDATE public.assessments a
SET academic_year_id = COALESCE(
  (SELECT t.academic_year_id FROM public.academic_terms t WHERE t.id = a.term_id),
  (SELECT y.id FROM public.academic_years y
     WHERE y.school_id = a.school_id
       AND a.date >= y.start_date
       AND a.date <= y.end_date
     ORDER BY y.is_active DESC NULLS LAST, y.start_date DESC
     LIMIT 1),
  (SELECT y.id FROM public.academic_years y
     WHERE y.school_id = a.school_id AND y.is_active = true
     ORDER BY y.start_date DESC
     LIMIT 1)
)
WHERE a.academic_year_id IS NULL;