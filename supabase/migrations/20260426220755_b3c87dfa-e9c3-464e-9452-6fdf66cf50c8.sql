-- ============================================================
-- FEE RULES (regras de propinas por nível de ensino)
-- ============================================================
CREATE TABLE public.fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  grade_level text NOT NULL,
  monthly_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_day integer NOT NULL DEFAULT 10,
  months_count integer NOT NULL DEFAULT 10,
  start_month integer NOT NULL DEFAULT 9,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, academic_year_id, grade_level)
);

ALTER TABLE public.fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fee rules viewable by school members"
  ON public.fee_rules FOR SELECT TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins can insert fee rules"
  ON public.fee_rules FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update fee rules"
  ON public.fee_rules FOR UPDATE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete fee rules"
  ON public.fee_rules FOR DELETE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE TRIGGER trg_fee_rules_updated_at
  BEFORE UPDATE ON public.fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- FAMILY DISCOUNT RULES (regra automática por irmão)
-- ============================================================
CREATE TABLE public.family_discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  sibling_position integer NOT NULL,
  discount_percentage numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, sibling_position),
  CHECK (sibling_position >= 2 AND sibling_position <= 10),
  CHECK (discount_percentage >= 0 AND discount_percentage <= 100)
);

ALTER TABLE public.family_discount_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family discount rules viewable by school members"
  ON public.family_discount_rules FOR SELECT TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins can insert family discount rules"
  ON public.family_discount_rules FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update family discount rules"
  ON public.family_discount_rules FOR UPDATE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete family discount rules"
  ON public.family_discount_rules FOR DELETE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE TRIGGER trg_family_discount_rules_updated_at
  BEFORE UPDATE ON public.family_discount_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STUDENT DISCOUNTS (override manual por aluno)
-- ============================================================
CREATE TABLE public.student_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  discount_percentage numeric(5,2),
  discount_fixed_amount numeric(12,2),
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year_id),
  CHECK (
    (discount_percentage IS NOT NULL AND discount_percentage >= 0 AND discount_percentage <= 100)
    OR (discount_fixed_amount IS NOT NULL AND discount_fixed_amount >= 0)
  )
);

ALTER TABLE public.student_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student discounts viewable by school members"
  ON public.student_discounts FOR SELECT TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins can insert student discounts"
  ON public.student_discounts FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update student discounts"
  ON public.student_discounts FOR UPDATE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete student discounts"
  ON public.student_discounts FOR DELETE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE TRIGGER trg_student_discounts_updated_at
  BEFORE UPDATE ON public.student_discounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- EXPENSE CATEGORIES
-- ============================================================
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Expense categories viewable by school members"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins can manage expense categories"
  ON public.expense_categories FOR ALL TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  receipt_url text,
  payment_method text,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_school_date ON public.expenses(school_id, expense_date DESC);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Expenses viewable by school members"
  ON public.expenses FOR SELECT TO authenticated
  USING (school_id = get_my_school());

CREATE POLICY "Admins can insert expenses"
  ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can update expenses"
  ON public.expenses FOR UPDATE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role)
  WITH CHECK (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE POLICY "Admins can delete expenses"
  ON public.expenses FOR DELETE TO authenticated
  USING (school_id = get_my_school() AND get_auth_role() = 'ADMIN'::user_role);

CREATE TRIGGER trg_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STORAGE bucket para comprovativos de despesas
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "School admins can view expense receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = get_my_school()::text);

CREATE POLICY "School admins can upload expense receipts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = get_my_school()::text
    AND get_auth_role() = 'ADMIN'::user_role
  );

CREATE POLICY "School admins can delete expense receipts"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = get_my_school()::text
    AND get_auth_role() = 'ADMIN'::user_role
  );

-- ============================================================
-- Permitir gestão de student_fees pelos admins
-- ============================================================
CREATE POLICY "Admins can insert student fees"
  ON public.student_fees FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_fees.student_id
        AND s.school_id = get_my_school()
    )
    AND get_auth_role() = 'ADMIN'::user_role
  );

