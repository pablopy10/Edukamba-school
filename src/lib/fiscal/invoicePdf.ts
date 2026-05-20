import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** Design alinhado à fatura moderna Edukamba (CSS de referência) */
/** Marca #1a3a5a */
const NAVY: [number, number, number] = [26, 58, 90];
/** body color #333 */
const BODY_TEXT: [number, number, number] = [51, 51, 51];
/** .footer color #666 */
const FOOTER_MUTED: [number, number, number] = [102, 102, 102];
/** borders #eee */
const BORDER_EEE: [number, number, number] = [238, 238, 238];
/** .box-title border #ddd */
const BORDER_DDD: [number, number, number] = [221, 221, 221];
/** .details-box #fcfcfc */
const PANEL_FCFCFC: [number, number, number] = [252, 252, 252];
/** hash-container #f5f5f5 */
const HASH_F5: [number, number, number] = [245, 245, 245];

/** Conversão típica CSS px→pt (96dpi → jsPDF pts) */
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
  /** Linhas de contacto da instituição (telefone / e-mail do estabelecimento, etc.) */
  schoolContactLines?: string[];
  logoDataUrl?: string | null;
  documentNumber: string;
  invoiceDateYYYYMMDD: string;
  clienteNome: string;
  clienteNif: string;
  /** Nome para exibição como encarregado (quando distinto dos dados estritamente fiscais). */
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
  /** FT anulada (cancelamento directo — marca no PDF). */
  isCancelled?: boolean;
  cancellationReason?: string | null;
};

/** @deprecated use FiscalInvoicePdfInput */
export type GuardianInvoicePdfInput = FiscalInvoicePdfInput;

