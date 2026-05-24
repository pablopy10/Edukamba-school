/** Ex.: número completo tipo «FT EDK/42». */
export function formatDocumentNumber(series: string, docNumber: number): string {
  const s = series.trim().toUpperCase();
  return `FT ${s}/${docNumber}`;
}

/** Data da fatura (YYYY-MM-DD) sem hora. */
export function formatInvoiceDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d + "T12:00:00") : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Plaintext antes da assinatura RSA-SHA1 (regra habitual AGT Angola):
 * DataFatura;DataHoraCriacao;NumeroFatura;Total;HashFaturaAnterior
 * Se primeira fatura da série: HashAnterior vazio no fim (; terminando sem hash ou string vazia após último ;).
 */
export function buildAgtSigningPlaintext(input: {
  invoiceDateYYYYMMDD: string;
  /** ISO8601 com data e hora de criação */
  issuedAtISO: string;
  /** NumeroFatura típico: «FT EDK/1» (sem prefixo espaços em excesso). */
  documentNumberFull: string;
  /** Total monetário como string decimal (pt: vírgula evitada; usar ponto) */
  totalAmountString: string;
  /** Assinatura Base64 do documento anterior; vazio na 1ª fatura. */
  previousDocumentHash: string;
}): string {
  const { invoiceDateYYYYMMDD, issuedAtISO, documentNumberFull, totalAmountString, previousDocumentHash } = input;
  const prev = (previousDocumentHash ?? "").trim();
  // Formato AGT: YYYY-MM-DDTHH:MM:SS (sem milissegundos, sem Z)
  const issuedAtClean = issuedAtISO.replace(/\.\d{3}Z$/, "").replace(/Z$/, "");
  return `${invoiceDateYYYYMMDD};${issuedAtClean};${documentNumberFull};${totalAmountString};${prev}`;
}

/** SHA-1 (hex minúsculo) — para campo document_hash na cadeia. */
export async function sha1HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Cronologia fiscal: nova data não pode ser anterior ao último documento já emitido
 * para a mesma escola/série (comparar apenas YYYY-MM-DD).
 */
export function assertInvoiceDateChronology(lastIssuedDateYYYYMMDD: string | null | undefined, newDateYYYYMMDD: string): void {
  if (!lastIssuedDateYYYYMMDD || !lastIssuedDateYYYYMMDD.trim()) return;
  const a = lastIssuedDateYYYYMMDD.slice(0, 10);
  const b = newDateYYYYMMDD.slice(0, 10);
  if (b < a) {
    throw new Error(
      `Cronologia fiscal: a data (${b}) não pode ser anterior ao último documento emitido (${a}).`,
    );
  }
}

export function formatTotalForSigning(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}
