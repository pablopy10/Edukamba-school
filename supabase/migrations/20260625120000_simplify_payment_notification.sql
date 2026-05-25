-- Simplificar notificação de pagamento validado:
-- REMOVER o trigger DB tg_notify_payment_validation que duplicava notificações.
-- O frontend já insere notificações com títulos contextuais (ex: "Pagamento registado — Maio").
-- Manter apenas 1 notificação por validação (a do frontend).

DROP TRIGGER IF EXISTS trg_notify_payment_validation ON public.payments;
