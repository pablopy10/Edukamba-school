import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * PDF NOTA DE CRÉDITO (NC) — Layout alinhado com FT mas com especificidades AGT:
 * - Tipo de documento: NOTA DE CRÉDITO (bem visível)
 * - Numeração separada: NC EDK/1, NC EDK/2...
 * - Campo de vinculação: "Documento Retificado: FT EDK/22"
 * - Valores: quantidade e preço unitário positivos, mas motor sabe que subtrai
 * - Hash e certificação AGT: mesma estrutura que FT
 */

const NAVY: [number, number, number] = [26, 58, 90];
const BODY_TEXT: [number, number, number] = [51, 51, 51];
const FOOTER_MUTED: [number, number, number] = [102, 102, 102];
const BORDER_EEE: [number, number, number] = [238, 238, 238];
const BORDER_DDD: [number, number, number] = [221, 221, 221];
const PANEL_FCFCFC: [number, number, number] = [252, 252, 252];

const pxToPt = (px: number) => Math.round(((px * 72) / 96) * 10) / 10;
const pxMm = (px: number) => (px / 96) * 25.4;

const PT_MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

export type CreditNoteLine = {
  description: string;
  quantity: number;
  unitAmountFmt: string;
  totalAmountFmt: string;
};

export type CreditNotePdfInput = {
  schoolName: string;
  schoolNif?: string | null;
  schoolAddress?: string | null;
  schoolContactLines?: string[];
  logoDataUrl?: string | null;
  
  /** Número da NC: "NC EDK/1" */
  documentNumber: string;
  invoiceDateYYYYMMDD: string;
  
  /** Referência obrigatória: qual FT está sendo retificada */
  sourceInvoiceNumber: string;
  
  /** Motivo da retificação (obrigatório AGT, 6-60 caracteres) */
  reason: string;
  
  clienteNome: string;
  clienteNif: string;
  encarregadoNome?: string | null;
  studentName: string;
  studentClassroom?: string | null;
  academicYearLabel?: string | null;
  
  lineItems: CreditNoteLine[];
  grossTotalFmt: string;
  
  exemptionCode?: string | null;
  exemptionReason?: string | null;
  documentHashFootnote?: string | null;
  digitalSignatureSha1?: string | null;
};

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

export function buildCreditNotePdf(opts: CreditNotePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const margin = 15;
  const usableW = pageW - margin * 2;
  const rhs = pageW - margin;

  const hdrTop = margin;
  const leftColW = usableW * 0.52;

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
  yLeft = drawWrappedTexts(doc, ["Nota de Crédito (documento fiscal)"], textStartX, yLeft, leftColW, {
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

  // Lado direito: NOTA DE CRÉDITO
  let yDoc = hdrTop;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(20));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("NOTA DE CRÉDITO", rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(28);

  doc.setFontSize(pxToPt(13));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text(opts.documentNumber.trim(), rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const issueLabel = fmtPtLongDateYYYYMMDD(opts.invoiceDateYYYYMMDD);
  doc.text(`Emissão: ${issueLabel}`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(16);

  // Documento Retificado (obrigatório AGT)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(`Documento Retificado:`, rhs, yDoc, { align: "right", baseline: "top" });
  yDoc += pxMm(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  doc.text(opts.sourceInvoiceNumber.trim(), rhs, yDoc, { align: "right", baseline: "top" });
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

  const headerBottomInner = Math.max(yLeft + pxMm(4), yDoc);
  const dividerY = headerBottomInner + pxMm(18);
  doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setLineWidth(Math.max(pxMm(1.75), 0.45));
  doc.line(margin, dividerY, rhs, dividerY);

  let y = dividerY + pxMm(26);

  // Painéis de dados
  const boxGap = usableW * 0.038;
  const panelW = (usableW - boxGap) / 2;
  const bx1 = margin;
  const bx2 = margin + panelW + boxGap;
  const padInner = pxMm(15);
  const rBox = pxMm(4);

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

  // Motivo da retificação (obrigatório AGT)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text("Motivo da Retificação:", margin, y);
  y += pxMm(12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const reasonLines = doc.splitTextToSize(opts.reason, usableW);
  for (const line of reasonLines) {
    doc.text(line, margin, y);
    y += pxMm(12);
  }
  y += pxMm(8);

  // Tabela de itens
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

  // Totais — usar largura generosa para caber "TOTAL A CREDITAR" + valor
  const totalsW = usableW * 0.55;
  const totalsX = rhs - totalsW;
  let blockY = tableFinalY + pxMm(14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(12));
  doc.setTextColor(BODY_TEXT[0], BODY_TEXT[1], BODY_TEXT[2]);
  const subLabel = "Subtotal";
  doc.text(subLabel, totalsX, blockY + pxMm(4));
  doc.text(opts.grossTotalFmt, totalsX + totalsW, blockY + pxMm(4), { align: "right" });

  blockY += pxMm(10) + pxMm(10);

  const grandH = pxMm(42);
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(totalsX, blockY, totalsW, grandH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL A CREDITAR", totalsX + pxMm(10), blockY + grandH * 0.35, {
    baseline: "middle",
  });
  doc.setFontSize(pxToPt(16));
  doc.text(opts.grossTotalFmt, totalsX + pxMm(10), blockY + grandH * 0.7, {
    baseline: "middle",
  });

  // Rodapé
  let footY = blockY + grandH + pxMm(48);
  const code = (opts.exemptionCode ?? "M11").trim();
  const reason =
    opts.exemptionReason?.trim() ||
    "nos termos do Artigo 12.º do CIVA - Isenção no domínio da educação.";
  const exemptText = `Isenção de IVA (${code}), ${reason}`;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(pxToPt(11));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  for (const ln of doc.splitTextToSize(exemptText, usableW)) {
    doc.text(ln, margin, footY);
    footY += pxMm(16);
  }

  footY += pxMm(12);

  // Hash control
  const fullHash = opts.documentHashFootnote?.trim() || "";
  const hashChar1 = fullHash.charAt(0) || "0";
  const hashChar2 = fullHash.charAt(10) || "0";
  const hashChar3 = fullHash.charAt(20) || "0";
  const hashChar4 = fullHash.charAt(30) || "0";
  const hashControl4 = `${hashChar1}${hashChar2}${hashChar3}${hashChar4}-`;

  const wmY = Math.min(pageH - pxMm(16), footY + pxMm(20));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(pxToPt(10));
  doc.setTextColor(FOOTER_MUTED[0], FOOTER_MUTED[1], FOOTER_MUTED[2]);
  doc.text(`Hash: ${hashControl4} | Processado por programa válido nº31.1/AGT20`, margin, wmY);
  doc.text("edukamba.com", rhs, wmY, { align: "right" });

  doc.setTextColor(0);
  doc.setDrawColor(0);

  return doc;
}
