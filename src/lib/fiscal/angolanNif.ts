/** Consumidor genérico / contribuinte inválido (AGT Angola). */
export const CONSUMER_FALLBACK_NIF = "999999999";

/** NIF Angola: esperado exactamente 10 dígitos. */
export function digitsOnly(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw.replace(/\D/g, "").trim();
}

export function validateAngolanNif(nif: string | null | undefined): boolean {
  const d = digitsOnly(nif);
  return /^\d{10}$/.test(d);
}

/**
 * Ao emitir FT: usar NIF do aluno (`students.tax_id`); caso contrário encarregado (`profiles.tax_id`);
 * senão contribuinte genérico consumidor final.
 * Aceita NIF numérico (9-10 dígitos) ou BI alfanumérico angolano (ex: 001699891LA037).
 */
export function resolveInvoiceCustomerNif(studentTaxId: string | null | undefined, parentTaxId: string | null | undefined): string {
  const normalize = (raw: string | null | undefined): string => raw?.trim() ?? "";
  const isValidNif = (val: string): boolean => {
    if (!val) return false;
    if (/^[0-9]{9,10}$/.test(val)) return true;
    if (/^[0-9A-Za-z]{6,14}$/.test(val)) return true;
    return false;
  };
  const fromStudent = normalize(studentTaxId);
  if (isValidNif(fromStudent)) return fromStudent.toUpperCase();
  const fromParent = normalize(parentTaxId);
  if (isValidNif(fromParent)) return fromParent.toUpperCase();
  return CONSUMER_FALLBACK_NIF;
}
