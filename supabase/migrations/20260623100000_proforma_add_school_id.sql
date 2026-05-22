-- Adiciona school_id à tabela proforma_invoices para associar orçamentos a escolas.
-- Orçamentos do Super Admin (plataforma Edukamba para leads) ficam com school_id NULL.
-- Orçamentos criados por staff de escola ficam com school_id preenchido.

ALTER TABLE public.proforma_invoices
ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;

-- Índice para filtrar por escola
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_school_id ON public.proforma_invoices(school_id);

COMMENT ON COLUMN public.proforma_invoices.school_id IS 'UUID da escola (NULL = orçamento da plataforma Edukamba / Super Admin)';

-- Atualizar RLS: super admin vê tudo, staff da escola vê apenas os da sua escola
DROP POLICY IF EXISTS "super_admin_all_access" ON public.proforma_invoices;
DROP POLICY IF EXISTS "school_staff_access" ON public.proforma_invoices;

-- Super admin: acesso total
CREATE POLICY "super_admin_all_access" ON public.proforma_invoices
FOR ALL TO authenticated
USING (public.auth_is_platform_super_admin())
WITH CHECK (public.auth_is_platform_super_admin());

-- Staff da escola: vê e cria apenas orçamentos da sua escola
CREATE POLICY "school_staff_access" ON public.proforma_invoices
FOR ALL TO authenticated
USING (
  school_id IS NOT NULL
  AND school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
  school_id IS NOT NULL
  AND school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
);
