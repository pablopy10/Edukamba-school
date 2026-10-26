import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getHashControl } from "./crypto/agtCrypto";
import { buildAgtQrPayload, buildAgtQrUrl, generateAgtQrDataUrl } from "./qr/agtQrCode";
import { getTaxRuleForLine } from "./educationalTaxRules";

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
  lineNumber?: number;
  description: string;
  quantity: number;
  unitPriceFmt: string;
  totalAmountFmt: string;
  discountPct?: string;
  discountAmountFmt?: string;
  /** Taxa IVA: "14%", "7%", "0%", "Isento (M11)", etc. */
  taxLabel?: string;
  taxPercentage?: number;
  exemptionCode?: string | null;
  exemptionReason?: string | null;
  totalNetFmt?: string;
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
  /** Registo no sistema exato: AAAA-MM-DD HH:MM:SS */
  systemEntryTimestamp?: string;
  /** Identificação da via: Original, Duplicado, 2.ª via em conformidade com o original */
  copyType?: "Original" | "Duplicado" | "2.ª via em conformidade com o original" | string;
  clienteNome: string;
  clienteNif: string;
  clienteAddress?: string | null;
  /** Nome para exibição como encarregado (quando distinto dos dados estritamente fiscais). */
  encarregadoNome?: string | null;
  studentName: string;
  studentClassroom?: string | null;
  academicYearLabel?: string | null;
  lineItems: FiscalInvoiceLine[];
  grossTotalFmt: string;
  /** Subtotal (soma das bases sem IVA). Se omitido, usa grossTotalFmt. */
  subtotalFmt?: string;
  /** Total de descontos formatado */
  totalDiscountFmt?: string;
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
  /** Referência do documento original (se NC ou conversão) */
  referencedDocNumber?: string | null;
  referencedDocDate?: string | null;
  /** Tipo de Documento ('FT', 'FR', 'NC', 'PF', etc.) */
  docType?: string | null;
  /** Imagem Base64 / DataUrl do QR Code oficial AGT */
  qrCodeDataUrl?: string | null;
  /** Payload de texto bruto do QR Code AGT */
  qrCodePayload?: string | null;
  /** Hash Control oficial (4 caracteres extraídos do hash: 1º, 11º, 21º, 31º) */
  hashControl?: string | null;
  /** Número de certificação da AGT */
  certificationNumber?: string | null;
  /** Versão do software */
  softwareVersion?: string | null;
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
  if (month && yLabel) serviceDescription = `Propina - ${month} (${yLabel})`;
  else if (month) serviceDescription = `Propina - ${month}`;
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
    .select("name,nif,address,logo_url,phone,email")
    .eq("id", invoice.school_id)
    .maybeSingle();
  const logoDataUrlFinal = await fetchLogoAsDataUrl(school?.logo_url ?? null);

  // Contactos dinâmicos da escola
  const contactLines: string[] = [];
  if ((school as Record<string, unknown>)?.phone) contactLines.push(`Tel: ${(school as Record<string, unknown>).phone}`);
  if ((school as Record<string, unknown>)?.email) contactLines.push(`Email: ${(school as Record<string, unknown>).email}`);
  if (contactLines.length === 0 && school?.name) contactLines.push(""); // escola sem contactos — não mostrar fallback Edukamba

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

  // Normalização do Adquirente (Regra AGT: 999999999 e Consumidor Final se omitido)
  const isGeneric = !invoice.cliente_nif?.trim() || invoice.cliente_nif.trim() === "999999999";
  const clienteNifFinal = isGeneric ? "999999999" : invoice.cliente_nif.trim();
  const clienteNomeFinal = isGeneric ? "Consumidor Final" : (invoice.cliente_nome?.trim() || "Cliente");

  // Identificação do Tipo de Documento
  const docType = (invoice as Record<string, unknown>).doc_type
    ? String((invoice as Record<string, unknown>).doc_type)
    : invoice.document_number.startsWith("FT")
    ? "FT"
    : invoice.document_number.startsWith("NC")
    ? "NC"
    : invoice.document_number.startsWith("PF")
    ? "PF"
    : "FR";

  // Timestamp de gravação no sistema (AAAA-MM-DD HH:MM:SS)
  const systemEntryTimestamp = (() => {
    const iso = (invoice as { invoice_issued_at?: string }).invoice_issued_at;
    if (iso) {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
    }
    return `${invoice.invoice_date.slice(0, 10)} 12:00:00`;
  })();

  // Extração dos 4 caracteres de controlo do Hash (1º, 11º, 21º, 31º)
  const rawHash = (invoice.digital_signature_sha1_b64 || invoice.document_hash || "").trim();
  const hashControl = getHashControl(rawHash) || (rawHash.length >= 4 ? rawHash.slice(0, 4) : "0000");

  // Geração do QR Code Oficial AGT
  // Conforme o Manual de Integração API Facturação Electrónica AGT e Decreto Presidencial n.º 292/18,
  // o código codifica o URL oficial de consulta do Quiosque Tributário da AGT (https://quiosqueagt.minfin.gov.ao)
  // garantindo leitura universal em smartphones (iOS/Android/Google Lens) e eliminando mensagens de erro "não foram encontrados dados".
  let qrCodeDataUrlFinal: string | null = null;
  let qrCodePayloadFinal: string | null = null;
  try {
    const schoolNif = school?.nif?.trim() || "5000000000";
    const docNum = invoice.document_number.trim();
    qrCodePayloadFinal = buildAgtQrUrl({
      nifEmissor: schoolNif,
      numDoc: docNum,
    });
    qrCodeDataUrlFinal = await generateAgtQrDataUrl(qrCodePayloadFinal, { width: 512, margin: 4 });
  } catch (qrErr) {
    console.warn("Erro ao gerar QR Code AGT para PDF:", qrErr);
  }

  // Parse e classificação de linhas com regras tributárias educacionais
  const parsedLines = (() => {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const parts = lineDescription.split(";").map((s) => s.trim()).filter(Boolean);

    if (parts.length > 1) {
      return parts.map((part, idx) => {
        const match3 = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
        if (match3) {
          const desc = cap(match3[1].trim());
          const val = parseFloat(match3[2].replace(/\s/g, "").replace(",", ".")) || 0;
          const ivaPctStr = match3[3].trim();
          const isM04 = ivaPctStr === "0_M04";
          const isM11 = ivaPctStr === "0_M11" || ivaPctStr === "0";
          const pct = isM04 || isM11 ? 0 : (parseFloat(ivaPctStr) || 0);
          const lineTotal = Math.round((val + (val * pct) / 100) * 100) / 100;
          const rule = getTaxRuleForLine(desc);

          return {
            lineNumber: idx + 1,
            description: desc,
            quantity: 1,
            unitPriceFmt: formatMoney(val),
            totalAmountFmt: formatMoney(lineTotal),
            totalNetFmt: formatMoney(val),
            taxPercentage: pct,
            exemptionCode: pct === 0 ? (isM04 ? "M04" : rule.taxExemptionCode || "M11") : undefined,
            exemptionReason: pct === 0 ? (isM04 ? "Não sujeito a IVA nos termos do CIVA" : rule.taxExemptionReason || "Isenção no domínio da educação") : undefined,
            taxLabel: pct === 0 ? (isM04 ? "Não sujeito (M04)" : "Isento (M11)") : `${pct}%`,
          };
        }

        const match2 = /^(.+):(\d[\d\s.,]*)$/.exec(part);
        if (match2) {
          const desc = cap(match2[1].trim());
          const val = parseFloat(match2[2].replace(/\s/g, "").replace(",", ".")) || 0;
          const rule = getTaxRuleForLine(desc);
          const isExempt = rule.defaultTaxPercentage === 0;

          return {
            lineNumber: idx + 1,
            description: desc,
            quantity: 1,
            unitPriceFmt: formatMoney(val),
            totalAmountFmt: formatMoney(val),
            totalNetFmt: formatMoney(val),
            taxPercentage: rule.defaultTaxPercentage,
            exemptionCode: isExempt ? rule.taxExemptionCode : undefined,
            exemptionReason: isExempt ? rule.taxExemptionReason : undefined,
            taxLabel: isExempt ? `Isento (${rule.taxExemptionCode || "M11"})` : `${rule.defaultTaxPercentage}%`,
          };
        }

        const rule = getTaxRuleForLine(part);
        const isExempt = rule.defaultTaxPercentage === 0;
        return {
          lineNumber: idx + 1,
          description: cap(part),
          quantity: 1,
          unitPriceFmt: totalFmt,
          totalAmountFmt: totalFmt,
          totalNetFmt: totalFmt,
          taxPercentage: rule.defaultTaxPercentage,
          exemptionCode: isExempt ? rule.taxExemptionCode : undefined,
          exemptionReason: isExempt ? rule.taxExemptionReason : undefined,
          taxLabel: isExempt ? `Isento (${rule.taxExemptionCode || "M11"})` : `${rule.defaultTaxPercentage}%`,
        };
      });
    }

    // Item único
    const sm = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(lineDescription);
    if (sm) {
      const desc = cap(sm[1].trim());
      const val = parseFloat(sm[2].replace(/\s/g, "").replace(",", ".")) || 0;
      const ivaPctStr = sm[3].trim();
      const isM04 = ivaPctStr === "0_M04";
      const isM11 = ivaPctStr === "0_M11" || ivaPctStr === "0";
      const pct = isM04 || isM11 ? 0 : (parseFloat(ivaPctStr) || 0);
      const lineTotal = Math.round((val + (val * pct) / 100) * 100) / 100;
      const rule = getTaxRuleForLine(desc);

      return [{
        lineNumber: 1,
        description: desc,
        quantity: 1,
        unitPriceFmt: formatMoney(val),
        totalAmountFmt: formatMoney(lineTotal),
        totalNetFmt: formatMoney(val),
        taxPercentage: pct,
        exemptionCode: pct === 0 ? (isM04 ? "M04" : rule.taxExemptionCode || "M11") : undefined,
        exemptionReason: pct === 0 ? (isM04 ? "Não sujeito a IVA nos termos do CIVA" : rule.taxExemptionReason || "Isenção no domínio da educação") : undefined,
        taxLabel: pct === 0 ? (isM04 ? "Não sujeito (M04)" : "Isento (M11)") : `${pct}%`,
      }];
    }

    const sm2 = /^(.+):(\d[\d\s.,]*)$/.exec(lineDescription);
    if (sm2) {
      const desc = cap(sm2[1].trim());
      const val = parseFloat(sm2[2].replace(/\s/g, "").replace(",", ".")) || 0;
      const rule = getTaxRuleForLine(desc);
      const isExempt = rule.defaultTaxPercentage === 0;

      return [{
        lineNumber: 1,
        description: desc,
        quantity: 1,
        unitPriceFmt: formatMoney(val),
        totalAmountFmt: formatMoney(val),
        totalNetFmt: formatMoney(val),
        taxPercentage: rule.defaultTaxPercentage,
        exemptionCode: isExempt ? rule.taxExemptionCode : undefined,
        exemptionReason: isExempt ? rule.taxExemptionReason : undefined,
        taxLabel: isExempt ? `Isento (${rule.taxExemptionCode || "M11"})` : `${rule.defaultTaxPercentage}%`,
      }];
    }

    const rule = getTaxRuleForLine(lineDescription);
    const isExempt = rule.defaultTaxPercentage === 0;
    return [{
      lineNumber: 1,
      description: cap(lineDescription),
      quantity: 1,
      unitPriceFmt: totalFmt,
      totalAmountFmt: totalFmt,
      totalNetFmt: totalFmt,
      taxPercentage: rule.defaultTaxPercentage,
      exemptionCode: isExempt ? rule.taxExemptionCode : undefined,
      exemptionReason: isExempt ? rule.taxExemptionReason : undefined,
      taxLabel: isExempt ? `Isento (${rule.taxExemptionCode || "M11"})` : `${rule.defaultTaxPercentage}%`,
    }];
  })();

  // Resumo de Impostos
  const taxSummaryComputed = (() => {
    const taxGroups: Record<string, { base: number; iva: number; label: string }> = {};
    let subtotal = 0;
    let totalIva = 0;

    for (const line of parsedLines) {
      const val = parseFloat(line.unitPriceFmt.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
      const pct = line.taxPercentage ?? 0;
      const ivaAmt = Math.round(((val * pct) / 100) * 100) / 100;
      subtotal += val;
      totalIva += ivaAmt;

      const groupKey = `${pct}_${line.exemptionCode || "NOR"}`;
      if (!taxGroups[groupKey]) {
        const label = pct === 0 ? `Isento (${line.exemptionCode || "M11"})` : `Taxa ${pct}%`;
        taxGroups[groupKey] = { base: 0, iva: 0, label };
      }
      taxGroups[groupKey].base += val;
      taxGroups[groupKey].iva += ivaAmt;
    }

    return {
      subtotalFmt: formatMoney(subtotal),
      ivaFmt: formatMoney(totalIva),
      taxSummary: Object.values(taxGroups).map((g) => ({
        label: g.label,
        base: formatMoney(g.base),
        iva: formatMoney(g.iva),
      })),
    };
  })();

  return {
    schoolName: school?.name?.trim() || "Escola",
    schoolNif: school?.nif?.trim() || null,
    schoolAddress: school?.address?.trim() || "Luanda, Angola",
    schoolContactLines: contactLines,
    logoDataUrl: logoDataUrlFinal,
    documentNumber: invoice.document_number.trim(),
    invoiceDateYYYYMMDD: invoice.invoice_date.slice(0, 10),
    issuedAtTime: systemEntryTimestamp.slice(11),
    systemEntryTimestamp,
    copyType: "Original",
    clienteNome: clienteNomeFinal,
    clienteNif: clienteNifFinal,
    clienteAddress: "Luanda, Angola",
    encarregadoNome: guardianNameFromProfile ?? clienteNomeFinal,
    studentName: studentFullName || "—",
    studentClassroom: studentClassroom || null,
    academicYearLabel,
    lineItems: parsedLines,
    grossTotalFmt: totalFmt,
    subtotalFmt: taxSummaryComputed.subtotalFmt,
    ivaFmt: taxSummaryComputed.ivaFmt,
    taxSummary: taxSummaryComputed.taxSummary,
    exemptionCode: invoice.exemption_code ?? (parsedLines[0]?.exemptionCode || "M11"),
    exemptionReason: invoice.exemption_reason ?? (parsedLines[0]?.exemptionReason || "Isenção no domínio da educação"),
    documentHashFootnote: invoice.document_hash,
    digitalSignatureSha1: invoice.digital_signature_sha1_b64,
    isCancelled: String((invoice as { invoice_status?: string }).invoice_status ?? "N").toUpperCase() === "A",
    cancellationReason: (invoice as { cancellation_reason?: string | null }).cancellation_reason ?? null,
    orderReferencePP: (invoice as { order_reference_pp?: string | null }).order_reference_pp ?? null,
    docType,
    qrCodeDataUrl: qrCodeDataUrlFinal,
    qrCodePayload: qrCodePayloadFinal,
    hashControl,
    certificationNumber: "99/AGT/2026",
    softwareVersion: "1.0.0",
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
  const leftColW = usableW * 0.54;

  // Logo e Identificação da Escola (lado a lado sem sobreposição)
  const hasLogo = Boolean(opts.logoDataUrl?.startsWith("data:image"));
  const logoW = 24;
  const logoH = 24;
  const logoGap = 4;

  if (hasLogo && opts.logoDataUrl) {
    addLogoIfPossible(doc, opts.logoDataUrl, margin, hdrTop, logoW, logoH);
  }

  const schoolTextX = hasLogo ? margin + logoW + logoGap : margin;
  const schoolTextMaxW = hasLogo ? leftColW - (logoW + logoGap) : leftColW;
  let yLeft = hdrTop;

  const schoolNameSize = pxToPt(16);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(schoolNameSize);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  yLeft = drawWrappedTexts(
    doc,
    [opts.schoolName || "Escola"],
    schoolTextX,
    yLeft,
    schoolTextMaxW,
    { leading: pxMm(19), size: schoolNameSize, style: "bold", color: NAVY },
  );

  yLeft += pxMm(3);
  const issuerHeaderLines: string[] = [];
  if (opts.schoolNif) issuerHeaderLines.push(`NIF: ${opts.schoolNif}`);
  if (opts.schoolAddress) issuerHeaderLines.push(opts.schoolAddress);
  if (opts.schoolContactLines?.length) {
    opts.schoolContactLines.forEach((l) => l?.trim() && issuerHeaderLines.push(l.trim()));
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(9.5));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  yLeft = drawWrappedTexts(doc, issuerHeaderLines, schoolTextX, yLeft, schoolTextMaxW, {
    leading: pxMm(13),
    size: pxToPt(9.5),
  });

  const leftHeaderBottom = Math.max(yLeft, hasLogo ? hdrTop + logoH : hdrTop);

  // ── Seção A (Via no canto superior direito)
  const copyLabel = (opts.copyType || "Original").toUpperCase();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(9));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  doc.text(copyLabel, rhs, hdrTop, { align: "right", baseline: "top" });

  // ── Seção B: Metadados do Documento (Lado Direito)
  let yDoc = hdrTop + pxMm(10);
  const docTypeUpper = (
    opts.docType ||
    (opts.documentNumber.startsWith("FT")
      ? "FT"
      : opts.documentNumber.startsWith("NC")
      ? "NC"
      : opts.documentNumber.startsWith("PF")
      ? "PF"
      : "FR")
  ).toUpperCase();

  const docTitle =
    docTypeUpper === "FT"
      ? "FATURA"
      : docTypeUpper === "NC"
      ? "NOTA DE CRÉDITO"
      : docTypeUpper === "PF"
      ? "FATURA PRÓ-FORMA"
      : docTypeUpper === "ND"
      ? "NOTA DE DÉBITO"
      : "FATURA / RECIBO";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(19));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(docTitle, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(24);

  doc.setFontSize(pxToPt(13));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text(opts.documentNumber.trim(), rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const issueLabel = fmtPtLongDateYYYYMMDD(opts.invoiceDateYYYYMMDD);
  doc.text(`Data de Emissão: ${issueLabel}`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(14);

  const systemEntry =
    opts.systemEntryTimestamp ||
    (opts.issuedAtTime
      ? `${opts.invoiceDateYYYYMMDD.slice(0, 10)} ${opts.issuedAtTime}`
      : `${opts.invoiceDateYYYYMMDD.slice(0, 10)} 12:00:00`);
  doc.text(`Registo no Sistema: ${systemEntry}`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(14);

  // Período Contabilístico
  const periodMonth = (() => {
    const raw = opts.invoiceDateYYYYMMDD?.trim()?.slice(0, 10);
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date().getMonth() + 1;
    return parseInt(raw.split("-")[1], 10);
  })();
  doc.setFontSize(pxToPt(9));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  doc.text(`Período Contabilístico: ${periodMonth}`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(14);

  // Referência de Origem (Para NC ou Conversão de PP)
  const originDoc = opts.referencedDocNumber || opts.orderReferencePP;
  if (originDoc?.trim()) {
    doc.setFontSize(pxToPt(10));
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    const originDateStr = opts.referencedDocDate ? ` de ${opts.referencedDocDate}` : "";
    doc.text(`Origem: ${originDoc.trim()}${originDateStr}`, rhs, yDoc, { align: "right", baseline: "top" });
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    yDoc += pxMm(14);
  }

  const headerBottomInner = Math.max(leftHeaderBottom + pxMm(4), yDoc);
  const dividerY = headerBottomInner + pxMm(14);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(Math.max(pxMm(1.75), 0.45));
  doc.line(margin, dividerY, rhs, dividerY);

  let y = dividerY + pxMm(20);

  /* Seção A: Dados do Adquirente (Aluno / Encarregado de Educação) */
  const boxGap = usableW * 0.038;
  const panelW = (usableW - boxGap) / 2;
  const bx1 = margin;
  const padInner = pxMm(14);
  const rBox = pxMm(4);

  const clientBody: string[] = [];
  const isGeneric = !opts.clienteNif?.trim() || opts.clienteNif.trim() === "999999999";
  const encNomeReal = isGeneric
    ? "Consumidor Final"
    : opts.encarregadoNome?.trim() || opts.clienteNome?.trim() || "Consumidor Final";
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
  clientBody.push(`NIF: ${isGeneric ? "999999999" : opts.clienteNif.trim()}`);
  clientBody.push(`Endereço: ${opts.clienteAddress?.trim() || "Luanda, Angola"}`);

  const innerW = usableW - padInner * 2;
  const hClientInner = measureDetailPanelInnerHeightMm(doc, "Adquirente (Cliente)", clientBody, innerW);
  const boxH = hClientInner + padInner * 2;
  const boxTop = y;

  doc.setDrawColor(BORDER_EEE[0], BORDER_EEE[1], BORDER_EEE[2]);
  doc.setFillColor(PANEL_FCFCFC[0], PANEL_FCFCFC[1], PANEL_FCFCFC[2]);
  doc.setLineWidth(pxMm(1));
  doc.roundedRect(bx1, boxTop, usableW, boxH, rBox, rBox, "FD");

  drawDetailPanelInner(doc, bx1, boxTop, padInner, "Adquirente (Cliente)", clientBody, innerW);

  y = boxTop + boxH + pxMm(16);

  /* ─── SEÇÃO C: TABELA DE LINHAS (ITENS FATURADOS) ─── */
  /* Colunas Obrigatórias: 1. N.º | 2. Descrição | 3. Qtd | 4. Preço Unitário | 5. Desc. | 6. Taxa IVA | 7. Total Líquido */
  const head = [["N.º", "DESCRIÇÃO", "QTD", "P. UNITÁRIO", "DESC.", "TAXA IVA", "TOTAL LÍQUIDO"]];
  const body = opts.lineItems.map((it, idx) => {
    const lineNo = String(it.lineNumber || idx + 1);
    const isExempt =
      it.taxPercentage === 0 ||
      it.taxLabel?.includes("Isento") ||
      it.taxLabel?.includes("Não sujeito") ||
      (it.taxLabel?.startsWith("0") ?? false);

    // Regra Obrigatória: Se taxa 0%, exibir abaixo da descrição o código e motivo oficial AGT
    let descWithExemption = it.description.replace(/\u00a0/g, " ");
    if (isExempt) {
      const code = it.exemptionCode || opts.exemptionCode || "M02";
      const reason = it.exemptionReason || opts.exemptionReason || "Isento nos termos do Código do IVA";
      descWithExemption += `\n(${code}) ${reason}`;
    }

    const disc = it.discountPct ? `${it.discountPct}%` : it.discountAmountFmt || "—";
    const tax =
      it.taxPercentage !== undefined
        ? it.taxPercentage === 0
          ? "0%"
          : `${it.taxPercentage}%`
        : it.taxLabel || "0%";
    const total = it.totalNetFmt || it.totalAmountFmt;

    return [lineNo, descWithExemption, String(it.quantity), it.unitPriceFmt, disc, tax, total];
  });

  const colNum = 10;
  const colQty = 12;
  const colUnit = 26;
  const colDisc = 16;
  const colTax = 20;
  const colTotal = 30;
  const colDesc = usableW - colNum - colQty - colUnit - colDisc - colTax - colTotal;

  autoTable(doc, {
    startY: y,
    head,
    body,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: {
      fontSize: pxToPt(11),
      cellPadding: { top: pxMm(8), right: pxMm(8), bottom: pxMm(8), left: pxMm(8) },
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
      fontSize: pxToPt(10),
      halign: "left",
      valign: "middle",
      cellPadding: { top: pxMm(9), right: pxMm(8), bottom: pxMm(9), left: pxMm(8) },
    },
    columnStyles: {
      0: { cellWidth: colNum, halign: "center" as const, valign: "middle" as const },
      1: { cellWidth: colDesc, valign: "middle" as const },
      2: { cellWidth: colQty, halign: "center" as const, valign: "middle" as const },
      3: { cellWidth: colUnit, halign: "right" as const, valign: "middle" as const },
      4: { cellWidth: colDisc, halign: "center" as const, valign: "middle" as const },
      5: { cellWidth: colTax, halign: "center" as const, valign: "middle" as const },
      6: {
        cellWidth: colTotal,
        halign: "right" as const,
        valign: "middle" as const,
        fontStyle: "bold" as const,
        textColor: [35, 40, 48] as [number, number, number],
      },
    },
  });

  const d = doc as DocWithAutoTable;
  const tableFinalY = d.lastAutoTable?.finalY ?? y + pxMm(90);

  let blockY = tableFinalY + pxMm(14);

  // ─── SEÇÃO D: QUADRO DE RESUMO DE IMPOSTOS E TOTAIS FINANCEIROS ───
  if (opts.taxSummary && opts.taxSummary.length > 0) {
    const taxHead = [["TAXA / MOTIVO DE ISENÇÃO", "BASE DE INCIDÊNCIA", "VALOR DO IVA"]];
    const taxBody = opts.taxSummary.map((ts) => [ts.label, ts.base, ts.iva]);

    autoTable(doc, {
      startY: blockY,
      head: taxHead,
      body: taxBody,
      margin: { left: margin + usableW * 0.35, right: margin },
      theme: "plain",
      styles: {
        fontSize: pxToPt(9),
        cellPadding: { top: pxMm(5), right: pxMm(7), bottom: pxMm(5), left: pxMm(7) },
        lineWidth: pxMm(0.5),
        lineColor: BORDER_EEE,
        textColor: BODY_TEXT,
        valign: "middle",
      },
      headStyles: {
        fillColor: [240, 240, 240] as [number, number, number],
        textColor: NAVY,
        fontStyle: "bold",
        fontSize: pxToPt(8.5),
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

  // Totais Financeiros
  const totalsW = usableW * 0.55;
  const totalsX = rhs - totalsW;

  const subtotalDisplay = opts.subtotalFmt ?? opts.grossTotalFmt;
  const ivaDisplay = opts.ivaFmt ?? "0,00 Kz";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text("Total Ilíquido (Sem Imposto)", totalsX, blockY + pxMm(4));
  doc.text(subtotalDisplay, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(16);

  if (opts.totalDiscountFmt && opts.totalDiscountFmt !== "0,00 Kz" && opts.totalDiscountFmt !== "0 Kz") {
    doc.text("Total de Descontos", totalsX, blockY + pxMm(4));
    doc.text(`-${opts.totalDiscountFmt}`, totalsX + totalsW, blockY + pxMm(4), { align: "right" });
    blockY += pxMm(16);
  }

  doc.text("Total de IVA", totalsX, blockY + pxMm(4));
  doc.text(ivaDisplay, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(16);

  const grandH = pxMm(38);
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(totalsX, blockY, totalsW, grandH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL A PAGAR (AOA)", totalsX + pxMm(10), blockY + grandH * 0.35, { baseline: "middle" });
  doc.setFontSize(pxToPt(15));
  doc.text(opts.grossTotalFmt, totalsX + pxMm(10), blockY + grandH * 0.72, { baseline: "middle" });

  /* ─── SEÇÃO E: RODAPÉ FISCAL E ELEMENTOS DE CERTIFICAÇÃO (CRÍTICO) ─── */
  let footY = blockY + grandH + pxMm(32);

  /* Extração dos 4 caracteres do Hash (1º, 11º, 21º, 31º) */
  let hashControl = (opts.hashControl || "").trim();
  if (!hashControl) {
    const fullHash = (opts.digitalSignatureSha1 || opts.documentHashFootnote || "").trim();
    hashControl = getHashControl(fullHash) || (fullHash.length >= 4 ? fullHash.slice(0, 4) : "0000");
  }

  const certNumber = opts.certificationNumber?.trim() || "99/AGT/2026";
  const softVersion = opts.softwareVersion?.trim() || "1.0.0";
  const legalCertificationMention = `${hashControl} - Processado por programa validado n.º ${certNumber} Edukamba v${softVersion}`;

  /* QR Code oficial AGT - Dimensionado para 28mm para leitura imediata e máxima visibilidade */
  const qrSize = 28; // 28 mm
  const qrY = Math.min(pageH - margin - qrSize - 4, footY);

  if (opts.qrCodeDataUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, qrY, qrSize, qrSize, "F");
      doc.addImage(opts.qrCodeDataUrl, "PNG", margin, qrY, qrSize, qrSize);
    } catch {
      /* ignora erro de renderização do QR */
    }
  }

  /* Texto Legal de Homologação em texto corrido ao lado do QR Code */
  const textLeftX = margin + qrSize + 4;
  const textMaxW = usableW - qrSize - 4;
  let textY = qrY + 1.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(9.5));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(legalCertificationMention, textLeftX, textY);
  textY += pxMm(14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(8));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  const legalNotice =
    "Os bens ou serviços foram colocados à disposição do adquirente na data e local indicados no presente documento. Documento emitido por software certificado pela Administração Geral Tributária (AGT) ao abrigo do Decreto Presidencial n.º 292/18.";
  for (const line of doc.splitTextToSize(legalNotice, textMaxW)) {
    doc.text(line, textLeftX, textY);
    textY += pxMm(10);
  }

  const wmY = pageH - pxMm(10);
  doc.setFontSize(pxToPt(8));
  doc.text(opts.schoolName || "", rhs, wmY, { align: "right" });

  /* Marca d'água se for Fatura Pró-Forma (PF) */
  const isProforma = docTypeUpper === "PF" || opts.documentNumber.startsWith("PF");
  if (isProforma) {
    drawProformaNoticeOverlay(doc, pageW, pageH);
  }

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

/** Marca d'água obrigatória AGT para Fatura Pró-Forma */
function drawProformaNoticeOverlay(doc: jsPDF, pageW: number, pageH: number): void {
  const cx = pageW / 2;
  const cy = pageH / 2;

  const d = doc as jsPDF & { saveGraphicsState?: () => void; restoreGraphicsState?: () => void };
  d.saveGraphicsState?.();
  setPdfTextOpacity(doc, 0.14);
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("ESTE DOCUMENTO NÃO SERVE DE FATURA", cx, cy, {
    align: "center",
    angle: 35,
    baseline: "middle",
  });
  setPdfTextOpacity(doc, 1);
  d.restoreGraphicsState?.();
}

