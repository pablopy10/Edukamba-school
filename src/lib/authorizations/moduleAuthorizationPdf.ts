import { jsPDF } from "jspdf";

/** Shape mínimo alinhado a `AuthorizationFieldDef` em `ModuleAuthorizationsPanel`. */
export type ModuleAuthPdfField = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  helper?: string;
};

export type ModuleAuthorizationPdfMode = "blank" | "response";

export type ModuleAuthorizationPdfInput = {
  mode: ModuleAuthorizationPdfMode;
  moduleAreaLabel: string;
  schoolName?: string | null;
  templateTitle: string;
  templateDescription?: string | null;
  fields: ModuleAuthPdfField[];

  studentName?: string;
  submittedByLabel?: string;
  submittedAtIso?: string;
  responses?: Record<string, unknown>;
  legacySignatureDataUrl?: string | null;
  attachments?: Array<{ url?: string; name?: string } | null> | null;
};

const MARGIN_MM = 16;
const PAGE_BOTTOM = 287;
const LINE_H = 5.5;
const TITLE_SIZE = 15;
const H2_SIZE = 11;
const BODY_SIZE = 9.5;
const NAVY: [number, number, number] = [26, 58, 90];
const MUTED: [number, number, number] = [90, 90, 90];

function slugFilePart(text: string, maxLen: number): string {
  const s = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLen);
  return s || "formulario";
}

function nonEmptyOptions(f: ModuleAuthPdfField): string[] {
  return (f.options ?? []).map((o) => String(o).trim()).filter(Boolean);
}

function formatResponseValue(field: ModuleAuthPdfField, responses: Record<string, unknown>): string {
  const raw = responses[field.id];
  if (raw === undefined || raw === null) return "";
  switch (field.type) {
    case "checkbox":
      return raw === true ? "Sim" : raw === false ? "Não" : String(raw);
    case "checkbox_group":
      return Array.isArray(raw) ? (raw as string[]).join(", ") : String(raw);
    case "file":
      if (raw && typeof raw === "object" && "url" in raw)
        return (raw as { name?: string; url?: string }).name ?? (raw as { url: string }).url ?? "—";
      return String(raw);
    case "signature":
      return "";
    default:
      return String(raw).trim();
  }
}

function resolveSignatureDataUrl(
  field: ModuleAuthPdfField,
  responses: Record<string, unknown>,
  legacy: string | null,
): string | null {
  const r = responses[field.id];
  if (typeof r === "string" && r.startsWith("data:image")) return r;
  if (legacy?.startsWith("data:image")) return legacy;
  if (field.type === "signature") {
    for (const v of Object.values(responses)) {
      if (typeof v === "string" && v.startsWith("data:image")) return v;
    }
  }
  return null;
}

function advanceY(doc: jsPDF, y: number, h: number, minBottom = PAGE_BOTTOM): number {
  if (y + h > minBottom) {
    doc.addPage();
    return MARGIN_MM + h;
  }
  return y + h;
}

function drawParagraph(
  doc: jsPDF,
  text: string,
  xMm: number,
  yStartMm: number,
  maxWmm: number,
  fontSize: number,
): number {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text || "—", maxWmm) as string[];
  let y = yStartMm;
  for (const ln of lines) {
    if (y + LINE_H > PAGE_BOTTOM - 4) {
      doc.addPage();
      y = MARGIN_MM;
    }
    doc.text(ln, xMm, y);
    y += LINE_H;
  }
  return y + 2;
}

