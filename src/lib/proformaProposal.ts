/**
 * «Fatura Proforma» Edukamba — layout alinhado ao modelo oficial (Super Admin → Propostas).
 * Corpo opcionalmente JSON estruturado; caso contrário usa título/resumo/texto + valor estimado.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const NAVY = [26, 54, 93] as const;
/** Logo público usado no modelo HTML original (PDF usa texto por defeito por ser síncrono). */
export const EDUKAMBA_PROFORMA_LOGO_URL =
  "https://sd-1235281.out-smart.com/files/VnA2ZzE4bkQ5VDBPTkV6VDZSV0d5bG8yV2Z0cWdTMjhjbHQ5OU9WTFVHcz0=/NmlPaE9qWTdBRWp1aVl4Wm14MWYrd24vZy9hNWlxaXJObEVFeE16emtsbz0=/NkkzNklWMDd1UnFoRlJXV091MjhXZz09/dllIZlQrRzk4UmtWL2Q4Ykd3M3pQK2ZGdjZVazJQZml4czMxSUlvOGw4UT0=/ZkRZN3AyTHdaLzlGYmdRTEZuUUlFbEJzRzhFSndwb3FOK0Z4WHRieUJjdDNFemxLU3hWNERlU0RzVHN3QW1xQQ==/NkVVa3JOa1ZHRWpsc2ZXV0RCTlJsVERkV3JDbkJOR0F4MGg4ck9yOG1VazRxcHhFcVplbFhzTGNtcmtuTXYyNlRab0lENUw4NzlDT0tlMytxWVJoMlNFTVI3Y3F4YUZyaHZCeUtkVnN4SUU9/NkkzNklWMDd1UnFoRlJXV091MjhXZz09/NkkzNklWMDd1UnFoRlJXV091MjhXZz09/edukamba_logo-removebg-preview_32549_6a074cbb9e427.png";

export type ProformaLineItem = {
  title: string;
  detail?: string | null;
  totalDisplay: string;
};

export type ProformaBankDetails = {
  bankName: string;
  account: string;
  iban: string;
  beneficiary: string;
};

export type ProformaStructuredJson = {
  document_number?: string;
  validity_days?: number;
  issue_date?: string;
  client_name?: string;
  client_lines?: string[];
  client_nif?: string | null;
  issuer_lines?: string[];
  items?: Array<{ title?: string; detail?: string | null; amount?: string | null }>;
  bank?: { bank?: string; account?: string; iban?: string; beneficiary?: string };
  iva_pct?: number;
  footer_note?: string;
};

