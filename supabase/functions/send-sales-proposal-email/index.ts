/**
 * send-sales-proposal-email — Envia proposta comercial (PDF em anexo) via Brevo.
 *
 * Invocação desde a SPA (authenticated):
 *   supabase.functions.invoke("send-sales-proposal-email", { body: { proposal_id, pdf_base64, pdf_filename? } })
 *
 * Segredos (já partilhados com notifications-email / invite-*):
 *   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME
 *
 * Segurança: só utilizadores com profiles.role = 'SUPER_ADMIN'. O JWT do utilizador vai no Authorization.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

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

function escHtmlBasic(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface BodyPayload {
  proposal_id?: string;
  pdf_base64?: string;
  pdf_filename?: string;
}

const MAX_BASE64_CHARS = 18_500_000; // ~13.8MiB dados binários antes de MIME

function validateBase64Rough(s: string): boolean {
  if (s.length < 80) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(s.replace(/\s/g, ""));
}

function buildProposalHtml(opts: {
  title: string;
  summary: string | null;
  amountLine: string | null;
  bodyText: string;
}): string {
  const amt = opts.amountLine
    ? `<p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1e40af">${escHtmlBasic(opts.amountLine)}</p>`
    : "";
  const sum = opts.summary
    ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">${escHtmlBasic(opts.summary)}</p>`
    : "";

  const bodyHtml = `<pre style="margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.55;color:#1e293b;white-space:pre-wrap">${escHtmlBasic(
    opts.bodyText || "—",
  )}</pre>`;

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

<tr><td style="background:linear-gradient(135deg,#1d4ed8,#0f766e);padding:26px 32px;text-align:center;">
<p style="margin:0;color:#fff;font-size:22px;font-weight:800;">Edu<span style="opacity:.92">kamba</span></p>
<p style="margin:10px 0 0;color:#e0f2fe;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Proposta comercial</p>
</td></tr>

<tr><td style="padding:28px 32px;">
<h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">${escHtmlBasic(opts.title)}</h1>
${amt}
${sum}
${bodyHtml}
<p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">PDF em anexo · Documento gerado na plataforma Edukamba.</p>
</td></tr>

<tr><td style="padding:14px 32px;border-top:1px solid #e5e7eb;text-align:center;">
<p style="margin:0;font-size:11px;color:#94a3b8;">Mensagem transaccional Edukamba. Responda a este email apenas se pretender dialogar sobre a proposta.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: caller } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (caller?.role !== "SUPER_ADMIN") {
      return corsJson({ error: "Requer perfil SUPER_ADMIN" }, 403);
    }

    let json: BodyPayload;
    try {
      json = (await req.json()) as BodyPayload;
    } catch {
      return corsJson({ error: "JSON inválido" }, 400);
    }

    const proposalId = typeof json.proposal_id === "string" ? json.proposal_id.trim() : "";
    const pdfRaw = typeof json.pdf_base64 === "string" ? json.pdf_base64.trim() : "";
    if (!proposalId) return corsJson({ error: "proposal_id obrigatório" }, 400);
    if (!pdfRaw) return corsJson({ error: "pdf_base64 obrigatório" }, 400);
    if (pdfRaw.length > MAX_BASE64_CHARS) return corsJson({ error: "PDF demasiado grande" }, 413);
    if (!validateBase64Rough(pdfRaw)) return corsJson({ error: "pdf_base64 inválido" }, 400);

    const { data: proposal, error: pErr } = await admin.from("saas_sales_proposals").select("*").eq("id", proposalId).maybeSingle();
    if (pErr) return corsJson({ error: pErr.message }, 500);
    if (!proposal) return corsJson({ error: "Proposta não encontrada" }, 404);

    const to = proposal.recipient_email as string | null;
    if (!to || typeof to !== "string" || !to.includes("@")) {
      return corsJson({ error: "Proposta sem email destinatário" }, 400);
    }

    const title = proposal.title as string;
    const summary = proposal.summary as string | null | undefined;
    const bodyText = proposal.body_text as string;
    const amt = proposal.amount_estimate as number | null | undefined;
    const cur = proposal.currency as string | undefined;

    const amountLine =
      amt != null && Number.isFinite(Number(amt)) ? `Valor estimado: ${amt} ${(cur ?? "AOA").trim()}` : null;

    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoKey) {
      return corsJson({ ok: false, error: "BREVO_API_KEY não configurado" }, 503);
    }
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "Edukamba";

    const pdfClean = pdfRaw.replace(/\s/g, "");
    const fname = typeof json.pdf_filename === "string" && json.pdf_filename.trim().length > 1 && json.pdf_filename.endsWith(".pdf")
      ? json.pdf_filename.trim().slice(0, 120)
      : `Proposta-Edukamba-${proposalId.slice(0, 8)}.pdf`;

    const brevoBody = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to, name: "Cliente" }],
      subject: `${senderName} — Proposta comercial`,
      htmlContent: buildProposalHtml({ title, summary: summary ?? null, amountLine, bodyText }),
      attachment: [{ name: fname, content: pdfClean }],
    };

    const bRes = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": brevoKey },
      body: JSON.stringify(brevoBody),
    });

    const bText = await bRes.text();
    if (!bRes.ok) {
      console.error("send-sales-proposal-email Brevo", bRes.status, bText);
      return corsJson({ error: `Brevo: ${bRes.status} — ${bText.slice(0, 400)}` }, 502);
    }

    let brevoMessageId: string | null = null;
    try {
      const parsed = JSON.parse(bText) as { messageId?: string | number };
      const mid = parsed?.messageId;
      if (typeof mid === "string" || typeof mid === "number") {
        brevoMessageId = String(mid).trim() || null;
      }
    } catch {
      // Resposta textual inesperada — ignorar persistência do id
    }

    const now = new Date().toISOString();
    const { error: upErr } = await admin.from("saas_sales_proposals").update({
      status: "sent",
      sent_at: now,
      ...(brevoMessageId ? { brevo_message_id: brevoMessageId } : {}),
    }).eq("id", proposalId);

    if (upErr) {
      console.error("proposal update after send:", upErr);
      return corsJson({ ok: true, warning: "Email enviado mas falhou ao gravar estado", brevo_response: bText }, 207);
    }

    return corsJson({ ok: true, sent_at: now });
  } catch (e) {
    console.error("send-sales-proposal-email", e);
    return corsJson({ error: (e as Error).message }, 500);
  }
});