export function generateModuleAuthorizationPdf(input: ModuleAuthorizationPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - 2 * MARGIN_MM;
  const responses = input.responses ?? {};

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 11, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.text(`Edukamba · ${input.moduleAreaLabel}`, MARGIN_MM, 8);

  doc.setTextColor(...NAVY);
  let y = MARGIN_MM + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(TITLE_SIZE);
  const titles = doc.splitTextToSize(input.templateTitle.trim() || "Formulário", maxW) as string[];
  for (let ti = 0; ti < titles.length; ti++) {
    y = advanceY(doc, y, LINE_H * 2);
    doc.text(titles[ti], MARGIN_MM, y);
    y += LINE_H * 2;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_SIZE);
  doc.setTextColor(...MUTED);
  const modeLabel =
    input.mode === "blank" ? "Versão imprimível (em branco)" : "Submissão registada (com respostas)";
  let meta =
    `${modeLabel}` +
    (input.schoolName?.trim() ? ` · Escola: ${input.schoolName.trim()}` : "") +
    ` · Gerado: ${new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`;
  y = drawParagraph(doc, meta, MARGIN_MM, y, maxW, BODY_SIZE);

  if (
    input.mode === "response" &&
    (input.studentName?.trim() || input.submittedByLabel?.trim() || input.submittedAtIso)
  ) {
    doc.setFontSize(BODY_SIZE);
    const bits: string[] = [];
    const sn = input.studentName?.trim();
    if (sn) bits.push(`Aluno/a: ${sn}`);
    const sb = input.submittedByLabel?.trim();
    if (sb) bits.push(`Preenchido por (encarregado de educação): ${sb}`);
    if (input.submittedAtIso) {
      bits.push(
        `Data e hora: ${new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "short" }).format(new Date(input.submittedAtIso))}`,
      );
    }
    y = drawParagraph(doc, bits.join(" · "), MARGIN_MM, y, maxW, BODY_SIZE - 0.5);
  }

  if (input.templateDescription?.trim()) {
    y = advanceY(doc, y, LINE_H);
    y = drawParagraph(doc, input.templateDescription!.trim(), MARGIN_MM, y, maxW, 9);
  }

  y = advanceY(doc, y + 2, LINE_H);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(H2_SIZE);
  doc.setTextColor(...NAVY);
  doc.text("Campos do formulário", MARGIN_MM, y + 6);
  y += 12;

  const legacySig =
    typeof input.legacySignatureDataUrl === "string" && input.legacySignatureDataUrl.startsWith("data:image")
      ? input.legacySignatureDataUrl.trim()
      : null;

  for (const f of input.fields) {
    const opts = nonEmptyOptions(f);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(BODY_SIZE);
    doc.setTextColor(...NAVY);
    const prefix = f.required ? "* " : "";
    y = advanceY(doc, y, LINE_H * 3);
    y = drawParagraph(doc, `${prefix}${f.label}`, MARGIN_MM, y + 6, maxW, BODY_SIZE + 0.3);

    if (f.helper?.trim()) {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...MUTED);
      y = advanceY(doc, y, LINE_H);
      y = drawParagraph(doc, f.helper!.trim(), MARGIN_MM, y, maxW, BODY_SIZE - 1);
      doc.setFont("helvetica", "normal");
    }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(BODY_SIZE);

    if (input.mode === "response") {
      if (f.type === "signature") {
        const imgSrc = resolveSignatureDataUrl(f, responses, legacySig);
        y = advanceY(doc, y + 2, LINE_H);
        y = drawParagraph(
          doc,
          imgSrc ? "Assinatura (imagem digital):" : "Assinatura: (não presente nos dados)",
          MARGIN_MM,
          y,
          maxW,
          BODY_SIZE,
        );
        if (imgSrc) {
          try {
            const fmt = imgSrc.includes("image/png") ? "PNG" : "JPEG";
            const boxW = Math.min(maxW - 2, 100);
            const boxH = 32;
            y = advanceY(doc, y, boxH + 10);
            doc.setDrawColor(210, 210, 210);
            doc.rect(MARGIN_MM, y - 28, boxW + 8, boxH);
            doc.addImage(imgSrc, fmt, MARGIN_MM + 1, y - 26, boxW, boxH - 2);
            y += 8;
          } catch {
            doc.setFontSize(BODY_SIZE - 1);
            doc.setTextColor(170, 0, 0);
            y = drawParagraph(doc, "Não foi possível incluir a imagem da assinatura no PDF.", MARGIN_MM, y, maxW, 9);
          }
          doc.setTextColor(30, 30, 30);
          doc.setFont("helvetica", "normal");
        }
      } else {
        const out = formatResponseValue(f, responses) || "—";
        y = advanceY(doc, y, LINE_H);
        y = drawParagraph(doc, out, MARGIN_MM, y + 4, maxW, BODY_SIZE);
      }
    } else {
      switch (f.type) {
        case "textarea": {
          const hTa = 22;
          y = advanceY(doc, y, hTa + 8);
          doc.setDrawColor(220, 220, 220);
          doc.rect(MARGIN_MM, y + 6, maxW, hTa);
          y += hTa + 12;
          break;
        }
        case "text":
          y = advanceY(doc, y + 8);
          doc.setDrawColor(200, 200, 200);
          doc.line(MARGIN_MM, y + 8, pageW - MARGIN_MM, y + 8);
          y += 12;
          break;
        case "select":
        case "radio":
          y = advanceY(doc, y, (opts.length + 2) * LINE_H);
          for (const opt of opts.length ? opts : ["…"]) {
            doc.setTextColor(...MUTED);
            doc.circle(MARGIN_MM + 2, y + LINE_H * 2, 2);
            doc.setTextColor(30, 30, 30);
            doc.text(opt, MARGIN_MM + 8, y + LINE_H * 2 + 1);
            y += LINE_H + 2;
          }
          y += 4;
          break;
        case "checkbox":
          doc.rect(MARGIN_MM, y + LINE_H + 3, 4, 4);
          doc.setTextColor(50, 50, 50);
          doc.text("Sim / não", MARGIN_MM + 8, y + LINE_H + 6);
          y += LINE_H + 12;
          break;
        case "checkbox_group":
          for (const opt of opts.length ? opts : ["—"]) {
            y = advanceY(doc, y, LINE_H * 3);
            doc.rect(MARGIN_MM, y + 4, 4, 4);
            doc.text(opt, MARGIN_MM + 9, y + 7);
            y += LINE_H + 6;
          }
          break;
        case "signature": {
          const hS = 30;
          y = advanceY(doc, y, hS + 12);
          doc.setDrawColor(210, 210, 210);
          doc.rect(MARGIN_MM, y + 4, maxW, hS);
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
          doc.text("Assinatura digital (portal) ou manuscrita", MARGIN_MM + 2, y + hS + 2);
          y += hS + 14;
          doc.setFontSize(BODY_SIZE);
          doc.setTextColor(30, 30, 30);
          break;
        }
        case "file":
          y = advanceY(doc, y, LINE_H * 3);
          doc.setTextColor(...MUTED);
          doc.text("(Anexo no portal Edukamba)", MARGIN_MM, y + LINE_H + 8);
          y += LINE_H * 6;
          doc.setTextColor(30, 30, 30);
          break;
        default:
          y += LINE_H * 4;
      }
    }

    doc.setDrawColor(...MUTED);
    y = advanceY(doc, y + 2, LINE_H);
    doc.line(MARGIN_MM, y, pageW - MARGIN_MM, y);
    y += LINE_H + 2;
    doc.setFont("helvetica", "normal");
  }

  if (input.mode === "response" && Array.isArray(input.attachments) && input.attachments.some((a) => a?.url ?? a?.name)) {
    y = advanceY(doc, y + 8, LINE_H * 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(H2_SIZE);
    doc.setTextColor(...NAVY);
    doc.text("Anexos submetidos", MARGIN_MM, y + 6);
    y += LINE_H + 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    for (const att of input.attachments) {
      if (!att?.url && !att?.name) continue;
      const line = `${att.name ?? "Anexo"}${att.url?.trim() ? ` — ${att.url.trim()}` : ""}`;
      y = advanceY(doc, y, LINE_H * 4);
      y = drawParagraph(doc, line, MARGIN_MM, y + 4, maxW, BODY_SIZE - 0.5);
    }
  }

  const total = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.text(`Página ${i}/${total} · Edukamba`, pageW / 2, PAGE_BOTTOM + 5, { align: "center" });
  }

  return doc;
}

export function downloadModuleAuthorizationPdf(input: ModuleAuthorizationPdfInput, filePrefix?: string): void {
  const part = slugFilePart(input.templateTitle.trim() || "autorizacao", 42);
  const mode = input.mode === "blank" ? "modelo-em-branco" : "preenchido";
  const doc = generateModuleAuthorizationPdf(input);
  const pre = filePrefix ? `${slugFilePart(filePrefix, 20)}-` : "";
  doc.save(`${pre}${mode}-${part}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
