/** 
 * Motivos de emissão de Nota de Crédito (NC) — Regras AGT Angola
 * NC retifica FT existente sem apagar ou editar o documento original
 */

export const CREDIT_NOTE_REASON_CODES = [
  "data_error",
  "value_error",
  "enrollment_cancellation",
  "commercial_discount",
  "service_not_provided",
  "duplicate_charge",
  "other",
] as const;

export type CreditNoteReasonCode = (typeof CREDIT_NOTE_REASON_CODES)[number];

export const CREDIT_NOTE_REASON_LABELS_PT: Record<CreditNoteReasonCode, string> = {
  data_error: "Erro de digitação nos dados",
  value_error: "Erro no valor cobrado",
  enrollment_cancellation: "Desistência de matrícula",
  commercial_discount: "Desconto comercial concedido",
  service_not_provided: "Serviço não prestado",
  duplicate_charge: "Cobrança duplicada",
  other: "Outro motivo",
};

/**
 * Valida a justificativa da Nota de Crédito conforme exigência AGT (mínimo 6 caracteres).
 */
export function validateCreditNoteReason(reasonText: string): { isValid: boolean; error?: string } {
  const t = reasonText?.trim() ?? "";
  if (!t) {
    return { isValid: false, error: "A justificativa da nota de crédito é obrigatória." };
  }
  if (t.length < 6) {
    return { isValid: false, error: "A justificativa deve ter no mínimo 6 caracteres." };
  }
  return { isValid: true };
}

/**
 * Resolve o texto do motivo para persistir na BD e exibir no PDF/XML.
 * Mínimo 6 caracteres conforme requisito AGT para campo Reason.
 */
export function resolveCreditNoteReasonText(
  code: CreditNoteReasonCode,
  customDetail?: string,
): string {
  if (code === "other") {
    const t = customDetail?.trim() ?? "";
    if (t.length >= 6) return t.slice(0, 200);
    throw new Error("Indique o motivo da nota de crédito (mínimo 6 caracteres).");
  }
  const base = CREDIT_NOTE_REASON_LABELS_PT[code] || "Retificação de fatura";
  if (customDetail?.trim()) {
    return `${base}: ${customDetail.trim()}`.slice(0, 200);
  }
  return base;
}
