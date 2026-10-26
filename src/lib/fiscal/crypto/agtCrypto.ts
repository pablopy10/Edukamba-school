import forge from "node-forge";

export interface AgtSigningPlaintextInput {
  invoiceDateYYYYMMDD: string;
  systemEntryDateISO: string;
  documentNumberFull: string;
  grossTotal: number | string;
  previousDocumentHash?: string | null;
}

export interface AgtSignatureResult {
  plaintext: string;
  documentHashSha1Hex: string;
  signatureBase64: string;
  hashControl: string;
  certificationFooter: string;
}

/**
 * Normaliza chave PEM privada (removendo aspas acidentais e tratando quebras de linha).
 */
export function normalizePrivateKeyPem(raw: string): string {
  let pem = raw.trim();
  if (!pem) return "";
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim();
  }
  return pem.replace(/\\n/g, "\n").trim();
}

/**
 * Normaliza chave PEM pública.
 */
export function normalizePublicKeyPem(raw: string): string {
  let pem = raw.trim();
  if (!pem) return "";
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim();
  }
  return pem.replace(/\\n/g, "\n").trim();
}

/**
 * Formata valor monetário com 2 casas decimais e ponto (padrão AGT).
 */
export function formatMoneyDecimal(amount: number | string): string {
  const num = typeof amount === "number" ? amount : parseFloat(amount);
  if (isNaN(num)) return "0.00";
  // Arredondamento half-up padrão bancário
  return (Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * Limpa timestamp para o padrão AGT: YYYY-MM-DDTHH:MM:SS (sem milissegundos, sem Z).
 */
export function formatSystemEntryDate(isoOrDate: string | Date): string {
  if (isoOrDate instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = isoOrDate.getFullYear();
    const m = pad(isoOrDate.getMonth() + 1);
    const d = pad(isoOrDate.getDate());
    const h = pad(isoOrDate.getHours());
    const min = pad(isoOrDate.getMinutes());
    const s = pad(isoOrDate.getSeconds());
    return `${y}-${m}-${d}T${h}:${min}:${s}`;
  }
  return isoOrDate
    .trim()
    .replace(/\.\d{3}Z$/, "")
    .replace(/Z$/, "")
    .slice(0, 19);
}

/**
 * Constrói a string de assinatura oficial AGT:
 * DocumentDate;SystemEntryDate;DocumentNumber;GrossTotal;PreviousDocumentHash
 */
export function buildAgtSigningPlaintext(input: AgtSigningPlaintextInput): string {
  const invoiceDate = input.invoiceDateYYYYMMDD.trim().slice(0, 10);
  const systemEntryDate = formatSystemEntryDate(input.systemEntryDateISO);
  const docNumber = input.documentNumberFull.trim();
  const total = formatMoneyDecimal(input.grossTotal);
  const prevHash = (input.previousDocumentHash ?? "").trim();

  return `${invoiceDate};${systemEntryDate};${docNumber};${total};${prevHash}`;
}

/**
 * Calcula o hash SHA-1 em hexadecimal (minúsculo) para o texto fornecido.
 */
export function calculateSha1Hex(text: string): string {
  const md = forge.md.sha1.create();
  md.update(text, "utf8");
  return md.digest().toHex().toLowerCase();
}

/**
 * Extração dos 4 Caracteres do Hash (1.º, 11.º, 21.º e 31.º caracteres da assinatura SHA-1):
 * Padrão oficial AGT para exibição em rodapés de documentos certificados.
 */
export function getHashControl(hash: string): string {
  if (!hash || hash.length < 31) return "";
  return `${hash[0]}${hash[10]}${hash[20]}${hash[30]}`;
}

/**
 * Extrai os 4 caracteres de controlo para impressão:
 * 1.º, 11.º, 21.º e 31.º caracteres da assinatura digital Base64 (índices 0, 10, 20, 30).
 */
export function extractHashControl(signatureBase64: string): string {
  const sig = signatureBase64?.trim() ?? "";
  if (!sig) return "";
  if (sig.length < 31) {
    // Fallback se chave for menor em testes fictícios
    return sig.slice(0, 4).padEnd(4, "0");
  }
  return getHashControl(sig);
}

/**
 * Monta o texto de rodapé legal obrigatório com a menção de certificação AGT.
 */
export function buildCertificationFooter(
  hashControl: string,
  certNumber = "0/AGT/2026",
  version = "1.0.0"
): string {
  return `${hashControl} - Processado por programa validado n.º ${certNumber} Edukamba v${version}`;
}

/**
 * Assina o plaintext com chave privada RSA (PKCS#1 v1.5 com SHA-1) e devolve a assinatura em Base64.
 */
export function signPlaintextRSA_SHA1(plaintext: string, privateKeyPem: string): string {
  const pem = normalizePrivateKeyPem(privateKeyPem);
  if (!pem || !/PRIVATE KEY/.test(pem)) {
    throw new Error("Chave privada RSA inválida ou vazia.");
  }

  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(pem);
  } catch (err) {
    throw new Error(
      `Falha ao importar chave privada RSA: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const md = forge.md.sha1.create();
  md.update(plaintext, "utf8");
  const signatureBytes = privateKey.sign(md);
  return forge.util.encode64(signatureBytes);
}

/**
 * Valida a assinatura digital RSA-SHA1 com a chave pública correspondente.
 */
export function verifyAgtSignature(
  plaintext: string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  const pem = normalizePublicKeyPem(publicKeyPem);
  if (!pem || !/PUBLIC KEY/.test(pem)) {
    throw new Error("Chave pública RSA inválida ou vazia.");
  }

  try {
    const publicKey = forge.pki.publicKeyFromPem(pem);
    const md = forge.md.sha1.create();
    md.update(plaintext, "utf8");
    const signatureBytes = forge.util.decode64(signatureBase64.trim());
    return publicKey.verify(md.digest().bytes(), signatureBytes);
  } catch (err) {
    console.error("Erro na verificação da assinatura RSA:", err);
    return false;
  }
}

/**
 * Executa o fluxo criptográfico completo da AGT para um documento fiscal.
 */
export function signAgtDocument(
  input: AgtSigningPlaintextInput,
  privateKeyPem: string,
  opts?: { certNumber?: string; softwareVersion?: string }
): AgtSignatureResult {
  const plaintext = buildAgtSigningPlaintext(input);
  const documentHashSha1Hex = calculateSha1Hex(plaintext);
  const signatureBase64 = signPlaintextRSA_SHA1(plaintext, privateKeyPem);
  const hashControl = extractHashControl(signatureBase64);
  const certificationFooter = buildCertificationFooter(
    hashControl,
    opts?.certNumber,
    opts?.softwareVersion
  );

  return {
    plaintext,
    documentHashSha1Hex,
    signatureBase64,
    hashControl,
    certificationFooter,
  };
}

/**
 * Valida a cronologia fiscal: data do novo documento não pode ser anterior ao último da série.
 */
export function validateInvoiceChronology(
  lastIssuedDateYYYYMMDD: string | null | undefined,
  newDateYYYYMMDD: string
): void {
  if (!lastIssuedDateYYYYMMDD || !lastIssuedDateYYYYMMDD.trim()) return;
  const last = lastIssuedDateYYYYMMDD.trim().slice(0, 10);
  const next = newDateYYYYMMDD.trim().slice(0, 10);
  if (next < last) {
    throw new Error(
      `Violação de cronologia fiscal AGT: a data (${next}) não pode ser anterior ao último documento emitido na série (${last}).`
    );
  }
}
