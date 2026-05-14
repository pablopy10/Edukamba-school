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
/** Altura entre linhas no corpo — compacto para juntar perguntas. */
const BODY_LINE_MM = 4;
/** Folga após blocos `drawParagraph`. */
const PAR_TAIL_MM = 0.5;
const TITLE_LINE_MM = 5.2;
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
  lineMm: number = BODY_LINE_MM,
): number {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(text || "—", maxWmm) as string[];
  let y = yStartMm;
  for (const ln of lines) {
    if (y + lineMm > PAGE_BOTTOM - 4) {
      doc.addPage();
      y = MARGIN_MM;
    }
    doc.text(ln, xMm, y);
    y += lineMm;
  }
  return y + PAR_TAIL_MM;
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
    y = advanceY(doc, y, TITLE_LINE_MM + 2);
    doc.text(titles[ti], MARGIN_MM, y);
    y += TITLE_LINE_MM + 1;
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
  y = drawParagraph(doc, meta, MARGIN_MM, y + 2, maxW, BODY_SIZE, BODY_LINE_MM);

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
    y = drawParagraph(doc, bits.join(" · "), MARGIN_MM, y + 2, maxW, BODY_SIZE - 0.5, BODY_LINE_MM);
  }

  if (input.templateDescription?.trim()) {
    y = drawParagraph(doc, input.templateDescription!.trim(), MARGIN_MM, y + 2, maxW, 9, BODY_LINE_MM);
  }

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(H2_SIZE);
  doc.setTextColor(...NAVY);
  doc.text("Campos do formulário", MARGIN_MM, y + 5);
  y += BODY_LINE_MM * 2;

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
    y += 1.5;
    y = advanceY(doc, y, BODY_LINE_MM);
    y = drawParagraph(doc, `${prefix}${f.label}`, MARGIN_MM, y + 4.2, maxW, BODY_SIZE + 0.2, BODY_LINE_MM);

    if (f.helper?.trim()) {
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...MUTED);
      y = drawParagraph(doc, f.helper!.trim(), MARGIN_MM, y + 1, maxW, BODY_SIZE - 1, BODY_LINE_MM - 0.5);
      doc.setFont("helvetica", "normal");
    }

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(BODY_SIZE);

    if (input.mode === "response") {
      if (f.type === "signature") {
        const imgSrc = resolveSignatureDataUrl(f, responses, legacySig);
        y = drawParagraph(
          doc,
          imgSrc ? "Assinatura (imagem digital):" : "Assinatura: (não presente nos dados)",
          MARGIN_MM,
          y + 2,
          maxW,
          BODY_SIZE,
          BODY_LINE_MM,
        );
        if (imgSrc) {
          try {
            const fmt = imgSrc.includes("image/png") ? "PNG" : "JPEG";
            const boxW = Math.min(maxW - 2, 100);
            const boxH = 26;
            y += 2;
            const top = y + 4;
            doc.setDrawColor(210, 210, 210);
            doc.rect(MARGIN_MM, top, boxW + 8, boxH);
            doc.addImage(imgSrc, fmt, MARGIN_MM + 1, top + 1, boxW, boxH - 2);
            y = top + boxH + 5;
          } catch {
            doc.setFontSize(BODY_SIZE - 1);
            doc.setTextColor(170, 0, 0);
            y = drawParagraph(
              doc,
              "Não foi possível incluir a imagem da assinatura no PDF.",
              MARGIN_MM,
              y + 2,
              maxW,
              9,
              BODY_LINE_MM,
            );
          }
          doc.setTextColor(30, 30, 30);
          doc.setFont("helvetica", "normal");
        }
      } else {
        const out = formatResponseValue(f, responses) || "—";
        y = drawParagraph(doc, out, MARGIN_MM, y + 3, maxW, BODY_SIZE, BODY_LINE_MM);
      }
    } else {
      switch (f.type) {
        case "textarea": {
          const hTa = 16;
          y = advanceY(doc, y, hTa + 6);
          const top = y + 4;
          doc.setDrawColor(220, 220, 220);
          doc.rect(MARGIN_MM, top, maxW, hTa);
          y = top + hTa + 5;
          break;
        }
        case "text": {
          y += 6;
          const ly = y + 6;
          doc.setDrawColor(200, 200, 200);
          doc.line(MARGIN_MM, ly, pageW - MARGIN_MM, ly);
          y = ly + 4;
          break;
        }
        case "select":
        case "radio": {
          y += 4;
          let optY = y + 8;
          for (const opt of opts.length ? opts : ["…"]) {
            doc.setTextColor(...MUTED);
            doc.circle(MARGIN_MM + 2, optY + 2, 1.8);
            doc.setTextColor(30, 30, 30);
            doc.text(opt, MARGIN_MM + 7, optY + 3);
            optY += BODY_LINE_MM + 1;
          }
          y = optY + 2;
          break;
        }
        case "checkbox": {
          y += 4;
          const ly = y + 8;
          doc.rect(MARGIN_MM, ly, 4, 4);
          doc.setTextColor(50, 50, 50);
          doc.text("Sim / não", MARGIN_MM + 9, ly + 3.5);
          y = ly + BODY_LINE_MM + 4;
          break;
        }
        case "checkbox_group":
          for (const opt of opts.length ? opts : ["—"]) {
            y += 3;
            const ly = y + 6;
            doc.rect(MARGIN_MM, ly, 3.8, 3.8);
            doc.text(opt, MARGIN_MM + 8.5, ly + 3.2);
            y = ly + BODY_LINE_MM + 1;
          }
          y += 2;
          break;
        case "signature": {
          const hS = 22;
          y = advanceY(doc, y, hS + 8);
          const top = y + 4;
          doc.setDrawColor(210, 210, 210);
          doc.rect(MARGIN_MM, top, maxW, hS);
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
          doc.text("Assinatura (portal ou manuscrita)", MARGIN_MM + 2, top + hS + 3);
          y = top + hS + 6;
          doc.setFontSize(BODY_SIZE);
          doc.setTextColor(30, 30, 30);
          break;
        }
        case "file":
          y += BODY_LINE_MM;
          doc.setTextColor(...MUTED);
          doc.text("(Anexo no portal Edukamba)", MARGIN_MM, y + 8);
          y += BODY_LINE_MM + 10;
          doc.setTextColor(30, 30, 30);
          break;
        default:
          y += BODY_LINE_MM + 8;
      }
    }

    doc.setDrawColor(...MUTED);
    y += 1;
    y = advanceY(doc, y, 2);
    doc.line(MARGIN_MM, y, pageW - MARGIN_MM, y);
    y += BODY_LINE_MM + 0.8;
    doc.setFont("helvetica", "normal");
  }

  if (input.mode === "response" && Array.isArray(input.attachments) && input.attachments.some((a) => a?.url ?? a?.name)) {
    y += 6;
    y = advanceY(doc, y, BODY_LINE_MM * 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(H2_SIZE);
    doc.setTextColor(...NAVY);
    doc.text("Anexos submetidos", MARGIN_MM, y + 6);
    y += BODY_LINE_MM + 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    for (const att of input.attachments) {
      if (!att?.url && !att?.name) continue;
      const line = `${att.name ?? "Anexo"}${att.url?.trim() ? ` — ${att.url.trim()}` : ""}`;
      y = drawParagraph(doc, line, MARGIN_MM, y + 3, maxW, BODY_SIZE - 0.5, BODY_LINE_MM - 0.3);
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
