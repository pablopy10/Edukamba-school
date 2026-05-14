-- Permite à administração da escola corrigir uma submissão de autorização (respostas, assinatura, anexos).
-- Auditoria: registo AFTER UPDATE na tabela `audit_logs` via `log_audit_event`.
-- Mantém invariantes do registo original (aluno, modelo, autor original, timestamps).

CREATE OR REPLACE FUNCTION public.enforce_module_authorization_submission_update_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.school_id IS DISTINCT FROM NEW.school_id
    OR OLD.template_id IS DISTINCT FROM NEW.template_id
    OR OLD.student_id IS DISTINCT FROM NEW.student_id
    OR OLD.submitted_by IS DISTINCT FROM NEW.submitted_by
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'module_authorization_submissions: apenas responses, signature_data e attachment_urls podem ser alterados pela administração';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_module_auth_sub_immutable_bounds ON public.module_authorization_submissions;

CREATE TRIGGER trg_module_auth_sub_immutable_bounds
  BEFORE UPDATE ON public.module_authorization_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_module_authorization_submission_update_immutable();

DROP POLICY IF EXISTS "Staff update module auth submissions" ON public.module_authorization_submissions;

CREATE POLICY "Staff update module auth submissions"
  ON public.module_authorization_submissions FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school()
    AND public.auth_is_module_auth_staff_viewer()
  )
  WITH CHECK (
    school_id = public.get_my_school()
    AND public.auth_is_module_auth_staff_viewer()
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'module_authorization_submissions'
  )
  THEN
    PERFORM public._ensure_audit_trigger('module_authorization_submissions');
  END IF;
END $$;