function fmtPtLongDateYYYYMMDD(yyyymmdd: string): string {
  const raw = yyyymmdd?.trim()?.slice(0, 10);
  const d =
    raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T12:00:00`)
      : raw
        ? new Date(yyyymmdd)
        : new Date(NaN);
  if (!Number.isFinite(d.getTime())) return yyyymmdd?.trim() || "—";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "long", year: "numeric" }).format(d);
}

function addLogoIfPossible(doc: jsPDF, logoDataUrl: string | undefined, x: number, y: number, maxW: number, maxH: number) {
  if (!logoDataUrl?.startsWith("data:image")) return;
  try {
    const fmt = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
    doc.addImage(logoDataUrl, fmt, x, y, maxW, maxH, undefined, "FAST");
  } catch {
    /* CORS ou formato inválido — ignora logo */
  }
}

export async function fetchLogoAsDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url?.trim()) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => reject(new Error("read"));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Quebra texto longo por largura máxima (mm). Devolve novo y inferior. */
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
    doc.text(flat[i], xMm, y, { baseline: "top" });
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

const PANEL_TITLE_SIZE = pxToPt(10);
const PANEL_BODY_SIZE = pxToPt(12);
const PANEL_TITLE_LEADING = pxMm(13);
const PANEL_BODY_LEADING = pxMm(15);
const PANEL_PAD_TOP = pxMm(6);
const PANEL_TITLE_GAP = pxMm(8);
const PANEL_UNDERLINE_GAP = pxMm(10);

function countWrappedLines(
  doc: jsPDF,
  lines: string[],
  maxW: number,
  fontSize: number,
  fontStyle: "normal" | "bold",
): number {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  let n = 0;
  for (const raw of lines) {
    const t = raw?.trim() ?? "";
    if (!t) continue;
    n += doc.splitTextToSize(t, maxW).length;
  }
  return Math.max(n, 1);
}

/** Altura interior do painel (título + corpo), alinhada com `drawDetailPanelInner`. */
function measureDetailPanelInnerHeightMm(
  doc: jsPDF,
  titlePt: string,
  bodyLines: string[],
  innerMaxW: number,
): number {
  const titleLineCount = countWrappedLines(doc, [titlePt.toUpperCase()], innerMaxW, PANEL_TITLE_SIZE, "bold");
  const bodyLineCount = countWrappedLines(doc, bodyLines, innerMaxW, PANEL_BODY_SIZE, "normal");
  return (
    PANEL_PAD_TOP +
    titleLineCount * PANEL_TITLE_LEADING +
    PANEL_TITLE_GAP +
    PANEL_UNDERLINE_GAP +
    bodyLineCount * PANEL_BODY_LEADING +
    pxMm(6)
  );
}

function drawDetailPanelInner(
  doc: jsPDF,
  bx: number,
  boxTop: number,
  padInner: number,
  titlePt: string,
  bodyPts: string[],
  innerMaxW: number,
): void {
  let yt = boxTop + padInner + PANEL_PAD_TOP;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PANEL_TITLE_SIZE);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  yt = drawWrappedTexts(doc, [titlePt.toUpperCase()], bx + padInner, yt, innerMaxW, {
    leading: PANEL_TITLE_LEADING,
    size: PANEL_TITLE_SIZE,
    style: "bold",
    color: NAVY,
  });

  doc.setDrawColor(BORDER_DDD[0], BORDER_DDD[1], BORDER_DDD[2]);
  doc.setLineWidth(pxMm(0.9));
  doc.line(bx + padInner, yt + pxMm(2), bx + padInner + innerMaxW, yt + pxMm(2));
  yt += PANEL_UNDERLINE_GAP;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(PANEL_BODY_SIZE);
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  drawWrappedTexts(doc, bodyPts, bx + padInner, yt, innerMaxW, {
    leading: PANEL_BODY_LEADING,
    size: PANEL_BODY_SIZE,
    color: BODY_TEXT,
  });
}

type DocWithAutoTable = jsPDF & {
  lastAutoTable?: {
    finalY: number;
  };
};

async function tuitionDetailFromFee(studentFeeId: string): Promise<{
  serviceDescription: string;
  academicYearLabel: string | null;
}> {
  const { data } = await supabase
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

async function academicYearFromActivityFee(activityFeeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("activity_fees")
    .select("academic_year:academic_years(label)")
    .eq("id", activityFeeId)
    .maybeSingle();
  return (data as { academic_year?: { label: string | null } | null } | null)?.academic_year?.label?.trim() ?? null;
}

async function academicYearFromTransportFee(transportFeeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("transport_fees")
    .select("academic_year:academic_years(label)")
    .eq("id", transportFeeId)
    .maybeSingle();
  return (data as { academic_year?: { label: string | null } | null } | null)?.academic_year?.label?.trim() ?? null;
}

async function academicYearFromEnrollmentFee(enrollmentFeeId: string): Promise<string | null> {
  const { data } = await supabase
    .from("enrollment_fees")
    .select("academic_year:academic_years(label)")
    .eq("id", enrollmentFeeId)
    .maybeSingle();
  return (data as { academic_year?: { label: string | null } | null } | null)?.academic_year?.label?.trim() ?? null;
}

/** Carrega texto da linha, ano letivo opcional e metadados a partir das cobranças ligadas ao pagamento. */
async function deriveLineAndYear(args: {
  invoice: Tables<"invoices">;
  studentFeeId: string | null;
  activityFeeId: string | null;
  transportFeeId: string | null;
  enrollmentFeeId: string | null;
}): Promise<{ lineDescription: string; academicYearLabel: string | null }> {
  let academicYearLabel: string | null = null;

  let lineDescription = args.invoice.line_description?.trim() || "Serviços educativos";

  try {
    if (args.studentFeeId) {
      const t = await tuitionDetailFromFee(args.studentFeeId);
      academicYearLabel = t.academicYearLabel;
      lineDescription = t.serviceDescription;
    }
    else if (args.activityFeeId) {
      academicYearLabel = await academicYearFromActivityFee(args.activityFeeId);
    }
    else if (args.transportFeeId) {
      academicYearLabel = await academicYearFromTransportFee(args.transportFeeId);
    }
    else if (args.enrollmentFeeId) {
      academicYearLabel = await academicYearFromEnrollmentFee(args.enrollmentFeeId);
    }
  } catch {
    /* Fallback: já temos invoice.line_description */
  }

  return { lineDescription, academicYearLabel };
}

/**
 * Resolve todos os dados visíveis no PDF (dinâmicos na base de dados atual).
 */
export async function resolveFiscalInvoicePdfInput(
  invoice: Tables<"invoices">,
  formatMoney: (amount: number) => string,
): Promise<FiscalInvoicePdfInput> {
  const { data: school } = await supabase
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
    const { data: stud } = await supabase
      .from("students")
      .select("full_name, parent_id, classroom:classrooms(name)")
      .eq("id", invoice.student_id)
      .maybeSingle();

    studentFullName = stud?.full_name?.trim() ?? "";
    studentClassroom = (stud?.classroom as { name?: string | null } | undefined)?.name?.trim() ?? null;
    parentId = stud?.parent_id ?? null;

    if (parentId) {
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", parentId).maybeSingle();
      guardianNameFromProfile = prof?.full_name?.trim() ?? null;
    }
  }

  let studentFeeId: string | null = null;
  let activityFeeId: string | null = null;
  let transportFeeId: string | null = null;
  let enrollmentFeeId: string | null = null;

  if (invoice.payment_id?.trim()) {
    const { data: payRow } = await supabase
      .from("payments")
      .select("student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id")
      .eq("id", invoice.payment_id.trim())
      .maybeSingle();

    studentFeeId = payRow?.student_fee_id ?? null;
    activityFeeId = payRow?.activity_fee_id ?? null;
    transportFeeId = payRow?.transport_fee_id ?? null;
    enrollmentFeeId = payRow?.enrollment_fee_id ?? null;
  }

  const { lineDescription, academicYearLabel } = await deriveLineAndYear({
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
    isCancelled: String((invoice as { invoice_status?: string }).invoice_status ?? "N").toUpperCase() === "A",
    cancellationReason: (invoice as { cancellation_reason?: string | null }).cancellation_reason ?? null,
  };
}

export function buildInvoicePdf(opts: FiscalInvoicePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  /* @page margin: 15mm */
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

  /* .school-info / .school-name — #333 family on bodylines, nome escola navy */
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
  if (opts.schoolContactLines?.length)
    opts.schoolContactLines.forEach((l) => l?.trim() && schoolLines.push(l.trim()));

  doc.setFontSize(pxToPt(12));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  ySchool = drawWrappedTexts(doc, schoolLines, schoolTextX, ySchool + pxMm(14), schoolTextMax, {
    leading: pxMm(15),
  });

  /* .doc-info — alinhamento à direita, sem «caixa» de fundo */
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

  /* .header { border-bottom: 2px solid #1a3a5a; padding-bottom: 20px } */
  const headerBottomInner = Math.max(ySchool + pxMm(4), yDoc);
  const dividerY = headerBottomInner + pxMm(18);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(Math.max(pxMm(1.75), 0.45));
  doc.line(margin, dividerY, rhs, dividerY);

  let y = dividerY + pxMm(26);

  /* .details-container + .details-box */
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

  const innerEncW = panelW - padInner * 2;
  const innerStudW = panelW - padInner * 2;
  const hEncInner = measureDetailPanelInnerHeightMm(doc, "Dados do encarregado", encBody, innerEncW);
  const hStudInner = measureDetailPanelInnerHeightMm(doc, "Dados do aluno", studBody, innerStudW);
  const boxH = Math.max(hEncInner, hStudInner) + padInner * 2;

  const boxTop = y;

  doc.setDrawColor(BORDER_EEE[0], BORDER_EEE[1], BORDER_EEE[2]);
  doc.setFillColor(PANEL_FCFCFC[0], PANEL_FCFCFC[1], PANEL_FCFCFC[2]);
  doc.setLineWidth(pxMm(1));
  doc.roundedRect(bx1, boxTop, panelW, boxH, rBox, rBox, "FD");
  doc.roundedRect(bx2, boxTop, panelW, boxH, rBox, rBox, "FD");

  drawDetailPanelInner(doc, bx1, boxTop, padInner, "Dados do encarregado", encBody, innerEncW);
  drawDetailPanelInner(doc, bx2, boxTop, padInner, "Dados do aluno", studBody, innerStudW);

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
    columnStyles: (() => {
      const colQty = 16;
      const colMoney = 32;
      const colDesc = usableW - colQty - colMoney * 2;
      const moneyStyle = { fontSize: pxToPt(11), halign: "right" as const, valign: "middle" as const };
      return {
        0: { cellWidth: colDesc, valign: "middle" as const },
        1: { cellWidth: colQty, halign: "center" as const, valign: "middle" as const },
        2: { cellWidth: colMoney, ...moneyStyle },
        3: { cellWidth: colMoney, ...moneyStyle, fontStyle: "bold" as const, textColor: [35, 40, 48] as [number, number, number] },
      };
    })(),
  });

  const d = doc as DocWithAutoTable;
  const tableFinalY = d.lastAutoTable?.finalY ?? y + pxMm(90);

  /* .totals-container float:right width:250px + .grand-total */
  const totalsW = pxMm(250);
  const totalsX = rhs - totalsW;
  let blockY = tableFinalY + pxMm(14);

  /* linha antes do destacado navy (tipo .total-row) */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(12));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const subLabel = "Subtotal";
  doc.text(subLabel, totalsX, blockY + pxMm(4));
  doc.text(opts.grossTotalFmt, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(10) + pxMm(10); /* espaço tipo margin-top antes do grande total */

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

  /* .footer … .fiscal-text */
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

  /* .hash-container: #f5f5f5, border-left 4px solid navy, Courier */
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

  /* .watermark + processado por computador */
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

  if (opts.isCancelled) {
    drawCancelledInvoiceOverlay(doc, pageW, pageH, opts.cancellationReason);
  }

  doc.setTextColor(0);
  doc.setDrawColor(0);

  return doc;
}

function formatIvaExemptionParagraph(code: string, reason: string): string {
  return `Isenção de IVA (${code}), nos termos fiscalmente comunicados pelo emitente neste documento. ${reason}`;
}

type JsPdfGState = { opacity: number };

function setPdfTextOpacity(doc: jsPDF, opacity: number): void {
  const d = doc as jsPDF & {
    GState?: new (p: JsPdfGState) => JsPdfGState;
    setGState?: (g: JsPdfGState) => void;
  };
  try {
    if (d.GState && d.setGState) d.setGState(new d.GState({ opacity }));
  } catch {
    /* jsPDF sem GState — fallback só com cor mais clara */
  }
}

/** Marca d'água suave quando a FT foi anulada (por cima do conteúdo já desenhado). */
function drawCancelledInvoiceOverlay(
  doc: jsPDF,
  pageW: number,
  pageH: number,
  cancellationReason?: string | null,
): void {
  const margin = 15;
  const cx = pageW / 2;
  const cy = pageH / 2 + pxMm(12);

  const d = doc as jsPDF & { saveGraphicsState?: () => void; restoreGraphicsState?: () => void };
  d.saveGraphicsState?.();
  setPdfTextOpacity(doc, 0.09);
  doc.setTextColor(210, 120, 120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(50);
  doc.text("ANULADA", cx, cy, { align: "center", angle: 38, baseline: "middle" });
  setPdfTextOpacity(doc, 1);
  d.restoreGraphicsState?.();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(195, 130, 130);
  doc.text("FACTURA ANULADA", cx, cy - pxMm(38), { align: "center", baseline: "middle" });

  const reason = cancellationReason?.trim();
  if (reason) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(pxToPt(9));
    doc.setTextColor(130, 130, 135);
    const usableW = pageW - margin * 2;
    const lines = doc.splitTextToSize(`Motivo da anulação: ${reason}`, usableW * 0.9);
    let ry = pageH - margin - pxMm(36) - lines.length * pxMm(10);
    for (const line of lines) {
      doc.text(line, margin, ry, { baseline: "top" });
      ry += pxMm(10);
    }
  }

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
}
