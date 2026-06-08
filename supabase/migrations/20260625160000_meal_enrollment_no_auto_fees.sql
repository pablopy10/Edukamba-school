-- Inscrições em refeições não geram cobranças; apenas as regras de cobrança o fazem.

DROP TRIGGER IF EXISTS trg_meal_enrollment_sync_fees ON public.meal_enrollments;

DROP FUNCTION IF EXISTS public.tg_meal_enrollment_sync_fees();
