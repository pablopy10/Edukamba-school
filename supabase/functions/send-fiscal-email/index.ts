import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

interface SendFiscalEmailPayload {
  school_id: string;
  invoice_id: string;
  recipient_email?: string;
  recipient_name?: string;
  student_id?: string;
  document_number: string;
  document_type: "FT" | "FR" | "RC" | "NC" | "ND" | "PF" | string;
  gross_total: number;
  pdf_base64: string;
  pdf_name?: string;
}

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getDocTypeLabel(type: string): string {
  switch (type.toUpperCase()) {
    case "FT": return "Fatura";
    case "FR": return "Fatura / Recibo";
    case "RC": return "Recibo de Quitação";
    case "NC": return "Nota de Crédito";
    case "ND": return "Nota de Débito";
    case "PF": return "Fatura Pró-Forma";
    default: return "Documento Fiscal";
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body: SendFiscalEmailPayload = await req.json();

    if (!body.school_id || !body.document_number || !body.pdf_base64) {
      return corsJson({ error: "school_id, document_number e pdf_base64 são obrigatórios" }, 400);
    }

    const { data: school } = await admin.from("schools").select("name, nif, email, phone").eq("id", body.school_id).maybeSingle();
    const schoolName = school?.name ?? "Edukamba";

    // Resolver destinatário se não fornecido
    let recipientEmail = body.recipient_email?.trim();
    let recipientName = body.recipient_name?.trim() || "Encarregado de Educação";

    if (!recipientEmail && body.student_id) {
      const { data: student } = await admin.from("students").select("full_name, email, parent_id").eq("id", body.student_id).maybeSingle();
      if (student?.parent_id) {
        const { data: parentAuth } = await admin.auth.admin.getUserById(student.parent_id);
        if (parentAuth?.user?.email) {
          recipientEmail = parentAuth.user.email;
          const { data: pProfile } = await admin.from("profiles").select("full_name").eq("id", student.parent_id).maybeSingle();
          recipientName = pProfile?.full_name || recipientName;
        }
      }
      if (!recipientEmail && student?.email) {
        recipientEmail = student.email;
        recipientName = student.full_name;
      }
    }

    if (!recipientEmail && body.invoice_id) {
      const { data: inv } = await admin.from("invoices").select("cliente_nome, parent_profile_id, student_id").eq("id", body.invoice_id).maybeSingle();
      if (inv?.parent_profile_id) {
        const { data: pAuth } = await admin.auth.admin.getUserById(inv.parent_profile_id);
        if (pAuth?.user?.email) {
          recipientEmail = pAuth.user.email;
          recipientName = inv.cliente_nome || recipientName;
        }
      }
    }

    if (!recipientEmail) {
      return corsJson({ ok: true, skipped: "Nenhum email de destinatário encontrado." });
    }

    const brevoKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoKey) {
      console.warn("send-fiscal-email: BREVO_API_KEY não configurada.");
      return corsJson({ ok: true, skipped: "BREVO_API_KEY não configurada." });
    }

    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") || "noreply@edukamba.com";
    const senderName = Deno.env.get("BREVO_SENDER_NAME") || "Edukamba";

    const docTypeLabel = getDocTypeLabel(body.document_type);
    const pdfFilename = body.pdf_name || `${docTypeLabel.replace(/\s+/g, "_")}_${body.document_number.replace(/[\s/]/g, "_")}.pdf`;

    const formattedTotal = new Intl.NumberFormat("pt-AO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(body.gross_total || 0) + " Kz";

    const subject = `[${schoolName}] ${docTypeLabel} - ${body.document_number}`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; margin: 0; padding: 0; background-color: #f8fafc; }
    .container { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: #1a3a5a; padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 14px; opacity: 0.9; }
    .content { padding: 32px 24px; }
    .box { background: #f1f5f9; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #cbd5e1; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .row:last-child { border-bottom: none; font-weight: 700; font-size: 16px; color: #1a3a5a; }
    .footer { padding: 24px; text-align: center; font-size: 12px; color: #64748b; background: #f8fafc; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${esc(schoolName)}</h1>
      <p>Emissão de Documento Fiscal Certificado AGT</p>
    </div>
    <div class="content">
      <p>Prezado(a) <strong>${esc(recipientName)}</strong>,</p>
      <p>Informamos que foi emitido o seguinte documento fiscal referente à instituição <strong>${esc(schoolName)}</strong>:</p>
      
      <div class="box">
        <div class="row">
          <span>Tipo de Documento:</span>
          <span>${esc(docTypeLabel)}</span>
        </div>
        <div class="row">
          <span>Número do Documento:</span>
          <span><strong>${esc(body.document_number)}</strong></span>
        </div>
        <div class="row">
          <span>Valor Total:</span>
          <span>${esc(formattedTotal)}</span>
        </div>
      </div>

      <p>O documento certificado oficial encontra-se <strong>em anexo a este email</strong> em formato PDF para seu arquivo e conferência fiscal.</p>
      
      <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
        Também pode consultar e descarregar o histórico completo de faturas e recibos acedendo à sua área de encarregado no portal <strong>Edukamba</strong>.
      </p>
    </div>
    <div class="footer">
      <p>Documento processado por software validado pela Administração Geral Tributária (AGT).<br>Edukamba — Gestão Escolar Integrada.</p>
    </div>
  </div>
</body>
</html>
`;

    // Disparar email com o PDF anexado via Brevo
    const brevoPayload = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: recipientEmail, name: recipientName }],
      subject,
      htmlContent,
      attachment: [
        {
          name: pdfFilename,
          content: body.pdf_base64,
        },
      ],
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
      console.error("send-fiscal-email: Brevo rejeitou envio:", brevoRes.status, brevoText);
      return corsJson({ ok: false, error: "Falha no envio Brevo", detail: brevoText }, 502);
    }

    return corsJson({ ok: true, sent_to: recipientEmail, document_number: body.document_number });
  } catch (err) {
    console.error("send-fiscal-email exception:", err);
    return corsJson({ error: "Erro interno", detail: (err as Error).message }, 500);
  }
});
