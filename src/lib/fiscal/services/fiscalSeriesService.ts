import { FiscalDocType, FiscalSeriesRecord } from "../types";
import { validateInvoiceChronology } from "../crypto/agtCrypto";

export interface ReserveNumberResult {
  seriesCode: string;
  docNumber: number;
  documentNumberFull: string;
  previousDocumentHash: string;
  lastDocumentDate?: string | null;
}

/**
 * Serviço de gestão de séries fiscais multi-tenant em conformidade com as regras da AGT.
 * Na base de dados, a exclusividade e atomicidade são garantidas por lock pessimista (SELECT ... FOR UPDATE).
 */
export class FiscalSeriesService {
  /**
   * Formata a numeração oficial no padrão AGT:
   * {DocumentType} {Series}/{SequentialNumber}
   * Ex: FT 2026/1, FR 2026/54, NC 2026/1, PF 2026/1
   */
  static formatDocumentNumber(
    docType: FiscalDocType,
    seriesCode: string,
    sequentialNumber: number
  ): string {
    const type = docType.trim().toUpperCase();
    const series = seriesCode.trim().toUpperCase();
    return `${type} ${series}/${sequentialNumber}`;
  }

  /**
   * Inicializa uma nova série fiscal (setup inicial / onboarding).
   * Permite continuação de softwares legados com startingNumber e lastDocumentHash prévios.
   */
  static createInitialSeries(params: {
    schoolId: string;
    seriesCode: string;
    documentType: FiscalDocType;
    fiscalYear?: number;
    startingNumber?: number;
    lastDocumentDate?: string | null;
    lastDocumentHash?: string | null;
  }): FiscalSeriesRecord {
    const fiscalYear = params.fiscalYear ?? new Date().getFullYear();
    const startingNumber = Math.max(params.startingNumber ?? 1, 1);
    const lastHash = (params.lastDocumentHash ?? "").trim();

    return {
      schoolId: params.schoolId,
      seriesCode: params.seriesCode.trim().toUpperCase(),
      documentType: params.documentType,
      fiscalYear,
      startingNumber,
      currentNumber: startingNumber - 1,
      lastHash,
      lastDocumentDate: params.lastDocumentDate ?? null,
      isActive: true,
      isClosed: false,
      documentsEmittedCount: 0,
    };
  }

  /**
   * Reserva atomicamente o próximo número da série e valida integridade.
   */
  static reserveNextNumber(
    series: FiscalSeriesRecord,
    newDocumentDateYYYYMMDD: string
  ): { updatedSeries: FiscalSeriesRecord; reservation: ReserveNumberResult } {
    if (!series.isActive) {
      throw new Error(`A série fiscal ${series.seriesCode} encontra-se inativa.`);
    }
    if (series.isClosed) {
      throw new Error(`A série fiscal ${series.seriesCode} encontra-se encerrada.`);
    }

    // Validação estrita de cronologia fiscal AGT
    validateInvoiceChronology(series.lastDocumentDate, newDocumentDateYYYYMMDD);

    const nextNumber =
      series.documentsEmittedCount === 0
        ? series.startingNumber
        : series.currentNumber + 1;

    const documentNumberFull = FiscalSeriesService.formatDocumentNumber(
      series.documentType,
      series.seriesCode,
      nextNumber
    );

    const previousDocumentHash = series.lastHash;

    const updatedSeries: FiscalSeriesRecord = {
      ...series,
      currentNumber: nextNumber,
      documentsEmittedCount: series.documentsEmittedCount + 1,
      // O lastHash e lastDocumentDate são confirmados após emissão com sucesso
    };

    return {
      updatedSeries,
      reservation: {
        seriesCode: series.seriesCode,
        docNumber: nextNumber,
        documentNumberFull,
        previousDocumentHash,
        lastDocumentDate: series.lastDocumentDate,
      },
    };
  }

  /**
   * Confirma a gravação do documento, atualizando a cadeia de hash e a data do último documento.
   */
  static commitDocumentEmission(
    series: FiscalSeriesRecord,
    documentHashBase64: string,
    documentDateYYYYMMDD: string
  ): FiscalSeriesRecord {
    return {
      ...series,
      lastHash: documentHashBase64.trim(),
      lastDocumentDate: documentDateYYYYMMDD.trim().slice(0, 10),
    };
  }

  /**
   * Garante a regra de imutabilidade de configuração:
   * Uma vez emitido o primeiro documento, startingNumber e parâmetros de encadeamento
   * não podem ser modificados por utilizadores.
   */
  static assertCanUpdateSeriesConfig(series: FiscalSeriesRecord): void {
    if (series.documentsEmittedCount > 0) {
      throw new Error(
        "A série fiscal já possui documentos emitidos e está bloqueada contra alterações de numeração e encadeamento inicial."
      );
    }
  }
}
