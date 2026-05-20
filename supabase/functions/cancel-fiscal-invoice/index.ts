/**
 * Anula FT existente (cancelamento directo no software — estado A no SAF-T).
 * Não emite novo documento; actualiza a mesma linha em `invoices`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANCEL_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "DIRECTOR", "TREASURER"]);

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 200);
  return t.length >= 6 ? t : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return corsJson({ error: "Variáveis Supabase em falta" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "JSON inválido" }, 400);
  }

  const invoice_id = (body as { invoice_id?: unknown }).invoice_id;
  const cancellation_reason = normalizeReason((body as { cancellation_reason?: unknown }).cancellation_reason);

  if (typeof invoice_id !== "string" || !invoice_id.trim()) {
    return corsJson({ error: "invoice_id obrigatório" }, 400);
  }
  if (!cancellation_reason) {
    return corsJson({ error: "cancellation_reason obrigatório (mínimo 6 caracteres)." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

  const { data: profile, error: profErr } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profErr) return corsJson({ error: profErr.message }, 400);
  const role = String(profile?.role ?? "");
  if (!CANCEL_ROLES.has(role)) {
    return corsJson({ error: "Sem permissão para anular faturas." }, 403);
  }

  const { data: inv, error: invErr } = await userClient
    .from("invoices")
    .select("id, document_number, invoice_status, school_id")
    .eq("id", invoice_id.trim())
    .maybeSingle();

  if (invErr) return corsJson({ error: invErr.message }, 400);
  if (!inv?.id) return corsJson({ error: "Fatura não encontrada ou sem permissão." }, 404);

  const status = String(inv.invoice_status ?? "N").trim().toUpperCase();
  if (status === "A") {
    return corsJson({ error: "Esta fatura já está anulada." }, 409);
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await userClient
    .from("invoices")
    .update({
      invoice_status: "A",
      cancellation_reason,
      cancelled_at: nowIso,
      cancelled_by: userData.user.id,
    })
    .eq("id", inv.id)
    .select("id, document_number")
    .single();

  if (updErr) return corsJson({ error: updErr.message }, 400);

  return corsJson({
    ok: true,
    invoice_id: String(updated?.id ?? inv.id),
    document_number: updated?.document_number ?? inv.document_number,
  });
});
