import { supabase } from "@/integrations/supabase/client";

type NotificationPayload = {
  recipient_id: string;
  school_id: string | null;
  title: string;
  description: string;
  category: string;
  link?: string;
};

/**
 * Insere notificação na tabela `notifications`.
 * O push é disparado automaticamente pelo Database Webhook/trigger configurado no Supabase
 * que chama a edge function `notifications-push` em cada INSERT.
 */
export async function sendNotificationWithPush(payload: NotificationPayload): Promise<void> {
  await supabase.from("notifications").insert(payload);
}
