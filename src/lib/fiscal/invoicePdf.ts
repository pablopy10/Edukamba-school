import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

/** Cabeçalhos / marca (#1a3a5a) */
const NAVY: [number, number, number] = [26, 58, 90];
/** Linhas e contornos */
const GRAY_STROKE: [number, number, number] = [190, 195, 200];
/** Texto secundário */
const GRAY_TEXT: [number, number, number] = [105, 110, 118];
/** Fundo discreto nos blocos de dados */
const PANEL_FILL: [number, number, number] = [248, 249, 251];
/** Fundo zona hash */
const HASH_BOX_FILL: [number, number, number] = [236, 242, 248];

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
    doc.text(flat[i], xMm, y);
    y += leading;
    if (i === flat.length - 1 && leading > size * 1.05) {
      /* já avançado */
    }
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

/** Altura aproximada (mm) de um bloco com título + linhas de corpo. */
function estimatePanelContentHeightMm(doc: jsPDF, title: string, bodyLines: string[], maxWidthMm: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.35);
  const titleLines = doc.splitTextToSize(title, maxWidthMm);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.95);
  let bodyCount = 0;
  for (const line of bodyLines) {
    const parts = doc.splitTextToSize(line, maxWidthMm);
    bodyCount += Math.max(1, parts.length);
  }
  return titleLines.length * 5.1 + 2.2 + bodyCount * 4.65;
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
  };
}

