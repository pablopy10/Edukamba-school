import { supabase } from "@/integrations/supabase/client";
import { emitCreditNoteDirect } from "../emitCreditNoteDirect";

export interface CreditNoteItemInput {
  description: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  taxPercentage?: number;
  taxCode?: string;
  taxExemptionCode?: string;
  taxExemptionReason?: string;
}

export interface IssueCreditNoteParams {
  originalInvoiceId: string;
  reason: string;
  partialAmount?: number;
  itemsToCredit?: CreditNoteItemInput[];
  selectedItemDesc?: string;
  adminUserId?: string;
}

export interface IssueCreditNoteResult {
  ok: boolean;
  message?: string;
  creditNoteId?: string;
  documentNumber?: string;
  sourceInvoiceNumber?: string;
  creditedAmount?: number;
  totalCredited?: number;
  creditStatus?: "NONE" | "PARTIALLY_CREDITED" | "FULLY_CREDITED";
  remainingBalance?: number;
  hashControl?: string;
}

/**
 * Service transacional de emissão de Notas de Crédito (NC) certificadas pela AGT.
 * Assegura:
 * - Validação de saldo e bloqueio de sobrecrédito (valor total creditado <= original)
 * - Série anual e encadeamento próprio de hash SHA-1
 * - Vinculação estrita à fatura original (original_invoice_id / number / date)
 * - Atualização de auditoria nos pagamentos (has_credit_note, credit_note_number, credited_amount)
 * - Transição para FULLY_CREDITED ou PARTIALLY_CREDITED
 */
export class CreditNoteService {
  /**
   * Calcula o saldo remanescente disponível para estorno de forma pura.
   */
  static calculateRemainingBalance(originalGross: number, alreadyCredited: number): number {
    const gross = Math.max(0, Number(originalGross) || 0);
    const credited = Math.max(0, Number(alreadyCredited) || 0);
    return Math.max(0, Math.round((gross - credited) * 100) / 100);
  }

  /**
   * Determina o próximo status de estorno (FULLY_CREDITED vs PARTIALLY_CREDITED).
   */
  static determineNextCreditStatus(params: {
    originalGross: number;
    alreadyCredited: number;
    newCreditAmount: number;
  }): "NONE" | "PARTIALLY_CREDITED" | "FULLY_CREDITED" {
    const totalCredit = (Number(params.alreadyCredited) || 0) + (Number(params.newCreditAmount) || 0);
    const gross = Number(params.originalGross) || 0;
    if (totalCredit >= gross - 0.01) {
      return "FULLY_CREDITED";
    }
    if (totalCredit > 0) {
      return "PARTIALLY_CREDITED";
    }
    return "NONE";
  }

  /**
   * Valida se o montante do pedido de estorno é válido e não excede o saldo disponível.
   */
  static validateCreditRequestAmount(params: {
    originalGross: number;
    alreadyCredited: number;
    requestedAmount: number;
  }): { isValid: boolean; error?: string } {
    const req = Number(params.requestedAmount);
    if (!Number.isFinite(req) || req <= 0) {
      return { isValid: false, error: "O valor a creditar deve ser superior a zero." };
    }
    const remaining = CreditNoteService.calculateRemainingBalance(
      params.originalGross,
      params.alreadyCredited
    );
    if (req > remaining + 0.01) {
      return {
        isValid: false,
        error: `O valor do crédito (${req} Kz) excede o saldo disponível para estorno (${remaining} Kz).`,
      };
    }
    return { isValid: true };
  }

