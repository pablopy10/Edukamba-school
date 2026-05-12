/**
 * Actualiza email de login (auth.users) + profiles.email pelo painel escolar.
 * Chamador: staff da mesma escola (ADMIN/SUPER_ADMIN/DIRECTOR/SECRETARY/TESOUREIRO/… sem TEACHER/PARENT/STUDENT).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CALLER_ALLOWED = new Set([
  "ADMIN",
  "SUPER_ADMIN",
  "DIRECTOR",
  "SECRETARY",
  "TREASURER",
  "LIBRARIAN",
  "STOCK_MANAGER",
  "RECEPTIONIST",
]);

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user) return corsJson({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as { user_id?: string; email?: string };
    const targetUserId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const newEmailRaw = normalizeEmail(body.email);
    if (!targetUserId || !newEmailRaw) {
      return corsJson({ error: "user_id e email são obrigatórios" }, 400);
    }
    if (!isValidEmail(newEmailRaw)) {
      return corsJson({ error: "Email inválido" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: caller, error: cErr } = await admin
      .from("profiles")
      .select("role, school_id")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (cErr || !caller?.role) return corsJson({ error: "Perfil inválido" }, 403);

    const callerRole = caller.role as string;
    if (!CALLER_ALLOWED.has(callerRole)) {
      return corsJson({ error: "Sem permissão para alterar emails de acesso" }, 403);
    }

    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, school_id, role, email")
      .eq("id", targetUserId)
      .maybeSingle();

    if (tErr || !target?.id) return corsJson({ error: "Utilizador não encontrado" }, 404);

    const targetRole = target.role as string | null;

    // Protecções simples na mesma escola
    if (callerRole !== "SUPER_ADMIN") {
      if (!caller.school_id || caller.school_id !== target.school_id) {
        return corsJson({ error: "Apenas utilizadores da mesma escola" }, 403);
      }
    }

    // Não permitir operações sobre SUPER_ADMIN por não-plataforma
    if (targetRole === "SUPER_ADMIN" && callerRole !== "SUPER_ADMIN") {
      return corsJson({ error: "Não pode alterar este utilizador" }, 403);
    }

    const currentEmail = (target.email ?? "").trim().toLowerCase();
    if (currentEmail === newEmailRaw) {
      return corsJson({ ok: true, unchanged: true });
    }

    const { error: updAuthErr } = await admin.auth.admin.updateUserById(targetUserId, {
      email: newEmailRaw,
      email_confirm: true,
    });
    if (updAuthErr) {
      console.error("admin-update-user-email auth", updAuthErr);
      return corsJson({ error: updAuthErr.message }, 400);
    }

    await admin.from("profiles").update({ email: newEmailRaw }).eq("id", targetUserId);

    // Alunos com conta: user_id na tabela students
    await admin.from("students").update({ email: newEmailRaw }).eq("user_id", targetUserId);

    return corsJson({ ok: true });
  } catch (e) {
    console.error("admin-update-user-email", e);
    return corsJson({ error: (e as Error).message }, 500);
  }
});
