-- ==============================================================================
-- Daily Reminders Cron Job
-- Requisitos: pg_cron habilitado
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION process_daily_payment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Lembrete de 3 dias antes (Propinas/Taxas)
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT
    p.id,
    'Lembrete de Pagamento: ' || ef.fee_type,
    'O pagamento de ' || ef.fee_type || ' do educando ' || s.full_name || ' vence em 3 dias.',
    '/pagamentos',
    'pagamentos',
    ef.school_id
  FROM public.enrollment_fees ef
  JOIN public.students s ON s.id = ef.student_id
  JOIN public.profiles p ON p.id = s.parent_id
  WHERE ef.is_paid = false
    AND ef.due_date::date = CURRENT_DATE + INTERVAL '3 days';

  -- Lembrete de 3 dias antes (Atividades Extracurriculares)
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT
    p.id,
    'Lembrete de Pagamento: Extracurricular',
    'O pagamento da atividade extracurricular do educando ' || s.full_name || ' vence em 3 dias.',
    '/pagamentos',
    'pagamentos',
    af.school_id
  FROM public.activity_fees af
  JOIN public.students s ON s.id = af.student_id
  JOIN public.profiles p ON p.id = s.parent_id
  WHERE af.is_paid = false
    AND af.due_date::date = CURRENT_DATE + INTERVAL '3 days';

  -- 2. Lembrete no dia do vencimento (Propinas/Taxas)
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT
    p.id,
    'Pagamento Vence Hoje: ' || ef.fee_type,
    'O pagamento de ' || ef.fee_type || ' do educando ' || s.full_name || ' vence hoje.',
    '/pagamentos',
    'pagamentos',
    ef.school_id
  FROM public.enrollment_fees ef
  JOIN public.students s ON s.id = ef.student_id
  JOIN public.profiles p ON p.id = s.parent_id
  WHERE ef.is_paid = false
    AND ef.due_date::date = CURRENT_DATE;

  -- Lembrete no dia do vencimento (Atividades Extracurriculares)
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT
    p.id,
    'Pagamento Vence Hoje: Extracurricular',
    'O pagamento da atividade extracurricular do educando ' || s.full_name || ' vence hoje.',
    '/pagamentos',
    'pagamentos',
    af.school_id
  FROM public.activity_fees af
  JOIN public.students s ON s.id = af.student_id
  JOIN public.profiles p ON p.id = s.parent_id
  WHERE af.is_paid = false
    AND af.due_date::date = CURRENT_DATE;

  -- 3. Lembrete 7 dias após matrícula aprovada (sem pagamento)
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT
    p.id,
    'Matrícula Pendente de Pagamento',
    'A matrícula de ' || s.full_name || ' foi aprovada há 7 dias e ainda aguarda pagamento.',
    '/pagamentos',
    'pagamentos',
    e.school_id
  FROM public.enrollments e
  JOIN public.students s ON s.id = e.student_id
  JOIN public.profiles p ON p.id = s.parent_id
  WHERE e.status = 'approved'
    AND e.updated_at::date = CURRENT_DATE - INTERVAL '7 days'
    AND EXISTS (
      SELECT 1 FROM public.enrollment_fees ef2
      WHERE ef2.enrollment_id = e.id AND ef2.fee_type ILIKE '%matrícula%' AND ef2.is_paid = false
    );

  -- 4. Notificar Funcionários/Secretaria sobre pagamentos por validar (comprovativos anexados)
  INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
  SELECT
    p.id,
    'Comprovativos Pendentes',
    'Existem comprovativos de pagamento aguardando validação.',
    '/pagamentos',
    'pagamentos',
    p.school_id
  FROM public.profiles p
  WHERE p.role IN ('SUPER_ADMIN') -- Ajuste de roles conforme necessário para quem gere pagamentos
    AND p.is_active = true
    AND EXISTS (
      SELECT 1 FROM public.school_invoices si 
      WHERE si.school_id = p.school_id 
        AND (si.status = 'pending' OR si.status = 'submitted')
        AND si.proof_url IS NOT NULL
    );
END;
$$;

-- Remove cron job existente se houver
SELECT cron.unschedule('daily_payment_reminders') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily_payment_reminders'
);

-- Agendar para correr todos os dias às 08:00 AM UTC
SELECT cron.schedule(
  'daily_payment_reminders',
  '0 8 * * *',
  'SELECT process_daily_payment_reminders()'
);
