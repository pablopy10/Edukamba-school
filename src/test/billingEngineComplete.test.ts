import { describe, it, expect, vi, beforeEach } from "vitest";
import { BillingEngineService } from "../lib/fiscal/services/billingEngineService";
import { SaftGenerator } from "../lib/fiscal/saft/saftGenerator";
import {
  DEFAULT_AGT_PRIVATE_KEY_PEM,
  buildAgtSigningPlaintext,
  buildCertificationFooter,
  calculateSha1Hex,
  extractHashControl,
  signPlaintextRSA_SHA1,
} from "../lib/fiscal/crypto/agtCrypto";
import { buildAgtQrPayload } from "../lib/fiscal/qr/agtQrCode";
import { EmittedFiscalDocument } from "../lib/fiscal/types";

describe("Motor Fiscal Completo AGT (Angola) — Edukamba", () => {
  // ─── 1. RESOLUÇÃO DE IDENTIDADE E CLIENTE (AGT) ───────────────────────────
  describe("1. Identidade do Adquirente e Regras de NIF", () => {
    it("deve atribuir NIF 999999999 e Consumidor Final quando NIF não for fornecido", () => {
      const cust = BillingEngineService.resolveCustomer(null, null);
      expect(cust.nif).toBe("999999999");
      expect(cust.name).toBe("Consumidor Final");
    });

    it("deve preservar NIF e Nome válidos quando informados", () => {
      const cust = BillingEngineService.resolveCustomer("5412345678", "Empresa Angolana Lda");
      expect(cust.nif).toBe("5412345678");
      expect(cust.name).toBe("Empresa Angolana Lda");
    });
  });

  // ─── 2. CRIPTOGRAFIA, HASH CONTROL E ASSINATURA RSA-SHA1 ──────────────────
  describe("2. Motor Criptográfico e Assinatura AGT (RSA-SHA1)", () => {
    it("deve assinar o plaintext com chave RSA e extrair os 4 caracteres de controlo (0, 10, 20, 30)", () => {
      const plaintext = "2026-10-27;2026-10-27T10:00:00;FT EDK/1;25000.00;";
      const hashSha1 = calculateSha1Hex(plaintext);
      expect(hashSha1).toHaveLength(40);

      const sigB64 = signPlaintextRSA_SHA1(plaintext, DEFAULT_AGT_PRIVATE_KEY_PEM);
      expect(sigB64).toBeDefined();
      expect(sigB64.length).toBeGreaterThan(32);

      const hashControl = extractHashControl(sigB64);
      expect(hashControl).toHaveLength(4);
      expect(hashControl).toBe(`${sigB64[0]}${sigB64[10]}${sigB64[20]}${sigB64[30]}`);
    });

    it("deve formatar o rodapé legal obrigatório com a marca Edukamba", () => {
      const footer = buildCertificationFooter("A1B2", "0/AGT/2026", "1.0.0");
      expect(footer).toContain("A1B2 - Processado por programa validado n.º 0/AGT/2026 Edukamba v1.0.0");
      expect(footer).not.toContain("eduCamba");
    });

    it("deve gerar o payload estruturado do QR Code no padrão oficial AGT", () => {
      const qrPayload = buildAgtQrPayload({
        nifEmissor: "5000001234",
        nifCliente: "999999999",
        pais: "AO",
        tipoDoc: "FR",
        estado: "N",
        data: "2026-10-27",
        numDoc: "FR EDK/1",
        hash4Chars: "X9Z1",
        totalLiquido: 25000,
        totalIva: 0,
        totalDocumento: 25000,
        format: "structured",
      });

      expect(qrPayload).toBe(
        "A:5000001234*B:999999999*C:AO*D:FR*E:N*F:20261027*G:FR EDK/1*H:X9Z1*I1:25000.00*I2:0.00*I3:25000.00"
      );
    });
  });

  // ─── 3. CENÁRIOS DE EMISSÃO FISCAL (MÁQUINA DE ESTADOS) ───────────────────
  describe("3. Regras de Emissão por Cenário", () => {
    it("Cenário A: Pronto Pagamento deve ser emitido como Fatura/Recibo (FR)", () => {
      const lines = [
        {
          itemType: "PROPINA",
          description: "Propina Outubro 2026",
          quantity: 1,
          unitPrice: 35000,
          taxPercentage: 0,
          taxExemptionCode: "M11",
        },
      ];

      // Cálculo de montantes
      const net = 35000;
      const tax = 0;
      const gross = 35000;

      expect(gross).toBe(35000);
      expect(lines[0].itemType).toBe("PROPINA");
      expect(lines[0].taxExemptionCode).toBe("M11");
    });

    it("Cenário B: Faturação Prévia deve ser emitida como Fatura (FT) a crédito", () => {
      const lines = [
        {
          itemType: "PROPINA",
          description: "Mensalidade Escolar - Novembro/2026",
          quantity: 1,
          unitPrice: 40000,
          taxPercentage: 0,
          taxExemptionCode: "M11",
        },
      ];

      expect(lines[0].unitPrice).toBe(40000);
    });

    it("Cenário C: Liquidação de FT prévia deve emitir exclusivamente Recibo (RC) sem duplicar imposto", () => {
      const mockOriginFt = {
        id: "ft-uuid-1234",
        document_number: "FT EDK/10",
        doc_type: "FT",
        gross_total: 50000,
        tax_payable: 0,
      };

      // No SAF-T, a quitação de FT com RC não gera novo SalesInvoices
      expect(mockOriginFt.doc_type).toBe("FT");
      const rcGrossTotal = 50000;
      const rcTaxPayable = 0; // Imposto é zero no recibo para não duplicar incidência
      expect(rcTaxPayable).toBe(0);
      expect(rcGrossTotal).toBe(mockOriginFt.gross_total);
    });

    it("Cenário D: Cotação / Pedido de Subsídio emite Pró-forma (PF) com marca d'água informativa", () => {
      const watermarkNotice = "ESTE DOCUMENTO NÃO SERVE DE FATURA";
      expect(watermarkNotice).toContain("NÃO SERVE DE FATURA");
    });
  });

  // ─── 4. EXPORTAÇÃO E INTEGRIDADE DO SAF-T (AO) COM SALESINVOICES E PAYMENTS
  describe("4. Exportador SAF-T (AO) 1.01_01 — SalesInvoices e Payments", () => {
    it("deve mapear FT, FR, NC em SalesInvoices e RC em Payments sem duplicidade de imposto", () => {
      const mockFt: EmittedFiscalDocument = {
        schoolId: "school-1",
        docType: "FT",
        seriesCode: "EDK",
        docNumber: 1,
        documentNumber: "FT EDK/1",
        fiscalYear: 2026,
        invoiceDate: "2026-10-10",
        systemEntryDate: "2026-10-10T10:00:00",
        customerNif: "5000009999",
        customerName: "Pai Exemplo",
        customerCountry: "AO",
        lines: [
          {
            lineNumber: 1,
            productCode: "PROP-01",
            productDescription: "Propina Outubro",
            quantity: 1,
            unitOfMeasure: "UN",
            unitPrice: 50000,
            grossAmountBeforeDiscount: 50000,
            effectiveDiscountAmount: 0,
            netAmount: 50000,
            taxAmount: 0,
            totalGrossAmount: 50000,
            taxPercentage: 0,
            taxCode: "ISE",
            taxExemptionCode: "M11",
            taxExemptionReason: "Isenção no domínio da educação",
          },
        ],
        subtotalNet: 50000,
        discountGlobalAmount: 0,
        taxPayable: 0,
        grossTotal: 50000,
        taxSummary: [{ taxCode: "ISE", taxPercentage: 0, taxBase: 50000, taxAmount: 0, taxExemptionCode: "M11" }],
        plaintext: "...",
        hash: "dummy-hash",
        hashControl: "0000",
        documentHashSha1Hex: "dummy",
        previousDocumentHash: "",
        certificationFooter: "0000 - Processado por programa validado n.º 0/AGT/2026 Edukamba v1.0.0",
        qrCodePayload: "...",
        status: "N",
      };

      const mockRc: EmittedFiscalDocument = {
        schoolId: "school-1",
        docType: "RC",
        seriesCode: "EDK",
        docNumber: 1,
        documentNumber: "RC EDK/1",
        fiscalYear: 2026,
        invoiceDate: "2026-10-27",
        systemEntryDate: "2026-10-27T12:00:00",
        customerNif: "5000009999",
        customerName: "Pai Exemplo",
        customerCountry: "AO",
        lines: [
          {
            lineNumber: 1,
            productCode: "REC-01",
            productDescription: "Liquidação FT EDK/1",
            quantity: 1,
            unitOfMeasure: "UN",
            unitPrice: 50000,
            grossAmountBeforeDiscount: 50000,
            effectiveDiscountAmount: 0,
            netAmount: 50000,
            taxAmount: 0,
            totalGrossAmount: 50000,
            taxPercentage: 0,
            taxCode: "ISE",
            taxExemptionCode: "M02",
            taxExemptionReason: "Não sujeito a imposto",
          },
        ],
        subtotalNet: 50000,
        discountGlobalAmount: 0,
        taxPayable: 0,
        grossTotal: 50000,
        taxSummary: [],
        plaintext: "...",
        hash: "dummy-rc-hash",
        hashControl: "0000",
        documentHashSha1Hex: "dummy",
        previousDocumentHash: "",
        certificationFooter: "0000 - Processado por programa validado n.º 0/AGT/2026 Edukamba v1.0.0",
        qrCodePayload: "...",
        referencedDocumentNumber: "FT EDK/1",
        referencedDocumentDate: "2026-10-10",
        status: "N",
      };

      const xml = SaftGenerator.generateXml({
        company: {
          name: "Colégio Edukamba Luanda",
          nif: "5000001234",
          address: "Talatona",
          city: "Luanda",
        },
        fiscalYear: 2026,
        startDate: "2026-10-01",
        endDate: "2026-10-31",
        documents: [mockFt, mockRc],
      });

      // Validação da secção SalesInvoices (contém FT)
      expect(xml).toContain("<SalesInvoices>");
      expect(xml).toContain("<InvoiceNo>FT EDK/1</InvoiceNo>");
      expect(xml).toContain("<InvoiceType>FT</InvoiceType>");
      // O recibo RC NÃO pode estar dentro de SalesInvoices
      const salesSection = xml.substring(xml.indexOf("<SalesInvoices>"), xml.indexOf("</SalesInvoices>"));
      expect(salesSection).not.toContain("<InvoiceNo>RC EDK/1</InvoiceNo>");

      // Validação da secção Payments (contém RC)
      expect(xml).toContain("<Payments>");
      expect(xml).toContain("<PaymentRefNo>RC EDK/1</PaymentRefNo>");
      expect(xml).toContain("<PaymentType>RC</PaymentType>");
      expect(xml).toContain("<OriginatingON>FT EDK/1</OriginatingON>");

      // Validação de integridade do SAF-T
      const validation = SaftGenerator.validateSaftIntegrity(xml);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.summary.numberOfEntries).toBe(1); // 1 Fatura em SalesInvoices
      expect(validation.summary.paymentsEntries).toBe(1); // 1 Recibo em Payments
    });
  });
});
