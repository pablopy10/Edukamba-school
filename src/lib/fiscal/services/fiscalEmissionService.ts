import {
  CalculatedFiscalDocument,
  EmittedFiscalDocument,
  FiscalDocType,
  FiscalDocumentInput,
  FiscalSeriesRecord,
} from "../types";
import { calculateFiscalDocument, formatMoney, roundMoney } from "./fiscalCalculations";
import {
  buildAgtSigningPlaintext,
  buildCertificationFooter,
  calculateSha1Hex,
  extractHashControl,
  formatSystemEntryDate,
  signPlaintextRSA_SHA1,
} from "../crypto/agtCrypto";
import { buildAgtQrPayload, generateAgtQrDataUrl } from "../qr/agtQrCode";
import { FiscalSeriesService } from "./fiscalSeriesService";

export const GENERIC_CONSUMER_NIF = "999999999";
export const GENERIC_CONSUMER_NAME = "Consumidor Final";

export interface EmitDocumentOptions {
  series: FiscalSeriesRecord;
  schoolNif: string;
  privateKeyPem: string;
  certificationNumber?: string;
  softwareVersion?: string;
  generateQrDataUrl?: boolean;
}

export interface EmitDocumentResult {
  document: EmittedFiscalDocument;
  updatedSeries: FiscalSeriesRecord;
}

/**
 * Serviço central de emissão de documentos fiscais certificados da AGT Angola.
 */
export class FiscalEmissionService {
  /**
   * Resolve o NIF e Nome do adquirente: se não fornecido, aplica Consumidor Final (999999999).
   */
  static resolveCustomerIdentity(customerNif?: string | null, customerName?: string | null): {
    nif: string;
    name: string;
  } {
    const rawNif = (customerNif ?? "").trim();
    const rawName = (customerName ?? "").trim();

    if (!rawNif || rawNif === GENERIC_CONSUMER_NIF) {
      return {
        nif: GENERIC_CONSUMER_NIF,
        name: rawName || GENERIC_CONSUMER_NAME,
      };
    }

    return {
      nif: rawNif,
      name: rawName || "Cliente",
    };
  }

