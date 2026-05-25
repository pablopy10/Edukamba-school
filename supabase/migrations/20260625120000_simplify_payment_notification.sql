-- Simplificar notificação de pagamento validado:
-- Título: "Pagamento registado — Maio" (mês da propina/cobrança)
-- Remover título "Pagamento de propina validado"
-- Manter notificação de rejeição com motivo

CREATE OR REPLACE FUNCTION public.tg_notify_payment_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_id uuid;
  _student_name text;
  _label text;
  _month_idx integer;
  _month_name text;
  _title text;
  _description text;
  _month_names text[] := ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('validado', 'rejeitado', 'validated', 'rejected') THEN RETURN NEW; END IF;

  _month_idx := NULL;

  IF NEW.activity_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name, af.month_index INTO _parent_id, _student_name, _month_idx
    FROM public.activity_fees af JOIN public.students s ON s.id = af.student_id
    WHERE af.id = NEW.activity_fee_id;
    _label := 'atividade extracurricular';
  ELSIF NEW.transport_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name, tf.month_index INTO _parent_id, _student_name, _month_idx
    FROM public.transport_fees tf JOIN public.students s ON s.id = tf.student_id
    WHERE tf.id = NEW.transport_fee_id;
    _label := 'transporte';
  ELSIF NEW.enrollment_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.enrollment_fees ef JOIN public.students s ON s.id = ef.student_id
    WHERE ef.id = NEW.enrollment_fee_id;
    _label := 'matrícula';
  ELSIF NEW.meal_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name, mf.month_index INTO _parent_id, _student_name, _month_idx
    FROM public.meal_fees mf JOIN public.students s ON s.id = mf.student_id
    WHERE mf.id = NEW.meal_fee_id;
    _label := 'refeições';
  ELSIF NEW.event_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name INTO _parent_id, _student_name
    FROM public.event_fees ef JOIN public.students s ON s.id = ef.student_id
    WHERE ef.id = NEW.event_fee_id;
    _label := 'evento escolar';
  ELSIF NEW.student_fee_id IS NOT NULL THEN
    SELECT s.parent_id, s.full_name, sf.month_index INTO _parent_id, _student_name, _month_idx
    FROM public.student_fees sf JOIN public.students s ON s.id = sf.student_id
    WHERE sf.id = NEW.student_fee_id;
    _label := 'propina';
  ELSE
    RETURN NEW;
  END IF;

  IF _parent_id IS NULL THEN RETURN NEW; END IF;

  -- Resolver nome do mês
  IF _month_idx IS NOT NULL AND _month_idx BETWEEN 1 AND 12 THEN
    _month_name := _month_names[_month_idx];
  ELSE
    _month_name := NULL;
  END IF;

  IF lower(NEW.status) IN ('validado', 'validated') THEN
    -- Título simples: "Pagamento registado — Maio" ou "Pagamento registado"
    IF _month_name IS NOT NULL THEN
      _title := 'Pagamento registado — ' || _month_name;
    ELSE
      _title := 'Pagamento registado';
    END IF;
    _description := COALESCE(_student_name, '') ||
      CASE WHEN _student_name IS NOT NULL THEN ' — ' ELSE '' END ||
      NEW.amount_paid::text || ' Kz';
  ELSE
    -- Rejeição: manter informativo
    _title := 'Pagamento rejeitado';
    _description := COALESCE(_student_name || ' — ', '') ||
      'Valor: ' || NEW.amount_paid::text || ' Kz' ||
      CASE WHEN NEW.rejection_reason IS NOT NULL
           THEN E'\nMotivo: ' || NEW.rejection_reason ELSE '' END;
  END IF;

  PERFORM public.notify_user(
    _parent_id, NEW.school_id, 'administrativo',
    _title,
    _description,
    '/pagamentos', NEW.validated_by, NULL
  );
  RETURN NEW;
END;
$$;