  /**
   * Consulta o saldo disponível para estorno de uma fatura original.
   */
  static async getAvailableCreditBalance(invoiceId: string): Promise<{
    originalGrossTotal: number;
    alreadyCredited: number;
    remainingBalance: number;
    creditStatus: string;
    documentNumber: string;
    invoiceStatus: string;
  }> {
    const id = invoiceId.trim();
    const { data: inv, error } = await supabase
      .from("invoices")
      .select("id, document_number, gross_total, credit_status, invoice_status")
      .eq("id", id)
      .maybeSingle();

    if (error || !inv) {
      throw new Error(error?.message || "Fatura original não encontrada.");
    }

    const originalGrossTotal = Number(inv.gross_total || 0);

    const { data: ncs } = await supabase
      .from("invoices")
      .select("gross_total")
      .or(`original_invoice_id.eq.${id},referenced_invoice_id.eq.${id}`)
      .in("doc_type", ["NC", "nc"]);

    const alreadyCredited = (ncs || []).reduce((acc, row) => acc + Number(row.gross_total || 0), 0);
    const remainingBalance = Math.max(0, Math.round((originalGrossTotal - alreadyCredited) * 100) / 100);

    return {
      originalGrossTotal,
      alreadyCredited,
      remainingBalance,
      creditStatus: inv.credit_status || (alreadyCredited >= originalGrossTotal - 0.01 ? "FULLY_CREDITED" : alreadyCredited > 0 ? "PARTIALLY_CREDITED" : "NONE"),
      documentNumber: inv.document_number,
      invoiceStatus: inv.invoice_status || "N",
    };
  }

  /**
   * Emite uma Nota de Crédito executando a transação ACID no backend com lock pessimista.
   */
  static async issueCreditNote(params: IssueCreditNoteParams): Promise<IssueCreditNoteResult> {
    const invoiceId = params.originalInvoiceId?.trim();
    const reasonText = params.reason?.trim();

    if (!invoiceId) {
      return { ok: false, message: "Identificador da fatura de origem é obrigatório." };
    }

    if (!reasonText || reasonText.length < 6) {
      return {
        ok: false,
        message: "O motivo da nota de crédito é obrigatório e deve ter no mínimo 6 caracteres.",
      };
    }

    // Validação prévia de saldo
    try {
      const balance = await this.getAvailableCreditBalance(invoiceId);
      if (balance.invoiceStatus === "A") {
        return { ok: false, message: "Não é possível emitir Nota de Crédito para uma fatura já anulada." };
      }
      if (balance.remainingBalance <= 0.001) {
        return {
          ok: false,
          message: `A fatura ${balance.documentNumber} já se encontra totalmente estornada (100%).`,
        };
      }
      if (params.partialAmount && params.partialAmount > balance.remainingBalance + 0.01) {
        return {
          ok: false,
          message: `Sobrecrédito rejeitado: valor solicitado (${params.partialAmount} Kz) excede o saldo remanescente (${balance.remainingBalance} Kz).`,
        };
      }
    } catch (balErr) {
      console.warn("CreditNoteService: não foi possível pré-validar saldo no cliente:", balErr);
    }

    // 1. Tentar invocar Edge Function emit-credit-note
    try {
      const { data, error } = await supabase.functions.invoke("emit-credit-note", {
        body: {
          invoice_id: invoiceId,
          reason: reasonText,
          partial_amount: params.partialAmount ?? null,
          selected_item: params.selectedItemDesc ?? null,
          items_to_credit: params.itemsToCredit ?? null,
        },
      });

      if (!error && data && (data as Record<string, unknown>).ok === true) {
        const res = data as Record<string, unknown>;
        return {
          ok: true,
          creditNoteId: typeof res.credit_note_id === "string" ? res.credit_note_id : undefined,
          documentNumber: typeof res.document_number === "string" ? res.document_number : undefined,
          sourceInvoiceNumber: typeof res.source_invoice_number === "string" ? res.source_invoice_number : undefined,
          creditedAmount: typeof res.credited_amount === "number" ? res.credited_amount : undefined,
          totalCredited: typeof res.total_credited === "number" ? res.total_credited : undefined,
          creditStatus: res.credit_status as IssueCreditNoteResult["creditStatus"],
          remainingBalance: typeof res.remaining_balance === "number" ? res.remaining_balance : undefined,
          hashControl: typeof res.hash_control === "string" ? res.hash_control : undefined,
        };
      }

      if (error) {
        console.warn("[CreditNoteService] Edge Function avisou, ativando emissão direta resiliente:", error.message);
      }
    } catch (edgeErr) {
      console.warn("[CreditNoteService] Exceção ao chamar Edge Function, ativando emissão direta resiliente:", edgeErr);
    }

    // 2. Fallback resiliente direto no cliente com lock pessimista RPC
    return emitCreditNoteDirect(params);
  }
}

/**
 * Função utilitária exportada diretamente para interoperabilidade
 */
export const issueCreditNote = CreditNoteService.issueCreditNote.bind(CreditNoteService);
