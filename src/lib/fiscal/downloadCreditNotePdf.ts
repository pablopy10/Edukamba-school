import { supabase } from "@/integrations/supabase/client";
import { buildCreditNotePdf, type CreditNotePdfInput, type CreditNoteLine } from "./creditNotePdf";
import { buildAgtQrUrl, generateAgtQrDataUrl } from "./qr/agtQrCode";
import { fetchLogoAsDataUrl } from "./invoicePdf";

/** Formata valor monetário com espaço como separador de milhares: "5 000,00 Kz" */
const fmtKz = (n: number): string => {
  const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  return formatted.replace(/\u202F/g, " ").replace(/\u00A0/g, " ") + " Kz";
};

type ParsedItem = {
  description: string;
  amount: number;
  ivaPct: number;
  taxLabel: string;
  exemptionCode?: string;
  exemptionReason?: string;
};

/** Parseia o line_description no formato "Desc:Valor:IvaPct; Desc2:Valor2:IvaPct2" */
function parseLineDescription(lineDesc: string): ParsedItem[] {
  const parts = lineDesc.split(";").map((s) => s.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  for (const part of parts) {
    const match = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
    if (match) {
      const desc = match[1].trim();
      const amount = parseFloat(match[2].replace(/\s/g, "").replace(",", ".")) || 0;
      const ivaPctStr = match[3].trim();
      const isM04 = ivaPctStr === "0_M04";
      const isM11 = ivaPctStr === "0_M11" || ivaPctStr === "0";
      const ivaPct = isM04 || isM11 ? 0 : (parseFloat(ivaPctStr) || 0);
      const taxLabel = isM04 ? "Não sujeito (M04)" : isM11 ? "Isento (M11)" : `${ivaPctStr}%`;
      items.push({
        description: desc,
        amount,
        ivaPct,
        taxLabel,
        exemptionCode: isM04 ? "M04" : isM11 ? "M11" : undefined,
        exemptionReason: isM04 ? "Não sujeito nos termos do CIVA" : isM11 ? "Isenção no domínio da educação" : undefined,
      });
    }
  }
  return items;
}

export async function prepareCreditNotePdfInput(creditNoteId: string): Promise<CreditNotePdfInput> {
  const id = creditNoteId?.trim();
  if (!id) throw new Error("Identificador de NC inválido.");

  const { data: nc, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!nc) throw new Error("Nota de crédito não encontrada.");

  const ncRecord = nc as Record<string, unknown>;
  const schoolId = ncRecord.school_id as string | undefined;

  // Carregar dados da escola
  let schoolName = "Edukamba";
  let schoolNif = "5480041924";
  let schoolAddress = "Zona Verde, Rua 18, Casa 26, Belas, Luanda";
  const schoolContacts = ["Email: geral@edukamba.com", "Website: www.edukamba.com"];
  let logoDataUrl: string | null = null;

  if (schoolId) {
    const { data: sch } = await supabase
      .from("schools")
      .select("name, nif, address, phone, email, logo_url")
      .eq("id", schoolId)
      .maybeSingle();

    if (sch) {
      schoolName = sch.name?.trim() || schoolName;
      schoolNif = sch.nif?.trim() || schoolNif;
      schoolAddress = sch.address?.trim() || schoolAddress;
      const parts: string[] = [];
      if (sch.phone?.trim()) parts.push(`Tel: ${sch.phone.trim()}`);
      if (sch.email?.trim()) parts.push(`Email: ${sch.email.trim()}`);
      if (parts.length > 0) schoolContacts.splice(0, schoolContacts.length, ...parts);

      if (sch.logo_url) {
        logoDataUrl = await fetchLogoAsDataUrl(sch.logo_url);
      }
    }
  }

  // Identificação do documento de origem retificado
  let sourceInvoiceNumber = (ncRecord.original_invoice_number as string) || (ncRecord.original_document_number as string) || "—";
  let sourceInvoiceDate = (ncRecord.original_invoice_date as string) || (ncRecord.original_document_date as string) || null;
  let reason = (ncRecord.credit_reason as string) || (ncRecord.rectification_reason as string) || (ncRecord.cancellation_reason as string) || "Retificação";
  let selectedItemRaw: string | null = null;

  const lineDesc = ncRecord.line_description as string | null;
  if (lineDesc && sourceInvoiceNumber === "—") {
    const refMatch = /NC ref\.\s*(FT\s+\S+\/\d+)\s*—\s*(.+)/.exec(lineDesc);
    if (refMatch) {
      sourceInvoiceNumber = refMatch[1];
      let reasonPart = refMatch[2];
      const itemMatch = /^(.+?)\s*\[(.+)\]$/.exec(reasonPart);
      if (itemMatch) {
        reasonPart = itemMatch[1].trim();
        selectedItemRaw = itemMatch[2].trim();
      }
      reason = reasonPart;
    }
  }

  // Dados do aluno e encarregado
  let studentName = "—";
  let studentClassroom: string | null = null;
  let encarregadoNome: string | null = null;

  if (ncRecord.student_id) {
    const { data: stud } = await supabase
      .from("students")
      .select("full_name, parent_id, classroom:classrooms(name)")
      .eq("id", ncRecord.student_id as string)
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

  const ncGrossTotal = Number(ncRecord.gross_total);

  // Carregar linhas ou resolver itens a partir da fatura original
  let creditItems: ParsedItem[] = [];

  // 1. Tentar ler de invoice_lines da própria NC
  const { data: ncLines } = await supabase
    .from("invoice_lines")
    .select("product_description, quantity, unit_price, tax_percentage, tax_exemption_code, tax_exemption_reason")
    .eq("invoice_id", id)
    .order("line_number", { ascending: true });

  if (ncLines && ncLines.length > 0) {
    creditItems = ncLines.map((l) => {
      const pct = Number(l.tax_percentage || 0);
      const taxLabel = pct > 0 ? `${pct}%` : l.tax_exemption_code === "M04" ? "Não sujeito (M04)" : `Isento (${l.tax_exemption_code || "M11"})`;
      return {
        description: l.product_description,
        amount: Number(l.unit_price) * Number(l.quantity || 1),
        ivaPct: pct,
        taxLabel,
        exemptionCode: l.tax_exemption_code || undefined,
        exemptionReason: l.tax_exemption_reason || undefined,
      };
    });
  }

  // 2. Se selectedItemRaw presente
  if (creditItems.length === 0 && selectedItemRaw) {
    const parsed = parseLineDescription(selectedItemRaw);
    if (parsed.length > 0) creditItems = parsed;
  }

  // 3. Fallback: resolver a partir da FT original
  if (creditItems.length === 0 && sourceInvoiceNumber !== "—") {
    const { data: originalFT } = await supabase
      .from("invoices")
      .select("id, line_description, gross_total, invoice_date, payment_id")
      .eq("document_number", sourceInvoiceNumber)
      .maybeSingle();

    if (originalFT) {
      if (!sourceInvoiceDate && originalFT.invoice_date) {
        sourceInvoiceDate = String(originalFT.invoice_date).slice(0, 10);
      }

      const allItems = parseLineDescription(originalFT.line_description ?? "");
      const ftGrossTotal = Number(originalFT.gross_total);

      if (allItems.length > 0) {
        if (Math.abs(ncGrossTotal - ftGrossTotal) < 1) {
          creditItems = allItems;
        } else {
          const matched = allItems.find((it) => Math.abs(it.amount - ncGrossTotal) < 1);
          if (matched) {
            creditItems = [matched];
          } else {
            const refItem = allItems[0];
            creditItems = [{
              description: refItem.description,
              amount: ncGrossTotal,
              ivaPct: refItem.ivaPct,
              taxLabel: refItem.taxLabel,
              exemptionCode: refItem.exemptionCode,
              exemptionReason: refItem.exemptionReason,
            }];
          }
        }
      }
    }
  }

  // Fallback padrão se não houver itens
  if (creditItems.length === 0) {
    creditItems = [{
      description: "Serviços educativos",
      amount: ncGrossTotal,
      ivaPct: 0,
      taxLabel: "Isento (M11)",
      exemptionCode: "M11",
      exemptionReason: "Isenção no domínio da educação",
    }];
  }

  // Totais e grupos de IVA
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
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const lineItems: CreditNoteLine[] = creditItems.map((it) => ({
    description: capitalize(it.description),
    quantity: 1,
    unitPriceFmt: fmtKz(it.amount),
    totalAmountFmt: fmtKz(it.amount),
    taxLabel: it.taxLabel,
  }));

  // Geração do QR Code Oficial AGT (28mm)
  const docNum = (ncRecord.document_number as string) || "NC";
  let qrCodeDataUrl: string | null = null;
  try {
    const qrUrl = buildAgtQrUrl({ nifEmissor: schoolNif, numDoc: docNum });
    qrCodeDataUrl = await generateAgtQrDataUrl(qrUrl, { width: 512, margin: 4 });
  } catch (qrErr) {
    console.warn("Erro ao gerar QR Code AGT para Nota de Crédito:", qrErr);
  }

  return {
    schoolName,
    schoolNif,
    schoolAddress,
    schoolContactLines: schoolContacts,
    logoDataUrl,
    documentNumber: docNum,
    invoiceDateYYYYMMDD: ((ncRecord.invoice_date as string)?.slice(0, 10)) || new Date().toISOString().slice(0, 10),
    sourceInvoiceNumber,
    sourceInvoiceDate,
    reason,
    clienteNome: (ncRecord.cliente_nome as string) || "Consumidor Final",
    clienteNif: (ncRecord.cliente_nif as string) || "999999999",
    encarregadoNome: encarregadoNome || (ncRecord.cliente_nome as string) || null,
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
    exemptionCode: (ncRecord.exemption_code as string | null) || "M11",
    exemptionReason: (ncRecord.exemption_reason as string | null) || "Isenção no domínio da educação",
    documentHashFootnote: (ncRecord.document_hash as string | null) || (ncRecord.digital_signature_sha1_b64 as string | null),
    digitalSignatureSha1: ncRecord.digital_signature_sha1_b64 as string | null,
    qrCodeDataUrl,
  };
}

/**
 * Gera e descarrega o PDF oficial da Nota de Crédito.
 */
export async function downloadCreditNotePdfById(creditNoteId: string): Promise<void> {
  const pdfInput = await prepareCreditNotePdfInput(creditNoteId);
  const doc = buildCreditNotePdf(pdfInput);
  const base = pdfInput.documentNumber.replace(/\s+/g, "_");
  doc.save(`${base}.pdf`);
}

/**
 * Abre o PDF oficial da Nota de Crédito num novo separador do navegador.
 */
export async function openCreditNotePdfInNewTabById(creditNoteId: string): Promise<void> {
  const pdfInput = await prepareCreditNotePdfInput(creditNoteId);
  const doc = buildCreditNotePdf(pdfInput);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
