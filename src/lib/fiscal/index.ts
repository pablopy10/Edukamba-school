/**
 * Módulo de Faturação e Certificação Fiscal AGT Angola — EduKamba
 *
 * Implementa integralmente as normas fiscais angolanas:
 * - Decreto Presidencial n.º 292/18 (Certificação de Software de Faturação)
 * - Código do IVA de Angola (CIVA) - Artigo 12.º e tabela de isenções (M02, M04, M11, etc.)
 * - Especificações Técnicas SAF-T (AO) 1.01_01 e QR Code Oficial AGT
 */

// Criptografia e Assinatura RSA-SHA1
export {
  getHashControl,
  extractHashControl,
  buildAgtSigningPlaintext,
  calculateSha1Hex,
  buildCertificationFooter,
  signPlaintextRSA_SHA1,
  verifyAgtSignature,
  formatMoneyDecimal,
  formatSystemEntryDate,
} from "./crypto/agtCrypto";

// QR Code Estruturado Oficial AGT
export {
  buildAgtQrPayload,
  buildAgtQrUrl,
  parseAgtQrPayload,
  generateAgtQrDataUrl,
} from "./qr/agtQrCode";
export type { AgtQrParams } from "./qr/agtQrCode";

// Regras Fiscais para Educação (Propinas, Matrículas, Transporte, etc.)
export {
  EDUCATIONAL_TAX_RULES,
  detectEducationalCategory,
  getTaxRuleForLine,
} from "./educationalTaxRules";
export type {
  EducationalServiceCategory,
  EducationalTaxRule,
} from "./educationalTaxRules";

// Gerador de PDF Certificado (jsPDF A4)
export {
  buildInvoicePdf,
  resolveFiscalInvoicePdfInput,
  fetchLogoAsDataUrl,
} from "./invoicePdf";
export type {
  FiscalInvoiceLine,
  FiscalInvoicePdfInput,
} from "./invoicePdf";

// Serviços e Tipos Gerais
export { FiscalEmissionService } from "./services/fiscalEmissionService";
export { FiscalSeriesService } from "./services/fiscalSeriesService";
export { CreditNoteService, issueCreditNote } from "./services/creditNoteService";
export { calculateFiscalDocument } from "./services/fiscalCalculations";
export { AgtFiscalEngine } from "./AgtFiscalEngine";
export type * from "./types";

