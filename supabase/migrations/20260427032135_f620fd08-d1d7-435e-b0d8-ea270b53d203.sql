-- Backfill academic_year_id on existing records that have none.
-- Use the school's active academic year. Skip if school has no active year.

-- Helper CTE pattern: for each table, link to schools.id and update only NULL rows.

UPDATE public.assessments a
SET term_id = term_id  -- no-op marker
WHERE FALSE;  -- keep this trivial line just to ensure file isn't empty if all updates skip

-- assessments has no academic_year_id column, but term_id already covers it via terms.

-- Tables WITH academic_year_id column:

UPDATE public.classrooms c
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE c.academic_year_id IS NULL
  AND ay.school_id = c.school_id
  AND ay.is_active = true;

UPDATE public.enrollments e
SET academic_year_id = ay.id
FROM public.students s
JOIN public.academic_years ay ON ay.school_id = s.school_id AND ay.is_active = true
WHERE e.academic_year_id IS NULL
  AND e.student_id = s.id;

UPDATE public.academic_terms t
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE t.academic_year_id IS NULL
  AND ay.school_id = t.school_id
  AND ay.is_active = true;

UPDATE public.school_holidays h
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE h.academic_year_id IS NULL
  AND ay.school_id = h.school_id
  AND ay.is_active = true;

UPDATE public.fee_rules fr
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE fr.academic_year_id IS NULL
  AND ay.school_id = fr.school_id
  AND ay.is_active = true;

UPDATE public.student_fees sf
SET academic_year_id = ay.id
FROM public.students s
JOIN public.academic_years ay ON ay.school_id = s.school_id AND ay.is_active = true
WHERE sf.academic_year_id IS NULL
  AND sf.student_id = s.id;

UPDATE public.activity_fees af
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE af.academic_year_id IS NULL
  AND ay.school_id = af.school_id
  AND ay.is_active = true;

UPDATE public.transport_fees tf
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE tf.academic_year_id IS NULL
  AND ay.school_id = tf.school_id
  AND ay.is_active = true;

UPDATE public.extracurricular_activities ea
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE ea.academic_year_id IS NULL
  AND ay.school_id = ea.school_id
  AND ay.is_active = true;

UPDATE public.student_discounts sd
SET academic_year_id = ay.id
FROM public.academic_years ay
WHERE sd.academic_year_id IS NULL
  AND ay.school_id = sd.school_id
  AND ay.is_active = true;