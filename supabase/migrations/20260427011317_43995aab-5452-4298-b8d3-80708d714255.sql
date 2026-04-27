-- Suporte a despesas recorrentes
-- 1) Nova tabela para definir despesas recorrentes (modelos)
CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL CHECK (frequency IN ('mensal','trimestral','semestral','anual')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  payment_method TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_school ON public.recurring_expenses(school_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_active ON public.recurring_expenses(school_id, is_active);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_recurring_expenses_updated_at ON public.recurring_expenses;
CREATE TRIGGER update_recurring_expenses_updated_at
  BEFORE UPDATE ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recurring expenses viewable by school members" ON public.recurring_expenses;
CREATE POLICY "Recurring expenses viewable by school members"
  ON public.recurring_expenses FOR SELECT TO authenticated
  USING (school_id = get_my_school());

DROP POLICY IF EXISTS "Admins can insert recurring expenses" ON public.recurring_expenses;
CREATE POLICY "Admins can insert recurring expenses"
  ON public.recurring_expenses FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

DROP POLICY IF EXISTS "Admins can update recurring expenses" ON public.recurring_expenses;
CREATE POLICY "Admins can update recurring expenses"
  ON public.recurring_expenses FOR UPDATE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

DROP POLICY IF EXISTS "Admins can delete recurring expenses" ON public.recurring_expenses;
CREATE POLICY "Admins can delete recurring expenses"
  ON public.recurring_expenses FOR DELETE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- 2) Coluna na tabela expenses para ligar a despesa recorrente que originou o registo
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_expense_id UUID REFERENCES public.recurring_expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON public.expenses(recurring_expense_id);

-- 3) Função para gerar as ocorrências de uma despesa recorrente até uma data limite
CREATE OR REPLACE FUNCTION public.generate_recurring_expense_occurrences(
  _recurring_id UUID,
  _until DATE DEFAULT (CURRENT_DATE + interval '12 months')::date
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r RECORD;
  _step interval;
  _next DATE;
  _last DATE;
  _count INTEGER := 0;
BEGIN
  SELECT * INTO _r FROM public.recurring_expenses WHERE id = _recurring_id;
  IF _r IS NULL OR _r.is_active = false THEN RETURN 0; END IF;

  _step := CASE _r.frequency
    WHEN 'mensal' THEN interval '1 month'
    WHEN 'trimestral' THEN interval '3 months'
    WHEN 'semestral' THEN interval '6 months'
    WHEN 'anual' THEN interval '12 months'
  END;

  _last := LEAST(COALESCE(_r.end_date, _until), _until);
  _next := _r.start_date;

  WHILE _next <= _last LOOP
    -- inserir só se ainda não existir uma ocorrência exatamente nessa data
    IF NOT EXISTS (
      SELECT 1 FROM public.expenses
      WHERE recurring_expense_id = _r.id AND expense_date = _next
    ) THEN
      INSERT INTO public.expenses (
        school_id, category_id, description, amount, expense_date,
        payment_method, notes, recurring_expense_id, created_by
      ) VALUES (
        _r.school_id, _r.category_id, _r.description, _r.amount, _next,
        _r.payment_method, _r.notes, _r.id, _r.created_by
      );
      _count := _count + 1;
    END IF;
    _next := (_next + _step)::date;
  END LOOP;

  RETURN _count;
END;
$$;