/** Motivos de anulação directa (método B — sem NC). Texto guardado em `invoices.cancellation_reason`. */

export const FISCAL_CANCELLATION_REASON_CODES = [
  "data_error_nif",
  "duplicate",
  "return_exchange",
  "value_error",
  "other",
] as const;

export type FiscalCancellationReasonCode = (typeof FISCAL_CANCELLATION_REASON_CODES)[number];

export const FISCAL_CANCELLATION_REASON_LABELS_PT: Record<FiscalCancellationReasonCode, string> = {
  data_error_nif: "Erro de dados/NIF do cliente",
  duplicate: "Duplicação de fatura",
  return_exchange: "Devolução ou troca",
  value_error: "Erro de valores ou imposto",
  other: "Outro motivo",
};

/** Texto persistido na BD (mín. 6 caracteres para SAF-T Reason e constraint SQL). */
export function resolveCancellationReasonText(
  code: FiscalCancellationReasonCode,
  customDetail?: string,
): string {
  if (code === "other") {
    const t = customDetail?.trim() ?? "";
    if (t.length >= 6) return t.slice(0, 200);
    throw new Error("Indique o motivo da anulação (mínimo 6 caracteres).");
  }
  return FISCAL_CANCELLATION_REASON_LABELS_PT[code];
}
