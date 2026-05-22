import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buildInvoicePdf, resolveFiscalInvoicePdfInput } from "./invoicePdf";
import { buildProformaInvoicePdf, type ProformaInvoicePdfInput } from "./proformaInvoicePdf";

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-AO", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

/** Gera o PDF FACTURA‑RECIBO a partir da linha `invoices` já carregada (RLS aplica‑se só na lectura inicial). */
export async function downloadFiscalInvoicePdfFromInvoice(invoice: Tables<"invoices">): Promise<void> {
  const payload = await resolveFiscalInvoicePdfInput(invoice, fmtAOA);
  const doc = buildInvoicePdf(payload);
  const base = invoice.document_number?.trim()?.replace(/\s+/g, "_") || invoice.id.slice(0, 8);
  doc.save(`${base}.pdf`);
}

/** Carrega `invoices` pelo id e transfere o PDF. */
export async function downloadFiscalInvoicePdfById(invoiceId: string): Promise<void> {
  const id = invoiceId?.trim();
  if (!id) throw new Error("Identificador de fatura inválido.");
  const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) throw new Error("Fatura não encontrada ou sem permissão.");
  await downloadFiscalInvoicePdfFromInvoice(inv as Tables<"invoices">);
}

/**
 * Gera PDF combinado: FT (página 1) + PP original (página 2).
 * Usado quando a FT foi convertida a partir de uma PP.
 */
export async function downloadConvertedInvoiceWithProforma(
  invoiceId: string,
  proformaInput: ProformaInvoicePdfInput,
): Promise<void> {
  const id = invoiceId?.trim();
  if (!id) throw new Error("Identificador de fatura inválido.");
  const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) throw new Error("Fatura não encontrada ou sem permissão.");

  // Gera FT — usa os itens da PP original para manter P. Unitário como foi escrito
  const payload = await resolveFiscalInvoicePdfInput(inv as Tables<"invoices">, fmtAOA);
  // Sobrescreve lineItems com os da PP (preserva o P. Unitário original)
  payload.lineItems = proformaInput.lineItems.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    totalAmountFmt: it.totalAmountFmt,
  }));
  const ftDoc = buildInvoicePdf(payload);

  // Gera PP
  const ppDoc = buildProformaInvoicePdf(proformaInput);

  // Merge com pdf-lib: FT (pág 1) + PP (pág 2)
  const { PDFDocument } = await import("pdf-lib");

  const ftBytes = ftDoc.output("arraybuffer");
  const ppBytes = ppDoc.output("arraybuffer");

  const mergedPdf = await PDFDocument.create();
  const ftPdfDoc = await PDFDocument.load(ftBytes);
  const ppPdfDoc = await PDFDocument.load(ppBytes);

  const ftPagesCopied = await mergedPdf.copyPages(ftPdfDoc, ftPdfDoc.getPageIndices());
  ftPagesCopied.forEach((page) => mergedPdf.addPage(page));

  const ppPagesCopied = await mergedPdf.copyPages(ppPdfDoc, ppPdfDoc.getPageIndices());
  ppPagesCopied.forEach((page) => mergedPdf.addPage(page));

  const mergedBytes = await mergedPdf.save();
  const blob = new Blob([mergedBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = inv.document_number?.trim()?.replace(/\s+/g, "_") || inv.id.slice(0, 8);
  a.download = `${base}_com_proforma.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
