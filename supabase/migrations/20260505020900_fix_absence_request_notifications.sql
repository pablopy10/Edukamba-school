-- Fix absence request notifications to use correct status strings and notify ADMIN and DIRECTOR

CREATE OR REPLACE FUNCTION trg_notify_absence_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'PENDING' AND NEW.status = 'PENDING') THEN
    -- Notify ADMINs
    PERFORM notify_users_by_role(NEW.school_id, 'ADMIN', 'Novo Pedido de Ausência', 'Foi submetido ou editado um pedido de ausência.', '/pedidos', 'pedidos');
    -- Notify DIRECTORs
    PERFORM notify_users_by_role(NEW.school_id, 'DIRECTOR', 'Novo Pedido de Ausência', 'Foi submetido ou editado um pedido de ausência.', '/pedidos', 'pedidos');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'APPROVED' THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (NEW.requester_id, 'Pedido Aprovado', 'O seu pedido de ausência foi aprovado.', '/pedidos', 'pedidos', NEW.school_id);
    ELSIF NEW.status = 'REJECTED' THEN
      INSERT INTO public.notifications (recipient_id, title, description, link, category, school_id)
      VALUES (NEW.requester_id, 'Pedido Rejeitado', 'O seu pedido de ausência foi rejeitado.', '/pedidos', 'pedidos', NEW.school_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
