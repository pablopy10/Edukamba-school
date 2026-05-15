-- Align permission module keys with app navigation (ModulesContext / Sidebar).

-- role_permissions: resolve duplicates before rename (UNIQUE school_id, role, module)
DELETE FROM public.role_permissions a
USING public.role_permissions b
WHERE a.module = 'horarios' AND b.module = 'horario'
  AND a.school_id = b.school_id AND a.role = b.role;

DELETE FROM public.role_permissions a
USING public.role_permissions b
WHERE a.module = 'pagamentos' AND b.module = 'propinas'
  AND a.school_id = b.school_id AND a.role = b.role;

UPDATE public.role_permissions SET module = 'horario' WHERE module = 'horarios';
UPDATE public.role_permissions SET module = 'propinas' WHERE module = 'pagamentos';

-- user_permissions: UNIQUE user_id, module
DELETE FROM public.user_permissions a
USING public.user_permissions b
WHERE a.module = 'horarios' AND b.module = 'horario' AND a.user_id = b.user_id AND a.school_id = b.school_id;

DELETE FROM public.user_permissions a
USING public.user_permissions b
WHERE a.module = 'pagamentos' AND b.module = 'propinas' AND a.user_id = b.user_id AND a.school_id = b.school_id;

UPDATE public.user_permissions SET module = 'horario' WHERE module = 'horarios';
UPDATE public.user_permissions SET module = 'propinas' WHERE module = 'pagamentos';
