import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Pro-forma Invoice / Orçamento (PP)
 * Layout idêntico às faturas fiscais, mas sem assinatura digital ou hash chain
 * Propósito: Documentos de referência para AGT e orçamentos para escolas
 */

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

export type ProformaInvoiceLine = {
  description: string;
  quantity: number;
  unitPriceFmt: string;
  totalAmountFmt: string;
  /** Desconto aplicado: "10%" */
  discountPct?: string;
  /** Taxa IVA aplicada: "14%", "Isento (M11)", etc. */
  taxLabel?: string;
};

export type ProformaInvoicePdfInput = {
  // Document info
  documentNumber: string; // "PP 2026/1"
  issueDateYYYYMMDD: string;
  validityDays: number;

  // School/Issuer info
  schoolName: string;
  schoolNif?: string | null;
  schoolAddress?: string | null;
  schoolContactLines?: string[];
  logoDataUrl?: string | null;

  // Client info (escola que está recebendo a proposta)
  clientName: string;
  clientLines: string[];
  clientNif?: string | null;
  clientEmail?: string | null;

  // Items
  lineItems: ProformaInvoiceLine[];
  subtotalFmt: string;
  ivaPercentage: number;
  ivaFmt: string;
  totalFmt: string;

  /** Quadro de Resumo de IVA (obrigatório AGT quando há taxas mistas) */
  taxSummary?: Array<{ label: string; base: string; iva: string }>;

  // Currency
  currencyLabel: string; // "AKZ" or "AOA"

  /** Moeda estrangeira: taxa de câmbio, data e totais em Kz */
  exchangeRate?: number;
  exchangeDate?: string;
  subtotalKzFmt?: string;
  ivaKzFmt?: string;
  totalKzFmt?: string;

  // AGT compliance fields
  /** 4-char hash extract, ex: "XyZ1" — shown as "XyZ1-" per AGT spec */
  hashExtract?: string | null;

  // Footer note (opcional)
  footerNote?: string | null;
};

type DocWithAutoTable = jsPDF & {
  lastAutoTable?: { finalY: number };
};

function fmtPtLongDateYYYYMMDD(yyyymmdd: string): string {
  const raw = yyyymmdd?.trim()?.slice(0, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "Data não definida";
  const [y, m, d] = raw.split("-");
  const dt = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return "Data inválida";
  const dayNum = dt.getUTCDate();
  const monthName = PT_MONTH_NAMES[dt.getUTCMonth()];
  const yearNum = dt.getUTCFullYear();
  return `${dayNum} de ${monthName} de ${yearNum}`;
}

function addLogoIfPossible(
  doc: jsPDF,
  logoDataUrl: string | undefined,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  if (!logoDataUrl?.trim() || logoDataUrl === "undefined") return;
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const scaled = canvas.toDataURL("image/png");
        const ratio = img.naturalWidth / img.naturalHeight;
        const w = Math.min(maxW, maxH * ratio);
        const h = w / ratio;
        doc.addImage(scaled, "PNG", x, y, w, h);
      } catch {
        /* ignore rendering error */
      }
    };
    img.onerror = () => {
      /* ignore load error */
    };
    img.src = logoDataUrl;
  } catch {
    /* ignore any error */
  }
}

interface DrawOptions {
  leading?: number;
  size?: number;
  style?: "normal" | "bold";
  color?: [number, number, number];
}

function drawWrappedTexts(
  doc: jsPDF,
  lines: string[],
  x: number,
  y: number,
  maxW: number,
  opts: DrawOptions = {},
): number {
  let currentY = y;
  const leading = opts.leading ?? pxMm(14);
  const size = opts.size ?? pxToPt(12);
  const style = opts.style ?? "normal";
  const color = opts.color ?? BODY_TEXT;

  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);

  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, maxW);
    for (const txt of wrapped) {
      doc.text(txt, x, currentY);
      currentY += leading;
    }
  }

  return currentY;
}

