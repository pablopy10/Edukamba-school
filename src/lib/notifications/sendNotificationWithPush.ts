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
 * Insere notificação na tabela E dispara push notification via edge function.
 * Garante que o push é enviado independentemente da configuração de Database Webhooks.
 */
export async function sendNotificationWithPush(payload: NotificationPayload): Promise<void> {
  // 1. Inserir na tabela notifications (dispara email via webhook se configurado)
  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert(payload)
    .select("id")
    .single();

  if (error || !inserted) return;

  // 2. Chamar edge function notifications-push directamente
  try {
    await supabase.functions.invoke("notifications-push", {
      body: {
        type: "INSERT",
        table: "notifications",
        record: {
          id: inserted.id,
          recipient_id: payload.recipient_id,
          title: payload.title,
          description: payload.description,
          link: payload.link ?? "",
          category: payload.category,
          school_id: payload.school_id,
        },
      },
    });
  } catch {
    // Push failure is non-blocking
  }
}
