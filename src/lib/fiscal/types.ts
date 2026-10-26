export type FiscalDocType = "FT" | "FR" | "NC" | "ND" | "PF" | "RC";

export type FiscalInvoiceStatus = "N" | "A" | "S"; // Normal, Anulado, Autofaturação

export interface FiscalTaxRate {
  taxType: "IVA";
  taxCountryRegion: "AO";
  taxCode: "NOR" | "RED" | "ISE" | string;
  taxPercentage: number; // 14, 7, 5, 0
  description: string;
}

export interface FiscalTaxSummaryItem {
  taxCode: string;
  taxPercentage: number;
  taxBase: number;
  taxAmount: number;
  taxExemptionCode?: string;
  taxExemptionReason?: string;
}

export interface FiscalLineInput {
  lineNumber?: number;
  productCode: string;
  productDescription: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  /** Desconto comercial percentual na linha (ex: 10 para 10%) */
  discountPct?: number;
  /** Desconto comercial em valor absoluto na linha */
  discountAmount?: number;
  /** Taxa de IVA (ex: 14, 7, 5, 0) */
  taxPercentage: number;
  /** Código de taxa AGT: 'NOR' (14%), 'RED' (7%/5%), 'ISE' (0%) */
  taxCode?: "NOR" | "RED" | "ISE" | string;
  /** Código oficial de isenção AGT (obrigatório se taxa for 0, ex: 'M02', 'M04', 'M11') */
  taxExemptionCode?: string;
  /** Motivo da isenção (obrigatório se taxa for 0, ex: 'Isenção no domínio da educação') */
  taxExemptionReason?: string;
  /** Número da fatura original retificada na linha (NC) */
  referencedDocumentNumber?: string;
}

export interface CalculatedFiscalLine extends FiscalLineInput {
  lineNumber: number;
  unitOfMeasure: string;
  taxCode: string;
  grossAmountBeforeDiscount: number;
  effectiveDiscountAmount: number;
  netAmount: number; // Base de incidência do imposto
  taxAmount: number;
  totalGrossAmount: number; // NetAmount + TaxAmount
}

export interface FiscalDocumentInput {
  schoolId: string;
  docType: FiscalDocType;
  seriesCode: string;
  fiscalYear?: number;
  invoiceDate: string | Date;
  systemEntryDate?: string | Date;
  customerNif?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerCountry?: string;
  lines: FiscalLineInput[];
  /** Desconto global no cabeçalho em percentagem (ex: 5%) */
  discountGlobalPct?: number;
  /** Desconto global no cabeçalho em valor fixo (ex: 1000 Kz) */
  discountGlobalAmount?: number;
  /** Dados específicos para Nota de Crédito (NC) */
  creditNoteDetails?: {
    originalDocumentNumber: string;
    originalDocumentDate: string;
    rectificationReason: string;
    referencedInvoiceId?: string;
  };
  /** Dados de conversão de Pró-Forma (PF) */
  proformaConversion?: {
    sourceProformaId: string;
    proformaNumber: string;
    proformaDate?: string;
  };
  /** Pagamento / Liquidação */
  paymentMethod?: string;
  paymentDate?: string;
}

export interface CalculatedFiscalDocument {
  docType: FiscalDocType;
  lines: CalculatedFiscalLine[];
  subtotalGross: number; // Soma dos preços x quantidade antes de descontos
  totalLineDiscounts: number;
  globalDiscountAmount: number;
  totalDiscountAmount: number;
  totalNet: number; // Incidência total do imposto
  totalTax: number; // Total IVA
  totalGross: number; // Total a pagar (TotalNet + TotalTax)
  taxSummary: FiscalTaxSummaryItem[];
}

export interface FiscalSeriesRecord {
  id?: string;
  schoolId: string;
  seriesCode: string;
  documentType: FiscalDocType;
  fiscalYear: number;
  startingNumber: number;
  currentNumber: number;
  lastHash: string;
  lastDocumentDate?: string | null;
  isActive: boolean;
  isClosed: boolean;
  documentsEmittedCount: number;
}

export interface EmittedFiscalDocument {
  id?: string;
  schoolId: string;
  docType: FiscalDocType;
  seriesCode: string;
  docNumber: number;
  documentNumber: string; // Ex: 'FT 2026/1'
  fiscalYear: number;
  invoiceDate: string; // YYYY-MM-DD
  systemEntryDate: string; // YYYY-MM-DDTHH:MM:SS
  customerNif: string;
  customerName: string;
  customerAddress?: string;
  customerCity?: string;
  customerCountry: string;
  lines: CalculatedFiscalLine[];
  subtotalNet: number;
  discountGlobalAmount: number;
  taxPayable: number;
  grossTotal: number;
  taxSummary: FiscalTaxSummaryItem[];
  // Criptografia e AGT
  plaintext: string;
  hash: string; // Assinatura RSA-SHA1 Base64
  hashControl: string; // 4 caracteres (1º, 11º, 21º, 31º)
  documentHashSha1Hex: string;
  previousDocumentHash: string;
  certificationFooter: string;
  qrCodePayload: string;
  qrCodeDataUrl?: string;
  // Rastreabilidade
  referencedDocumentNumber?: string;
  referencedDocumentDate?: string;
  rectificationReason?: string;
  orderReferencePP?: string;
  sourceProformaId?: string;
  status: FiscalInvoiceStatus;
}
