import { supabase } from "@/integrations/supabase/client";
import { buildCreditNotePdf, type CreditNotePdfInput, type CreditNoteLine } from "./creditNotePdf";

/** Formata valor monetário com espaço como separador de milhares: "5 000,00 Kz" */
const fmtKz = (n: number): string => {
  const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  // fr-FR usa espaço fino (narrow no-break space) — normalizar para espaço normal
  return formatted.replace(/\u202F/g, " ").replace(/\u00A0/g, " ") + " Kz";
};

type ParsedItem = {
  description: string;
  amount: number;
  ivaPct: number;
  taxLabel: string;
};

/** Parseia o line_description da FT no formato "Desc:Valor:IvaPct; Desc2:Valor2:IvaPct2" */
function parseLineDescription(lineDesc: string): ParsedItem[] {
  const parts = lineDesc.split(";").map((s) => s.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  for (const part of parts) {
    const match = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
    if (match) {
      const desc = match[1].trim();
      const amount = parseFloat(match[2].replace(/\s/g, "").replace(",", ".")) || 0;
      const ivaPctStr = match[3].trim();
      const ivaPct = ivaPctStr === "0_M04" ? 0 : (parseFloat(ivaPctStr) || 0);
      const taxLabel = ivaPctStr === "0" ? "Isento (M11)" : ivaPctStr === "0_M04" ? "Não sujeito (M04)" : `${ivaPctStr}%`;
      items.push({ description: desc, amount, ivaPct, taxLabel });
    }
  }
  return items;
}

/**
 * Gera e descarrega o PDF da Nota de Crédito.
 * - Anulação total: herda TODOS os itens da FT original (linhas separadas)
 * - Anulação parcial: encontra o item específico pelo valor
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

  const lineDesc = (nc as Record<string, unknown>).line_description as string | null;
  let sourceInvoiceNumber = "—";
  let reason = (nc as Record<string, unknown>).cancellation_reason as string || "Retificação";
  let selectedItemRaw: string | null = null;

  if (lineDesc) {
    // Formato: "NC ref. FT EDK/X — motivo [Desc:Valor:IvaPct]" ou sem [...]
    const refMatch = /NC ref\.\s*(FT\s+\S+\/\d+)\s*—\s*(.+)/.exec(lineDesc);
    if (refMatch) {
      sourceInvoiceNumber = refMatch[1];
      let reasonPart = refMatch[2];
      // Extrair item seleccionado entre [...]
      const itemMatch = /^(.+?)\s*\[(.+)\]$/.exec(reasonPart);
      if (itemMatch) {
        reasonPart = itemMatch[1].trim();
        selectedItemRaw = itemMatch[2].trim();
      }
      reason = reasonPart;
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

  const ncGrossTotal = Number((nc as Record<string, unknown>).gross_total);

  // Carregar FT original para obter itens com taxas
  let creditItems: ParsedItem[] = [];

  // Se temos o item seleccionado explicitamente guardado na NC, usar directamente
  if (selectedItemRaw) {
    const parsed = parseLineDescription(selectedItemRaw);
    if (parsed.length > 0) {
      creditItems = parsed;
    }
  }

  // Senão, resolver a partir da FT original
  if (creditItems.length === 0 && sourceInvoiceNumber !== "—") {
    const { data: originalFT } = await supabase
      .from("invoices")
      .select("line_description, gross_total")
      .eq("document_number", sourceInvoiceNumber)
      .maybeSingle();

    if (originalFT?.line_description) {
      const allItems = parseLineDescription(originalFT.line_description);
      const ftGrossTotal = Number(originalFT.gross_total);

      if (allItems.length > 0) {
        // Verificar se é anulação total (valor NC = valor total da FT)
        if (Math.abs(ncGrossTotal - ftGrossTotal) < 1) {
          // Anulação total: herdar TODOS os itens
          creditItems = allItems;
        } else {
          // Anulação parcial: encontrar o item que corresponde ao valor da NC
          const matched = allItems.find((it) => Math.abs(it.amount - ncGrossTotal) < 1);
          if (matched) {
            creditItems = [matched];
          } else {
            // Fallback: usar descrição do primeiro item da FT com o valor parcial
            // A AGT exige referência ao serviço original, não texto genérico
            const refItem = allItems[0];
            creditItems = [{ description: refItem.description, amount: ncGrossTotal, ivaPct: refItem.ivaPct, taxLabel: refItem.taxLabel }];
          }
        }
      }
    }
  }

  // Fallback se não conseguiu parsear itens
  if (creditItems.length === 0) {
    creditItems = [{ description: "Serviços educativos", amount: ncGrossTotal, ivaPct: 0, taxLabel: "Isento (M11)" }];
  }

  // Calcular totais a partir dos itens
  let subtotal = 0;
  let totalIva = 0;
  const taxGroups: Record<string, { base: number; iva: number; label: string }> = {};

  for (const item of creditItems) {
    subtotal += item.amount;
    const iva = (item.amount * item.ivaPct) / 100;
    totalIva += iva;
    if (!taxGroups[item.taxLabel]) taxGroups[item.taxLabel] = { base: 0, iva: 0, label: item.taxLabel };
    taxGroups[item.taxLabel].base += item.amount;
    taxGroups[item.taxLabel].iva += iva;
  }

  const grandTotal = subtotal + totalIva;

  // Construir lineItems para o PDF
  const lineItems: CreditNoteLine[] = creditItems.map((it) => ({
    description: it.description,
    quantity: 1,
    totalAmountFmt: fmtKz(it.amount),
    taxLabel: it.taxLabel,
  }));

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
    lineItems,
    subtotalFmt: fmtKz(subtotal),
    ivaFmt: fmtKz(totalIva),
    grossTotalFmt: fmtKz(grandTotal),
    taxSummary: Object.values(taxGroups).map((g) => ({
      label: g.label,
      base: fmtKz(g.base),
      iva: fmtKz(g.iva),
    })),
    exemptionCode: (nc as Record<string, unknown>).exemption_code as string | null,
    exemptionReason: (nc as Record<string, unknown>).exemption_reason as string | null,
    documentHashFootnote: (nc as Record<string, unknown>).document_hash as string | null,
    digitalSignatureSha1: (nc as Record<string, unknown>).digital_signature_sha1_b64 as string | null,
  };

  const doc = buildCreditNotePdf(pdfInput);
  const base = pdfInput.documentNumber.replace(/\s+/g, "_");
  doc.save(`${base}.pdf`);
}
