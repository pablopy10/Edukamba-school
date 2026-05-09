/**
 * document-sign-request — Sends email notifications to parents/teachers
 * when the school creates document_requests for them.
 *
 * Called from the frontend after bulk-inserting document_requests.
 *
 * Request body (JSON):
 *   {
 *     document_request_ids: string[],   // IDs of newly created document_requests
 *     app_url: string,                  // Base URL of the app, e.g. "https://app.edukamba.com"
 *   }
 *
 * Secrets required (Supabase Dashboard → Settings → Edge Functions → Secrets):
 *   BREVO_API_KEY        — API Key do painel Brevo
 *   BREVO_SENDER_EMAIL   — Email remetente verificado no Brevo
 *   BREVO_SENDER_NAME    — Nome do remetente (ex: Edukamba)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Email template ──────────────────────────────────────────────────────────

function buildHtml(opts: {
  recipientName: string;
  schoolName: string;
  documentTitle: string;
  documentCategory: string;
  classroomName: string | null;
  studentName: string | null;
  signUrl: string;
  expiresAt: string | null;
}): string {
  const { recipientName, schoolName, documentTitle, documentCategory, classroomName, studentName, signUrl, expiresAt } = opts;
  const firstName = recipientName.split(" ")[0] || recipientName;

  const categoryLabel = documentCategory === "assinatura"
    ? "Pedido de Assinatura"
    : documentCategory === "formulario"
    ? "Formulário para Preenchimento"
    : "Documento para Leitura";

  const headerColor = documentCategory === "assinatura"
    ? "#3b82f6"
    : documentCategory === "formulario"
    ? "#f59e0b"
    : "#22c55e";

  const headerIcon = documentCategory === "assinatura" ? "✍️" : documentCategory === "formulario" ? "📋" : "📄";

  const expiryLine = expiresAt
    ? `<p style="margin:8px 0 0;font-size:13px;color:#dc2626;font-weight:600;">⚠️ Prazo: ${new Date(expiresAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}</p>`
    : "";

  const classroomLine = classroomName
    ? `<p style="margin:0 0 6px;font-size:14px;color:#374151;">Turma: <strong>${classroomName}</strong></p>`
    : "";

  const studentLine = studentName
    ? `<p style="margin:0 0 12px;font-size:14px;color:#374151;">Educando(a): <strong>${studentName}</strong></p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${categoryLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.07);">

        <!-- Header -->
        <tr>
          <td style="background:${headerColor};padding:28px 32px;text-align:center;">
            <div style="font-size:40px;line-height:1;">${headerIcon}</div>
            <p style="margin:8px 0 0;color:#ffffff;font-size:13px;font-weight:600;
                      text-transform:uppercase;letter-spacing:1px;opacity:0.9;">
              ${categoryLabel}
            </p>
          </td>
        </tr>

        <!-- Branding -->
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
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e293b;line-height:1.3;">
              A escola enviou-lhe um documento
            </h1>
            ${classroomLine}
            ${studentLine}
            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;">
              <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;">${documentTitle}</p>
              ${expiryLine}
            </div>
            <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
              Por favor, abra o link abaixo para visualizar o documento e ${documentCategory === "assinatura" ? "assinar digitalmente" : documentCategory === "formulario" ? "preencher o formulário" : "confirmar a leitura"}.
            </p>
            <div style="text-align:center;">
              <a href="${signUrl}"
                 style="display:inline-block;background:${headerColor};color:#ffffff;text-decoration:none;
                        font-weight:700;font-size:15px;padding:14px 32px;border-radius:24px;letter-spacing:0.3px;">
                ${documentCategory === "assinatura" ? "✍️ Assinar documento" : documentCategory === "formulario" ? "📋 Preencher formulário" : "📄 Confirmar leitura"}
              </a>
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
              Abre a app Edukamba se estiver instalada, ou o browser caso contrário.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e5e7eb;text-align:center;">
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

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey      = Deno.env.get("SUPABASE_ANON_KEY")!;
    const brevoKey     = Deno.env.get("BREVO_API_KEY");
    const senderEmail  = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com";
    const senderName   = Deno.env.get("BREVO_SENDER_NAME")  ?? "Edukamba";

    // Auth — require valid user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: { document_request_ids: string[]; app_url: string } = await req.json();
    const { document_request_ids, app_url } = body;

    if (!Array.isArray(document_request_ids) || document_request_ids.length === 0 || !app_url) {
      return new Response(JSON.stringify({ error: "document_request_ids[] e app_url obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!brevoKey) {
      console.warn("document-sign-request: BREVO_API_KEY não configurado — emails ignorados.");
      return new Response(JSON.stringify({ ok: true, skipped: "brevo_not_configured", count: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRole);

    // Load all requests + their documents + recipient profiles + students + classroom
    const { data: requests, error: reqErr } = await admin
      .from("document_requests")
      .select(`
        id,
        document:document_id(title, category, expires_at, school_id),
        recipient:recipient_profile_id(id, full_name, email),
        student:student_id(full_name),
        classroom:classroom_id(name)
      `)
      .in("id", document_request_ids);

    if (reqErr || !requests) {
      return new Response(JSON.stringify({ error: reqErr?.message ?? "fetch failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get school name for all requests (usually the same school)
    const schoolIds = [...new Set((requests as any[]).map((r) => r.document?.school_id).filter(Boolean))];
    const schoolMap: Record<string, string> = {};
    for (const sid of schoolIds) {
      const { data: school } = await admin.from("schools").select("name").eq("id", sid).maybeSingle();
      if (school?.name) schoolMap[sid] = school.name;
    }

    let sent = 0;
    let skipped = 0;

    for (const req_row of requests as any[]) {
      const recipient = req_row.recipient;
      if (!recipient?.id) { skipped++; continue; }

      let recipientEmail: string | null = recipient.email ?? null;
      if (!recipientEmail) {
        const { data: authUser } = await admin.auth.admin.getUserById(recipient.id);
        recipientEmail = authUser?.user?.email ?? null;
      }
      if (!recipientEmail) { skipped++; continue; }

      const doc = req_row.document;
      const schoolName = schoolMap[doc?.school_id] ?? "Edukamba";
      const rawSignPath = `/documentos/assinar/${req_row.id}`;
      const signUrl = `https://www.edukamba.com/app-open?path=${encodeURIComponent(rawSignPath)}`;

      const html = buildHtml({
        recipientName: recipient.full_name ?? "Educador(a)",
        schoolName,
        documentTitle: doc?.title ?? "Documento",
        documentCategory: doc?.category ?? "assinatura",
        classroomName: req_row.classroom?.name ?? null,
        studentName: req_row.student?.full_name ?? null,
        signUrl,
        expiresAt: doc?.expires_at ?? null,
      });

      const brevoPayload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: recipient.full_name ?? "Destinatário" }],
        subject: `${schoolName} — ${doc?.title ?? "Documento para assinar"}`,
        htmlContent: html,
      };

      const res = await fetch(BREVO_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": brevoKey },
        body: JSON.stringify(brevoPayload),
      });

      if (res.ok) {
        sent++;
        console.log(`document-sign-request: email enviado → ${recipientEmail}`);
      } else {
        const detail = await res.text();
        console.error(`document-sign-request: Brevo [${res.status}] ${recipientEmail} — ${detail}`);
        skipped++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("document-sign-request: exceção", err);
    return new Response(JSON.stringify({ error: "Erro interno", detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