export function buildInvoicePdf(opts: FiscalInvoicePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 14;
  const gutter = 6;
  const usableW = pageW - margin * 2;

  const rightBoxW = 72;
  const rightX = pageW - margin - rightBoxW;
  let y = margin;

  const logoW = 21;
  const logoH = 13;

  const hdrTop = y;
  const schoolBlockStartX = margin + logoW + 4;
  const leftTextMax = rightX - schoolBlockStartX - gutter;

  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.roundedRect(rightX - 2.5, hdrTop - 2, rightBoxW + 2.5, 34.6, 1.85, 1.85, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("FACTURA RECIBO", rightX + rightBoxW / 2, hdrTop + 7.2, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.3);
  doc.text(opts.documentNumber, rightX + rightBoxW / 2, hdrTop + 15.9, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const issueLabel = fmtPtLongDateYYYYMMDD(opts.invoiceDateYYYYMMDD);
  doc.text(`Emissão: ${issueLabel}`, rightX + rightBoxW / 2, hdrTop + 24.9, {
    align: "center",
  });

  doc.setTextColor(0);

  addLogoIfPossible(doc, opts.logoDataUrl ?? undefined, margin, hdrTop, logoW, logoH);

  const schoolNameLeading = opts.schoolName.length > 44 ? 5.35 : 5.9;
  let ySchool = drawWrappedTexts(
    doc,
    [opts.schoolName.trim() || "Instituição de ensino"],
    schoolBlockStartX,
    hdrTop + 0.35,
    leftTextMax,
    {
      leading: schoolNameLeading,
      size: opts.schoolName.length > 48 ? 9.95 : 11.05,
      style: "bold",
    },
  );

  ySchool = drawWrappedTexts(
    doc,
    ["Plataforma fiscal Edukamba"],
    schoolBlockStartX,
    ySchool + 0.45,
    leftTextMax,
    { leading: 4.1, size: 7.65, color: GRAY_TEXT, style: "normal" },
  );

  const schoolLines: string[] = [];
  if (opts.schoolNif?.trim()) schoolLines.push(`NIF: ${opts.schoolNif.trim()}`);
  if (opts.schoolAddress?.trim()) schoolLines.push(`Morada: ${opts.schoolAddress.trim()}`);
  if (opts.schoolContactLines?.length) opts.schoolContactLines.forEach((l) => l?.trim() && schoolLines.push(l.trim()));

  ySchool = drawWrappedTexts(doc, schoolLines, schoolBlockStartX, ySchool + 1.05, leftTextMax, {
    leading: 4.3,
    size: 8.75,
    color: GRAY_TEXT,
  });

  y = Math.max(ySchool + 2.2, hdrTop + logoH + 4, hdrTop + 33.2) + 4.4;

  doc.setDrawColor(GRAY_STROKE[0], GRAY_STROKE[1], GRAY_STROKE[2]);
  doc.setLineWidth(0.35);
  doc.line(margin, y - 2.85, pageW - margin, y - 2.85);

  const boxGap = 4;
  const half = (usableW - boxGap) / 2;
  const bx1 = margin;
  const bx2 = margin + half + boxGap;
  const padInner = 4.2;

  const encNomeReal = opts.encarregadoNome?.trim() || opts.clienteNome.trim() || "—";
  const turma = opts.studentClassroom?.trim() || "—";
  const ano = opts.academicYearLabel?.trim() || "—";

  const encBody = [`Nome: ${encNomeReal}`, `NIF (efeitos fiscais): ${opts.clienteNif.trim()}`];
  const studBody = [`Nome: ${opts.studentName.trim()}`, `Turma: ${turma}`, `Ano lectivo: ${ano}`];

  const innerEncW = half - padInner * 2;
  const innerStudW = half - padInner * 2;

  const hEnc = estimatePanelContentHeightMm(doc, "Dados do encarregado", encBody, innerEncW);
  const hStud = estimatePanelContentHeightMm(doc, "Dados do aluno", studBody, innerStudW);

  const boxH = Math.max(hEnc + padInner * 2 + 1.85, hStud + padInner * 2 + 1.85, 30.8);

  const boxTop = y;

  doc.setDrawColor(GRAY_STROKE[0], GRAY_STROKE[1], GRAY_STROKE[2]);
  doc.setFillColor(PANEL_FILL[0], PANEL_FILL[1], PANEL_FILL[2]);
  doc.roundedRect(bx1, boxTop, half, boxH, 2, 2, "FD");
  doc.roundedRect(bx2, boxTop, half, boxH, 2, 2, "FD");

  let tyLeft = boxTop + padInner + 5;
  tyLeft = drawWrappedTexts(doc, ["Dados do encarregado"], bx1 + padInner, tyLeft, innerEncW, {
    style: "bold",
    color: NAVY,
    size: 8.5,
    leading: 5.2,
  });
  drawWrappedTexts(doc, encBody, bx1 + padInner, tyLeft + 1.05, innerEncW, {
    leading: 4.62,
    size: 8.95,
  });

  let tyStud = boxTop + padInner + 5;
  tyStud = drawWrappedTexts(doc, ["Dados do aluno"], bx2 + padInner, tyStud, innerStudW, {
    style: "bold",
    color: NAVY,
    size: 8.5,
    leading: 5.2,
  });
  drawWrappedTexts(doc, studBody, bx2 + padInner, tyStud + 1.05, innerStudW, {
    leading: 4.62,
    size: 8.95,
  });

  y = boxTop + boxH + 6.4;

  const head = [["Descrição do serviço", "Qtd", "P. unitário", "Total"]];
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
      fontSize: 9,
      cellPadding: 4,
      lineColor: GRAY_STROKE,
      lineWidth: 0.12,
      textColor: GRAY_TEXT,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: NAVY,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8.95,
      halign: "left",
      cellPadding: 3.95,
    },
    columnStyles: {
      0: { cellWidth: usableW - 62 },
      1: { cellWidth: 18, halign: "center" },
      2: { cellWidth: 23, halign: "right" },
      3: { cellWidth: 23, halign: "right", fontStyle: "bold", textColor: [35, 40, 48] },
    },
  });

  const d = doc as DocWithAutoTable;
  const tableFinalY = d.lastAutoTable?.finalY ?? y + 42;

  /* ——— Totais (alinhamento à direita) ——— */
  const rhs = pageW - margin;
  let totY = tableFinalY + 9;

  doc.setFillColor(PANEL_FILL[0], PANEL_FILL[1], PANEL_FILL[2]);
  doc.setDrawColor(GRAY_STROKE[0], GRAY_STROKE[1], GRAY_STROKE[2]);
  doc.setLineWidth(0.15);
  const totPanelW = 88;
  const totPanelX = rhs - totPanelW;
  doc.rect(totPanelX, totY - 6.4, totPanelW, 29, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2]);
  doc.text("Subtotal (valor da operação)", totPanelX + 4.2, totY + 2.2);

  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(opts.grossTotalFmt, rhs - 4.8, totY + 2.2, { align: "right" });

  doc.setDrawColor(GRAY_STROKE[0], GRAY_STROKE[1], GRAY_STROKE[2]);
  doc.setLineWidth(0.12);
  doc.line(totPanelX + 3.9, totY + 5.95, rhs - 3.9, totY + 5.95);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.85);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("TOTAL PAGO", totPanelX + 4.2, totY + 12.95);

  doc.setFontSize(14.85);
  doc.text(opts.grossTotalFmt, rhs - 4.8, totY + 13.85, { align: "right" });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.15);
  doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2]);
  doc.text("Importância certificada através do presente documento fiscal.", totPanelX + 4.2, totY + 20.95);

  totY += 27.65;

  /* ——— Rodapé: isenção IVA ——— */
  doc.setDrawColor(GRAY_STROKE[0], GRAY_STROKE[1], GRAY_STROKE[2]);
  doc.setLineWidth(0.22);
  doc.line(margin, totY + 1.95, pageW - margin, totY + 1.95);

  const code = (opts.exemptionCode ?? "M10").trim();
  const reason =
    opts.exemptionReason?.trim() ||
    "Isenção de IVA no domínio da educação nos termos legais aplicáveis ao estabelecimento.";

  const exemptText = formatIvaExemptionParagraph(code, reason);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.4);
  doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2]);
  let exY = totY + 6.95;
  const wrappedEx = doc.splitTextToSize(exemptText, usableW);
  for (const ln of wrappedEx) {
    doc.text(ln, margin, exY);
    exY += 4.25;
  }

  /* ——— Caixa destacada AGT Hash ——— */
  let hashTop = Math.max(exY + 6.2, totY + 22);

  /** Garantir espaço mínimo acima da faixa Edukamba */
  const reservedFooter = pageH - 27;
  hashTop = Math.min(hashTop, reservedFooter - 44);

  const hashMain = opts.documentHashFootnote?.trim();
  let hashRows = chunkTextForPdf(hashMain || "", 108);
  if (!hashRows.length) hashRows = ["(hash não disponível no momento)"];

  let hashBoxMinH =
    20.65 + hashRows.length * 4.15 + (opts.digitalSignatureSha1?.trim() ? 14 : 0);
  hashBoxMinH = Math.max(hashBoxMinH, 27.85);

  doc.setFillColor(HASH_BOX_FILL[0], HASH_BOX_FILL[1], HASH_BOX_FILL[2]);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(margin, hashTop, usableW, hashBoxMinH, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.05);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("Hash AGT — assinatura digital / cadeia de documentos", margin + 4.4, hashTop + 7.05);

  doc.setFont("courier", "normal");
  doc.setFontSize(7.95);
  doc.setTextColor(35, 40, 48);

  let hy = hashTop + 13.95;
  for (const row of hashRows) {
    doc.text(row, margin + 4.35, hy);
    hy += 4.08;
  }

  if (opts.digitalSignatureSha1?.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.15);
    doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2]);
    const sigTxt = opts.digitalSignatureSha1.trim();
    const sigShow =
      sigTxt.length <= 96 ? sigTxt : `${sigTxt.slice(0, 44)} … ${sigTxt.slice(-44)}`;
    let sigY = hashTop + hashBoxMinH - 9;
    doc.splitTextToSize(`Assinatura digital PKCS#1 RSA-SHA1 (Base64): ${sigShow}`, usableW - 9).forEach((line) => {
      doc.text(line, margin + 4.35, sigY);
      sigY += 3.95;
    });
  }

  /* ——— Rodapé institucional (fixo) ——— */
  doc.setDrawColor(GRAY_STROKE[0], GRAY_STROKE[1], GRAY_STROKE[2]);

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.15);
  doc.setTextColor(GRAY_TEXT[0], GRAY_TEXT[1], GRAY_TEXT[2]);

  doc.text(`Processado por computador • ${opts.schoolName}`, pageW / 2, pageH - 16.95, {
    align: "center",
  });
  doc.text("Documento com dados gerados dinamicamente a partir do portal Edukamba.", pageW / 2, pageH - 13.25, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("edukamba.com", pageW / 2, pageH - 8.85, { align: "center" });

  doc.setTextColor(0);
  doc.setDrawColor(0);

  return doc;
}

function formatIvaExemptionParagraph(code: string, reason: string): string {
  return `Isenção de IVA (${code}), nos termos fiscalmente comunicados pelo emitente neste documento. ${reason}`;
}
