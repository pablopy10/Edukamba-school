/**
 * Envio automático (Brevo) ao emitir FT fiscal — encarregado do aluno.
 * Respeita notification_preferences.channel = 'invoice_issued' (default: ligado).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

/** Inline (evita import `./appLink.ts`: o bundle da Edge só inclui a pasta da função e resolve paths mal). */
const WEB_BASE_APP_OPEN = "https://www.edukamba.com";

function appOpenLink(pathOrUrl: string): string {
  let path: string;
  if (pathOrUrl.startsWith("http")) {
    try {
      const u = new URL(pathOrUrl);
      path = u.pathname + (u.search ?? "");
    } catch {
      path = "/dashboard";
    }
  } else {
    path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  }
  return `${WEB_BASE_APP_OPEN}/app-open?path=${encodeURIComponent(path)}`;
}

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const CHANNEL_INVOICE_ISSUED = "invoice_issued";

function escHtmlBasic(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(amount: number, currency: string): string {
  const c = (currency || "AOA").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${c}`;
  }
}

function uint8ToBase64(u8: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function sanitizeFilename(raw: string): string {
  const t = raw.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
  return t.length > 0 ? t : "fatura";
}

async function buildMinimalInvoicePdf(args: {
  schoolName: string;
  documentNumber: string;
  invoiceDate: string;
  grossTotal: number;
  currency: string;
  lineDescription: string;
  clienteNome: string;
  clienteNif: string;
  studentName: string;
  hashShort: string;
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const x = 48;
  const textColor = rgb(0.12, 0.14, 0.18);

  const pushLines = (text: string, size: number, bold = false) => {
    const f = bold ? fontBold : font;
    const maxChars = 85;
    const clean = text.replace(/\r\n/g, "\n");
    const parts = clean.split("\n");
    for (const part of parts) {
      for (let i = 0; i < part.length; i += maxChars) {
        const slice = part.slice(i, i + maxChars);
        if (slice.trim()) {
          page.drawText(slice, { x, y, size, font: f, color: textColor });
          y -= size + 5;
        }
      }
    }
  };

  pushLines("FACTURA-RECIBO (resumo)", 13, true);
  y -= 4;
  pushLines(args.schoolName, 12, true);
  y -= 10;
  pushLines(`Documento: ${args.documentNumber}`, 11, true);
  pushLines(`Data: ${args.invoiceDate}`, 10);
  pushLines(`Total: ${fmtMoney(args.grossTotal, args.currency)}`, 11, true);
  y -= 6;
  pushLines(`Serviço: ${args.lineDescription}`, 10);
  y -= 6;
  pushLines(`Cliente (fiscal): ${args.clienteNome}`, 10);
  pushLines(`Contribuinte: ${args.clienteNif}`, 10);
  pushLines(`Aluno: ${args.studentName}`, 10);
  y -= 8;
  pushLines("Hash AGT (documento completo na app):", 9, true);
  pushLines(args.hashShort, 8);
  y -= 10;
  pushLines(
    "PDF resumido. O PDF oficial com layout completo está disponível em Edukamba > Pagamentos após iniciar sessão.",
    8,
  );

  return pdfDoc.save();
}

function buildHtml(opts: {
  schoolName: string;
  recipientFirstName: string;
  documentNumber: string;
  invoiceDate: string;
  amountLabel: string;
  lineDescription: string;
  studentName: string;
  openAppUrl: string;
}): string {
  const { schoolName, recipientFirstName, documentNumber, invoiceDate, amountLabel, lineDescription, studentName, openAppUrl } =
    opts;
  return `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;"><tr><td align="center">
<table width="600" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">
<tr><td style="background:#1a3a5a;padding:24px;text-align:center;">
<p style="margin:0;font-size:13px;font-weight:600;letter-spacing:1px;color:#e2e8f0;text-transform:uppercase;">Fatura emitida</p>
</td></tr>
<tr><td style="padding:24px 28px;">
<p style="margin:0 0 8px;font-size:13px;color:#64748b;">Olá, <strong style="color:#1e293b;">${escHtmlBasic(recipientFirstName)}</strong></p>
<p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1e293b;">${escHtmlBasic(schoolName)}</p>
<p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.55;">Foi emitida a fatura <strong>${escHtmlBasic(documentNumber)}</strong> (${escHtmlBasic(
    invoiceDate,
  )}) no valor de <strong>${escHtmlBasic(amountLabel)}</strong>.</p>
