import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buildInvoicePdf, resolveFiscalInvoicePdfInput } from "./invoicePdf";

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

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