CREATE POLICY "Admins can update student fees"
  ON public.student_fees FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_fees.student_id
        AND s.school_id = get_my_school()
    )
    AND get_auth_role() = 'ADMIN'::user_role
  );

CREATE POLICY "Admins can delete student fees"
  ON public.student_fees FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = student_fees.student_id
        AND s.school_id = get_my_school()
    )
    AND get_auth_role() = 'ADMIN'::user_role
  );

-- ============================================================
-- Função para gerar todas as propinas do ano letivo para um aluno
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_student_fees_for_year(
  _student_id uuid,
  _academic_year_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student record;
  _rule record;
  _year record;
  _discount_percentage numeric := 0;
  _discount_fixed numeric := 0;
  _final_amount numeric;
  _sibling_count integer;
  _family_rule record;
  _override record;
  _i integer;
  _due_date date;
  _month_idx integer;
  _year_part integer;
  _created_count integer := 0;
BEGIN
  SELECT s.id, s.school_id, s.parent_id, c.grade_level
  INTO _student
  FROM students s
  LEFT JOIN classrooms c ON c.id = s.classroom_id
  WHERE s.id = _student_id;

  IF _student IS NULL OR _student.grade_level IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _rule
  FROM fee_rules
  WHERE school_id = _student.school_id
    AND grade_level = _student.grade_level
    AND (academic_year_id = _academic_year_id OR academic_year_id IS NULL)
  ORDER BY academic_year_id NULLS LAST
  LIMIT 1;

  IF _rule IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO _year FROM academic_years WHERE id = _academic_year_id;
  IF _year IS NULL THEN
    RETURN 0;
  END IF;

  -- Verificar override manual
  SELECT * INTO _override
  FROM student_discounts
  WHERE student_id = _student_id
    AND (academic_year_id = _academic_year_id OR academic_year_id IS NULL)
    AND is_active = true
  ORDER BY academic_year_id NULLS LAST
  LIMIT 1;

  IF _override IS NOT NULL THEN
    _discount_percentage := COALESCE(_override.discount_percentage, 0);
    _discount_fixed := COALESCE(_override.discount_fixed_amount, 0);
  ELSIF _student.parent_id IS NOT NULL THEN
    -- Contar irmãos (incluindo este)
    SELECT COUNT(*) INTO _sibling_count
    FROM students
    WHERE parent_id = _student.parent_id
      AND school_id = _student.school_id;

    IF _sibling_count >= 2 THEN
      -- Determinar a posição deste aluno (ordem por created_at)
      SELECT pos INTO _i FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS pos
        FROM students
        WHERE parent_id = _student.parent_id
          AND school_id = _student.school_id
      ) t WHERE id = _student_id;

      IF _i >= 2 THEN
        SELECT * INTO _family_rule
        FROM family_discount_rules
        WHERE school_id = _student.school_id
          AND sibling_position <= _i
        ORDER BY sibling_position DESC
        LIMIT 1;

        IF _family_rule IS NOT NULL THEN
          _discount_percentage := _family_rule.discount_percentage;
        END IF;
      END IF;
    END IF;
  END IF;

  _final_amount := _rule.monthly_amount * (1 - _discount_percentage / 100) - _discount_fixed;
  IF _final_amount < 0 THEN _final_amount := 0; END IF;

  -- Gerar as propinas mensais
  FOR _i IN 0.._rule.months_count - 1 LOOP
    _month_idx := ((_rule.start_month - 1 + _i) % 12) + 1;
    _year_part := EXTRACT(YEAR FROM _year.start_date)::int + ((_rule.start_month - 1 + _i) / 12);
    _due_date := make_date(_year_part, _month_idx, LEAST(_rule.due_day, 28));

    INSERT INTO student_fees (
      student_id, academic_year_id, amount_due, due_date, month_index, is_paid
    )
    VALUES (
      _student_id, _academic_year_id, _final_amount, _due_date, _month_idx, false
    );
    _created_count := _created_count + 1;
  END LOOP;

  RETURN _created_count;
END;
$$;
