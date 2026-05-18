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
import { buildDocumentSignHtml, documentSignSubject } from "../_shared/documentSignEmailCopy.ts";
import { normalizeUserLocale } from "../_shared/normalizeUserLocale.ts";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        recipient:recipient_profile_id(id, full_name, email, language),
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

      const locale = normalizeUserLocale(recipient.language);

      const html = buildDocumentSignHtml({
        locale,
        recipientName: recipient.full_name ?? "Educador(a)",
        schoolName,
        documentTitle: doc?.title ?? "Documento",
        documentCategory: doc?.category ?? "assinatura",
        classroomName: req_row.classroom?.name ?? null,
        studentName: req_row.student?.full_name ?? null,
        signUrl,
        expiresAt: doc?.expires_at ?? null,
      });

      const subject = documentSignSubject({
        locale,
        schoolName,
        documentTitle: doc?.title ?? "Documento",
        documentCategory: doc?.category ?? "assinatura",
      });

      const brevoPayload = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: recipientEmail, name: recipient.full_name ?? "Destinatário" }],
        subject,
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
