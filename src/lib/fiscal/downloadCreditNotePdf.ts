import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buildCreditNotePdf, type CreditNotePdfInput } from "./creditNotePdf";

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

/**
 * Gera e descarrega o PDF da Nota de Crédito a partir do ID na tabela invoices.
 * Carrega os dados da NC e da FT original para preencher:
 * - "Documento Retificado" (referência obrigatória AGT)
 * - Descrição do item (deve ser idêntica ao serviço da FT, não o motivo)
 */
export async function downloadCreditNotePdfById(creditNoteId: string): Promise<void> {
  const id = creditNoteId?.trim();
  if (!id) throw new Error("Identificador de NC inválido.");

  const { data: nc, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!nc) throw new Error("Nota de crédito não encontrada.");

  // Extrair referência à FT original do line_description (formato: "NC ref. FT EDK/X — motivo")
  const lineDesc = (nc as Record<string, unknown>).line_description as string | null;
  let sourceInvoiceNumber = "—";
  let reason = (nc as Record<string, unknown>).cancellation_reason as string || "Retificação";
  let originalServiceDescription = "Serviços educativos";
  
  if (lineDesc) {
    const refMatch = /NC ref\.\s*(FT\s+\S+\/\d+)\s*—\s*(.+)/.exec(lineDesc);
    if (refMatch) {
      sourceInvoiceNumber = refMatch[1];
      reason = refMatch[2];
    }
  }

  // Carregar FT original para obter a descrição do serviço (regra AGT: item da NC = item da FT)
  if (sourceInvoiceNumber !== "—") {
    const { data: originalFT } = await supabase
      .from("invoices")
      .select("line_description")
      .eq("document_number", sourceInvoiceNumber)
      .maybeSingle();
    
    if (originalFT?.line_description?.trim()) {
      originalServiceDescription = originalFT.line_description.trim();
    }
  }

  // Dados do aluno
  let studentName = "—";
  let studentClassroom: string | null = null;
  let encarregadoNome: string | null = null;

  if ((nc as Record<string, unknown>).student_id) {
    const { data: stud } = await supabase
      .from("students")
      .select("full_name, parent_id, classroom:classrooms(name)")
      .eq("id", (nc as Record<string, unknown>).student_id as string)
      .maybeSingle();
    
    if (stud) {
      studentName = stud.full_name?.trim() || "—";
      studentClassroom = (stud.classroom as { name?: string } | null)?.name?.trim() || null;
      if (stud.parent_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", stud.parent_id)
          .maybeSingle();
        encarregadoNome = prof?.full_name?.trim() || null;
      }
    }
  }

  const gross = Number((nc as Record<string, unknown>).gross_total);
  const totalFmt = fmtAOA(Number.isFinite(gross) ? gross : 0);

  // Determinar a taxa de IVA do item creditado a partir da FT original
  let itemTaxLabel = "Isento (M11)";
  let itemTaxPct = 0;
  
  if (sourceInvoiceNumber !== "—") {
    const { data: originalFT } = await supabase
      .from("invoices")
      .select("line_description, gross_total")
      .eq("document_number", sourceInvoiceNumber)
      .maybeSingle();
    
    if (originalFT?.line_description) {
      // Parsear itens da FT para encontrar o que corresponde ao valor da NC
      const parts = originalFT.line_description.split(";").map((s: string) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const match3 = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
        if (match3) {
          const val = parseFloat(match3[2].replace(/\s/g, "").replace(",", ".")) || 0;
          const ivaPctStr = match3[3].trim();
          // Se o valor do item corresponde ao valor da NC, usar a sua taxa
          if (Math.abs(val - gross) < 1) {
            itemTaxPct = ivaPctStr === "0_M04" ? 0 : (parseFloat(ivaPctStr) || 0);
            itemTaxLabel = ivaPctStr === "0" ? "Isento (M11)" : ivaPctStr === "0_M04" ? "Não sujeito (M04)" : `${ivaPctStr}%`;
            originalServiceDescription = match3[1].trim();
            break;
          }
        }
      }
    }
  }

  // Calcular subtotal, IVA e total
  const ivaAmount = (gross * itemTaxPct) / 100;
  const totalWithIva = gross + ivaAmount;

  const pdfInput: CreditNotePdfInput = {
    schoolName: "Edukamba",
    schoolNif: "5480041924",
    schoolAddress: "Zona Verde, Rua 18, Casa 26, Belas, Luanda",
    schoolContactLines: ["Email: geral@edukamba.com", "Website: www.edukamba.com"],
    documentNumber: ((nc as Record<string, unknown>).document_number as string) || "NC",
    invoiceDateYYYYMMDD: ((nc as Record<string, unknown>).invoice_date as string)?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    sourceInvoiceNumber,
    reason,
    clienteNome: ((nc as Record<string, unknown>).cliente_nome as string) || "—",
    clienteNif: ((nc as Record<string, unknown>).cliente_nif as string) || "999999999",
    encarregadoNome,
    studentName,
    studentClassroom,
    lineItems: [{
      description: originalServiceDescription,
      quantity: 1,
      totalAmountFmt: totalFmt,
      taxLabel: itemTaxLabel,
    }],
    subtotalFmt: totalFmt,
    ivaFmt: fmtAOA(ivaAmount),
    grossTotalFmt: fmtAOA(totalWithIva),
    taxSummary: [{
      label: itemTaxLabel,
      base: totalFmt,
      iva: fmtAOA(ivaAmount),
    }],
    exemptionCode: (nc as Record<string, unknown>).exemption_code as string | null,
    exemptionReason: (nc as Record<string, unknown>).exemption_reason as string | null,
    documentHashFootnote: (nc as Record<string, unknown>).document_hash as string | null,
    digitalSignatureSha1: (nc as Record<string, unknown>).digital_signature_sha1_b64 as string | null,
  };

  const doc = buildCreditNotePdf(pdfInput);
  const base = pdfInput.documentNumber.replace(/\s+/g, "_");
  doc.save(`${base}.pdf`);
}
