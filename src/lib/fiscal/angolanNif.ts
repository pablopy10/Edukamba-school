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
 */
export function resolveInvoiceCustomerNif(studentTaxId: string | null | undefined, parentTaxId: string | null | undefined): string {
  const fromStudent = digitsOnly(studentTaxId);
  if (fromStudent.length === 10) return fromStudent;
  const fromParent = digitsOnly(parentTaxId);
  if (fromParent.length === 10) return fromParent;
  return CONSUMER_FALLBACK_NIF;
}
