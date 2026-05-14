/**
 * PDF FACTURA-RECIBO alinhado a `src/lib/fiscal/invoicePdf.ts` (mesmo layout da app).
 * Vive na pasta da função para o bundle Deno resolver `./fiscalInvoicePdf.ts` correctamente.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.3?deps=jspdf@2.5.2";

const NAVY: [number, number, number] = [26, 58, 90];
const BODY_TEXT: [number, number, number] = [51, 51, 51];
const FOOTER_MUTED: [number, number, number] = [102, 102, 102];
const BORDER_EEE: [number, number, number] = [238, 238, 238];
const BORDER_DDD: [number, number, number] = [221, 221, 221];
const PANEL_FCFCFC: [number, number, number] = [252, 252, 252];
const HASH_F5: [number, number, number] = [245, 245, 245];

const pxToPt = (px: number) => Math.round(((px * 72) / 96) * 10) / 10;
const pxMm = (px: number) => (px / 96) * 25.4;

const PT_MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export type FiscalInvoiceLine = {
  description: string;
  quantity: number;
  unitAmountFmt: string;
  totalAmountFmt: string;
};

export type FiscalInvoicePdfInput = {
  schoolName: string;
  schoolNif?: string | null;
  schoolAddress?: string | null;
  schoolContactLines?: string[];
  logoDataUrl?: string | null;
  documentNumber: string;
  invoiceDateYYYYMMDD: string;
  clienteNome: string;
  clienteNif: string;
  encarregadoNome?: string | null;
  studentName: string;
  studentClassroom?: string | null;
  academicYearLabel?: string | null;
  lineItems: FiscalInvoiceLine[];
  grossTotalFmt: string;
  exemptionCode?: string | null;
  exemptionReason?: string | null;
  documentHashFootnote?: string | null;
  digitalSignatureSha1?: string | null;
};

export type InvoiceRecordForPdf = {
  school_id: string;
  payment_id: string | null;
  student_id: string | null;
  document_number: string;
  invoice_date: string;
  gross_total: number;
  currency: string;
  line_description: string | null;
  cliente_nome: string;
  cliente_nif: string;
  exemption_code: string | null;
  exemption_reason: string | null;
  document_hash: string | null;
  digital_signature_sha1_b64: string | null;
};

/** Mapa da linha `invoices` (pós-insert) para o resolver do PDF. */
export function invoiceRowToPdfPayload(row: Record<string, unknown>): InvoiceRecordForPdf {
  return {
    school_id: String(row.school_id ?? ""),
    payment_id: row.payment_id != null ? String(row.payment_id) : null,
    student_id: row.student_id != null ? String(row.student_id) : null,
    document_number: String(row.document_number ?? ""),
    invoice_date: String(row.invoice_date ?? "").slice(0, 10),
    gross_total: Number(row.gross_total ?? 0),
    currency: String(row.currency ?? "AOA"),
    line_description: row.line_description != null ? String(row.line_description) : null,
    cliente_nome: String(row.cliente_nome ?? ""),
    cliente_nif: String(row.cliente_nif ?? ""),
    exemption_code: row.exemption_code != null ? String(row.exemption_code) : null,
    exemption_reason: row.exemption_reason != null ? String(row.exemption_reason) : null,
    document_hash: row.document_hash != null ? String(row.document_hash) : null,
    digital_signature_sha1_b64: row.digital_signature_sha1_b64 != null
      ? String(row.digital_signature_sha1_b64)
      : null,
  };
}