export type ProformaRenderInput = {
  documentNumber: string;
  issueDate: Date;
  validityDays: number;
  currencyLabel: string;
  clientName: string;
  clientLines: string[];
  clientNif: string | null;
  issuerName: string;
  issuerLines: string[];
  items: ProformaLineItem[];
  subtotalDisplay: string;
  ivaPct: number;
  ivaDisplay: string;
  totalDisplay: string;
  bank: ProformaBankDetails;
  footerNote?: string | null;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nl2brEscaped(text: string): string {
  return escapeHtml(text).replace(/\r\n/g, "\n").split("\n").join("<br>");
}

/** Interpreta valores monetários pt (ex.: "1.250.000,00") como número (AKZ/AOA). */
function parsePtMoney(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (!t || t === "incluído" || t === "incluido" || t === "—" || t === "-") return null;
  const normalized = t.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatPtMoney(n: number): string {
  return new Intl.NumberFormat("pt-AO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function currencyDisplayLabel(code: string): string {
  const c = code.trim().toUpperCase();
  if (c === "AOA") return "AKZ";
  return c || "AKZ";
}

export function tryParseProformaStructuredBody(bodyText: string): ProformaStructuredJson | null {
  const t = bodyText.trim();
  if (!t.startsWith("{")) return null;
  try {
    const j = JSON.parse(t) as unknown;
    if (j && typeof j === "object") return j as ProformaStructuredJson;
  } catch {
    /* ignore */
  }
  return null;
}

function issueDateLabel(d: Date): string {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function defaultDocNumber(seedId: string, d: Date): string {
  const y = d.getFullYear();
  const tail = seedId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `EPF${y}/${tail}`;
}

export function buildProformaRenderInput(args: {
  proposal: {
    id: string;
    title: string;
    summary: string | null;
    body_text: string;
    amount_estimate: number | null;
    currency: string;
    recipient_email: string | null;
    created_at?: string | null;
  };
  lead?: { organization_name: string } | null;
}): ProformaRenderInput {
  const { proposal, lead } = args;
  const structuredRaw = tryParseProformaStructuredBody(proposal.body_text);
  const currencyLabel = currencyDisplayLabel(proposal.currency || "AOA");
  const issueDate = structuredRaw?.issue_date ? new Date(structuredRaw.issue_date) : proposal.created_at ? new Date(proposal.created_at) : new Date();
  const validityDays = structuredRaw?.validity_days ?? 30;
  const docNo = structuredRaw?.document_number ?? defaultDocNumber(proposal.id, issueDate);

  const clientName =
    structuredRaw?.client_name ??
    lead?.organization_name ??
    (proposal.recipient_email?.includes("@") ? proposal.recipient_email : null) ??
    "Cliente";

  const clientLines =
    structuredRaw?.client_lines?.filter(Boolean) ??
    (!structuredRaw
      ? proposal.summary?.trim()
        ? [proposal.summary.trim()]
        : ["[Morada]", "[Localidade — País]"]
      : ["[Morada]", "[Localidade — País]"]);

  const clientNif = structuredRaw?.client_nif ?? null;

  const issuerName = "Edukamba Tecnologia";
  const issuerLines =
    structuredRaw?.issuer_lines?.filter(Boolean) ?? ["Luanda, Angola", "Email: geral@edukamba.com", "Website: www.edukamba.com"];

  const ivaPct = typeof structuredRaw?.iva_pct === "number" && Number.isFinite(structuredRaw.iva_pct) ? structuredRaw.iva_pct : 14;

  let items: ProformaLineItem[] = [];
  if (structuredRaw?.items?.length) {
    items = structuredRaw.items.map((it) => ({
      title: String(it.title ?? "—"),
      detail: it.detail ?? null,
      totalDisplay: String(it.amount ?? "—"),
    }));
  } else {
    const plainBody = structuredRaw ? "" : proposal.body_text.trim();
    const detailParts = [proposal.summary, plainBody].filter(Boolean).join("\n\n");
    items = [
      {
        title: proposal.title.trim() || "Proposta comercial Edukamba",
        detail: detailParts || undefined,
        totalDisplay:
          proposal.amount_estimate != null ? formatPtMoney(proposal.amount_estimate) : "—",
      },
    ];
  }

  let numericSum = 0;
  let numericCount = 0;
  for (const it of items) {
    const v = parsePtMoney(it.totalDisplay);
    if (v != null) {
      numericSum += v;
      numericCount++;
    }
  }

  let subtotalNum: number;
  let totalNum: number;
  let ivaNum: number;

  if (numericCount > 0 && numericSum > 0) {
    subtotalNum = numericSum;
    ivaNum = (subtotalNum * ivaPct) / 100;
    totalNum = subtotalNum + ivaNum;
  } else if (proposal.amount_estimate != null && proposal.amount_estimate > 0) {
    totalNum = proposal.amount_estimate;
    subtotalNum = totalNum / (1 + ivaPct / 100);
    ivaNum = totalNum - subtotalNum;
  } else {
    subtotalNum = 0;
    ivaNum = 0;
    totalNum = 0;
  }

  const bank: ProformaBankDetails = {
    bankName: structuredRaw?.bank?.bank ?? "[Inserir Nome do Banco]",
    account: structuredRaw?.bank?.account ?? "[Número da Conta]",
    iban: structuredRaw?.bank?.iban ?? "[Número do IBAN]",
    beneficiary: structuredRaw?.bank?.beneficiary ?? "Edukamba",
  };

  return {
    documentNumber: docNo,
    issueDate,
    validityDays,
    currencyLabel,
    clientName,
    clientLines,
    clientNif,
    issuerName,
    issuerLines,
    items,
    subtotalDisplay: formatPtMoney(subtotalNum),
    ivaPct,
    ivaDisplay: formatPtMoney(ivaNum),
    totalDisplay: formatPtMoney(totalNum),
    bank,
    footerNote: structuredRaw?.footer_note ?? null,
  };
}

/** Documento HTML completo (iframe `srcDoc` / impressão). */
export function buildProformaProposalHtml(input: ProformaRenderInput): string {
  const css = `
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #333; background-color: #f5f5f5; }
        .page { width: 180mm; min-height: 297mm; padding: 15mm; margin: 10mm auto; border: 1px solid #eee; background: #fff; }

        .layout-table { width: 100%; border: none; border-collapse: collapse; }
        .header-bottom { border-bottom: 2px solid #1a365d; padding-bottom: 20px; }

        .logo { max-width: 200px; }
        h1 { color: #1a365d; margin: 0; font-size: 24px; text-transform: uppercase; }
        .meta-info { color: #666; font-size: 13px; margin-top: 3px; }

        .section-label { font-weight: bold; color: #1a365d; text-transform: uppercase; font-size: 11px; border-bottom: 1px solid #eee; margin-bottom: 8px; padding-bottom: 4px; display: block; }
        .address-box { font-size: 12px; line-height: 1.5; vertical-align: top; padding: 20px 10px 0 0; }

        .items-table { width: 100%; border-collapse: collapse; margin-top: 30px; }
        .items-table th { background-color: #f8fafc; color: #1a365d; text-align: left; padding: 10px; font-size: 12px; border-bottom: 2px solid #1a365d; }
        .items-table td { padding: 12px 10px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }

        .totals-wrapper { width: 100%; margin-top: 20px; }
        .totals-table { width: 250px; border-collapse: collapse; }
        .total-row td { padding: 5px 0; font-size: 13px; }
        .grand-total { border-top: 2px solid #1a365d; font-weight: bold; font-size: 16px; color: #1a365d; }

        .bank-info { background-color: #f8fafc; padding: 15px; border-radius: 5px; margin-top: 30px; border: 1px solid #e2e8f0; font-size: 12px; }
        .footer { margin-top: 40px; font-size: 10px; color: #777; line-height: 1.4; border-top: 1px solid #eee; padding-top: 15px; }
        .badge { background: #edf2f7; padding: 3px 8px; border-radius: 3px; font-weight: bold; display: inline-block; margin-top: 10px; }
  `.trim();

  const clientAddressHtml = input.clientLines.map((l) => nl2brEscaped(l)).join("<br>");
  const issuerLinesHtml = input.issuerLines.map((l) => nl2brEscaped(l)).join("<br>");

  const itemsRows = input.items
    .map((it) => {
      const detail =
        it.detail && it.detail.trim()
          ? `<br>${nl2brEscaped(it.detail.trim())}`
          : "";
      return `<tr>
                    <td>
                        <strong>${escapeHtml(it.title)}</strong>${detail}
                    </td>
                    <td style="text-align: right;">${escapeHtml(it.totalDisplay)}</td>
                </tr>`;
    })
    .join("\n");

  const clientNifBlock =
    input.clientNif != null && String(input.clientNif).trim()
      ? `<br>NIF: ${escapeHtml(String(input.clientNif).trim())}`
      : "";

  const extraFooter = input.footerNote?.trim() ?? "";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Fatura Proforma - Edukamba</title>
    <style>${css}</style>
</head>
<body>
    <div class="page">
        <table class="layout-table header-bottom">
            <tr>
                <td style="width: 50%;">
                    <img src="${escapeHtml(EDUKAMBA_PROFORMA_LOGO_URL)}" alt="Edukamba" class="logo">
                </td>
                <td style="width: 50%; text-align: right; vertical-align: middle;">
                    <h1>Fatura Proforma</h1>
                    <div class="meta-info">N.º ${escapeHtml(input.documentNumber)}</div>
                    <div class="meta-info">Data: ${escapeHtml(issueDateLabel(input.issueDate))}</div>
                    <div class="meta-info">Validade: ${escapeHtml(String(input.validityDays))} dias</div>
                </td>
            </tr>
        </table>

        <table class="layout-table">
            <tr>
                <td class="address-box">
                    <span class="section-label">Dados do Cliente</span>
                    <strong>${escapeHtml(input.clientName)}</strong><br>
                    ${clientAddressHtml}
                    ${clientNifBlock}
                </td>
                <td class="address-box">
                    <span class="section-label">Dados do Emissor</span>
                    <strong>${escapeHtml(input.issuerName)}</strong><br>
                    ${issuerLinesHtml}
                </td>
            </tr>
        </table>

        <table class="items-table">
            <thead>
                <tr>
                    <th style="width: 70%;">Descrição dos Serviços</th>
                    <th style="text-align: right;">Total (${escapeHtml(input.currencyLabel)})</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows}
            </tbody>
        </table>

        <table class="totals-wrapper">
            <tr>
                <td style="width: 60%;"></td>
                <td style="width: 40%;">
                    <table class="totals-table" style="float: right;">
                        <tr class="total-row">
                            <td style="text-align: left;">Subtotal</td>
                            <td style="text-align: right;">${escapeHtml(input.subtotalDisplay)}</td>
                        </tr>
                        <tr class="total-row">
                            <td style="text-align: left;">IVA (${escapeHtml(String(input.ivaPct))}%)</td>
                            <td style="text-align: right;">${escapeHtml(input.ivaDisplay)}</td>
                        </tr>
                        <tr class="total-row grand-total">
                            <td style="text-align: left; padding-top: 10px;">TOTAL</td>
                            <td style="text-align: right; padding-top: 10px;">${escapeHtml(input.totalDisplay)}</td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <div style="clear: both;"></div>

        <div class="bank-info">
            <span class="section-label">Coordenadas Bancárias</span>
            <strong>Banco:</strong> ${escapeHtml(input.bank.bankName)}<br>
            <strong>Conta:</strong> ${escapeHtml(input.bank.account)}<br>
            <strong>IBAN:</strong> ${escapeHtml(input.bank.iban)}<br>
            <strong>Beneficiário:</strong> ${escapeHtml(input.bank.beneficiary)}
        </div>

        <div class="footer">
            <p><strong>Nota importante:</strong> Este documento é uma proposta comercial (Fatura Proforma) para fins de adjudicação e planeamento. Não possui valor fiscal e não substitui a Fatura-Recibo definitiva que será emitida após o pagamento.</p>
            <p>O sistema Edukamba opera de forma complementar ao sistema Inovar através de fluxos de importação/exportação de dados.</p>
            ${extraFooter ? `<p>${nl2brEscaped(extraFooter)}</p>` : ""}
            <div class="badge">Documento Gerado por Edukamba SaaS v2.0</div>
        </div>
    </div>
</body>
</html>`;
}

/** PDF espelhando o mesmo conteúdo (sem logo raster — marca em texto). */
export function buildProformaProposalPdf(input: ProformaRenderInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("EDUKAMBA", margin, y);

  doc.setFontSize(18);
  doc.text("Fatura Proforma", pageW - margin, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(102, 102, 102);
  doc.text(`N.º ${input.documentNumber}`, pageW - margin, y, { align: "right" });
  y += 5;
  doc.text(`Data: ${issueDateLabel(input.issueDate)}`, pageW - margin, y, { align: "right" });
  y += 5;
  doc.text(`Validade: ${input.validityDays} dias`, pageW - margin, y, { align: "right" });
  y += 10;

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("DADOS DO CLIENTE", margin, y);
  doc.text("DADOS DO EMISSOR", margin + pageW / 2 - margin / 2, y);
  y += 5;

  doc.setDrawColor(238, 238, 238);
  doc.line(margin, y, margin + 75, y);
  doc.line(margin + pageW / 2 - margin / 2, y, pageW - margin, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text(input.clientName, margin, y);
  doc.text(input.issuerName, margin + pageW / 2 - margin / 2, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const leftLines = doc.splitTextToSize([...input.clientLines, input.clientNif ? `NIF: ${input.clientNif}` : ""].filter(Boolean).join("\n"), 75);
  const rightLines = doc.splitTextToSize(input.issuerLines.join("\n"), 75);
  doc.text(leftLines, margin, y);
  doc.text(rightLines, margin + pageW / 2 - margin / 2, y);
  y += Math.max(leftLines.length, rightLines.length) * 5 + 16;

  autoTable(doc, {
    startY: y,
    head: [[`Descrição dos Serviços`, `Total (${input.currencyLabel})`]],
    body: input.items.map((it) => {
      const desc = it.detail?.trim() ? `${it.title}\n${it.detail}` : it.title;
      return [desc, it.totalDisplay];
    }),
    styles: { fontSize: 10, cellPadding: 3, textColor: [51, 51, 51] },
    headStyles: {
      fillColor: [248, 250, 252],
      textColor: [26, 54, 93],
      fontStyle: "bold",
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: pageW - margin * 2 - 42 },
      1: { halign: "right", cellWidth: 40 },
    },
    theme: "plain",
    tableLineColor: [238, 238, 238],
    tableLineWidth: 0.1,
  });

  const lastAuto = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
  let afterTableY = lastAuto?.finalY ?? y + 40;
  afterTableY += 10;

  const totalsX = pageW - margin - 58;
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text("Subtotal", totalsX, afterTableY);
  doc.text(input.subtotalDisplay, pageW - margin, afterTableY, { align: "right" });
  afterTableY += 7;
  doc.text(`IVA (${input.ivaPct}%)`, totalsX, afterTableY);
  doc.text(input.ivaDisplay, pageW - margin, afterTableY, { align: "right" });
  afterTableY += 9;
  doc.setDrawColor(...NAVY);
  doc.line(totalsX - 2, afterTableY - 4, pageW - margin, afterTableY - 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text("TOTAL", totalsX, afterTableY + 2);
  doc.text(input.totalDisplay, pageW - margin, afterTableY + 2, { align: "right" });
  afterTableY += 16;

  doc.setFillColor(248, 250, 252);
  doc.rect(margin, afterTableY, pageW - margin * 2, 28, "F");
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, afterTableY, pageW - margin * 2, 28, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("COORDENADAS BANCÁRIAS", margin + 3, afterTableY + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 51, 51);
  const bankLines = [
    `Banco: ${input.bank.bankName}`,
    `Conta: ${input.bank.account}`,
    `IBAN: ${input.bank.iban}`,
    `Beneficiário: ${input.bank.beneficiary}`,
  ];
  doc.text(doc.splitTextToSize(bankLines.join("\n"), pageW - margin * 2 - 8), margin + 3, afterTableY + 12);

  let footerY = afterTableY + 38;
  doc.setFontSize(8);
  doc.setTextColor(119, 119, 119);
  const footerPara =
    "Nota importante: Este documento é uma proposta comercial (Fatura Proforma) para fins de adjudicação e planeamento. Não possui valor fiscal e não substitui a Fatura-Recibo definitiva que será emitida após o pagamento.";
  const footerPara2 =
    "O sistema Edukamba opera de forma complementar ao sistema Inovar através de fluxos de importação/exportação de dados.";
  const fp1 = doc.splitTextToSize(footerPara, pageW - margin * 2);
  doc.text(fp1, margin, footerY);
  footerY += fp1.length * 4 + 4;
  const fp2 = doc.splitTextToSize(footerPara2, pageW - margin * 2);
  doc.text(fp2, margin, footerY);
  footerY += fp2.length * 4 + 6;

  if (input.footerNote?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(119, 119, 119);
    const fp3 = doc.splitTextToSize(input.footerNote.trim(), pageW - margin * 2);
    doc.text(fp3, margin, footerY);
    footerY += fp3.length * 4 + 8;
  }

  doc.setFillColor(237, 242, 247);
  doc.roundedRect(margin, footerY, 92, 7, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 51, 51);
  doc.setFontSize(8);
  doc.text("Documento Gerado por Edukamba SaaS v2.0", margin + 3, footerY + 5);

  return doc;
}
