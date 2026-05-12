import {
  assertInvoiceDateChronology,
  buildAgtSigningPlaintext,
  formatDocumentNumber,
  formatInvoiceDate,
  formatTotalForSigning,
  sha1HexUtf8,
} from "./agtSigning";
import { resolveInvoiceCustomerNif } from "./angolanNif";

export type InvoicePreviewInput = {
  schoolId: string;
  series: string;
  docNumber: number;
  invoiceDate: Date | string;
  issuedAt?: Date;
  grossTotal: number;
  /** Data (YYYY-MM-DD) do último documento já emitido — validação cronológica AGT */
  lastIssuedInvoiceDateYYYYMMDD?: string | null;
  /** Hash SHA-1 hex do doc anterior para o plaintext */
  previousDocumentHash?: string;
  clienteNome: string;
  studentTaxId?: string | null;
  parentTaxId?: string | null;
};

export type InvoicePreviewPayload = {
  document_number: string;
  invoice_date_yyyymmdd: string;
  invoice_issued_at_iso: string;
  plaintext: string;
  total_string: string;
  cliente_nif: string;
  hash_control_stub: string;
};

/**
 * Motor fiscal AGT — assinatura RSA-SHA1 do plaintext e cadeia de hash.
 * A chave privada PKCS#8 PEM deve ficar apenas em servidor / Edge Function.
 */
export class AgtFiscalEngine {
  private readonly privateKeyPem: string | undefined;

  constructor(opts?: { privateKeyPem?: string }) {
    this.privateKeyPem = opts?.privateKeyPem?.trim() || undefined;
  }

  static resolveClienteNif = resolveInvoiceCustomerNif;

  static formatDocumentNumber = formatDocumentNumber;

  previewSigningPayload(input: InvoicePreviewInput): InvoicePreviewPayload {
    const issuedAt = input.issuedAt ?? new Date();
    const issuedISO = issuedAt.toISOString();
    const invoiceDateYYYYMMDD = formatInvoiceDate(input.invoiceDate);
    const numero = AgtFiscalEngine.formatDocumentNumber(input.series, input.docNumber);
    const prevHashForPlaintext =
      input.docNumber <= 1 || !input.previousDocumentHash?.trim()
        ? ""
        : input.previousDocumentHash.trim();
    const totalStr = formatTotalForSigning(input.grossTotal);

    assertInvoiceDateChronology(input.lastIssuedInvoiceDateYYYYMMDD ?? undefined, invoiceDateYYYYMMDD);

    const plaintext = buildAgtSigningPlaintext({
      invoiceDateYYYYMMDD,
      issuedAtISO: issuedISO,
      documentNumberFull: numero,
      totalAmountString: totalStr,
      previousDocumentHash: prevHashForPlaintext,
    });

    const cliente_nif = AgtFiscalEngine.resolveClienteNif(input.studentTaxId, input.parentTaxId);

    return {
      document_number: numero,
      invoice_date_yyyymmdd: invoiceDateYYYYMMDD,
      invoice_issued_at_iso: issuedISO,
      plaintext,
      total_string: totalStr,
      cliente_nif,
      hash_control_stub: (((Math.max(input.docNumber, 1) - 1) % 10) + 1).toString(),
    };
  }

  async finalizeHashes(plaintext: string): Promise<{ document_hash_sha1_hex: string }> {
    const document_hash_sha1_hex = await sha1HexUtf8(plaintext);
    return { document_hash_sha1_hex };
  }

  /**
   * RSA PKCS#1 v1.5 com SHA-1 (Web Crypto).
   */
  async signPlaintextRSA_SHA1_PKCS1(plaintext: string, overridePem?: string): Promise<{ signatureBase64: string }> {
    const pem = (overridePem ?? this.privateKeyPem)?.trim();
    if (!pem) {
      throw new Error(
        "Chave privada não configurada. Use Edge Function ou variável secreta PEM.",
      );
    }
    const pkcs8 = pemToPkcs8Der(pem);
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(plaintext),
    );
    const signatureBase64 = arrayBufferToBase64(sig);
    return { signatureBase64 };
  }

  async buildPreviewHashes(
    input: InvoicePreviewInput,
  ): Promise<InvoicePreviewPayload & { document_hash_sha1_hex: string }> {
    const base = this.previewSigningPayload(input);
    const hashes = await this.finalizeHashes(base.plaintext);
    return { ...base, ...hashes };
  }
}

/** Base64 encoding without spreading the whole byte array onto the stack. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function pemToPkcs8Der(pem: string): ArrayBuffer {
  const lines = pem.split(/\r?\n/).filter((l) => l && !l.startsWith("-----"));
  const b64 = lines.join("");
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
}