function fmtPtLongDateYYYYMMDD(isoDate: string): string {
  const raw = isoDate?.trim()?.slice(0, 10);
  const d =
    raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T12:00:00`)
      : raw
        ? new Date(isoDate)
        : new Date(NaN);
  if (!Number.isFinite(d.getTime())) return isoDate?.trim() || "—";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

function addLogoIfPossible(doc: jsPDF, logoDataUrl: string | undefined, x: number, y: number, maxW: number, maxH: number) {
  if (!logoDataUrl?.startsWith("data:image")) return;
  try {
    const fmt = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
    doc.addImage(logoDataUrl, fmt, x, y, maxW, maxH, undefined, "FAST");
  } catch {
    /* formato inválido — ignora */
  }
}

async function fetchLogoAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url?.trim()) return null;
  try {
    const res = await fetch(url.trim());
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const mime = ct.includes("png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function drawWrappedTexts(
  doc: jsPDF,
  lines: string[],
  xMm: number,
  yMm: number,
  maxWidthMm: number,
  opts?: { leading?: number; size?: number; color?: [number, number, number]; style?: "normal" | "bold" },
): number {
  const leading = opts?.leading ?? 4.8;
  const size = opts?.size ?? 9;
  let y = yMm;
  doc.setFont("helvetica", opts?.style === "bold" ? "bold" : "normal");
  doc.setFontSize(size);
  if (opts?.color) doc.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
  else doc.setTextColor(0);
  const flat: string[] = [];
  lines.forEach((raw) => {
    const trimmed = raw?.trim() ?? "";
    if (!trimmed) return;
    const parts = doc.splitTextToSize(trimmed, maxWidthMm);
    parts.forEach((p) => flat.push(typeof p === "string" ? p : String(p)));
  });
  for (let i = 0; i < flat.length; i++) {
    doc.text(flat[i], xMm, y);
    y += leading;
  }
  return y;
}

function chunkTextForPdf(value: string, chunkSize: number): string[] {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= chunkSize) return [clean];
  const rows: string[] = [];
  for (let i = 0; i < clean.length; i += chunkSize) rows.push(clean.slice(i, i + chunkSize));
  return rows;
}

function estimatePanelContentHeightMm(doc: jsPDF, titleUpper: string, bodyLines: string[], maxWidthMm: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(10));
  const titleLines = doc.splitTextToSize(titleUpper.toUpperCase(), maxWidthMm);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(13));
  let bodyCount = 0;
  for (const line of bodyLines) {
    const parts = doc.splitTextToSize(line, maxWidthMm);
    bodyCount += Math.max(1, parts.length);
  }
  const underlinePad = pxMm(3) + pxMm(8);
  return (
    Math.max(pxMm(1), titleLines.length * pxMm(13) * 0.52) +
    underlinePad +
    bodyCount * pxMm(13 * 1.5 * 0.35)
  );
}

type DocWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

async function tuitionDetailFromFee(sb: SupabaseClient, studentFeeId: string): Promise<{
  serviceDescription: string;
  academicYearLabel: string | null;
}> {
  const { data } = await sb
    .from("student_fees")
    .select("month_index, academic_year:academic_years(label)")
    .eq("id", studentFeeId)
    .maybeSingle();
  const row = data as { month_index: number | null; academic_year: { label: string | null } | null } | null;
  const m = Number(row?.month_index);
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? PT_MONTH_NAMES[m - 1] : null;
  const yLabel = row?.academic_year?.label?.trim() ?? null;
  let serviceDescription = "Propina / serviços educativos";
  if (month && yLabel) serviceDescription = `Propina — ${month} (${yLabel})`;
  else if (month) serviceDescription = `Propina — ${month}`;
  else if (yLabel) serviceDescription = `Propina (${yLabel})`;
  return { serviceDescription, academicYearLabel: yLabel };
}

async function academicYearFromActivityFee(sb: SupabaseClient, activityFeeId: string): Promise<string | null> {
  const { data } = await sb
    .from("activity_fees")
    .select("academic_year:academic_years(label)")
    .eq("id", activityFeeId)
    .maybeSingle();
  return (data as { academic_year?: { label: string | null } | null } | null)?.academic_year?.label?.trim() ?? null;
}

async function academicYearFromTransportFee(sb: SupabaseClient, transportFeeId: string): Promise<string | null> {
  const { data } = await sb
    .from("transport_fees")
    .select("academic_year:academic_years(label)")
    .eq("id", transportFeeId)
    .maybeSingle();
  return (data as { academic_year?: { label: string | null } | null } | null)?.academic_year?.label?.trim() ?? null;
}

async function academicYearFromEnrollmentFee(sb: SupabaseClient, enrollmentFeeId: string): Promise<string | null> {
  const { data } = await sb
    .from("enrollment_fees")
    .select("academic_year:academic_years(label)")
    .eq("id", enrollmentFeeId)
    .maybeSingle();
  return (data as { academic_year?: { label: string | null } | null } | null)?.academic_year?.label?.trim() ?? null;
}

async function deriveLineAndYear(
  sb: SupabaseClient,
  args: {
    invoice: InvoiceRecordForPdf;
    studentFeeId: string | null;
    activityFeeId: string | null;
    transportFeeId: string | null;
    enrollmentFeeId: string | null;
  },
): Promise<{ lineDescription: string; academicYearLabel: string | null }> {
  let academicYearLabel: string | null = null;
  let lineDescription = args.invoice.line_description?.trim() || "Serviços educativos";

  try {
    if (args.studentFeeId) {
      const t = await tuitionDetailFromFee(sb, args.studentFeeId);
      academicYearLabel = t.academicYearLabel;
      lineDescription = t.serviceDescription;
    } else if (args.activityFeeId) {
      academicYearLabel = await academicYearFromActivityFee(sb, args.activityFeeId);
    } else if (args.transportFeeId) {
      academicYearLabel = await academicYearFromTransportFee(sb, args.transportFeeId);
    } else if (args.enrollmentFeeId) {
      academicYearLabel = await academicYearFromEnrollmentFee(sb, args.enrollmentFeeId);
    }
  } catch {
    /* Fallback */
  }

  return { lineDescription, academicYearLabel };
}

async function resolveFiscalInvoicePdfInput(
  sb: SupabaseClient,
  invoice: InvoiceRecordForPdf,
  formatMoney: (amount: number) => string,
): Promise<FiscalInvoicePdfInput> {
  const { data: school } = await sb
    .from("schools")
    .select("name,nif,address,logo_url")
    .eq("id", invoice.school_id)
    .maybeSingle();
  const logoDataUrlFinal = await fetchLogoAsDataUrl(school?.logo_url ?? null);

  let studentFullName = "";
  let studentClassroom: string | null = null;
  let parentId: string | null = null;
  let guardianNameFromProfile: string | null = null;

  if (invoice.student_id) {
    const { data: stud } = await sb
      .from("students")
      .select("full_name, parent_id, classroom:classrooms(name)")
      .eq("id", invoice.student_id)
      .maybeSingle();

    studentFullName = stud?.full_name?.trim() ?? "";
    studentClassroom = (stud?.classroom as { name?: string | null } | undefined)?.name?.trim() ?? null;
    parentId = stud?.parent_id ?? null;

    if (parentId) {
      const { data: prof } = await sb.from("profiles").select("full_name").eq("id", parentId).maybeSingle();
      guardianNameFromProfile = prof?.full_name?.trim() ?? null;
    }
  }

  let studentFeeId: string | null = null;
  let activityFeeId: string | null = null;
  let transportFeeId: string | null = null;
  let enrollmentFeeId: string | null = null;

  if (invoice.payment_id?.trim()) {
    const { data: payRow } = await sb
      .from("payments")
      .select("student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id")
      .eq("id", invoice.payment_id.trim())
      .maybeSingle();

    studentFeeId = payRow?.student_fee_id ?? null;
    activityFeeId = payRow?.activity_fee_id ?? null;
    transportFeeId = payRow?.transport_fee_id ?? null;
    enrollmentFeeId = payRow?.enrollment_fee_id ?? null;
  }

  const { lineDescription, academicYearLabel } = await deriveLineAndYear(sb, {
    invoice,
    studentFeeId,
    activityFeeId,
    transportFeeId,
    enrollmentFeeId,
  });

  const gross = Number(invoice.gross_total);
  const totalFmt = formatMoney(Number.isFinite(gross) ? gross : 0);

  return {
    schoolName: school?.name?.trim() || "Escola",
    schoolNif: school?.nif ?? null,
    schoolAddress: school?.address ?? null,
    schoolContactLines: undefined,
    logoDataUrl: logoDataUrlFinal,
    documentNumber: invoice.document_number.trim(),
    invoiceDateYYYYMMDD: invoice.invoice_date.slice(0, 10),
    clienteNome: invoice.cliente_nome.trim(),
    clienteNif: invoice.cliente_nif.trim(),
    encarregadoNome: guardianNameFromProfile ?? invoice.cliente_nome.trim(),
    studentName: studentFullName || "—",
    studentClassroom: studentClassroom || null,
    academicYearLabel,
    lineItems: [
      {
        description: lineDescription,
        quantity: 1,
        unitAmountFmt: totalFmt,
        totalAmountFmt: totalFmt,
      },
    ],
    grossTotalFmt: totalFmt,
    exemptionCode: invoice.exemption_code ?? null,
    exemptionReason: invoice.exemption_reason ?? null,
    documentHashFootnote: invoice.document_hash,
    digitalSignatureSha1: invoice.digital_signature_sha1_b64,
  };
}

function formatIvaExemptionParagraph(code: string, reason: string): string {
  return `Isenção de IVA (${code}), nos termos fiscalmente comunicados pelo emitente neste documento. ${reason}`;
}

export function buildInvoicePdf(opts: FiscalInvoicePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 15;
  const usableW = pageW - margin * 2;
  const rhs = pageW - margin;

  const logoW = pxMm(64);
  const logoH = pxMm(42);
  const hdrTop = margin;

  const schoolColRight = margin + usableW * 0.61;
  const schoolTextX = margin + logoW + pxMm(14);
  const schoolTextMax = Math.max(pxMm(24), schoolColRight - schoolTextX - pxMm(4));

  addLogoIfPossible(doc, opts.logoDataUrl ?? undefined, margin, hdrTop, logoW, logoH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(24));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  let ySchool = drawWrappedTexts(
    doc,
    [opts.schoolName.trim() || "Instituição de ensino"],
    schoolTextX,
    hdrTop + pxMm(2),
    schoolTextMax,
    { leading: pxMm(24) * 0.55, size: pxToPt(24), style: "bold", color: NAVY },
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  ySchool = drawWrappedTexts(doc, ["Edukamba • documento fiscal"], schoolTextX, ySchool + pxMm(6), schoolTextMax, {
    leading: pxMm(12) * 0.45,
  });

  const schoolLines: string[] = [];
  if (opts.schoolNif?.trim()) schoolLines.push(`NIF: ${opts.schoolNif.trim()}`);
  if (opts.schoolAddress?.trim()) schoolLines.push(`Morada: ${opts.schoolAddress.trim()}`);
  if (opts.schoolContactLines?.length) {
    opts.schoolContactLines.forEach((l) => l?.trim() && schoolLines.push(l.trim()));
  }

  doc.setFontSize(pxToPt(12));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  ySchool = drawWrappedTexts(doc, schoolLines, schoolTextX, ySchool + pxMm(14), schoolTextMax, {
    leading: pxMm(15),
  });

  let yDoc = hdrTop + pxMm(16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(20));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("FACTURA RECIBO", rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(34);

  doc.setFontSize(pxToPt(13));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text(opts.documentNumber.trim(), rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(13));
  const issueLabel = fmtPtLongDateYYYYMMDD(opts.invoiceDateYYYYMMDD);
  doc.text(`Emissão: ${issueLabel}`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(10);

  const headerBottomInner = Math.max(ySchool + pxMm(4), yDoc);
  const dividerY = headerBottomInner + pxMm(18);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(Math.max(pxMm(1.75), 0.45));
  doc.line(margin, dividerY, rhs, dividerY);

  let y = dividerY + pxMm(26);

  const boxGap = usableW * 0.038;
  const panelW = (usableW - boxGap) / 2;
  const bx1 = margin;
  const bx2 = margin + panelW + boxGap;
  const padInner = pxMm(15);
  const rBox = pxMm(4);

  const encNomeReal = opts.encarregadoNome?.trim() || opts.clienteNome.trim() || "—";
  const turma = opts.studentClassroom?.trim() || "—";
  const ano = opts.academicYearLabel?.trim() || "—";
  const encBody = [`Nome: ${encNomeReal}`, `NIF (efeitos fiscais): ${opts.clienteNif.trim()}`];
  const studBody = [`Nome: ${opts.studentName.trim()}`, `Turma: ${turma}`, `Ano lectivo: ${ano}`];

  const innerEncW = panelW - padInner * 2 - pxMm(1);
  const innerStudW = panelW - padInner * 2 - pxMm(1);
  const hEnc = estimatePanelContentHeightMm(doc, "Dados do encarregado", encBody, innerEncW);
  const hStud = estimatePanelContentHeightMm(doc, "Dados do aluno", studBody, innerStudW);
  const boxH = Math.max(hEnc + padInner * 2 + pxMm(4), hStud + padInner * 2 + pxMm(4), pxMm(108));

  const boxTop = y;

  doc.setDrawColor(BORDER_EEE[0], BORDER_EEE[1], BORDER_EEE[2]);
  doc.setFillColor(PANEL_FCFCFC[0], PANEL_FCFCFC[1], PANEL_FCFCFC[2]);
  doc.setLineWidth(pxMm(1));
  doc.roundedRect(bx1, boxTop, panelW, boxH, rBox, rBox, "FD");
  doc.roundedRect(bx2, boxTop, panelW, boxH, rBox, rBox, "FD");

  const drawModernBoxInner = (
    bx: number,
    titlePt: string,
    bodyPts: string[],
    innerMaxW: number,
  ): void => {
    let yt = boxTop + padInner + pxMm(4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(pxToPt(10));
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    yt = drawWrappedTexts(doc, [titlePt.toUpperCase()], bx + padInner, yt, innerMaxW, {
      leading: pxMm(12) * 0.48,
      style: "bold",
    });

    doc.setDrawColor(BORDER_DDD[0], BORDER_DDD[1], BORDER_DDD[2]);
    doc.setLineWidth(pxMm(0.9));
    doc.line(bx + padInner, yt + pxMm(2), bx + padInner + innerMaxW, yt + pxMm(2));
    yt += pxMm(10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(pxToPt(13));
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    drawWrappedTexts(doc, bodyPts, bx + padInner, yt, innerMaxW, {
      leading: pxMm(16),
      size: pxToPt(13),
      color: BODY_TEXT,
    });
  };

  drawModernBoxInner(bx1, "Dados do encarregado", encBody, innerEncW);
  drawModernBoxInner(bx2, "Dados do aluno", studBody, innerStudW);

  y = boxTop + boxH + pxMm(18);

  const head = [["DESCRIÇÃO DO SERVIÇO", "QTD", "P. UNITÁRIO", "TOTAL"]];
  const body = opts.lineItems.map((it) => [
    it.description.replace(/\u00a0/g, " "),
    String(it.quantity),
    it.unitAmountFmt,
    it.totalAmountFmt,
  ]);

  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: {
      fontSize: pxToPt(13),
      cellPadding: { top: pxMm(10), right: pxMm(10), bottom: pxMm(11), left: pxMm(10) },
      lineWidth: pxMm(0.7),
      lineColor: BORDER_EEE,
      textColor: BODY_TEXT,
      valign: "middle",
      overflow: "linebreak",
      fontStyle: "normal",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontStyle: "bold",
      fontSize: pxToPt(12),
      halign: "left",
      valign: "middle",
      cellPadding: { top: pxMm(10), right: pxMm(10), bottom: pxMm(10), left: pxMm(10) },
    },
    columnStyles: {
      0: { cellWidth: usableW - 63 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 24, halign: "right" },
      3: { cellWidth: 24, halign: "right", fontStyle: "bold", textColor: [35, 40, 48] },
    },
  });

  const d = doc as DocWithAutoTable;
  const tableFinalY = d.lastAutoTable?.finalY ?? y + pxMm(90);

  const totalsW = pxMm(250);
  const totalsX = rhs - totalsW;
  let blockY = tableFinalY + pxMm(14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(12));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text("Subtotal", totalsX, blockY + pxMm(4));
  doc.text(opts.grossTotalFmt, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(10) + pxMm(10);

  const grandH = pxMm(42);
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(totalsX, blockY, totalsW, grandH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(16));
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL PAGO", totalsX + pxMm(12), blockY + grandH / 2 + pxMm(2), {
    baseline: "middle",
  });
  doc.text(opts.grossTotalFmt, totalsX + totalsW - pxMm(12), blockY + grandH / 2 + pxMm(2), {
    align: "right",
    baseline: "middle",
  });

  let footY = blockY + grandH + pxMm(48);
  const code = (opts.exemptionCode ?? "M10").trim();
  const reason =
    opts.exemptionReason?.trim() ||
    "Isenção de IVA no domínio da educação nos termos legais aplicáveis ao estabelecimento.";
  const exemptText = formatIvaExemptionParagraph(code, reason);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  for (const ln of doc.splitTextToSize(exemptText, usableW)) {
    doc.text(ln, margin, footY);
    footY += pxMm(16);
  }

  footY += pxMm(12);

  let hashRows = chunkTextForPdf(opts.documentHashFootnote?.trim() || "", 92);
  if (!hashRows.length) hashRows = ["(hash não disponível)"];
  const stripW = pxMm(4);
  const padHash = pxMm(10);

  let hashBoxMinH = padHash * 2 + hashRows.length * pxMm(16) + (opts.digitalSignatureSha1?.trim() ? pxMm(42) : 0);
  hashBoxMinH = Math.max(hashBoxMinH, pxMm(64));

  const hashTop = footY;

  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(margin, hashTop, stripW, hashBoxMinH, "F");
  doc.setFillColor(HASH_F5[0], HASH_F5[1], HASH_F5[2]);
  doc.rect(margin + stripW, hashTop, usableW - stripW, hashBoxMinH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("Hash AGT — assinatura digital", margin + stripW + padHash, hashTop + padHash + pxMm(11));

  doc.setFont("courier", "normal");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  let hx = hashTop + padHash + pxMm(30);
  for (const row of hashRows) {
    doc.splitTextToSize(row, usableW - stripW - padHash * 2 - pxMm(4)).forEach((line) => {
      doc.text(line, margin + stripW + padHash, hx);
      hx += pxMm(14.5);
    });
  }

  if (opts.digitalSignatureSha1?.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(pxToPt(10));
    doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
    const sigTxt = opts.digitalSignatureSha1.trim();
    const sigShow = sigTxt.length <= 92 ? sigTxt : `${sigTxt.slice(0, 40)} … ${sigTxt.slice(-40)}`;
    hx += pxMm(6);
    doc.splitTextToSize(`Assinatura digital PKCS#1 RSA-SHA1 (Base64): ${sigShow}`, usableW - stripW - padHash * 2).forEach((line) => {
      doc.text(line, margin + stripW + padHash, hx);
      hx += pxMm(14);
    });
  }

  const wmY = Math.min(pageH - pxMm(16), hx + pxMm(40));
  doc.setFont("helvetica", "italic");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  doc.text(`Processado por computador • ${opts.schoolName}`, rhs, wmY, { align: "right" });
  doc.setFontSize(pxToPt(10));
  doc.text("Edukamba — dados dinâmicos conforme o portal.", rhs, wmY + pxMm(14), { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("edukamba.com", rhs, pageH - margin, { align: "right" });

  doc.setTextColor(0);
  doc.setDrawColor(0);

  return doc;
}

function formatMoney(amount: number, currency: string): string {
  const c = (currency || "AOA").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-PT", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${c}`;
  }
}

/** PDF idêntico ao «download» na app (invoicePdf). */
export async function buildOfficialFiscalInvoicePdfBytes(
  sb: SupabaseClient,
  invoice: InvoiceRecordForPdf,
): Promise<Uint8Array> {
  const payload = await resolveFiscalInvoicePdfInput(sb, invoice, (n) =>
    formatMoney(n, invoice.currency ?? "AOA"),
  );
  const doc = buildInvoicePdf(payload);
  const buf = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(buf);
}
