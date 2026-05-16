import { jsPDF } from "jspdf";

export type EdukambaProposalPdfInput = {
  title: string;
  recipientEmail?: string;
  summary?: string;
  body: string;
  amount?: string;
  currency?: string;
};

function buildProposalPdfDoc(input: EdukambaProposalPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = 18;
  doc.setFontSize(16);
  doc.setTextColor(32, 64, 120);
  doc.text("Edukamba · Proposta comercial", 18, y);
  y += 10;
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text(input.title, 18, y);
  y += 8;
  if (input.recipientEmail) {
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`Para: ${input.recipientEmail}`, 18, y);
    y += 7;
  }
  if (input.summary) {
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    const summaryLines = doc.splitTextToSize(input.summary, 174);
    doc.text(summaryLines, 18, y);
    y += summaryLines.length * 5 + 4;
  }
  if (input.amount) {
    doc.setFontSize(11);
    doc.text(`Valor estimado: ${input.amount} ${input.currency ?? ""}`.trim(), 18, y);
    y += 8;
  }
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const bodyLines = doc.splitTextToSize(input.body.trim() || "—", 174);
  let lineY = y;
  for (const line of bodyLines) {
    if (lineY > 270) {
      doc.addPage();
      lineY = 18;
    }
    doc.text(line, 18, lineY);
    lineY += 5;
  }
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Documento gerado na aplicação Edukamba.", 18, 288);
  return doc;
}

export function downloadEdukambaProposalPdf(input: EdukambaProposalPdfInput, filename = "proposta-edukamba.pdf") {
  const doc = buildProposalPdfDoc(input);
  doc.save(filename);
}

/** Base64 (sem prefixo data:...) para anexos via Edge Function. */
export function proposalPdfBase64(input: EdukambaProposalPdfInput): string {
  const doc = buildProposalPdfDoc(input);
  const dataUri = doc.output("datauristring") as string;
  const i = dataUri.indexOf(",");
  return i >= 0 ? dataUri.slice(i + 1) : dataUri;
}
