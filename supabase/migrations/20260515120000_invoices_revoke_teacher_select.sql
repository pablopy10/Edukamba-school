-- Professores não devem aceder às FT dos alunos (reverte SELECT só para TEACHER).
DROP POLICY IF EXISTS "School TEACHER read fiscal invoices" ON public.invoices;