<p style="margin:0 0 8px;font-size:13px;color:#475569;"><strong>Serviço:</strong> ${escHtmlBasic(lineDescription)}</p>
<p style="margin:0 0 20px;font-size:13px;color:#475569;"><strong>Aluno:</strong> ${escHtmlBasic(studentName)}</p>
<p style="margin:0 0 18px;font-size:13px;color:#64748b;">Segue em anexo um PDF com o resumo desta fatura. Na app pode consultar o documento completo e descarregar o PDF oficial.</p>
<div style="text-align:center;margin-bottom:8px;">
<a href="${openAppUrl}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:22px;">Abrir Pagamentos</a>
</div>
<p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;">Mensagem automática Edukamba — não responda a este email.</p>
</td></tr></table></td></tr></table></body></html>`;
}

type InvRow = {
  id: string;
  school_id: string;
  document_number: string;
  invoice_date: string;
  gross_total: number;
  currency: string;
  line_description: string;
  cliente_nome: string;
  cliente_nif: string;
  document_hash: string | null;
  student_id: string | null;
  parent_profile_id: string | null;
};

export async function sendInvoiceIssuedEmailForId(
  admin: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: boolean; skipped?: string }> {
  const brevoKey = Deno.env.get("BREVO_API_KEY")?.trim();
  if (!brevoKey) {
    console.warn("sendInvoiceIssuedEmail: BREVO_API_KEY em falta — email não enviado.");
    return { ok: true, skipped: "no brevo" };
  }

  const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "noreply@edukamba.com";
  const senderName = Deno.env.get("BREVO_SENDER_NAME") ?? "Edukamba";

  const { data: invRaw, error: invErr } = await admin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (invErr || !invRaw) {
    console.error("sendInvoiceIssuedEmail: invoice load", invErr);
    return { ok: false, skipped: "invoice not found" };
  }
  const inv = invRaw as InvRow;

  const { data: school } = await admin.from("schools").select("name").eq("id", inv.school_id).maybeSingle();
  const schoolName = school?.name?.trim() || "Escola";

  let studentName = inv.cliente_nome?.trim() || "Aluno";
  let parentId: string | null = inv.parent_profile_id;
  let studentEmail: string | null = null;

  if (inv.student_id) {
    const { data: st } = await admin
      .from("students")
      .select("full_name, email, parent_id")
      .eq("id", inv.student_id)
      .maybeSingle();
    if (st?.full_name?.trim()) studentName = st.full_name.trim();
    studentEmail = typeof st?.email === "string" && st.email.includes("@") ? st.email.trim() : null;
    if (!parentId && st?.parent_id) parentId = st.parent_id;
  }

  let recipientEmail: string | null = null;
  let recipientName = "Encarregado";

  if (parentId) {
    const { data: authUser } = await admin.auth.admin.getUserById(parentId);
    const e = authUser?.user?.email?.trim();
    if (e) {
      recipientEmail = e;
      const { data: prof } = await admin.from("profiles").select("full_name").eq("id", parentId).maybeSingle();
      recipientName = prof?.full_name?.trim() || "Encarregado";
    }
    if (recipientEmail) {
      const { data: pref } = await admin
        .from("notification_preferences")
        .select("enabled")
        .eq("user_id", parentId)
        .eq("channel", CHANNEL_INVOICE_ISSUED)
        .maybeSingle();
      if (pref && pref.enabled === false) {
        console.log(`sendInvoiceIssuedEmail: user ${parentId} desactivou ${CHANNEL_INVOICE_ISSUED}`);
        return { ok: true, skipped: "user disabled channel" };
      }
    }
  }

  if (!recipientEmail && studentEmail) {
    recipientEmail = studentEmail;
    recipientName = studentName;
  }

  if (!recipientEmail) {
    console.warn("sendInvoiceIssuedEmail: sem email para encarregado/aluno");
    return { ok: true, skipped: "no email" };
  }

  const hash = (inv.document_hash ?? "").trim();
  const hashShort = hash.length > 180 ? `${hash.slice(0, 90)} … ${hash.slice(-40)}` : hash || "(indisponível)";

  const amountLabel = fmtMoney(Number(inv.gross_total), inv.currency);
  const invoiceDatePt = inv.invoice_date?.slice(0, 10) ?? "—";
  const firstName = recipientName.split(/\s+/)[0] || recipientName;
  const openAppUrl = appOpenLink("/pagamentos");

  const pdfBytes = await buildMinimalInvoicePdf({
    schoolName,
    documentNumber: inv.document_number,
    invoiceDate: invoiceDatePt,
    grossTotal: Number(inv.gross_total),
    currency: inv.currency || "AOA",
    lineDescription: inv.line_description?.trim() || "Serviços educativos",
    clienteNome: inv.cliente_nome?.trim() || studentName,
    clienteNif: inv.cliente_nif?.trim() || "—",
    studentName,
    hashShort,
  });

  const attachmentName = `${sanitizeFilename(inv.document_number)}.pdf`;
  const html = buildHtml({
    schoolName,
    recipientFirstName: firstName,
    documentNumber: inv.document_number,
    invoiceDate: invoiceDatePt,
    amountLabel,
    lineDescription: inv.line_description?.trim() || "Propina / serviços educativos",
    studentName,
    openAppUrl,
  });

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": brevoKey },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: recipientEmail, name: recipientName }],
      subject: `${schoolName} — Fatura ${inv.document_number}`,
      htmlContent: html,
      attachment: [{ content: uint8ToBase64(pdfBytes), name: attachmentName }],
    }),
  });

  if (!res.ok) console.error("sendInvoiceIssuedEmail Brevo:", res.status, await res.text());
  else console.log(`sendInvoiceIssuedEmail: enviado para ${recipientEmail}`);

  return { ok: res.ok };
}
