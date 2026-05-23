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
  unitPriceFmt: string;
  totalAmountFmt: string;
  discountPct?: string;
  /** Taxa IVA: "14%", "Isento (M11)", etc. */
  taxLabel?: string;
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
  /** Hora de emissão (hh:mm:ss) para exibir no PDF */
  issuedAtTime?: string;
  clienteNome: string;
  clienteNif: string;
  /** Nome para exibição como encarregado (quando distinto dos dados estritamente fiscais). */
  encarregadoNome?: string | null;
  studentName: string;
  studentClassroom?: string | null;
  academicYearLabel?: string | null;
  lineItems: FiscalInvoiceLine[];
  grossTotalFmt: string;
  /** Subtotal (soma das bases sem IVA). Se omitido, usa grossTotalFmt. */
  subtotalFmt?: string;
  /** Valor total do IVA. Se omitido, assume 0. */
  ivaFmt?: string;
  /** Quadro de Resumo de IVA (obrigatório AGT quando há taxas mistas) */
  taxSummary?: Array<{ label: string; base: string; iva: string }>;
  exemptionCode?: string | null;
  exemptionReason?: string | null;
  documentHashFootnote?: string | null;
  digitalSignatureSha1?: string | null;
  /** FT anulada (cancelamento directo — marca no PDF). */
  isCancelled?: boolean;
  cancellationReason?: string | null;
  /** Referência à Pró-Forma que originou esta FT (OrderReferences AGT). Ex: "PP 2026/4" */
  orderReferencePP?: string | null;
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
    schoolName: school?.name?.trim() || "Edukamba",
    schoolNif: school?.nif?.trim() || "5480041924",
    schoolAddress: school?.address?.trim() || "Zona Verde, Rua 18, Casa 26, Belas, Luanda",
    schoolContactLines: ["Email: geral@edukamba.com", "Website: www.edukamba.com"],
    logoDataUrl: logoDataUrlFinal,
    documentNumber: invoice.document_number.trim(),
    invoiceDateYYYYMMDD: invoice.invoice_date.slice(0, 10),
    issuedAtTime: (() => {
      const iso = (invoice as { invoice_issued_at?: string }).invoice_issued_at;
      if (!iso) return undefined;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return undefined;
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    })(),
    clienteNome: invoice.cliente_nif.trim() === "999999999" ? "Consumidor Final" : invoice.cliente_nome.trim(),
    clienteNif: invoice.cliente_nif.trim(),
    encarregadoNome: invoice.cliente_nif.trim() === "999999999" ? "Consumidor Final" : (guardianNameFromProfile ?? invoice.cliente_nome.trim()),
    studentName: studentFullName || "—",
    studentClassroom: studentClassroom || null,
    academicYearLabel,
    lineItems: (() => {
      // Capitalizar primeira letra
      const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
      // Se line_description contém múltiplos itens separados por ";" (conversão PP→FT), criar linhas distintas
      // Formato novo: "Desc:Valor:IvaPct; Desc2:Valor2:IvaPct2"
      // Formato antigo: "Desc:Valor; Desc2:Valor2" ou "Desc; Desc2"
      const parts = lineDescription.split(";").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map((part) => {
          // Usar regex para extrair: tudo antes do último ou penúltimo ":" é descrição
          // Formato: "Descrição:valor_numerico:iva_pct"
          const match3 = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
          if (match3) {
            const desc = match3[1].trim();
            const val = match3[2].trim();
            const ivaPct = match3[3].trim();
            const num = parseFloat(val.replace(/\s/g, "").replace(",", "."));
            const taxLabel = ivaPct === "0" ? "Isento (M11)" : ivaPct === "0_M04" ? "Não sujeito (M04)" : `${ivaPct}%`;
            const fmtVal = Number.isFinite(num) ? formatMoney(num) : totalFmt;
            return {
              description: cap(desc),
              quantity: 1,
              unitPriceFmt: fmtVal,
              totalAmountFmt: fmtVal,
              taxLabel,
            };
          }
          // Formato antigo: "Desc:Valor"
          const match2 = /^(.+):(\d[\d\s.,]*)$/.exec(part);
          if (match2) {
            const desc = match2[1].trim();
            const val = match2[2].trim();
            const num = parseFloat(val.replace(/\s/g, "").replace(",", "."));
            const fmtVal = Number.isFinite(num) ? formatMoney(num) : totalFmt;
            return {
              description: cap(desc),
              quantity: 1,
              unitPriceFmt: fmtVal,
              totalAmountFmt: fmtVal,
            };
          }
          return { description: cap(part), quantity: 1, unitPriceFmt: totalFmt, totalAmountFmt: totalFmt };
        });
      }
      // Item único — tentar parsear formato "Desc:Valor:IvaPct"
      const singleMatch = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(lineDescription);
      if (singleMatch) {
        const desc = singleMatch[1].trim();
        const val = singleMatch[2].trim();
        const ivaPctStr = singleMatch[3].trim();
        const num = parseFloat(val.replace(/\s/g, "").replace(",", "."));
        const taxLabel = ivaPctStr === "0" ? "Isento (M11)" : ivaPctStr === "0_M04" ? "Não sujeito (M04)" : `${ivaPctStr}%`;
        const fmtVal = Number.isFinite(num) ? formatMoney(num) : totalFmt;
        return [{
          description: cap(desc),
          quantity: 1,
          unitPriceFmt: fmtVal,
          totalAmountFmt: fmtVal,
          taxLabel,
        }];
      }
      // Formato antigo "Desc:Valor"
      const singleMatch2 = /^(.+):(\d[\d\s.,]*)$/.exec(lineDescription);
      if (singleMatch2) {
        const desc = singleMatch2[1].trim();
        const val = singleMatch2[2].trim();
        const num = parseFloat(val.replace(/\s/g, "").replace(",", "."));
        const fmtVal = Number.isFinite(num) ? formatMoney(num) : totalFmt;
        return [{
          description: cap(desc),
          quantity: 1,
          unitPriceFmt: fmtVal,
          totalAmountFmt: fmtVal,
        }];
      }
      return [{
        description: cap(lineDescription),
        quantity: 1,
        unitPriceFmt: totalFmt,
        totalAmountFmt: totalFmt,
      }];
    })(),
    ...(() => {
      // Calcular subtotal, IVA e taxSummary a partir dos itens parseados
      const parts = lineDescription.split(";").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        let subtotal = 0;
        let totalIva = 0;
        const taxGroups: Record<string, { base: number; iva: number; label: string }> = {};

        for (const part of parts) {
          const match3 = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
          if (match3) {
            const val = parseFloat(match3[2].replace(/\s/g, "").replace(",", ".")) || 0;
            const ivaPctStr = match3[3].trim();
            const pct = ivaPctStr === "0_M04" ? 0 : (parseFloat(ivaPctStr) || 0);
            const ivaAmt = (val * pct) / 100;
            subtotal += val;
            totalIva += ivaAmt;
            const label = ivaPctStr === "0" ? "Isento (M11)" : ivaPctStr === "0_M04" ? "Não sujeito (M04)" : `${ivaPctStr}%`;
            if (!taxGroups[ivaPctStr]) taxGroups[ivaPctStr] = { base: 0, iva: 0, label };
            taxGroups[ivaPctStr].base += val;
            taxGroups[ivaPctStr].iva += ivaAmt;
          } else {
            const match2 = /^(.+):(\d[\d\s.,]*)$/.exec(part);
            const val = match2 ? (parseFloat(match2[2].replace(/\s/g, "").replace(",", ".")) || 0) : 0;
            subtotal += val;
          }
        }

        const fmtNum = (n: number) => formatMoney(Number.isFinite(n) ? n : 0);
        return {
          subtotalFmt: fmtNum(subtotal),
          ivaFmt: fmtNum(totalIva),
          taxSummary: Object.values(taxGroups).map((g) => ({
            label: g.label,
            base: fmtNum(g.base),
            iva: fmtNum(g.iva),
          })),
        };
      }
      // Item único com formato "Desc:Valor:IvaPct"
      const sm = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(lineDescription);
      if (sm) {
        const val = parseFloat(sm[2].replace(/\s/g, "").replace(",", ".")) || 0;
        const ivaPctStr = sm[3].trim();
        const pct = ivaPctStr === "0_M04" ? 0 : (parseFloat(ivaPctStr) || 0);
        const ivaAmt = Math.round((val * pct / 100) * 100) / 100;
        const label = ivaPctStr === "0" ? "Isento (M11)" : ivaPctStr === "0_M04" ? "Não sujeito (M04)" : `${ivaPctStr}%`;
        const fmtNum = (n: number) => formatMoney(Number.isFinite(n) ? n : 0);
        return {
          subtotalFmt: fmtNum(val),
          ivaFmt: fmtNum(ivaAmt),
          taxSummary: [{ label, base: fmtNum(val), iva: fmtNum(ivaAmt) }],
        };
      }
      return {};
    })(),
    grossTotalFmt: totalFmt,
    exemptionCode: invoice.exemption_code ?? null,
    exemptionReason: invoice.exemption_reason ?? null,
    documentHashFootnote: invoice.document_hash,
    digitalSignatureSha1: invoice.digital_signature_sha1_b64,
    isCancelled: String((invoice as { invoice_status?: string }).invoice_status ?? "N").toUpperCase() === "A",
    cancellationReason: (invoice as { cancellation_reason?: string | null }).cancellation_reason ?? null,
    orderReferencePP: (invoice as { order_reference_pp?: string | null }).order_reference_pp ?? null,
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

  const hdrTop = margin;
  const leftColW = usableW * 0.52;

  // Logo removido — header começa directamente com texto
  const textStartX = margin;
  let yLeft = hdrTop;

  const schoolNameSize = pxToPt(18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(schoolNameSize);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  yLeft = drawWrappedTexts(
    doc,
    ["Edukamba"],
    textStartX,
    yLeft,
    leftColW,
    { leading: pxMm(22), size: schoolNameSize, style: "bold", color: NAVY },
  );

  yLeft += pxMm(3);
  yLeft = drawWrappedTexts(doc, ["Factura-Recibo (documento fiscal)"], textStartX, yLeft, leftColW, {
    leading: pxMm(12),
    size: pxToPt(9),
    color: FOOTER_MUTED,
  });

  yLeft += pxMm(5);
  const edukambaHeaderLines = [
    "NIF: 5480041924",
    "Zona Verde, Rua 18, Casa 26, Belas, Luanda",
    "Email: geral@edukamba.com",
    "Website: www.edukamba.com",
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  yLeft = drawWrappedTexts(doc, edukambaHeaderLines, textStartX, yLeft, leftColW, {
    leading: pxMm(13),
    size: pxToPt(10),
  });

  // ── Lado direito: tipo de documento + número + datas
  let yDoc = hdrTop;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(20));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("FACTURA RECIBO", rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(28);

  doc.setFontSize(pxToPt(13));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text(opts.documentNumber.trim(), rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const issueLabel = fmtPtLongDateYYYYMMDD(opts.invoiceDateYYYYMMDD);
  const timeStr = opts.issuedAtTime ? ` ${opts.issuedAtTime}` : "";
  doc.text(`Emissão: ${issueLabel}${timeStr}`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(16);

  // Período Contabilístico
  const periodMonth = (() => {
    const raw = opts.invoiceDateYYYYMMDD?.trim()?.slice(0, 10);
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date().getMonth() + 1;
    return parseInt(raw.split("-")[1], 10);
  })();
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  doc.text(`Período Contabilístico: ${periodMonth}`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(16);

  // OrderReferences — origem PP
  if (opts.orderReferencePP?.trim()) {
    doc.setFontSize(pxToPt(11));
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(`Origem: ${opts.orderReferencePP.trim()}`, rhs, yDoc, { align: "right", baseline: "top" });
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    yDoc += pxMm(16);
  }

  const headerBottomInner = Math.max(yLeft + pxMm(4), yDoc);
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

  // Dados do Cliente
  const clientBody: string[] = [];
  const encNomeReal = opts.encarregadoNome?.trim() || opts.clienteNome.trim() || "—";
  clientBody.push(encNomeReal);
  if (opts.studentName?.trim() && opts.studentName.trim() !== "—") {
    clientBody.push(`Aluno: ${opts.studentName.trim()}`);
  }
  if (opts.studentClassroom?.trim() && opts.studentClassroom.trim() !== "—") {
    clientBody.push(`Turma: ${opts.studentClassroom.trim()}`);
  }
  if (opts.academicYearLabel?.trim() && opts.academicYearLabel.trim() !== "—") {
    clientBody.push(`Ano lectivo: ${opts.academicYearLabel.trim()}`);
  }
  clientBody.push(`NIF: ${opts.clienteNif.trim()}`);

  // Dados do Emitente — SEMPRE Edukamba (fixo)
  const issuerBody: string[] = [
    "Edukamba",
    "Zona Verde, Rua 18, Casa 26, Belas, Luanda",
    "NIF: 5480041924",
    "Email: geral@edukamba.com",
    "Website: www.edukamba.com",
  ];

  const innerW = panelW - padInner * 2;
  const hClientInner = measureDetailPanelInnerHeightMm(doc, "Dados do Cliente", clientBody, innerW);
  const hIssuerInner = measureDetailPanelInnerHeightMm(doc, "Dados do Emitente", issuerBody, innerW);
  const boxH = Math.max(hClientInner, hIssuerInner) + padInner * 2;

  const boxTop = y;

  doc.setDrawColor(BORDER_EEE[0], BORDER_EEE[1], BORDER_EEE[2]);
  doc.setFillColor(PANEL_FCFCFC[0], PANEL_FCFCFC[1], PANEL_FCFCFC[2]);
  doc.setLineWidth(pxMm(1));
  doc.roundedRect(bx1, boxTop, panelW, boxH, rBox, rBox, "FD");
  doc.roundedRect(bx2, boxTop, panelW, boxH, rBox, rBox, "FD");

  drawDetailPanelInner(doc, bx1, boxTop, padInner, "Dados do Cliente", clientBody, innerW);
  drawDetailPanelInner(doc, bx2, boxTop, padInner, "Dados do Emitente", issuerBody, innerW);

  y = boxTop + boxH + pxMm(18);

  const hasAnyDiscount = opts.lineItems.some((it) => it.discountPct);
  const head = hasAnyDiscount
    ? [["DESCRIÇÃO DO SERVIÇO", "QTD", "P. UNITÁRIO", "DESC.", "TAXA", "TOTAL"]]
    : [["DESCRIÇÃO DO SERVIÇO", "QTD", "P. UNITÁRIO", "TAXA", "TOTAL"]];
  const body = opts.lineItems.map((it) => {
    const row = [
      it.description.replace(/\u00a0/g, " "),
      String(it.quantity),
      it.unitPriceFmt,
    ];
    if (hasAnyDiscount) row.push(it.discountPct || "—");
    row.push(it.taxLabel || "Isento (M11)");
    row.push(it.totalAmountFmt);
    return row;
  });

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
      const moneyStyle = { fontSize: pxToPt(11), halign: "right" as const, valign: "middle" as const };
      if (hasAnyDiscount) {
        const colQty = 12; const colUnit = 24; const colDisc = 14; const colTax = 20; const colTotal = 34;
        const colDesc = usableW - colQty - colUnit - colDisc - colTax - colTotal;
        return {
          0: { cellWidth: colDesc, valign: "middle" as const },
          1: { cellWidth: colQty, halign: "center" as const, valign: "middle" as const },
          2: { cellWidth: colUnit, ...moneyStyle },
          3: { cellWidth: colDisc, halign: "center" as const, valign: "middle" as const },
          4: { cellWidth: colTax, halign: "center" as const, valign: "middle" as const },
          5: { cellWidth: colTotal, ...moneyStyle, fontStyle: "bold" as const, textColor: [35, 40, 48] as [number, number, number] },
        };
      }
      const colQty = 12; const colUnit = 24; const colTax = 20; const colTotal = 38;
      const colDesc = usableW - colQty - colUnit - colTax - colTotal;
      return {
        0: { cellWidth: colDesc, valign: "middle" as const },
        1: { cellWidth: colQty, halign: "center" as const, valign: "middle" as const },
        2: { cellWidth: colUnit, ...moneyStyle },
        3: { cellWidth: colTax, halign: "center" as const, valign: "middle" as const },
        4: { cellWidth: colTotal, ...moneyStyle, fontStyle: "bold" as const, textColor: [35, 40, 48] as [number, number, number] },
      };
    })(),
  });

  const d = doc as DocWithAutoTable;
  const tableFinalY = d.lastAutoTable?.finalY ?? y + pxMm(90);

  let blockY = tableFinalY + pxMm(14);

  // Quadro de Resumo de IVA (obrigatório AGT quando há taxas mistas)
  if (opts.taxSummary && opts.taxSummary.length > 0) {
    const taxHead = [["TAXA / ISENÇÃO", "BASE TRIBUTÁVEL", "IVA"]];
    const taxBody = opts.taxSummary.map((ts) => [ts.label, ts.base, ts.iva]);

    autoTable(doc, {
      startY: blockY,
      head: taxHead,
      body: taxBody,
      margin: { left: margin + usableW * 0.35, right: margin },
      theme: "plain",
      styles: {
        fontSize: pxToPt(10),
        cellPadding: { top: pxMm(6), right: pxMm(8), bottom: pxMm(6), left: pxMm(8) },
        lineWidth: pxMm(0.5),
        lineColor: BORDER_EEE,
        textColor: BODY_TEXT,
        valign: "middle",
      },
      headStyles: {
        fillColor: [240, 240, 240] as [number, number, number],
        textColor: NAVY,
        fontStyle: "bold",
        fontSize: pxToPt(9),
      },
      columnStyles: {
        0: { halign: "left" as const },
        1: { halign: "right" as const },
        2: { halign: "right" as const },
      },
    });

    const d2 = doc as DocWithAutoTable;
    blockY = (d2.lastAutoTable?.finalY ?? blockY) + pxMm(10);
  }

  // Totals section
  const totalsW = usableW * 0.55;
  const totalsX = rhs - totalsW;

  const subtotalDisplay = opts.subtotalFmt ?? opts.grossTotalFmt;
  const ivaDisplay = opts.ivaFmt ?? "0 AOA";
  const hasIva = opts.ivaFmt && opts.ivaFmt !== "0 AOA" && opts.ivaFmt !== "0,00" && opts.ivaFmt !== "0,00 AOA";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(12));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text("Subtotal", totalsX, blockY + pxMm(4));
  doc.text(subtotalDisplay, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(10) + pxMm(10);

  // Linha de IVA (sempre mostrar)
  doc.text("IVA", totalsX, blockY + pxMm(4));
  doc.text(ivaDisplay, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(10) + pxMm(10);

  const grandH = pxMm(42);
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(totalsX, blockY, totalsW, grandH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL PAGO", totalsX + pxMm(10), blockY + grandH * 0.35, { baseline: "middle" });
  doc.setFontSize(pxToPt(16));
  doc.text(opts.grossTotalFmt, totalsX + pxMm(10), blockY + grandH * 0.7, { baseline: "middle" });

  /* .footer … .fiscal-text */
  let footY = blockY + grandH + pxMm(48);
  
  // Texto de isenção IVA — só renderizar se houver itens com código M11
  const hasExemptItem = opts.lineItems.some((it) => 
    it.taxLabel?.includes("M11") || it.taxLabel?.includes("Isento")
  ) || (opts.exemptionCode?.trim()?.startsWith("M") && opts.taxSummary?.some((ts) => ts.label.includes("M11") || ts.label.includes("Isento")));
  
  if (hasExemptItem) {
    const code = (opts.exemptionCode ?? "M11").trim();
    const reason =
      opts.exemptionReason?.trim() ||
      "nos termos do Artigo 12.º do CIVA - Isenção no domínio da educação.";
    const exemptText = formatIvaExemptionParagraph(code, reason);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(pxToPt(11));
    doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
    for (const ln of doc.splitTextToSize(exemptText, usableW)) {
      doc.text(ln, margin, footY);
      footY += pxMm(16);
    }
    footY += pxMm(12);
  }

  /* Hash control: apenas 4 caracteres extraídos do hash (posições 1,11,21,31) + hífen */
  const fullHash = opts.documentHashFootnote?.trim() || "";
  const hashChar1 = fullHash.charAt(0) || "0";
  const hashChar2 = fullHash.charAt(10) || "0";
  const hashChar3 = fullHash.charAt(20) || "0";
  const hashChar4 = fullHash.charAt(30) || "0";
  const hashControl4 = `${hashChar1}${hashChar2}${hashChar3}${hashChar4}-`;

  /* .watermark + processado por computador */
  const wmY = Math.min(pageH - pxMm(16), footY + pxMm(20));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  doc.text(`Hash: ${hashControl4} | Processado por programa válido nº31.1/AGT20`, margin, wmY);
  doc.text("edukamba.com", rhs, wmY, { align: "right" });

  if (opts.isCancelled) {
    drawCancelledInvoiceOverlay(doc, pageW, pageH, opts.cancellationReason);
  }

  doc.setTextColor(0);
  doc.setDrawColor(0);

  return doc;
}

function formatIvaExemptionParagraph(code: string, reason: string): string {
  return `Isenção de IVA (${code}), ${reason}`;
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
  setPdfTextOpacity(doc, 0.17);
  doc.setTextColor(205, 95, 95);
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
