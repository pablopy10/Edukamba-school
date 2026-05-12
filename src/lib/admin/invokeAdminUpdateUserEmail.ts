import { supabase } from "@/integrations/supabase/client";

type EdgeBody = { ok?: boolean; unchanged?: boolean; error?: string };

/**
 * Altera o email de login (Supabase Auth) e sincroniza `profiles.email`.
 * Orquestrado pela Edge Function `admin-update-user-email` com JWT do utilizador staff.
 */
export async function invokeAdminUpdateUserEmail(userId: string, email: string): Promise<{ ok: boolean; message?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!userId.trim() || !trimmed) return { ok: false, message: "Email ou utilizador inválido." };

  const { data, error } = await supabase.functions.invoke("admin-update-user-email", {
    body: { user_id: userId.trim(), email: trimmed },
  });
  if (error) return { ok: false, message: error.message };

  const body = (data ?? {}) as EdgeBody;
  if (typeof body.error === "string") return { ok: false, message: body.error };
  if (body.ok === true || body.unchanged === true) return { ok: true };
  return { ok: false, message: "Resposta inválida do servidor." };
}