function measureDetailPanelInnerHeightMm(
  doc: jsPDF,
  title: string,
  lines: string[],
  innerW: number,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  const titleLines = doc.splitTextToSize(title, innerW);
  let h = titleLines.length * pxMm(13) + pxMm(8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, innerW);
    h += wrapped.length * pxMm(12);
  }

  return h;
}

function drawDetailPanelInner(
  doc: jsPDF,
  panelX: number,
  panelY: number,
  padding: number,
  title: string,
  lines: string[],
  innerW: number,
): void {
  let y = panelY + padding;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  for (const ln of doc.splitTextToSize(title, innerW)) {
    doc.text(ln, panelX + padding, y);
    y += pxMm(13);
  }

  y += pxMm(6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  for (const line of lines) {
    for (const ln of doc.splitTextToSize(line, innerW)) {
      doc.text(ln, panelX + padding, y);
      y += pxMm(12);
    }
  }
}

function chunkTextForPdf(text: string, chunkSize: number): string[] {
  if (!text.trim()) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}

/** Período contabilístico = mês da data de emissão (1–12). */
function accountingPeriod(yyyymmdd: string): number {
  const raw = yyyymmdd?.trim()?.slice(0, 10);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date().getMonth() + 1;
  return parseInt(raw.split("-")[1], 10);
}

/** Formata preço unitário com 4 casas decimais (requisito AGT). */
function fmtUnitPrice4Dec(raw: string): string {
  // tenta interpretar o valor pt-AO (ex: "3.000.000,00") e reformatar com 4 dec
  const normalized = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return raw; // devolve original se não parseable
  return new Intl.NumberFormat("pt-AO", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n);
}

export function buildProformaInvoicePdf(opts: ProformaInvoicePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 15;
  const usableW = pageW - margin * 2;
  const rhs = pageW - margin;

  // ── Layout: esquerda ocupa ~55% da largura, direita os restantes ~45%
  const leftColW = usableW * 0.52;
  const rightColX = margin + leftColW + pxMm(8);
  const rightColW = rhs - rightColX;
  const hdrTop = margin;

  // Logo (opcional) — acima do nome, alinhado à esquerda
  const logoW = pxMm(48);
  const logoH = pxMm(48);
  addLogoIfPossible(doc, opts.logoDataUrl ?? undefined, margin, hdrTop, logoW, logoH);
  const textStartX = margin; // texto começa sempre na margem esquerda

  // Nome da empresa (bold, navy)
  const schoolNameSize = pxToPt(18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(schoolNameSize);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  // Se tiver logo, começa abaixo dele; senão começa no topo
  const hasLogo = !!opts.logoDataUrl?.trim();
  let yLeft = hasLogo ? hdrTop + logoH + pxMm(4) : hdrTop;
  yLeft = drawWrappedTexts(doc, [opts.schoolName.trim() || "Edukamba"], textStartX, yLeft, leftColW, {
    leading: pxMm(22),
    size: schoolNameSize,
    style: "bold",
    color: NAVY,
  });

  // Subtítulo muted
  yLeft += pxMm(3);
  yLeft = drawWrappedTexts(doc, ["Fatura Pró-Forma / Orçamento (não-fiscal)"], textStartX, yLeft, leftColW, {
    leading: pxMm(12),
    size: pxToPt(9),
    color: FOOTER_MUTED,
  });

  // Detalhes: NIF, Morada, contactos — todos alinhados à esquerda
  yLeft += pxMm(5);
  const detailLines: string[] = [];
  if (opts.schoolNif?.trim()) detailLines.push(`NIF: ${opts.schoolNif.trim()}`);
  if (opts.schoolAddress?.trim()) detailLines.push(opts.schoolAddress.trim());
  if (opts.schoolContactLines?.length)
    opts.schoolContactLines.forEach((l) => l?.trim() && detailLines.push(l.trim()));

  if (detailLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(pxToPt(10));
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    yLeft = drawWrappedTexts(doc, detailLines, textStartX, yLeft, leftColW, {
      leading: pxMm(13),
      size: pxToPt(10),
    });
  }

  // ── Lado direito: tipo de documento + número + datas
  let yRight = hdrTop;

  // "FATURA PRÓ-FORMA" — título grande alinhado à direita
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(20));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("FATURA PRÓ-FORMA", rhs, yRight, { align: "right", baseline: "top" });
  yRight += pxMm(28);

  // Número do documento
  doc.setFontSize(pxToPt(13));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text(opts.documentNumber.trim(), rhs, yRight, { align: "right", baseline: "top" });
  yRight += pxMm(18);

  // Datas e período — fonte menor, alinhados à direita
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const issueLabel = fmtPtLongDateYYYYMMDD(opts.issueDateYYYYMMDD);
  const period = accountingPeriod(opts.issueDateYYYYMMDD);
  const nowTime = new Date();
  const timeStr = `${String(nowTime.getHours()).padStart(2, "0")}:${String(nowTime.getMinutes()).padStart(2, "0")}:${String(nowTime.getSeconds()).padStart(2, "0")}`;
  doc.text(`Emissão: ${issueLabel} ${timeStr}`, rhs, yRight, { align: "right", baseline: "top" });
  yRight += pxMm(12);
  doc.text(`Validade: ${opts.validityDays} dias`, rhs, yRight, { align: "right", baseline: "top" });
  yRight += pxMm(12);
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  doc.setFontSize(pxToPt(10));
  doc.text(`Período Contabilístico: ${period}`, rhs, yRight, { align: "right", baseline: "top" });
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  yRight += pxMm(10);

  // Linha divisória abaixo do header
  const dividerY = Math.max(yLeft, yRight) + pxMm(10);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(Math.max(pxMm(1.75), 0.45));
  doc.line(margin, dividerY, rhs, dividerY);

  let y = dividerY + pxMm(26);

  // Client and Issuer details boxes
  const boxGap = usableW * 0.038;
  const panelW = (usableW - boxGap) / 2;
  const bx1 = margin;
  const bx2 = margin + panelW + boxGap;
  const padInner = pxMm(15);
  const rBox = pxMm(4);

  const clientBody = [
    opts.clientName.trim(),
    ...opts.clientLines.filter((l) => l?.trim()),
  ];
  if (opts.clientNif?.trim()) clientBody.push(`NIF: ${opts.clientNif.trim()}`);
  else clientBody.push("NIF: 999999999");
  if (opts.clientEmail?.trim()) clientBody.push(`Email: ${opts.clientEmail.trim()}`);

  const issuerBody: string[] = [];
  if (opts.schoolAddress?.trim()) issuerBody.push(opts.schoolAddress.trim());
  if (opts.schoolNif?.trim()) issuerBody.push(`NIF: ${opts.schoolNif.trim()}`);
  if (opts.schoolContactLines?.length) {
    opts.schoolContactLines.forEach((l) => l?.trim() && issuerBody.push(l.trim()));
  } else {
    issuerBody.push("Email: geral@edukamba.com");
    issuerBody.push("Website: www.edukamba.com");
  }

  const innerW = panelW - padInner * 2;
  const hClientInner = measureDetailPanelInnerHeightMm(doc, "Dados do Cliente", clientBody, innerW);
  const hIssuerInner = measureDetailPanelInnerHeightMm(doc, "Dados do Emitente", [opts.schoolName.trim(), ...issuerBody], innerW);
  const boxH = Math.max(hClientInner, hIssuerInner) + padInner * 2;

  const boxTop = y;

  doc.setDrawColor(BORDER_EEE[0], BORDER_EEE[1], BORDER_EEE[2]);
  doc.setFillColor(PANEL_FCFCFC[0], PANEL_FCFCFC[1], PANEL_FCFCFC[2]);
  doc.setLineWidth(pxMm(1));
  doc.roundedRect(bx1, boxTop, panelW, boxH, rBox, rBox, "FD");
  doc.roundedRect(bx2, boxTop, panelW, boxH, rBox, rBox, "FD");

  drawDetailPanelInner(doc, bx1, boxTop, padInner, "Dados do Cliente", clientBody, innerW);
  drawDetailPanelInner(doc, bx2, boxTop, padInner, "Dados do Emitente", [opts.schoolName.trim(), ...issuerBody], innerW);

  y = boxTop + boxH + pxMm(18);

  // Items table — include DESC. column if any item has discount
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
    row.push(it.taxLabel || "Isento");
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

  // Tax Summary Table (Quadro de Resumo de IVA — obrigatório AGT para taxas mistas)
  let blockY = tableFinalY + pxMm(14);
  
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

  // Exchange rate info (moeda estrangeira)
  if (opts.exchangeRate && opts.exchangeRate > 0 && opts.currencyLabel !== "AKZ") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(pxToPt(10));
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    const exDateFmt = opts.exchangeDate || "—";
    doc.text(`Moeda: ${opts.currencyLabel} | Taxa de Câmbio: ${new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2 }).format(opts.exchangeRate)} Kz | Data: ${exDateFmt} (BNA)`, margin, blockY);
    blockY += pxMm(16);
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  }

  // Totals section
  const totalsW = usableW * 0.55;
  const totalsX = rhs - totalsW;
  const isForeign = opts.exchangeRate && opts.exchangeRate > 0 && opts.currencyLabel !== "AKZ";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(12));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text("Subtotal", totalsX, blockY + pxMm(4));
  const subtotalDisplay = isForeign ? `${opts.subtotalFmt} ${opts.currencyLabel} | ${opts.subtotalKzFmt}` : opts.subtotalFmt;
  doc.text(subtotalDisplay, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(10) + pxMm(10);

  doc.text("IVA", totalsX, blockY + pxMm(4));
  const ivaDisplay = isForeign ? `${opts.ivaFmt} ${opts.currencyLabel} | ${opts.ivaKzFmt}` : opts.ivaFmt;
  doc.text(ivaDisplay, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(10) + pxMm(10);

  const grandH = pxMm(42);
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(totalsX, blockY, totalsW, grandH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL", totalsX + pxMm(10), blockY + grandH * 0.35, { baseline: "middle" });
  doc.setFontSize(pxToPt(14));
  const totalDisplay = isForeign ? `${opts.totalFmt} ${opts.currencyLabel} | ${opts.totalKzFmt}` : opts.totalFmt;
  doc.text(totalDisplay, totalsX + pxMm(10), blockY + grandH * 0.7, { baseline: "middle" });

  // Hash extract box removida — hash aparece no rodapé junto à linha AGT
  const hashExtract = opts.hashExtract?.trim() ? opts.hashExtract.trim().slice(0, 4) : null;
  const footY = blockY + grandH + pxMm(32);
  let currentFootY = footY;

  // Disclaimer paragraph
  const footerParagraph =
    "Esta fatura pró-forma é um documento de referência para fins de adjudicação e planeamento. " +
    "Não possui valor fiscal e não substitui a Fatura-Recibo definitiva que será emitida após o pagamento validado. " +
    "O documento tem validade de " + opts.validityDays + " dias a partir da data de emissão.";

  doc.setFont("helvetica", "italic");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  for (const ln of doc.splitTextToSize(footerParagraph, usableW)) {
    doc.text(ln, margin, currentFootY);
    currentFootY += pxMm(16);
  }

  currentFootY += pxMm(8);

  // Additional footer note if provided
  if (opts.footerNote?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(pxToPt(10));
    doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
    for (const ln of doc.splitTextToSize(opts.footerNote.trim(), usableW)) {
      doc.text(ln, margin, currentFootY);
      currentFootY += pxMm(14);
    }
    currentFootY += pxMm(6);
  }

  // AGT mandatory certification line + hash extract
  // Hash: usa o fornecido ou gera stub determinístico a partir do número do documento
  const hashForFooter = hashExtract
    ?? (opts.documentNumber.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase() || "0000");
  const hashDisplay = `${hashForFooter}-`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  // Linha única: "Hash: Tz7C- | Processado por programa válido nº31.1/AGT20"
  doc.text(
    `Hash: ${hashDisplay} | Processado por programa válido nº31.1/AGT20`,
    margin,
    pageH - margin,
  );
  doc.text("edukamba.com", rhs, pageH - margin, { align: "right" });

  doc.setTextColor(0);
  doc.setDrawColor(0);

  return doc;
}
