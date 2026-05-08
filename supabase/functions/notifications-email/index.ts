/**
 * notifications-email — Envia emails transacionais via Brevo (api.brevo.com).
 *
 * Acionado pelo mesmo Database Webhook que o notifications-push:
 *   Evento: INSERT em public.notifications
 *   Método: POST para esta função
 *
 * Segredos necessários (Supabase Dashboard → Settings → Edge Functions → Secrets):
 *   BREVO_API_KEY          — API Key do painel Brevo (API Keys → Create a new API key)
 *   BREVO_SENDER_EMAIL     — Email do remetente verificado no Brevo (ex: noreply@edukamba.com)
 *   BREVO_SENDER_NAME      — Nome do remetente (ex: Edukamba)
 *
 * Categorias suportadas:
 *   ENROLLMENT_APPROVED    → Matrícula aprovada
 *   ATTENDANCE             → Falta, atraso ou falta disciplinar
 *   ASSESSMENT_CREATED     → Criação de avaliação
 *   ASSESSMENT_REMINDER    → Lembrete de avaliação
 *   RESULTS_PUBLISHED      → Publicação de resultados
 *   PAYMENT                → Cobrança (propina, matrícula, extracurricular, transporte)
 *   ABSENCE_REQUEST        → Pedido de ausência
 *   MATERIAL_REQUEST       → Pedido de material
 *   LOW_STOCK              → Alerta de stock baixo
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const USER_EMAIL_CHANNEL = "user_email";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

// ─── Auth ────────────────────────────────────────────────────────────────────

function authorize(req: Request): boolean {
  // 1. Shared secret (header personalizado opcional)
  const shared = Deno.env.get("NOTIFICATIONS_EMAIL_WEBHOOK_SECRET");
  if (shared) {
    const h = req.headers.get("x-notification-email-secret")?.trim();
    if (h === shared) return true;
  }

  // 2. Comparação direta com SUPABASE_SERVICE_ROLE_KEY
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rawApikey = req.headers.get("apikey")?.trim();
  const rawAuth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (serviceRole && (rawApikey === serviceRole || rawAuth === serviceRole)) return true;

  // 3. Fallback: decodificar o JWT (base64url) e verificar role=service_role
  //    (o Database Webhook do Supabase envia o service_role JWT como Bearer token)
  const token = rawAuth ?? rawApikey ?? "";
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        // JWT usa base64url: trocar - por + e _ por / antes de atob()
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(
          Math.ceil(parts[1].length / 4) * 4, "=",
        );
        const payload = JSON.parse(atob(b64));
        if (payload.role === "service_role" && payload.iss === "supabase") return true;
      }
    } catch {
      // token inválido — continua para return false
    }
  }

  return false;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface WebhookPayload {
  type?: string;
  table?: string;
  record?: NotificationRow;
}

interface NotificationRow {
  id?: string;
  recipient_id?: string;
  title?: string;
  description?: string | null;
  link?: string | null;
  category?: string | null;
  school_id?: string | null;
  actor_name?: string | null;
}

function extractRecord(body: unknown): NotificationRow | null {
  if (!body || typeof body !== "object") return null;
  const o = body as WebhookPayload & NotificationRow;
  if (o.table != null && o.table !== "notifications") return null;
  if (o.type != null && String(o.type).toUpperCase() !== "INSERT") return null;
  if (o.record && typeof o.record === "object") return o.record as NotificationRow;
  if (typeof o.recipient_id === "string" && typeof o.title === "string") return o as NotificationRow;
  return null;
}

// ─── Email templates ─────────────────────────────────────────────────────────

interface CategoryMeta {
  color: string;
  headerIcon: string;
  label: string;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  ENROLLMENT_APPROVED:    { color: "#22c55e", headerIcon: "✅", label: "Matrícula Aprovada" },
  ATTENDANCE:             { color: "#f59e0b", headerIcon: "⚠️", label: "Registo de Assiduidade" },
  ASSESSMENT_CREATED:     { color: "#3b82f6", headerIcon: "📝", label: "Nova Avaliação" },
  ASSESSMENT_REMINDER:    { color: "#8b5cf6", headerIcon: "🔔", label: "Lembrete de Avaliação" },
  RESULTS_PUBLISHED:      { color: "#06b6d4", headerIcon: "📊", label: "Resultados Publicados" },
  PAYMENT:                { color: "#ef4444", headerIcon: "💳", label: "Cobrança" },
  ABSENCE_REQUEST:        { color: "#64748b", headerIcon: "📋", label: "Pedido de Ausência" },
  MATERIAL_REQUEST:       { color: "#f97316", headerIcon: "📦", label: "Pedido de Material" },
  LOW_STOCK:              { color: "#dc2626", headerIcon: "⚡", label: "Alerta de Stock" },
  DOCUMENT_SIGN_REQUEST:  { color: "#3b82f6", headerIcon: "✍️", label: "Documento para Assinar" },
  DOCUMENT_SIGNED:        { color: "#22c55e", headerIcon: "✅", label: "Documento Assinado" },
};

function buildHtml(opts: {
  title: string;
  description: string;
  category: string;
  link: string | null;
  schoolName: string;
  recipientName: string;
}): string {
  const { title, description, category, link, schoolName, recipientName } = opts;
  const meta = CATEGORY_META[category] ?? { color: "#3b82f6", headerIcon: "📬", label: "Notificação" };
  const firstName = recipientName.split(" ")[0] || recipientName;

  const linkBtn = link
    ? `<div style="text-align:center;margin-top:28px;">
         <a href="${link}"
            style="display:inline-block;background:${meta.color};color:#ffffff;text-decoration:none;
                   font-weight:600;font-size:14px;padding:12px 28px;border-radius:24px;letter-spacing:0.3px;">
           Ver detalhes →
         </a>
       </div>`
    : "";

  const descParagraphs = description
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 10px;color:#374151;font-size:15px;line-height:1.6;">${p}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Header band -->
        <tr>
          <td style="background:${meta.color};padding:28px 32px;text-align:center;">
            <div style="font-size:36px;line-height:1;">${meta.headerIcon}</div>
            <p style="margin:8px 0 0;color:#ffffff;font-size:13px;font-weight:600;
                      text-transform:uppercase;letter-spacing:1px;opacity:0.9;">
              ${meta.label}
            </p>
          </td>
        </tr>

        <!-- Brand logo row -->
        <tr>
          <td style="padding:20px 32px 0;text-align:center;border-bottom:1px solid #e5e7eb;">
            <span style="font-size:22px;font-weight:800;color:#1e293b;letter-spacing:-0.5px;">
              Edu<span style="color:#93c5fd;">kamba</span>
            </span>
            <p style="margin:4px 0 16px;font-size:12px;color:#94a3b8;">${schoolName}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 6px;font-size:13px;color:#94a3b8;">Olá, <strong style="color:#1e293b;">${firstName}</strong></p>
            <h1 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#1e293b;line-height:1.3;">${title}</h1>
            ${descParagraphs}
            ${linkBtn}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              Este email foi enviado automaticamente pelo sistema Edukamba.<br />
              Por favor não responda diretamente a esta mensagem.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!authorize(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const record = extractRecord(body);
  if (!record) {
    return new Response(JSON.stringify({ ok: true, skipped: "not_a_notification_insert" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const recipientId = record.recipient_id?.trim();
  const title = record.title?.trim();
  const description = (record.description ?? "").trim() || (title ?? "");
  const category = record.category?.trim() ?? "GENERIC";
  const link = record.link?.trim() || null;
  const schoolId = record.school_id ?? null;

  // DOCUMENT_SIGN_REQUEST already sends a dedicated rich email via the
  // document-sign-request Edge Function — skip here to avoid duplicates.
  if (category === "DOCUMENT_SIGN_REQUEST") {
    return new Response(JSON.stringify({ ok: true, skipped: "handled_by_document_sign_request" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!recipientId || !title) {
    return new Response(JSON.stringify({ error: "recipient_id e title obrigatórios" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com";
  const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "Edukamba";

  if (!brevoKey) {
    console.warn("notifications-email: BREVO_API_KEY não configurado — email ignorado.");
    return new Response(JSON.stringify({ ok: true, skipped: "brevo_not_configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }


  const admin = createClient(supabaseUrl, serviceRole);

  // 1. Check email preference
  const { data: emailPref } = await admin
    .from("notification_preferences")
    .select("enabled")
    .eq("user_id", recipientId)
    .eq("channel", USER_EMAIL_CHANNEL)
    .maybeSingle();

  if (emailPref?.enabled === false) {
    return new Response(JSON.stringify({ ok: true, skipped: "email_disabled" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Fetch recipient email + name (profiles first, fallback to auth.users)
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", recipientId)
    .maybeSingle();

  const recipientName = profile?.full_name?.trim() ?? "Utilizador";
  let recipientEmail = profile?.email?.trim() || null;

  if (!recipientEmail) {
    // Fallback: buscar email em auth.users
    const { data: authUser } = await admin.auth.admin.getUserById(recipientId);
    recipientEmail = authUser?.user?.email?.trim() || null;
  }

  if (!recipientEmail) {
    console.warn(`notifications-email: sem email para recipient_id=${recipientId}`);
    return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Fetch school name
  let schoolName = "Edukamba";
  if (schoolId) {
    const { data: school } = await admin
      .from("schools")
      .select("name")
      .eq("id", schoolId)
      .maybeSingle();
    if (school?.name) schoolName = school.name;
  }

  // 4. Resolve relative links to full URLs so Brevo tracking redirects work
  const appUrl = (Deno.env.get("APP_URL") ?? "https://app.edukamba.com").replace(/\/$/, "");
  const resolvedLink = link
    ? link.startsWith("http") ? link : `${appUrl}${link}`
    : null;

  // 5. Build email
  const htmlContent = buildHtml({ title, description, category, link: resolvedLink, schoolName, recipientName });

  // 6. Send via Brevo
  const brevoPayload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: recipientEmail, name: recipientName }],
    subject: title,
    htmlContent,
  };

  const brevoRes = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify(brevoPayload),
  });

  const brevoText = await brevoRes.text();
  if (!brevoRes.ok) {
    // Retornar 200 para o webhook não entrar em retry loop.
    // O detalhe do erro fica nos logs do Edge Function (Supabase Dashboard → Edge Functions → Logs).
    console.error(
      `notifications-email: Brevo rejeitou [${brevoRes.status}] to=${recipientEmail} category=${category} detail=${brevoText}`,
    );
    return new Response(
      JSON.stringify({ ok: false, brevo_status: brevoRes.status, detail: brevoText }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`notifications-email: enviado para ${recipientEmail} (category=${category})`);
  return new Response(JSON.stringify({ ok: true, to: recipientEmail }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  } catch (err) {
    console.error("notifications-email: exceção não esperada", err);
    return new Response(
      JSON.stringify({ error: "Erro interno", detail: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