  /**
   * Emite um documento fiscal com conformidade plena com o Decreto Presidencial n.º 292/18.
   */
  static async emitDocument(
    input: FiscalDocumentInput,
    options: EmitDocumentOptions
  ): Promise<EmitDocumentResult> {
    const { series, schoolNif, privateKeyPem } = options;
    const certNumber = options.certificationNumber ?? "0/AGT/2026";
    const softVersion = options.softwareVersion ?? "1.0.0";

    // 1. Validar e resolver identidade do cliente
    const customer = FiscalEmissionService.resolveCustomerIdentity(
      input.customerNif,
      input.customerName
    );

    // 2. Validações específicas por tipo de documento
    if (input.docType === "NC") {
      if (!input.creditNoteDetails) {
        throw new Error(
          "A emissão de Nota de Crédito (NC) exige creditNoteDetails com documento de origem e motivo."
        );
      }
      if (!input.creditNoteDetails.originalDocumentNumber?.trim()) {
        throw new Error("Nota de Crédito: o campo originalDocumentNumber é obrigatório.");
      }
      if (!input.creditNoteDetails.rectificationReason?.trim()) {
        throw new Error("Nota de Crédito: a fundamentação / motivo de retificação é obrigatória.");
      }
    }

    // 3. Normalizar datas
    const invoiceDateStr =
      input.invoiceDate instanceof Date
        ? input.invoiceDate.toISOString().slice(0, 10)
        : input.invoiceDate.trim().slice(0, 10);

    const systemEntryDateStr = formatSystemEntryDate(input.systemEntryDate ?? new Date());

    // 4. Executar cálculo financeiro rigoroso (linhas, descontos, IVA, microvalores)
    const calculation: CalculatedFiscalDocument = calculateFiscalDocument(input);

    // 5. Reservar número sequencial na série apropriada com validação cronológica
    const { updatedSeries: seriesWithNumber, reservation } = FiscalSeriesService.reserveNextNumber(
      series,
      invoiceDateStr
    );

    const documentNumberFull = reservation.documentNumberFull;
    const docNumber = reservation.docNumber;
    const previousDocumentHash = reservation.previousDocumentHash;

    // 6. Criptografia RSA-SHA1 e Assinatura AGT
    let plaintext = "";
    let signatureBase64 = "";
    let hashControl = "";
    let documentHashSha1Hex = "";
    let certificationFooter = "";

    // Proforma (PF) não gera hash comercial nem encadeia em série fiscal comercial
    if (input.docType === "PF") {
      plaintext = `PROFORMA;${invoiceDateStr};${documentNumberFull};${formatMoney(calculation.totalGross)}`;
      documentHashSha1Hex = calculateSha1Hex(plaintext);
      signatureBase64 = "N/A - DOCUMENTO PRELIMINAR";
      hashControl = "PF00";
      certificationFooter = "Este documento não serve de fatura";
    } else {
      plaintext = buildAgtSigningPlaintext({
        invoiceDateYYYYMMDD: invoiceDateStr,
        systemEntryDateISO: systemEntryDateStr,
        documentNumberFull,
        grossTotal: calculation.totalGross,
        previousDocumentHash,
      });

      documentHashSha1Hex = calculateSha1Hex(plaintext);
      signatureBase64 = signPlaintextRSA_SHA1(plaintext, privateKeyPem);
      hashControl = extractHashControl(signatureBase64);
      certificationFooter = buildCertificationFooter(hashControl, certNumber, softVersion);
    }

    // 7. Gerar Payload do QR Code Oficial AGT
    const qrCodePayload = buildAgtQrPayload({
      nifEmissor: schoolNif,
      nifCliente: customer.nif,
      pais: input.customerCountry || "AO",
      tipoDoc: input.docType,
      estado: "N",
      data: invoiceDateStr,
      numDoc: documentNumberFull,
      hash4Chars: hashControl,
      totalLiquido: calculation.totalNet,
      totalIva: calculation.totalTax,
      totalDocumento: calculation.totalGross,
    });

    let qrCodeDataUrl: string | undefined;
    if (options.generateQrDataUrl) {
      try {
        qrCodeDataUrl = await generateAgtQrDataUrl(qrCodePayload);
      } catch (e) {
        console.warn("Aviso: falha ao gerar imagem do QR Code:", e);
      }
    }

    // 8. Confirmar encadeamento na série (apenas para documentos fiscais que encadeiam)
    let finalizedSeries = seriesWithNumber;
    if (input.docType !== "PF") {
      finalizedSeries = FiscalSeriesService.commitDocumentEmission(
        seriesWithNumber,
        signatureBase64,
        invoiceDateStr
      );
    }

    // 9. Construir o documento emitido final imutável
    const emittedDoc: EmittedFiscalDocument = {
      schoolId: input.schoolId,
      docType: input.docType,
      seriesCode: series.seriesCode,
      docNumber,
      documentNumber: documentNumberFull,
      fiscalYear: series.fiscalYear,
      invoiceDate: invoiceDateStr,
      systemEntryDate: systemEntryDateStr,
      customerNif: customer.nif,
      customerName: customer.name,
      customerAddress: input.customerAddress ?? undefined,
      customerCity: input.customerCity ?? undefined,
      customerCountry: input.customerCountry || "AO",
      lines: calculation.lines,
      subtotalNet: calculation.totalNet,
      discountGlobalAmount: calculation.globalDiscountAmount,
      taxPayable: calculation.totalTax,
      grossTotal: calculation.totalGross,
      taxSummary: calculation.taxSummary,
      plaintext,
      hash: signatureBase64,
      hashControl,
      documentHashSha1Hex,
      previousDocumentHash,
      certificationFooter,
      qrCodePayload,
      qrCodeDataUrl,
      referencedDocumentNumber: input.creditNoteDetails?.originalDocumentNumber,
      referencedDocumentDate: input.creditNoteDetails?.originalDocumentDate,
      rectificationReason: input.creditNoteDetails?.rectificationReason,
      orderReferencePP: input.proformaConversion?.proformaNumber,
      sourceProformaId: input.proformaConversion?.sourceProformaId,
      status: "N",
    };

    return {
      document: emittedDoc,
      updatedSeries: finalizedSeries,
    };
  }

