-- Permite formulários de autorização associados aos eventos escolares.
ALTER TABLE public.module_authorization_templates
  DROP CONSTRAINT IF EXISTS module_authorization_templates_module_check;

ALTER TABLE public.module_authorization_templates
  ADD CONSTRAINT module_authorization_templates_module_check CHECK (
    module IN ('extracurricular', 'transport', 'meal', 'event')
  );
