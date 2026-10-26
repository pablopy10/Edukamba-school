import { CreditNoteService, type IssueCreditNoteResult } from "./services/creditNoteService";

/**
 * Emite Nota de Crédito (NC) que retifica uma fatura existente (FT/FR).
 * Chama o serviço transacional e o Edge Function `emit-credit-note`.
 * 
 * Regras AGT:
 * - Numeração própria (NC EDK/1, NC EDK/2...)
 * - Vinculação estrita à fatura original
 * - Motivo justificado obrigatório (mínimo 6 caracteres)
 * - Trava de sobrecrédito e consistência de impostos
 * - Assinatura digital RSA-SHA1 encadeada
 */
export async function invokeCreditNote(
  invoiceId: string,
  reason: string,
  partialAmount?: number,
  selectedItemDesc?: string,
): Promise<IssueCreditNoteResult> {
  return CreditNoteService.issueCreditNote({
    originalInvoiceId: invoiceId,
    reason,
    partialAmount,
    selectedItemDesc,
  });
}
