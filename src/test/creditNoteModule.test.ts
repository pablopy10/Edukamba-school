import { describe, it, expect } from "vitest";
import { CreditNoteService } from "../lib/fiscal/services/creditNoteService";
import {
  CREDIT_NOTE_REASON_CODES,
  CREDIT_NOTE_REASON_LABELS_PT,
  resolveCreditNoteReasonText,
  validateCreditNoteReason,
} from "../lib/fiscal/creditNoteReasons";
import { getHashControl, buildCertificationFooter } from "../lib/fiscal/crypto/agtCrypto";
import { buildAgtQrPayload } from "../lib/fiscal/qr/agtQrCode";
import { buildCreditNotePdf, CreditNotePdfInput } from "../lib/fiscal/creditNotePdf";
import { SaftGenerator } from "../lib/fiscal/saft/saftGenerator";
import { EmittedFiscalDocument } from "../lib/fiscal/types";

describe("Módulo de Notas de Crédito (NC) Certificadas AGT - Edukamba", () => {
  // ─── 1. REGRAS DE NEGÓCIO E CONTROLE DE SALDO ─────────────────────────────
  describe("1. Validação de Saldo e Sobrecrédito (Credit Balance)", () => {
    it("deve calcular corretamente o saldo disponível para estorno", () => {
      const balance1 = CreditNoteService.calculateRemainingBalance(50000, 0);
      expect(balance1).toBe(50000);

      const balance2 = CreditNoteService.calculateRemainingBalance(50000, 20000);
      expect(balance2).toBe(30000);

      const balance3 = CreditNoteService.calculateRemainingBalance(50000, 50000);
      expect(balance3).toBe(0);
    });

    it("deve determinar FULLY_CREDITED quando valor total é estornado", () => {
      const statusFull = CreditNoteService.determineNextCreditStatus({
        originalGross: 45000,
        alreadyCredited: 0,
        newCreditAmount: 45000,
      });
      expect(statusFull).toBe("FULLY_CREDITED");

      const statusFullIncremental = CreditNoteService.determineNextCreditStatus({
        originalGross: 45000,
        alreadyCredited: 20000,
        newCreditAmount: 25000,
      });
      expect(statusFullIncremental).toBe("FULLY_CREDITED");
    });

    it("deve determinar PARTIALLY_CREDITED quando estorno é menor que o saldo restante", () => {
      const statusPartial = CreditNoteService.determineNextCreditStatus({
        originalGross: 60000,
        alreadyCredited: 0,
        newCreditAmount: 20000,
      });
      expect(statusPartial).toBe("PARTIALLY_CREDITED");

      const statusPartialSecond = CreditNoteService.determineNextCreditStatus({
        originalGross: 60000,
        alreadyCredited: 20000,
        newCreditAmount: 15000,
      });
      expect(statusPartialSecond).toBe("PARTIALLY_CREDITED");
    });

    it("deve rejeitar montantes de estorno que excedem o saldo disponível (Sobrecrédito)", () => {
      const check1 = CreditNoteService.validateCreditRequestAmount({
        originalGross: 30000,
        alreadyCredited: 10000,
        requestedAmount: 25000, // Excede 20000
      });
      expect(check1.isValid).toBe(false);
      expect(check1.error).toContain("excede o saldo disponível");

      const checkValid = CreditNoteService.validateCreditRequestAmount({
        originalGross: 30000,
        alreadyCredited: 10000,
        requestedAmount: 20000,
      });
      expect(checkValid.isValid).toBe(true);
      expect(checkValid.error).toBeUndefined();
    });

    it("deve rejeitar valores negativos ou nulos no pedido de estorno", () => {
      const checkZero = CreditNoteService.validateCreditRequestAmount({
        originalGross: 30000,
        alreadyCredited: 0,
        requestedAmount: 0,
      });
      expect(checkZero.isValid).toBe(false);

      const checkNeg = CreditNoteService.validateCreditRequestAmount({
        originalGross: 30000,
        alreadyCredited: 0,
        requestedAmount: -500,
      });
      expect(checkNeg.isValid).toBe(false);
    });
  });

  // ─── 2. MOTIVO OBRIGATÓRIO E CÓDIGOS DE JUSTIFICATIVA ──────────────────────
  describe("2. Validação e Resolução de Motivo de Retificação (AGT)", () => {
    it("deve validar que a justificativa é obrigatória com pelo menos 6 caracteres", () => {
      expect(validateCreditNoteReason("").isValid).toBe(false);
      expect(validateCreditNoteReason("erro").isValid).toBe(false);
      expect(validateCreditNoteReason("Erro no valor da propina").isValid).toBe(true);
    });

    it("deve mapear códigos de retificação para descrições fiscais oficiais", () => {
      expect(CREDIT_NOTE_REASON_CODES.length).toBeGreaterThan(0);
      const text = resolveCreditNoteReasonText("value_error", "Cobrado valor indevido");
      expect(text).toContain("Erro no valor");
      expect(text).toContain("Cobrado valor indevido");
    });
  });

  // ─── 3. ASSINATURA DIGITAL RSA-SHA1 E QR CODE AGT ─────────────────────────
  describe("3. Assinatura Digital e Formatação AGT para NC", () => {
    it("deve extrair os 4 caracteres de controle (1º, 11º, 21º, 31º) da assinatura da NC", () => {
      const ncHash = "Z123456789P123456789X1234567897RestOfBase64Signature==";
      const control = getHashControl(ncHash);
      expect(control).toBe("ZPX7");
    });

    it("deve formatar o rodapé de certificação legal com Edukamba e versão correta", () => {
      const footer = buildCertificationFooter({
        hashControl: "ZPX7",
        softwareVersion: "1.0.0",
        certificationNumber: "0/AGT/2026",
      });
      expect(footer).toContain("ZPX7");
      expect(footer).toContain("0/AGT/2026");
      expect(footer).toContain("Edukamba");
      expect(footer).not.toContain("EduCamba");
    });

    it("deve gerar payload de QR Code com tipo de documento D:NC", () => {
      const payload = buildAgtQrPayload({
        schoolNif: "5000001234",
        customerNif: "999999999",
        docType: "NC",
        documentNumber: "NC 2026/1",
        invoiceDate: "2026-10-26",
        grossTotal: 45000,
        taxPayable: 0,
        hashControl: "ZPX7",
        certificationNumber: "0/AGT/2026",
      });

      expect(payload).toContain("D:NC");
      expect(payload).toContain("5000001234");
      expect(payload).toContain("NC 2026/1");
      expect(payload).toContain("ZPX7");
    });
  });

  // ─── 4. TEMPLATE DE IMPRESSÃO / PDF DA NOTA DE CRÉDITO ────────────────────
  describe("4. Gerador de PDF da Nota de Crédito (AgtCertifiedInvoiceTemplate)", () => {
    it("deve gerar documento PDF A4 contendo dados de retificação da fatura de origem", async () => {
      const pdfInput: CreditNotePdfInput = {
        schoolName: "Colégio Futuro do Saber",
        schoolNif: "5000001234",
        schoolAddress: "Rua Direita de Luanda, n.º 42, Maianga",
        schoolCity: "Luanda",
        schoolPhone: "+244 923 000 000",
        schoolEmail: "financeiro@colegiofuturo.ao",
        documentNumber: "NC 2026/3",
        invoiceDateYYYYMMDD: "2026-10-26",
        sourceInvoiceNumber: "FT 2026/45",
        sourceInvoiceDate: "2026-10-15",
        reason: "Erro na aplicação de desconto da propina",
        copyType: "Original",
        clienteNome: "Manuel Domingos dos Santos",
        clienteNif: "5417892345",
        studentName: "Lucas dos Santos",
        lineItems: [
          {
            description: "Retificação Parcial: Propina de Outubro/2026",
            quantity: 1,
            unitPriceFmt: "15.000,00 Kz",
            totalFmt: "15.000,00 Kz",
            ivaRate: 0,
            taxExemptionCode: "M11",
            taxExemptionReason: "Isenção nos termos do art. 12.º do CIVA",
          },
        ],
        grossTotalFmt: "15.000,00 Kz",
        subtotalFmt: "15.000,00 Kz",
        ivaFmt: "0,00 Kz",
        documentHashFootnote: "ZPX7 - Processado por programa validado n.º 0/AGT/2026 Edukamba v1.0.0",
      };

      const doc = await buildCreditNotePdf(pdfInput);
      expect(doc).toBeDefined();

      const buffer = doc.output("arraybuffer");
      expect(buffer.byteLength).toBeGreaterThan(1000);
    });
  });

  // ─── 5. EXPORTAÇÃO SAF-T (AO) 1.01_01 COM REFERÊNCIA ──────────────────────
  describe("5. Schema SAF-T (AO) para Linhas de Nota de Crédito", () => {
    it("deve emitir <Reference> tanto ao nível do documento como de cada <Line> para NC", () => {
      const mockNcDoc: EmittedFiscalDocument = {
        schoolId: "school-1",
        docType: "NC",
        seriesCode: "EDK",
        docNumber: 1,
        documentNumber: "NC 2026/1",
        fiscalYear: 2026,
        invoiceDate: "2026-10-26",
        systemEntryDate: "2026-10-26T15:00:00",
        customerNif: "5417892345",
        customerName: "Manuel Santos",
        customerAddress: "Luanda",
        customerCountry: "AO",
        referencedDocumentNumber: "FT 2026/45",
        referencedDocumentDate: "2026-10-15",
        rectificationReason: "Cancelamento de inscrição extracurricular",
        status: "N",
        subtotalNet: 25000,
        discountGlobalAmount: 0,
        taxPayable: 0,
        grossTotal: 25000,
        plaintext: "NC 2026-10-26 25000",
        hash: "A123456789K123456789U1234567894ExtraBase64Sig==",
        hashControl: "AKU4",
        documentHashSha1Hex: "abcdef1234567890",
        previousDocumentHash: "",
        certificationFooter: "AKU4-Processado por programa certificado n.º 0/AGT/2026 Edukamba 1.0.0",
        qrCodePayload: "D:NC*5000000000*5417892345*NC 2026/1*25000.00",
        taxSummary: [
          {
            taxCode: "ISE",
            taxPercentage: 0,
            taxBase: 25000,
            taxAmount: 0,
            taxExemptionCode: "M11",
            taxExemptionReason: "Isenção nos termos do Artigo 12.º do CIVA",
          },
        ],
        lines: [
          {
            lineNumber: 1,
            productCode: "EXT-001",
            productDescription: "Clube de Robótica - Outubro/2026",
            quantity: 1,
            unitOfMeasure: "UN",
            unitPrice: 25000,
            grossAmountBeforeDiscount: 25000,
            effectiveDiscountAmount: 0,
            netAmount: 25000,
            taxAmount: 0,
            totalGrossAmount: 25000,
            taxPercentage: 0,
            taxCode: "ISE",
            taxExemptionCode: "M11",
            taxExemptionReason: "Isenção nos termos do Artigo 12.º do CIVA",
            referencedDocumentNumber: "FT 2026/45",
          },
        ],
      };

      const xml = SaftGenerator.generateXml({
        company: {
          name: "Escola Exemplo",
          nif: "5000001234",
          address: "Luanda",
          city: "Luanda",
        },
        fiscalYear: 2026,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        documents: [mockNcDoc],
      });

      // Validação do Documento NC
      expect(xml).toContain("<InvoiceType>NC</InvoiceType>");
      expect(xml).toContain("<DebitAmount>25000.00</DebitAmount>");
      expect(xml).not.toContain("<CreditAmount>25000.00</CreditAmount>");

      // Validação do References ao nível de documento
      expect(xml).toContain("<References>");
      expect(xml).toContain("<Reference>FT 2026/45</Reference>");
      expect(xml).toContain("<Reason>Cancelamento de inscrição extracurricular</Reason>");

      // Validação do References dentro de cada <Line>
      const lineBlock = xml.substring(xml.indexOf("<Line>"), xml.indexOf("</Line>"));
      expect(lineBlock).toContain("<References>");
      expect(lineBlock).toContain("<Reference>FT 2026/45</Reference>");
    });
  });
});