  /**
   * Converte uma Fatura Pró-Forma (PF) numa Fatura Comercial Definitiva (FT ou FR).
   */
  static async convertProformaToFiscalInvoice(params: {
    proforma: {
      id: string;
      documentNumber: string;
      issueDate: string;
      customerNif?: string | null;
      customerName?: string | null;
      lines: any[];
      discountGlobalPct?: number;
      discountGlobalAmount?: number;
    };
    targetDocType: "FT" | "FR";
    series: FiscalSeriesRecord;
    schoolNif: string;
    privateKeyPem: string;
    certificationNumber?: string;
    softwareVersion?: string;
  }): Promise<EmitDocumentResult> {
    const { proforma, targetDocType, ...options } = params;

    const input: FiscalDocumentInput = {
      schoolId: options.series.schoolId,
      docType: targetDocType,
      seriesCode: options.series.seriesCode,
      fiscalYear: options.series.fiscalYear,
      invoiceDate: new Date(),
      customerNif: proforma.customerNif,
      customerName: proforma.customerName,
      lines: proforma.lines,
      discountGlobalPct: proforma.discountGlobalPct,
      discountGlobalAmount: proforma.discountGlobalAmount,
      proformaConversion: {
        sourceProformaId: proforma.id,
        proformaNumber: proforma.documentNumber,
        proformaDate: proforma.issueDate,
      },
    };

    return FiscalEmissionService.emitDocument(input, options);
  }

  /**
   * Emite uma Nota de Crédito (NC) para estorno total ou parcial de uma fatura emitida.
   */
  static async emitCreditNote(params: {
    originalInvoice: EmittedFiscalDocument;
    reason: string;
    partialLines?: any[];
    seriesNC: FiscalSeriesRecord;
    schoolNif: string;
    privateKeyPem: string;
    certificationNumber?: string;
    softwareVersion?: string;
  }): Promise<EmitDocumentResult> {
    const { originalInvoice, reason, partialLines, seriesNC, ...opts } = params;

    if (!reason || reason.trim().length < 5) {
      throw new Error("A Nota de Crédito exige uma fundamentação válida com pelo menos 5 caracteres.");
    }

    // Se partialLines não for fornecido, estorna a totalidade das linhas da fatura original
    const linesToCredit = partialLines || originalInvoice.lines.map((l) => ({
      productCode: l.productCode,
      productDescription: l.productDescription,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      discountAmount: l.discountAmount,
      taxPercentage: l.taxPercentage,
      taxCode: l.taxCode,
      taxExemptionCode: l.taxExemptionCode,
      taxExemptionReason: l.taxExemptionReason,
    }));

    const input: FiscalDocumentInput = {
      schoolId: originalInvoice.schoolId,
      docType: "NC",
      seriesCode: seriesNC.seriesCode,
      fiscalYear: seriesNC.fiscalYear,
      invoiceDate: new Date(),
      customerNif: originalInvoice.customerNif,
      customerName: originalInvoice.customerName,
      lines: linesToCredit,
      creditNoteDetails: {
        originalDocumentNumber: originalInvoice.documentNumber,
        originalDocumentDate: originalInvoice.invoiceDate,
        rectificationReason: reason.trim(),
        referencedInvoiceId: originalInvoice.id,
      },
    };

    return FiscalEmissionService.emitDocument(input, {
      series: seriesNC,
      ...opts,
    });
  }

  /**
   * Verificação de imutabilidade: impede alteração ou eliminação de documentos gravados.
   */
  static assertDocumentImmutability(action: "UPDATE" | "DELETE", doc: EmittedFiscalDocument): void {
    if (action === "DELETE") {
      throw new Error(
        `Violação de Integridade Fiscal: O documento ${doc.documentNumber} já foi emitido e assinado pela AGT e JAMAIS pode ser eliminado.`
      );
    }
    if (action === "UPDATE") {
      throw new Error(
        `Violação de Integridade Fiscal: O documento ${doc.documentNumber} é imutável. Quaisquer alterações devem ser feitas exclusivamente via emissão de Nota de Crédito (NC).`
      );
    }
  }
}
