/**
 * ============================================================================
 * MOTOR FISCAL COMPLETO AGT — EDUKAMBA (BillingEngineService)
 * ============================================================================
 * Conformidade estrita: Decreto Presidencial n.º 292/18 e SAF-T (AO) 1.01_01.
 * 
 * Gere as 6 tipologias documentais fiscais:
 * - FR (Fatura/Recibo): Pronto pagamento e quitação imediata (Cenário A).
 * - FT (Fatura): Venda a crédito / lançamento prévio de propinas (Cenário B).
 * - RC (Recibo): Quitação de FT pré-existente sem duplicidade de imposto (Cenário C).
 * - PF (Fatura Pró-forma): Documento orçamentário sem valor fiscal (Cenário D).
 * - NC (Nota de Crédito): Estorno ou retificação vinculada (Cenário E).
 * - ND (Nota de Débito): Penalidade ou acréscimo financeiro vinculado.
 * 
 * Regra de Ouro: Sempre que for emitida uma cobrança, fatura, recibo ou nota de crédito,
 * o email transacional correspondente é automaticamente despachado com o PDF anexo.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AGT_PRIVATE_KEY_PEM,
  buildAgtSigningPlaintext,
  buildCertificationFooter,
  calculateSha1Hex,
  extractHashControl,
  formatMoneyDecimal,
  formatSystemEntryDate,
  signPlaintextRSA_SHA1,
} from "../crypto/agtCrypto";
import { buildAgtQrPayload } from "../qr/agtQrCode";
import { FiscalEmailService } from "./fiscalEmailService";
import { CreditNoteService } from "./creditNoteService";
import { emitCreditNoteDirect } from "../emitCreditNoteDirect";
import type { FiscalDocType, FiscalLineInput } from "../types";

export interface BillingLineItemInput {
  itemType?: "PROPINA" | "MATRICULA" | "TRANSPORTE" | "REFEICAO" | "EXTRACURRICULAR" | "MATERIAL" | "OUTRO" | string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  taxPercentage?: number; // 14, 7, 5, 0
  taxCode?: "NOR" | "RED" | "RED5" | "ISE" | string;
  taxExemptionCode?: string; // ex: 'M11', 'M04', 'M02'
  taxExemptionReason?: string;
}

export interface BaseEmissionParams {
  schoolId: string;
  studentId?: string | null;
  parentProfileId?: string | null;
  customerNif?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  seriesCode?: string;
  notes?: string | null;
  sendEmailWithPdf?: boolean;
  enrollmentFeeId?: string | null;
}

export interface IssueCashInvoiceParams extends BaseEmissionParams {
  paymentId?: string | null;
  paymentMethod?: string;
  paymentDate?: string;
  lines: BillingLineItemInput[];
}

export interface IssueCreditInvoiceParams extends BaseEmissionParams {
  dueDate: string;
  lines: BillingLineItemInput[];
  studentFeeId?: string | null;
}

export interface IssueReceiptParams extends BaseEmissionParams {
  originInvoiceId: string; // ID da FT de origem
  amountPaid: number;
  paymentMethod?: string;
  paymentDate?: string;
  paymentId?: string | null;
}

export interface IssueProformaParams extends BaseEmissionParams {
  dueDate?: string;
  lines: BillingLineItemInput[];
}

export interface ConvertProformaParams {
  proformaId: string;
  targetDocType: "FT" | "FR";
  paymentMethod?: string;
  paymentDate?: string;
}

export interface IssueCreditNoteParams {
  originalInvoiceId: string;
  reason: string;
  partialAmount?: number;
  selectedItemDesc?: string;
  sendEmailWithPdf?: boolean;
}

export interface IssueDebitNoteParams extends BaseEmissionParams {
  originInvoiceId: string;
  reason: string;
  surchargeAmount: number;
  description?: string;
}

export interface BillingEngineResult {
  ok: boolean;
  message?: string;
  invoiceId?: string;
  documentNumber?: string;
  docType?: FiscalDocType;
  grossTotal?: number;
  hashControl?: string;
  emailSent?: boolean;
}

function formatInvoiceDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d.includes("T") ? d : `${d}T12:00:00`) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export class BillingEngineService {
  /**
   * Resolve o NIF e Nome do adquirente (Regra AGT: 999999999 e Consumidor Final se omitido).
   */
  static resolveCustomer(customerNif?: string | null, customerName?: string | null): {
    nif: string;
    name: string;
  } {
    const rawNif = (customerNif ?? "").trim();
    const rawName = (customerName ?? "").trim();
    if (!rawNif || rawNif === "999999999") {
      return { nif: "999999999", name: rawName || "Consumidor Final" };
    }
    return { nif: rawNif, name: rawName || "Cliente" };
  }

  /**
   * Obtém a chave privada RSA configurada ou utiliza a chave padrão homologada da Edukamba.
   */
  static getPrivateKey(): string {
    return (
      (import.meta.env?.VITE_AGT_RSA_PRIVATE_KEY_PEM as string) ||
      DEFAULT_AGT_PRIVATE_KEY_PEM
    );
  }

  /**
   * CENÁRIO A: Pronto Pagamento (Validação imediata de propina, matrícula, cantina, uniforme)
   * Emite exclusivamente uma FR (Fatura/Recibo).
   * Quita o item e cumpre a obrigação fiscal num único passo atómico.
   */
  static async issueCashInvoice(params: IssueCashInvoiceParams): Promise<BillingEngineResult> {
    const schoolId = params.schoolId?.trim();
    if (!schoolId) return { ok: false, message: "schoolId é obrigatório" };
    if (!params.lines?.length) return { ok: false, message: "Pelo menos uma linha de serviço/produto é obrigatória" };

    const seriesCode = params.seriesCode?.trim() || "EDK";
    const currentFiscalYear = new Date().getFullYear();
    const invoiceDate = formatInvoiceDate(params.paymentDate || new Date());
    const issuedAt = new Date().toISOString();

    const customer = this.resolveCustomer(params.customerNif, params.customerName);

    // Calcular totais
    let subtotalNet = 0;
    let totalTax = 0;
    let totalGross = 0;

    const normalizedLines = params.lines.map((l, idx) => {
      const qty = l.quantity || 1;
      const unit = l.unitPrice || 0;
      const discount = l.discountAmount || 0;
      const net = Math.max(0, Math.round((qty * unit - discount) * 100) / 100);
      const taxRate = l.taxPercentage ?? 0;
      const tax = taxRate > 0 ? Math.round(((net * taxRate) / 100) * 100) / 100 : 0;
      const gross = Math.round((net + tax) * 100) / 100;

      subtotalNet += net;
      totalTax += tax;
      totalGross += gross;

      return {
        line_number: idx + 1,
        item_type: l.itemType || "OUTRO",
        product_code: `PROD-${idx + 1}`,
        product_description: l.description,
        quantity: qty,
        unit_of_measure: "UN",
        unit_price: unit,
        discount_amount: discount,
        credit_amount: gross,
        debit_amount: 0,
        settlement_amount: gross,
        tax_type: "IVA",
        tax_country_region: "AO",
        tax_code: taxRate > 0 ? (l.taxCode || "NOR") : "ISE",
        tax_percentage: taxRate,
        tax_exemption_code: taxRate === 0 ? (l.taxExemptionCode || "M11") : null,
        tax_exemption_reason: taxRate === 0 ? (l.taxExemptionReason || "Isenção no domínio da educação") : null,
      };
    });

    const grossTotal = totalGross;

    // 1. Reservar sequência na série fiscal (com lock pessimista)
    let nextNumber: number;
    let documentNumber: string;
    let previousHash = "";

    const { data: reserveData, error: reserveErr } = await supabase.rpc("billing_reserve_series_next_number", {
      _school_id: schoolId,
      _doc_type: "FR",
      _series_code: seriesCode,
      _fiscal_year: currentFiscalYear,
      _document_date: invoiceDate,
    });

    if (!reserveErr && reserveData && Array.isArray(reserveData) && reserveData.length > 0) {
      const row = reserveData[0];
      nextNumber = row.doc_number;
      documentNumber = row.document_number_full || `FR ${seriesCode}/${nextNumber}`;
      previousHash = (row.previous_document_hash ?? "").trim();
    } else {
      const { data: lastFR } = await supabase
        .from("invoices")
        .select("doc_number, document_hash")
        .eq("school_id", schoolId)
        .eq("doc_type", "FR")
        .order("doc_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      nextNumber = (lastFR?.doc_number ?? 0) + 1;
      documentNumber = `FR ${seriesCode}/${nextNumber}`;
      previousHash = (lastFR?.document_hash ?? "").trim();
    }

    // 2. Assinatura digital RSA-SHA1 oficial AGT
    const plaintext = buildAgtSigningPlaintext({
      invoiceDateYYYYMMDD: invoiceDate,
      systemEntryDateISO: formatSystemEntryDate(issuedAt),
      documentNumberFull: documentNumber,
      grossTotal,
      previousDocumentHash: previousHash,
    });

    const docHashSha1 = calculateSha1Hex(plaintext);
    const signatureBase64 = signPlaintextRSA_SHA1(plaintext, this.getPrivateKey());
    const hashControl = extractHashControl(signatureBase64);

    // 3. QR Code AGT
    const { data: school } = await supabase.from("schools").select("nif").eq("id", schoolId).maybeSingle();
    const qrPayload = buildAgtQrPayload({
      nifEmissor: school?.nif || "5000000000",
      nifCliente: customer.nif,
      pais: "AO",
      tipoDoc: "FR",
      estado: "N",
      data: invoiceDate,
      numDoc: documentNumber,
      hash4Chars: hashControl,
      totalLiquido: subtotalNet,
      totalIva: totalTax,
      totalDocumento: totalGross,
    });

    // 4. Inserir fatura/recibo
    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        school_id: schoolId,
        student_id: params.studentId ?? null,
        parent_profile_id: params.parentProfileId ?? null,
        payment_id: params.paymentId ?? null,
        enrollment_fee_id: params.enrollmentFeeId ?? null,
        series: seriesCode,
        doc_number: nextNumber,
        document_number: documentNumber,
        doc_type: "FR",
        document_type: "FR",
        invoice_date: invoiceDate,
        invoice_issued_at: issuedAt,
        gross_total: totalGross,
        net_total: subtotalNet,
        tax_payable: totalTax,
        currency: "AOA",
        cliente_nome: customer.name,
        cliente_nif: customer.nif,
        line_description: normalizedLines.map((l) => l.product_description).join("; "),
        payment_method: params.paymentMethod || "Numerário",
        payment_date: invoiceDate,
        settlement_amount: totalGross,
        agt_signing_plaintext: plaintext,
        digital_signature_sha1_b64: signatureBase64,
        document_hash: docHashSha1,
        previous_document_hash: previousHash || null,
        hash_control: hashControl,
        qr_code_payload: qrPayload,
        invoice_status: "N",
      })
      .select("id, document_number")
      .single();

    if (insertErr || !inserted) {
      return { ok: false, message: insertErr?.message || "Erro ao gravar Fatura/Recibo." };
    }

    // 5. Inserir linhas em invoice_lines
    try {
      const linesToInsert = normalizedLines.map((l) => ({
        ...l,
        invoice_id: inserted.id,
      }));
      await supabase.from("invoice_lines").insert(linesToInsert);
    } catch (lineErr) {
      console.warn("issueCashInvoice: invoice_lines non-fatal:", lineErr);
    }

    // 6. Atualizar pagamento associado (se fornecido)
    if (params.paymentId) {
      try {
        await supabase
          .from("payments")
          .update({
            status: "APPROVED",
            invoice_id: inserted.id,
            linked_invoice_id: inserted.id,
          })
          .eq("id", params.paymentId);
      } catch (pErr) {
        console.warn("issueCashInvoice: update payment non-fatal:", pErr);
      }
    }

    // 7. Atualizar taxa de matrícula associada (se fornecida)
    if (params.enrollmentFeeId) {
      try {
        await supabase
          .from("enrollment_fees")
          .update({ invoice_id: inserted.id })
          .eq("id", params.enrollmentFeeId);
      } catch (efErr) {
        console.warn("issueCashInvoice: update enrollment_fees non-fatal:", efErr);
      }
    }

    // 7. Envio do documento em PDF anexado por email
    if (params.sendEmailWithPdf !== false) {
      FiscalEmailService.sendDocumentEmail({
        invoiceId: inserted.id,
        studentId: params.studentId || undefined,
      }).catch((emErr) => console.warn("issueCashInvoice: auto email non-fatal:", emErr));
    }

    return {
      ok: true,
      invoiceId: inserted.id,
      documentNumber: inserted.document_number,
      docType: "FR",
      grossTotal,
      hashControl,
    };
  }

  /**
   * CENÁRIO B: Faturação Prévia / Emissão em Lote no Início do Mês
   * Emite FT (Fatura a crédito) com data de vencimento.
   * O lançamento de conta a receber fica em aberto (PENDING_PAYMENT).
   */
  static async issueCreditInvoice(params: IssueCreditInvoiceParams): Promise<BillingEngineResult> {
    const schoolId = params.schoolId?.trim();
    if (!schoolId) return { ok: false, message: "schoolId é obrigatório" };
    if (!params.lines?.length) return { ok: false, message: "Pelo menos uma linha de serviço/produto é obrigatória" };

    const seriesCode = params.seriesCode?.trim() || "EDK";
    const currentFiscalYear = new Date().getFullYear();
    const invoiceDate = formatInvoiceDate(new Date());
    const dueDate = formatInvoiceDate(params.dueDate || new Date());
    const issuedAt = new Date().toISOString();

    const customer = this.resolveCustomer(params.customerNif, params.customerName);

    let subtotalNet = 0;
    let totalTax = 0;
    let totalGross = 0;

    const normalizedLines = params.lines.map((l, idx) => {
      const qty = l.quantity || 1;
      const unit = l.unitPrice || 0;
      const discount = l.discountAmount || 0;
      const net = Math.max(0, Math.round((qty * unit - discount) * 100) / 100);
      const taxRate = l.taxPercentage ?? 0;
      const tax = taxRate > 0 ? Math.round(((net * taxRate) / 100) * 100) / 100 : 0;
      const gross = Math.round((net + tax) * 100) / 100;

      subtotalNet += net;
      totalTax += tax;
      totalGross += gross;

      return {
        line_number: idx + 1,
        item_type: l.itemType || "PROPINA",
        product_code: `SERV-EDUC-${idx + 1}`,
        product_description: l.description,
        quantity: qty,
        unit_of_measure: "UN",
        unit_price: unit,
        discount_amount: discount,
        credit_amount: gross,
        debit_amount: 0,
        settlement_amount: 0,
        tax_type: "IVA",
        tax_country_region: "AO",
        tax_code: taxRate > 0 ? (l.taxCode || "NOR") : "ISE",
        tax_percentage: taxRate,
        tax_exemption_code: taxRate === 0 ? (l.taxExemptionCode || "M11") : null,
        tax_exemption_reason: taxRate === 0 ? (l.taxExemptionReason || "Isenção no domínio da educação") : null,
      };
    });

    const grossTotal = totalGross;

    // 1. Reservar sequência na série fiscal FT
    let nextNumber: number;
    let documentNumber: string;
    let previousHash = "";

    const { data: reserveData, error: reserveErr } = await supabase.rpc("billing_reserve_series_next_number", {
      _school_id: schoolId,
      _doc_type: "FT",
      _series_code: seriesCode,
      _fiscal_year: currentFiscalYear,
      _document_date: invoiceDate,
    });

    if (!reserveErr && reserveData && Array.isArray(reserveData) && reserveData.length > 0) {
      const row = reserveData[0];
      nextNumber = row.doc_number;
      documentNumber = row.document_number_full || `FT ${seriesCode}/${nextNumber}`;
      previousHash = (row.previous_document_hash ?? "").trim();
    } else {
      const { data: lastFT } = await supabase
        .from("invoices")
        .select("doc_number, document_hash")
        .eq("school_id", schoolId)
        .eq("doc_type", "FT")
        .order("doc_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      nextNumber = (lastFT?.doc_number ?? 0) + 1;
      documentNumber = `FT ${seriesCode}/${nextNumber}`;
      previousHash = (lastFT?.document_hash ?? "").trim();
    }

    // 2. Assinatura digital RSA-SHA1
    const plaintext = buildAgtSigningPlaintext({
      invoiceDateYYYYMMDD: invoiceDate,
      systemEntryDateISO: formatSystemEntryDate(issuedAt),
      documentNumberFull: documentNumber,
      grossTotal,
      previousDocumentHash: previousHash,
    });

    const docHashSha1 = calculateSha1Hex(plaintext);
    const signatureBase64 = signPlaintextRSA_SHA1(plaintext, this.getPrivateKey());
    const hashControl = extractHashControl(signatureBase64);

    // 3. QR Code AGT
    const { data: school } = await supabase.from("schools").select("nif").eq("id", schoolId).maybeSingle();
    const qrPayload = buildAgtQrPayload({
      nifEmissor: school?.nif || "5000000000",
      nifCliente: customer.nif,
      pais: "AO",
      tipoDoc: "FT",
      estado: "N",
      data: invoiceDate,
      numDoc: documentNumber,
      hash4Chars: hashControl,
      totalLiquido: subtotalNet,
      totalIva: totalTax,
      totalDocumento: totalGross,
    });

    // 4. Inserir FT
    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        school_id: schoolId,
        student_id: params.studentId ?? null,
        parent_profile_id: params.parentProfileId ?? null,
        enrollment_fee_id: params.enrollmentFeeId ?? null,
        series: seriesCode,
        doc_number: nextNumber,
        document_number: documentNumber,
        doc_type: "FT",
        document_type: "FT",
        invoice_date: invoiceDate,
        invoice_issued_at: issuedAt,
        due_date: dueDate,
        gross_total: totalGross,
        net_total: subtotalNet,
        tax_payable: totalTax,
        currency: "AOA",
        cliente_nome: customer.name,
        cliente_nif: customer.nif,
        line_description: normalizedLines.map((l) => l.product_description).join("; "),
        agt_signing_plaintext: plaintext,
        digital_signature_sha1_b64: signatureBase64,
        document_hash: docHashSha1,
        previous_document_hash: previousHash || null,
        hash_control: hashControl,
        qr_code_payload: qrPayload,
        invoice_status: "N",
      })
      .select("id, document_number")
      .single();

    if (insertErr || !inserted) {
      return { ok: false, message: insertErr?.message || "Erro ao gravar Fatura FT." };
    }

    // 5. Inserir linhas em invoice_lines
    try {
      const linesToInsert = normalizedLines.map((l) => ({
        ...l,
        invoice_id: inserted.id,
      }));
      await supabase.from("invoice_lines").insert(linesToInsert);
    } catch (lineErr) {
      console.warn("issueCreditInvoice: invoice_lines non-fatal:", lineErr);
    }

    // 6. Atualizar taxa de matrícula associada (se fornecida)
    if (params.enrollmentFeeId) {
      try {
        await supabase
          .from("enrollment_fees")
          .update({ invoice_id: inserted.id })
          .eq("id", params.enrollmentFeeId);
      } catch (efErr) {
        console.warn("issueCreditInvoice: update enrollment_fees non-fatal:", efErr);
      }
    }

    // 7. Enviar documento em PDF anexado por email
    if (params.sendEmailWithPdf !== false) {
      FiscalEmailService.sendDocumentEmail({
        invoiceId: inserted.id,
        studentId: params.studentId || undefined,
      }).catch((emErr) => console.warn("issueCreditInvoice: auto email non-fatal:", emErr));
    }

    return {
      ok: true,
      invoiceId: inserted.id,
      documentNumber: inserted.document_number,
      docType: "FT",
      grossTotal,
      hashControl,
    };
  }

  /**
   * CENÁRIO C: Liquidação de Fatura Existente (Pagamento posterior)
   * Emite EXCLUSIVAMENTE um RC (Recibo) referenciando a FT de origem.
   * REGRA CRÍTICA: NUNCA emitir FR neste cenário, para não duplicar imposto e receita no SAF-T.
   */
  static async issueReceipt(params: IssueReceiptParams): Promise<BillingEngineResult> {
    const originId = params.originInvoiceId?.trim();
    if (!originId) return { ok: false, message: "originInvoiceId é obrigatório" };

    // 1. Carregar FT original
    const { data: ft, error: ftErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", originId)
      .maybeSingle();

    if (ftErr || !ft) {
      return { ok: false, message: "Fatura de origem (FT) não encontrada." };
    }

    if (ft.invoice_status === "A") {
      return { ok: false, message: `A fatura ${ft.document_number} encontra-se anulada.` };
    }

    if (ft.doc_type !== "FT") {
      return { ok: false, message: "Apenas faturas a crédito (FT) podem ser liquidadas com Recibo (RC)." };
    }

    const schoolId = ft.school_id;
    const seriesCode = params.seriesCode?.trim() || "EDK";
    const currentFiscalYear = new Date().getFullYear();
    const invoiceDate = formatInvoiceDate(params.paymentDate || new Date());
    const issuedAt = new Date().toISOString();

    const amountPaid = typeof params.amountPaid === "number" && params.amountPaid > 0
      ? params.amountPaid
      : Number(ft.gross_total || 0);

    const customer = this.resolveCustomer(ft.cliente_nif, ft.cliente_nome);

    // 2. Reservar sequência na série fiscal RC
    let nextNumber: number;
    let documentNumber: string;
    let previousHash = "";

    const { data: reserveData, error: reserveErr } = await supabase.rpc("billing_reserve_series_next_number", {
      _school_id: schoolId,
      _doc_type: "RC",
      _series_code: seriesCode,
      _fiscal_year: currentFiscalYear,
      _document_date: invoiceDate,
    });

    if (!reserveErr && reserveData && Array.isArray(reserveData) && reserveData.length > 0) {
      const row = reserveData[0];
      nextNumber = row.doc_number;
      documentNumber = row.document_number_full || `RC ${seriesCode}/${nextNumber}`;
      previousHash = (row.previous_document_hash ?? "").trim();
    } else {
      const { data: lastRC } = await supabase
        .from("invoices")
        .select("doc_number, document_hash")
        .eq("school_id", schoolId)
        .eq("doc_type", "RC")
        .order("doc_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      nextNumber = (lastRC?.doc_number ?? 0) + 1;
      documentNumber = `RC ${seriesCode}/${nextNumber}`;
      previousHash = (lastRC?.document_hash ?? "").trim();
    }

    // 3. Assinatura digital RSA-SHA1 oficial AGT
    const plaintext = buildAgtSigningPlaintext({
      invoiceDateYYYYMMDD: invoiceDate,
      systemEntryDateISO: formatSystemEntryDate(issuedAt),
      documentNumberFull: documentNumber,
      grossTotal: amountPaid,
      previousDocumentHash: previousHash,
    });

    const docHashSha1 = calculateSha1Hex(plaintext);
    const signatureBase64 = signPlaintextRSA_SHA1(plaintext, this.getPrivateKey());
    const hashControl = extractHashControl(signatureBase64);

    // 4. QR Code AGT
    const { data: school } = await supabase.from("schools").select("nif").eq("id", schoolId).maybeSingle();
    const qrPayload = buildAgtQrPayload({
      nifEmissor: school?.nif || "5000000000",
      nifCliente: customer.nif,
      pais: "AO",
      tipoDoc: "RC",
      estado: "N",
      data: invoiceDate,
      numDoc: documentNumber,
      hash4Chars: hashControl,
      totalLiquido: amountPaid,
      totalIva: 0,
      totalDocumento: amountPaid,
    });

    // 5. Inserir RC com vínculo estrito à FT de origem (NÃO duplica imposto)
    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        school_id: schoolId,
        student_id: ft.student_id,
        parent_profile_id: ft.parent_profile_id,
        series: seriesCode,
        doc_number: nextNumber,
        document_number: documentNumber,
        doc_type: "RC",
        document_type: "RC",
        invoice_date: invoiceDate,
        invoice_issued_at: issuedAt,
        gross_total: amountPaid,
        net_total: amountPaid,
        tax_payable: 0, // Recibo não gera imposto adicional (já apurado na FT)
        currency: "AOA",
        cliente_nome: customer.name,
        cliente_nif: customer.nif,
        line_description: `Recibo ref. ${ft.document_number}`,
        payment_method: params.paymentMethod || "Transferência Bancária",
        payment_date: invoiceDate,
        source_document_id: ft.id,
        source_document_number: ft.document_number,
        source_document_date: ft.invoice_date,
        referenced_invoice_id: ft.id,
        original_document_number: ft.document_number,
        original_document_date: ft.invoice_date,
        settlement_amount: amountPaid,
        agt_signing_plaintext: plaintext,
        digital_signature_sha1_b64: signatureBase64,
        document_hash: docHashSha1,
        previous_document_hash: previousHash || null,
        hash_control: hashControl,
        qr_code_payload: qrPayload,
        invoice_status: "N",
      })
      .select("id, document_number")
      .single();

    if (insertErr || !inserted) {
      return { ok: false, message: insertErr?.message || "Erro ao gravar Recibo (RC)." };
    }

    // 6. Inserir linha do recibo em invoice_lines
    try {
      await supabase.from("invoice_lines").insert({
        invoice_id: inserted.id,
        line_number: 1,
        item_type: "OUTRO",
        product_code: "REC-LIQ-01",
        product_description: `Liquidação financeira ref. ${ft.document_number}`,
        quantity: 1,
        unit_of_measure: "UN",
        unit_price: amountPaid,
        credit_amount: amountPaid,
        debit_amount: 0,
        settlement_amount: amountPaid,
        tax_type: "IVA",
        tax_country_region: "AO",
        tax_code: "ISE",
        tax_percentage: 0,
        tax_exemption_code: "M02",
        tax_exemption_reason: "Não sujeito a imposto (Liquidação de fatura)",
      });
    } catch (lineErr) {
      console.warn("issueReceipt: invoice_lines non-fatal:", lineErr);
    }

    // 7. Atualizar pagamento associado (se fornecido)
    if (params.paymentId) {
      try {
        await supabase
          .from("payments")
          .update({
            status: "APPROVED",
            linked_receipt_id: inserted.id,
            linked_invoice_id: ft.id,
          })
          .eq("id", params.paymentId);
      } catch (pErr) {
        console.warn("issueReceipt: update payment non-fatal:", pErr);
      }
    }

    // 8. Enviar documento em PDF anexado por email
    if (params.sendEmailWithPdf !== false) {
      FiscalEmailService.sendDocumentEmail({
        invoiceId: inserted.id,
        studentId: ft.student_id || undefined,
      }).catch((emErr) => console.warn("issueReceipt: auto email non-fatal:", emErr));
    }

    return {
      ok: true,
      invoiceId: inserted.id,
      documentNumber: inserted.document_number,
      docType: "RC",
      grossTotal: amountPaid,
      hashControl,
    };
  }

  /**
   * CENÁRIO D: Cotação / Pedido de Subsídio a Empresas
   * Emite PF (Fatura Pró-forma).
   * Documento orçamentário sem valor fiscal com marca d'água "Este documento não serve de fatura".
   */
  static async issueProforma(params: IssueProformaParams): Promise<BillingEngineResult> {
    const schoolId = params.schoolId?.trim();
    if (!schoolId) return { ok: false, message: "schoolId é obrigatório" };
    if (!params.lines?.length) return { ok: false, message: "Pelo menos uma linha de serviço/produto é obrigatória" };

    const seriesCode = params.seriesCode?.trim() || "EDK";
    const invoiceDate = formatInvoiceDate(new Date());
    const dueDate = formatInvoiceDate(params.dueDate || new Date());
    const issuedAt = new Date().toISOString();

    const customer = this.resolveCustomer(params.customerNif, params.customerName);

    let subtotalNet = 0;
    let totalTax = 0;
    let totalGross = 0;

    const normalizedLines = params.lines.map((l, idx) => {
      const qty = l.quantity || 1;
      const unit = l.unitPrice || 0;
      const discount = l.discountAmount || 0;
      const net = Math.max(0, Math.round((qty * unit - discount) * 100) / 100);
      const taxRate = l.taxPercentage ?? 0;
      const tax = taxRate > 0 ? Math.round(((net * taxRate) / 100) * 100) / 100 : 0;
      const gross = Math.round((net + tax) * 100) / 100;

      subtotalNet += net;
      totalTax += tax;
      totalGross += gross;

      return {
        line_number: idx + 1,
        item_type: l.itemType || "PROPINA",
        product_code: `ORC-${idx + 1}`,
        product_description: l.description,
        quantity: qty,
        unit_of_measure: "UN",
        unit_price: unit,
        discount_amount: discount,
        credit_amount: gross,
        debit_amount: 0,
        settlement_amount: 0,
        tax_type: "IVA",
        tax_country_region: "AO",
        tax_code: taxRate > 0 ? (l.taxCode || "NOR") : "ISE",
        tax_percentage: taxRate,
        tax_exemption_code: taxRate === 0 ? (l.taxExemptionCode || "M11") : null,
        tax_exemption_reason: taxRate === 0 ? (l.taxExemptionReason || "Isenção no domínio da educação") : null,
      };
    });

    const grossTotal = totalGross;

    // Pró-forma tem numeração independente e não encadeia em hash fiscal comercial
    const { data: lastPF } = await supabase
      .from("invoices")
      .select("doc_number")
      .eq("school_id", schoolId)
      .eq("doc_type", "PF")
      .order("doc_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNumber = (lastPF?.doc_number ?? 0) + 1;
    const documentNumber = `PF ${seriesCode}/${nextNumber}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        school_id: schoolId,
        student_id: params.studentId ?? null,
        parent_profile_id: params.parentProfileId ?? null,
        series: seriesCode,
        doc_number: nextNumber,
        document_number: documentNumber,
        doc_type: "PF",
        document_type: "PF",
        invoice_date: invoiceDate,
        invoice_issued_at: issuedAt,
        due_date: dueDate,
        gross_total: totalGross,
        net_total: subtotalNet,
        tax_payable: totalTax,
        currency: "AOA",
        cliente_nome: customer.name,
        cliente_nif: customer.nif,
        line_description: normalizedLines.map((l) => l.product_description).join("; "),
        hash_control: "PF00",
        invoice_status: "N",
      })
      .select("id, document_number")
      .single();

    if (insertErr || !inserted) {
      return { ok: false, message: insertErr?.message || "Erro ao gravar Fatura Pró-forma." };
    }

    try {
      const linesToInsert = normalizedLines.map((l) => ({
        ...l,
        invoice_id: inserted.id,
      }));
      await supabase.from("invoice_lines").insert(linesToInsert);
    } catch (lineErr) {
      console.warn("issueProforma: invoice_lines non-fatal:", lineErr);
    }

    if (params.sendEmailWithPdf !== false) {
      FiscalEmailService.sendDocumentEmail({
        invoiceId: inserted.id,
        studentId: params.studentId || undefined,
      }).catch((emErr) => console.warn("issueProforma: auto email non-fatal:", emErr));
    }

    return {
      ok: true,
      invoiceId: inserted.id,
      documentNumber: inserted.document_number,
      docType: "PF",
      grossTotal,
      hashControl: "PF00",
    };
  }

  /**
   * Conversão de Pró-Forma (PF) em Fatura Comercial Definitiva (FT ou FR).
   */
  static async convertProforma(params: ConvertProformaParams): Promise<BillingEngineResult> {
    const pfId = params.proformaId?.trim();
    if (!pfId) return { ok: false, message: "proformaId é obrigatório" };

    const { data: pf, error: pfErr } = await supabase
      .from("invoices")
      .select("*, invoice_lines(*)")
      .eq("id", pfId)
      .maybeSingle();

    if (pfErr || !pf) {
      return { ok: false, message: "Fatura Pró-forma não encontrada." };
    }

    if (pf.doc_type !== "PF") {
      return { ok: false, message: "O documento selecionado não é uma Fatura Pró-forma." };
    }

    const lines: BillingLineItemInput[] = (pf.invoice_lines || []).map((l: any) => ({
      itemType: l.item_type || "PROPINA",
      description: l.product_description,
      quantity: Number(l.quantity) || 1,
      unitPrice: Number(l.unit_price) || 0,
      discountAmount: Number(l.discount_amount) || 0,
      taxPercentage: Number(l.tax_percentage) || 0,
      taxCode: l.tax_code,
      taxExemptionCode: l.tax_exemption_code,
      taxExemptionReason: l.tax_exemption_reason,
    }));

    if (!lines.length) {
      lines.push({
        itemType: "PROPINA",
        description: pf.line_description || "Serviço educacional",
        quantity: 1,
        unitPrice: Number(pf.gross_total) || 0,
        taxPercentage: 0,
        taxExemptionCode: "M11",
      });
    }

    let result: BillingEngineResult;
    if (params.targetDocType === "FR") {
      result = await this.issueCashInvoice({
        schoolId: pf.school_id,
        studentId: pf.student_id,
        parentProfileId: pf.parent_profile_id,
        customerNif: pf.cliente_nif,
        customerName: pf.cliente_nome,
        paymentMethod: params.paymentMethod || "Transferência Bancária",
        paymentDate: params.paymentDate || formatInvoiceDate(new Date()),
        lines,
      });
    } else {
      result = await this.issueCreditInvoice({
        schoolId: pf.school_id,
        studentId: pf.student_id,
        parentProfileId: pf.parent_profile_id,
        customerNif: pf.cliente_nif,
        customerName: pf.cliente_nome,
        dueDate: pf.due_date || formatInvoiceDate(new Date()),
        lines,
      });
    }

    if (result.ok && result.invoiceId) {
      // Marcar referência na fatura emitida e atualizar pró-forma
      await supabase
        .from("invoices")
        .update({
          order_reference_pp: pf.document_number,
          source_proforma_id: pf.id,
        })
        .eq("id", result.invoiceId);
    }

    return result;
  }

  /**
   * CENÁRIO E: Estorno, Erro ou Devolução
   * Emite NC (Nota de Crédito) apontando para a FT ou FR original.
   * Réplica rigorosa das taxas e motivos de isenção da fatura original;
   * Atualiza a linha do pagamento na UI com a flag de estorno.
   */
  static async issueCreditNote(params: IssueCreditNoteParams): Promise<BillingEngineResult> {
    const directRes = await emitCreditNoteDirect({
      originalInvoiceId: params.originalInvoiceId,
      reason: params.reason,
      partialAmount: params.partialAmount,
      selectedItemDesc: params.selectedItemDesc,
    });

    if (!directRes.ok || !directRes.creditNoteId) {
      return { ok: false, message: directRes.message || "Falha ao emitir Nota de Crédito." };
    }

    if (params.sendEmailWithPdf !== false) {
      FiscalEmailService.sendDocumentEmail({
        invoiceId: directRes.creditNoteId,
      }).catch((emErr) => console.warn("issueCreditNote: auto email non-fatal:", emErr));
    }

    return {
      ok: true,
      invoiceId: directRes.creditNoteId,
      documentNumber: directRes.documentNumber,
      docType: "NC",
      grossTotal: directRes.creditedAmount,
      hashControl: directRes.hashControl,
    };
  }

  /**
   * NOTA DE DÉBITO (ND): Acréscimo financeiro ou penalidade vinculada a documento anterior.
   */
  static async issueDebitNote(params: IssueDebitNoteParams): Promise<BillingEngineResult> {
    const originId = params.originInvoiceId?.trim();
    if (!originId) return { ok: false, message: "originInvoiceId é obrigatório" };
    if (!params.surchargeAmount || params.surchargeAmount <= 0) {
      return { ok: false, message: "Valor do acréscimo deve ser superior a zero." };
    }

    const { data: orig, error: origErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", originId)
      .maybeSingle();

    if (origErr || !orig) {
      return { ok: false, message: "Fatura de origem não encontrada." };
    }

    const schoolId = orig.school_id;
    const seriesCode = params.seriesCode?.trim() || "EDK";
    const currentFiscalYear = new Date().getFullYear();
    const invoiceDate = formatInvoiceDate(new Date());
    const issuedAt = new Date().toISOString();
    const amount = Number(params.surchargeAmount);

    const customer = this.resolveCustomer(orig.cliente_nif, orig.cliente_nome);

    // 1. Reservar sequência na série fiscal ND
    let nextNumber: number;
    let documentNumber: string;
    let previousHash = "";

    const { data: reserveData, error: reserveErr } = await supabase.rpc("billing_reserve_series_next_number", {
      _school_id: schoolId,
      _doc_type: "ND",
      _series_code: seriesCode,
      _fiscal_year: currentFiscalYear,
      _document_date: invoiceDate,
    });

    if (!reserveErr && reserveData && Array.isArray(reserveData) && reserveData.length > 0) {
      const row = reserveData[0];
      nextNumber = row.doc_number;
      documentNumber = row.document_number_full || `ND ${seriesCode}/${nextNumber}`;
      previousHash = (row.previous_document_hash ?? "").trim();
    } else {
      const { data: lastND } = await supabase
        .from("invoices")
        .select("doc_number, document_hash")
        .eq("school_id", schoolId)
        .eq("doc_type", "ND")
        .order("doc_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      nextNumber = (lastND?.doc_number ?? 0) + 1;
      documentNumber = `ND ${seriesCode}/${nextNumber}`;
      previousHash = (lastND?.document_hash ?? "").trim();
    }

    // 2. Assinatura digital RSA-SHA1
    const plaintext = buildAgtSigningPlaintext({
      invoiceDateYYYYMMDD: invoiceDate,
      systemEntryDateISO: formatSystemEntryDate(issuedAt),
      documentNumberFull: documentNumber,
      grossTotal: amount,
      previousDocumentHash: previousHash,
    });

    const docHashSha1 = calculateSha1Hex(plaintext);
    const signatureBase64 = signPlaintextRSA_SHA1(plaintext, this.getPrivateKey());
    const hashControl = extractHashControl(signatureBase64);

    // 3. QR Code AGT
    const { data: school } = await supabase.from("schools").select("nif").eq("id", schoolId).maybeSingle();
    const qrPayload = buildAgtQrPayload({
      nifEmissor: school?.nif || "5000000000",
      nifCliente: customer.nif,
      pais: "AO",
      tipoDoc: "ND",
      estado: "N",
      data: invoiceDate,
      numDoc: documentNumber,
      hash4Chars: hashControl,
      totalLiquido: amount,
      totalIva: 0,
      totalDocumento: amount,
    });

    // 4. Inserir ND
    const { data: inserted, error: insertErr } = await supabase
      .from("invoices")
      .insert({
        school_id: schoolId,
        student_id: orig.student_id,
        parent_profile_id: orig.parent_profile_id,
        series: seriesCode,
        doc_number: nextNumber,
        document_number: documentNumber,
        doc_type: "ND",
        document_type: "ND",
        invoice_date: invoiceDate,
        invoice_issued_at: issuedAt,
        gross_total: amount,
        net_total: amount,
        tax_payable: 0,
        currency: "AOA",
        cliente_nome: customer.name,
        cliente_nif: customer.nif,
        line_description: params.description || `Nota de Débito ref. ${orig.document_number} — ${params.reason}`,
        source_document_id: orig.id,
        source_document_number: orig.document_number,
        source_document_date: orig.invoice_date,
        referenced_invoice_id: orig.id,
        original_document_number: orig.document_number,
        original_document_date: orig.invoice_date,
        rectification_reason: params.reason,
        agt_signing_plaintext: plaintext,
        digital_signature_sha1_b64: signatureBase64,
        document_hash: docHashSha1,
        previous_document_hash: previousHash || null,
        hash_control: hashControl,
        qr_code_payload: qrPayload,
        invoice_status: "N",
      })
      .select("id, document_number")
      .single();

    if (insertErr || !inserted) {
      return { ok: false, message: insertErr?.message || "Erro ao gravar Nota de Débito (ND)." };
    }

    try {
      await supabase.from("invoice_lines").insert({
        invoice_id: inserted.id,
        line_number: 1,
        item_type: "OUTRO",
        product_code: "PENAL-01",
        product_description: params.description || `Acréscimo ref. ${orig.document_number}`,
        quantity: 1,
        unit_of_measure: "UN",
        unit_price: amount,
        credit_amount: amount,
        debit_amount: 0,
        settlement_amount: 0,
        tax_type: "IVA",
        tax_country_region: "AO",
        tax_code: "ISE",
        tax_percentage: 0,
        tax_exemption_code: "M04",
        tax_exemption_reason: "Não sujeito a imposto",
      });
    } catch (lErr) {
      console.warn("issueDebitNote: invoice_lines non-fatal:", lErr);
    }

    if (params.sendEmailWithPdf !== false) {
      FiscalEmailService.sendDocumentEmail({
        invoiceId: inserted.id,
        studentId: orig.student_id || undefined,
      }).catch((emErr) => console.warn("issueDebitNote: auto email non-fatal:", emErr));
    }

    return {
      ok: true,
      invoiceId: inserted.id,
      documentNumber: inserted.document_number,
      docType: "ND",
      grossTotal: amount,
      hashControl,
    };
  }
}
