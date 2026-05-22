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
  return CREDIT_NOTE_REASON_LABELS_PT[code];
}
