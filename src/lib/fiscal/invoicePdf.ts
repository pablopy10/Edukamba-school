import { jsPDF } from "jspdf";

export type GuardianInvoicePdfInput = {
  schoolName: string;
  logoDataUrl?: string | null;
  documentNumber: string;
  invoiceDateYYYYMMDD: string;
  studentDisplayName: string;
  clienteNome: string;
  clienteNif: string;
  grossTotalFmt: string;
  documentHashFootnote?: string | null;
  digitalSignatureSha1?: string | null;
};

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

export function buildInvoicePdf(opts: GuardianInvoicePdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  let y = 18;

  addLogoIfPossible(doc, opts.logoDataUrl ?? undefined, 16, y, 32, 14);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(opts.schoolName, pageW / 2, y + 6, { align: "center" });

  y += 22;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("FACTURA RECIBO (FT)", pageW / 2, y, { align: "center" });
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text(opts.documentNumber, pageW / 2, y, { align: "center" });

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Data: ${opts.invoiceDateYYYYMMDD}`, 16, y);
  y += 6;
  doc.text(`Educando: ${opts.studentDisplayName}`, 16, y);
  y += 6;
  doc.text(`Cliente / Encarregado: ${opts.clienteNome}`, 16, y);
  y += 6;
  doc.text(`NIF (efeitos fiscais): ${opts.clienteNif}`, 16, y);
  y += 10;

  doc.setDrawColor(200);
  doc.line(16, y, pageW - 16, y);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Total", 16, y);
  doc.text(opts.grossTotalFmt, pageW - 16, y, { align: "right" });
  y += 14;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(80);
  const hash =
    opts.documentHashFootnote?.trim() ||
    opts.digitalSignatureSha1?.trim() ||
    "—";
  doc.text(`Hash / assinatura (referência AGT): ${hash}`, 16, y, { maxWidth: pageW - 32 });
  y += 10;
  doc.text("Processado por computador", pageW / 2, y, { align: "center" });

  return doc;
}
