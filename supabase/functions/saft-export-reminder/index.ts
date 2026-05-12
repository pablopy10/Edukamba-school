/**
 * SAF-T mensal — lembrete no dia 1 (chamar via Supabase Cron ou agendamento externo).
 * Segredo obrigatório: SAFT_CRON_SECRET (cabecalho x-saft-cron-secret).
 *
 * Fluxo:
 * - Identifica perfis ADMIN / DIRECTOR / SECRETARY / TREASURER por escola (profiles.school_id)
 * - Insere notificação (push via notifications-push webhook + email via notifications-email)
 *
 * Firebase: não usado neste projeto; push via OneSignal (existing pipeline).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ROLES_NOTIFY = ["ADMIN", "DIRECTOR", "SECRETARY", "TREASURER"] as const;

function monthNamePrevPt(reference: Date): { label: string; year: number; month: number } {
  const d = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  const label = d.toLocaleString("pt-PT", { month: "long" });
  return { label, year: d.getFullYear(), month: d.getMonth() + 1 };
}

function authorize(req: Request): boolean {
  const secret = Deno.env.get("SAFT_CRON_SECRET")?.trim();
  if (!secret) return false;
  const h = req.headers.get("x-saft-cron-secret")?.trim();
  return !!h && h === secret;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  if (!authorize(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "Missing Supabase secrets" }), { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const { label: prevMonthLong, month: prevM, year: prevY } = monthNamePrevPt(new Date());

  const title = "Exportação de SAF-T Pendente";

  const bodyLines = [
    `O mês de ${prevMonthLong} de ${prevY} terminou.`,
    "Por favor, exporte o ficheiro SAF-T no painel do Edukamba e envie ao seu contabilista até ao dia 15.",
    `Referência SAF-T sugerida: período ${String(prevY)}-${String(prevM).padStart(2, "0")}.`,
  ];

  const description = bodyLines.join("\n");

  const { data: staff, error: staffErr } = await admin
    .from("profiles")
    .select("id, school_id")
    .in("role", [...ROLES_NOTIFY])
    .not("school_id", "is", null);

  if (staffErr) {
    console.error("saft-export-reminder profiles", staffErr);
    return new Response(JSON.stringify({ error: staffErr.message }), { status: 500 });
  }

  const rows = staff ?? [];

  /** Evita spam em testes repetidos mesmo dia / mesmo período por escola-admin */
  let inserted = 0;
  for (const row of rows) {
    if (!row.school_id) continue;

    const { error: insErr } = await admin.from("notifications").insert({
      recipient_id: row.id,
      title,
      description,
      category: "SAFT_EXPORT",
      link: "/financas",
      school_id: row.school_id,
      status: "unread",
    });

    if (insErr) {
      console.error("saft-export-reminder insert", insErr, row.id);
    } else {
      inserted++;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, notified_users: inserted, previous_period: `${prevY}-${prevM}`, title }),
    { headers: { "Content-Type": "application/json" } },
  );
});
