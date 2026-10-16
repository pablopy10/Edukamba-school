import { describe, it, expect, beforeAll } from "vitest";
import {
  signPlaintextRSA_SHA1,
  verifyAgtSignature,
  extractHashControl,
  buildAgtSigningPlaintext,
  calculateSha1Hex,
  buildCertificationFooter,
} from "../lib/fiscal/crypto/agtCrypto";
import {
  buildAgtQrPayload,
  parseAgtQrPayload,
  generateAgtQrDataUrl,
} from "../lib/fiscal/qr/agtQrCode";
import {
  calculateFiscalDocument,
  formatMoney,
  roundMoney,
} from "../lib/fiscal/services/fiscalCalculations";
import { FiscalSeriesService } from "../lib/fiscal/services/fiscalSeriesService";
import {
  FiscalEmissionService,
  GENERIC_CONSUMER_NIF,
  GENERIC_CONSUMER_NAME,
} from "../lib/fiscal/services/fiscalEmissionService";
import { SaftGenerator } from "../lib/fiscal/saft/saftGenerator";
import { FiscalDocumentInput, FiscalSeriesRecord } from "../lib/fiscal/types";

// Chave RSA 1024-bit de teste oficial AGT presente no projeto
const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBANI6TSTevzosc6LA
sgA75TJOGVTCNGVUNwct3gyP4FQ7HF5+Lv+ykQO0oQYAI9VrAvI+IjKfIb6Y0p4U
KJbaGpM/KQcyVSP+iBn4SUbmVCHCRs99fLH0rloXsPCoZN27q6Hx4VBfwzK7PoGr
qB4UHMsEydEwtW7TlRMatv355SUnAgMBAAECgYBEsPQgBgBp27h1B42h8fAz/bzd
Kw+/xEKuv9f8Ns7P9viQD57/wbMMiOrMcSNEStENoiu+aqy2AG1hZajVkbJ4rpGl
JCwzWW3WZWAsypwDnwsb4Q24AMrDLN95Wg5TiVB5kmqdNxmcLMT5ZRdeEeDQBU/p
pbKwqPcaWTokw8ZjAQJBAPdhOpvhm1pXd6d9s1C0FSRgJfxVknHQHPNUfA51Yzm1
RtPU0AkZZZgGiv0oTnZEQZpxmRT51f/dubtS1Xl/UsECQQDZjaeNzcxVdyVBAhCA
sdXTyNX5cmC6/6oysvtKJys6Th4Qxttp4HGC8Fo3a54PnvzTVRl1/MtN5aVy8YMG
NLnnAkBegJovKoR6gqeHKJHz5pedCc35E4eaSvKEUmYB7/4z8XhZPBctIrKY3QcD
pv4yV+jn4zWjub1yvXVShlZez7EBAkEA1dlFu8FxOw2sRBOobyjgHJdNpi9FYGvS
PJXtJ74K4vxI14rxwUiLq/9hXxrdO1O4CHCdX3qHyeGUWcGHXwFTPwJAD+arpzOe
He0FRwXBXCa+EZWq2EfesFVe87gX8/ZzotmIEdfMRd0TigXcyVoc5CGSRWfsPXId
jtTnvKwyKoeFQw==
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDSOk0k3r86LHOiwLIAO+UyThlU
wjRlVDcHLd4Mj+BUOxxefi7/spEDtKEGACPVawLyPiIynyG+mNKeFCiW2hqTPykH
MlUj/ogZ+ElG5lQhwkbPfXyx9K5aF7DwqGTdu6uh8eFQX8Myuz6Bq6geFBzLBMnR
MLVu05UTGrb9+eUlJwIDAQAB
-----END PUBLIC KEY-----`;

const TEST_SCHOOL_ID = "11111111-2222-3333-4444-555555555555";
const TEST_SCHOOL_NIF = "5000123456";

describe("Módulo de Faturação Certificada AGT Angola (EduKamba)", () => {
  // ─── CENÁRIO 1: Fatura Simples com NIF (FT / FR) ─────────────────────────
  it("Cenário 1: Emissão de Fatura Simples com NIF validado", async () => {
    const series = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FT",
      fiscalYear: 2026,
    });

    const input: FiscalDocumentInput = {
      schoolId: TEST_SCHOOL_ID,
      docType: "FT",
      seriesCode: "2026",
      invoiceDate: "2026-10-16",
      customerNif: "5009876543",
      customerName: "Dr. Manuel Domingos",
      lines: [
        {
          productCode: "PROP-01",
          productDescription: "Propina do Mês de Outubro",
          quantity: 1,
          unitPrice: 25000.0,
          taxPercentage: 14,
        },
      ],
    };

    const { document, updatedSeries } = await FiscalEmissionService.emitDocument(input, {
      series,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
      certificationNumber: "99/AGT/2026",
      softwareVersion: "2.1.0",
    });

    expect(document.documentNumber).toBe("FT 2026/1");
    expect(document.customerNif).toBe("5009876543");
    expect(document.customerName).toBe("Dr. Manuel Domingos");
    expect(document.subtotalNet).toBe(25000.0);
    expect(document.taxPayable).toBe(3500.0);
    expect(document.grossTotal).toBe(28500.0);
    expect(document.hash).toBeTruthy();
    expect(document.hashControl.length).toBe(4);
    expect(document.certificationFooter).toBe(
      `${document.hashControl} - Processado por programa validado n.º 99/AGT/2026 EduCamba v2.1.0`
    );

    // Validação da assinatura com a chave pública
    const isValid = verifyAgtSignature(document.plaintext, document.hash, TEST_PUBLIC_KEY_PEM);
    expect(isValid).toBe(true);

    // Série foi atualizada
    expect(updatedSeries.currentNumber).toBe(1);
    expect(updatedSeries.documentsEmittedCount).toBe(1);
    expect(updatedSeries.lastHash).toBe(document.hash);
  });

  // ─── CENÁRIO 2: Fatura sem NIF (Consumidor Final) ────────────────────────
  it("Cenário 2: Fatura sem NIF atribui automaticamente NIF genérico 999999999", async () => {
    const series = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FR",
      fiscalYear: 2026,
    });

    const input: FiscalDocumentInput = {
      schoolId: TEST_SCHOOL_ID,
      docType: "FR",
      seriesCode: "2026",
      invoiceDate: "2026-10-16",
      customerNif: null, // Sem NIF
      customerName: "", // Nome vazio
      lines: [
        {
          productCode: "DECL-01",
          productDescription: "Declaração com Notas",
          quantity: 1,
          unitPrice: 2000.0,
          taxPercentage: 14,
        },
      ],
    };

    const { document } = await FiscalEmissionService.emitDocument(input, {
      series,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    expect(document.documentNumber).toBe("FR 2026/1");
    expect(document.customerNif).toBe(GENERIC_CONSUMER_NIF);
    expect(document.customerName).toBe(GENERIC_CONSUMER_NAME);

    // QR Code deve conter o NIF 999999999 no campo B
    const qrData = parseAgtQrPayload(document.qrCodePayload);
    expect(qrData.nifCliente).toBe("999999999");
    expect(qrData.numDoc).toBe("FR 2026/1");
  });

  // ─── CENÁRIO 3: Fatura com Descontos (Linha e Global) ────────────────────
  it("Cenário 3: Fatura com descontos comerciais por linha e desconto global no cabeçalho", async () => {
    const series = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FT",
      fiscalYear: 2026,
    });

    const input: FiscalDocumentInput = {
      schoolId: TEST_SCHOOL_ID,
      docType: "FT",
      seriesCode: "2026",
      invoiceDate: "2026-10-16",
      customerNif: "5000000001",
      customerName: "Ana Silva",
      // Desconto global de 500 Kz no cabeçalho
      discountGlobalAmount: 500.0,
      lines: [
        {
          productCode: "LIVR-01",
          productDescription: "Manual Escolar Matemática",
          quantity: 2,
          unitPrice: 5000.0, // Subtotal bruto = 10.000 Kz
          discountPct: 10, // Desconto na linha de 10% = 1.000 Kz -> líquido 9.000 Kz
          taxPercentage: 14,
        },
        {
          productCode: "CAD-01",
          productDescription: "Caderno Diário",
          quantity: 1,
          unitPrice: 1000.0, // Subtotal bruto = 1.000 Kz (sem desconto de linha) -> líquido 1.000 Kz
          taxPercentage: 14,
        },
      ],
    };

    // Subtotal antes do desconto global = 9.000 + 1.000 = 10.000 Kz
    // Desconto global = 500 Kz
    // Base líquida final tributável = 9.500 Kz
    // IVA 14% sobre 9.500 = 1.330 Kz
    // Total Geral = 10.830 Kz
    const { document } = await FiscalEmissionService.emitDocument(input, {
      series,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    expect(document.subtotalNet).toBe(9500.0);
    expect(document.discountGlobalAmount).toBe(500.0);
    expect(document.taxPayable).toBe(1330.0);
    expect(document.grossTotal).toBe(10830.0);
  });

  // ─── CENÁRIO 4: Faturas Convertidas (PF -> FT) ───────────────────────────
  it("Cenário 4: Conversão de Fatura Pró-forma (PF) em Fatura Definitiva (FT)", async () => {
    const seriesFT = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FT",
      fiscalYear: 2026,
    });

    const mockProforma = {
      id: "proforma-uuid-12345",
      documentNumber: "PF 2026/12",
      issueDate: "2026-10-10",
      customerNif: "5001239876",
      customerName: "Colégio Futuro Lda",
      lines: [
        {
          productCode: "CURS-01",
          productDescription: "Inscrição Curso Robótica",
          quantity: 1,
          unitPrice: 30000.0,
          taxPercentage: 14,
        },
      ],
    };

    const { document } = await FiscalEmissionService.convertProformaToFiscalInvoice({
      proforma: mockProforma,
      targetDocType: "FT",
      series: seriesFT,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    expect(document.documentNumber).toBe("FT 2026/1");
    expect(document.orderReferencePP).toBe("PF 2026/12");
    expect(document.sourceProformaId).toBe("proforma-uuid-12345");
    expect(document.customerNif).toBe("5001239876");
    expect(document.grossTotal).toBe(34200.0); // 30.000 + 4.200 (14% IVA)
  });

  // ─── CENÁRIO 5: Faturas com Múltiplas Taxas de Impostos ──────────────────
  it("Cenário 5: Fatura com múltiplas taxas de IVA (14%, 7%, 0% Isento com validação de código)", async () => {
    const series = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FT",
      fiscalYear: 2026,
    });

    const input: FiscalDocumentInput = {
      schoolId: TEST_SCHOOL_ID,
      docType: "FT",
      seriesCode: "2026",
      invoiceDate: "2026-10-16",
      customerNif: "5003332221",
      customerName: "Família Bento",
      lines: [
        {
          productCode: "UNIF-01",
          productDescription: "Uniforme Escolar (Taxa Normal)",
          quantity: 1,
          unitPrice: 10000.0,
          taxPercentage: 14, // 14% -> 1.400 Kz IVA
        },
        {
          productCode: "TRANSP-01",
          productDescription: "Serviço de Transporte (Taxa Reduzida)",
          quantity: 1,
          unitPrice: 8000.0,
          taxPercentage: 7, // 7% -> 560 Kz IVA
        },
        {
          productCode: "PROP-01",
          productDescription: "Propina Ensino Secundário (Isento de IVA)",
          quantity: 1,
          unitPrice: 35000.0,
          taxPercentage: 0, // 0% Isento
          taxExemptionCode: "M11",
          taxExemptionReason: "Isenção no domínio da educação (Artigo 12.º do CIVA)",
        },
      ],
    };

    const { document } = await FiscalEmissionService.emitDocument(input, {
      series,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    // Subtotal líquido = 10.000 + 8.000 + 35.000 = 53.000 Kz
    // IVA = 1.400 + 560 + 0 = 1.960 Kz
    // Total Geral = 54.960 Kz
    expect(document.subtotalNet).toBe(53000.0);
    expect(document.taxPayable).toBe(1960.0);
    expect(document.grossTotal).toBe(54960.0);

    // Resumo de taxas segregado
    expect(document.taxSummary.length).toBe(3);
    const exemptSummary = document.taxSummary.find((s) => s.taxPercentage === 0);
    expect(exemptSummary?.taxExemptionCode).toBe("M11");
    expect(exemptSummary?.taxBase).toBe(35000.0);

    // Validação estrita: se linha com 0% NÃO fornecer taxExemptionCode, deve lançar erro
    expect(() => {
      calculateFiscalDocument({
        schoolId: TEST_SCHOOL_ID,
        docType: "FT",
        seriesCode: "2026",
        invoiceDate: "2026-10-16",
        lines: [
          {
            productCode: "ERR-01",
            productDescription: "Item sem código",
            quantity: 1,
            unitPrice: 1000.0,
            taxPercentage: 0,
            // taxExemptionCode omitido
          },
        ],
      });
    }).toThrow(/Isenção de IVA \(0%\) exige obrigatoriamente um código oficial AGT/);
  });

  // ─── CENÁRIO 6: Fatura de Valor Reduzido (Microfatura ex: 40 Kz) ──────────
  it("Cenário 6: Microfatura (40 Kz) com precisão DECIMAL(18,2) e arredondamento half-up", async () => {
    const series = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FR",
      fiscalYear: 2026,
    });

    const input: FiscalDocumentInput = {
      schoolId: TEST_SCHOOL_ID,
      docType: "FR",
      seriesCode: "2026",
      invoiceDate: "2026-10-16",
      customerNif: "999999999",
      customerName: "Consumidor Final",
      lines: [
        {
          productCode: "COPIA-01",
          productDescription: "Fotocópia de Exame",
          quantity: 1,
          unitPrice: 40.0,
          taxPercentage: 14, // 40 * 0.14 = 5.60 Kz
        },
      ],
    };

    const { document } = await FiscalEmissionService.emitDocument(input, {
      series,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    expect(document.subtotalNet).toBe(40.0);
    expect(document.taxPayable).toBe(5.6);
    expect(document.grossTotal).toBe(45.6);

    // Verificar plaintext com 2 casas decimais obrigatórias (45.60)
    expect(document.plaintext).toContain(";45.60;");
  });

  // ─── CENÁRIO 7: Fatura Pró-Forma (PF) ────────────────────────────────────
  it("Cenário 7: Fatura Pró-Forma tem série própria, não encadeia em série fiscal e contém menção obrigatória", async () => {
    const seriesPF = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "PF",
      fiscalYear: 2026,
    });

    const input: FiscalDocumentInput = {
      schoolId: TEST_SCHOOL_ID,
      docType: "PF",
      seriesCode: "2026",
      invoiceDate: "2026-10-16",
      customerNif: "5001112223",
      customerName: "Empresa Exemplo",
      lines: [
        {
          productCode: "ORC-01",
          productDescription: "Orçamento de Formação Contínua",
          quantity: 5,
          unitPrice: 20000.0,
          taxPercentage: 14,
        },
      ],
    };

    const { document, updatedSeries } = await FiscalEmissionService.emitDocument(input, {
      series: seriesPF,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    expect(document.documentNumber).toBe("PF 2026/1");
    expect(document.certificationFooter).toBe("Este documento não serve de fatura");
    // PF não preenche hash fiscal de encadeamento comercial
    expect(document.hash).toContain("DOCUMENTO PRELIMINAR");
  });

  // ─── CENÁRIO 8: Nota de Crédito (NC) / Anulação ──────────────────────────
  it("Cenário 8: Emissão de Nota de Crédito vinculada à fatura original com abatimento de imposto", async () => {
    // 1. Emitir Fatura Original
    const seriesFT = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FT",
      fiscalYear: 2026,
    });

    const { document: originalFT } = await FiscalEmissionService.emitDocument(
      {
        schoolId: TEST_SCHOOL_ID,
        docType: "FT",
        seriesCode: "2026",
        invoiceDate: "2026-10-16",
        customerNif: "5008889990",
        customerName: "Carlos Alberto",
        lines: [
          {
            productCode: "FEE-01",
            productDescription: "Taxa de Matrícula",
            quantity: 1,
            unitPrice: 15000.0,
            taxPercentage: 14,
          },
        ],
      },
      {
        series: seriesFT,
        schoolNif: TEST_SCHOOL_NIF,
        privateKeyPem: TEST_PRIVATE_KEY_PEM,
      }
    );

    // 2. Emitir Nota de Crédito estornando a fatura original
    const seriesNC = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "NC",
      fiscalYear: 2026,
    });

    const { document: creditNote } = await FiscalEmissionService.emitCreditNote({
      originalInvoice: originalFT,
      reason: "Anulação de matrícula a pedido do encarregado de educação",
      seriesNC,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    expect(creditNote.documentNumber).toBe("NC 2026/1");
    expect(creditNote.referencedDocumentNumber).toBe("FT 2026/1");
    expect(creditNote.referencedDocumentDate).toBe("2026-10-16");
    expect(creditNote.rectificationReason).toBe(
      "Anulação de matrícula a pedido do encarregado de educação"
    );
    expect(creditNote.subtotalNet).toBe(15000.0);
    expect(creditNote.taxPayable).toBe(2100.0);
    expect(creditNote.grossTotal).toBe(17100.0);

    // NC deve possuir assinatura própria válida
    const isValid = verifyAgtSignature(creditNote.plaintext, creditNote.hash, TEST_PUBLIC_KEY_PEM);
    expect(isValid).toBe(true);
  });

  // ─── CENÁRIO 9: Onboarding e Continuação de Série (Numeração herdada) ─────
  it("Cenário 9: Continuação de software antigo com starting_number 54 e last_document_hash herdado", async () => {
    const inheritedHash = "INHERITED_HASH_FROM_PREVIOUS_SOFTWARE_BASE64_999=";
    const series = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FR",
      fiscalYear: 2026,
      startingNumber: 54, // Continuação
      lastDocumentDate: "2026-10-15",
      lastDocumentHash: inheritedHash,
    });

    const input: FiscalDocumentInput = {
      schoolId: TEST_SCHOOL_ID,
      docType: "FR",
      seriesCode: "2026",
      invoiceDate: "2026-10-16",
      customerNif: "5007778881",
      customerName: "Joaquim Costa",
      lines: [
        {
          productCode: "PROP-02",
          productDescription: "Propina Continuada",
          quantity: 1,
          unitPrice: 20000.0,
          taxPercentage: 0,
          taxExemptionCode: "M11",
          taxExemptionReason: "Isenção no domínio da educação",
        },
      ],
    };

    const { document, updatedSeries } = await FiscalEmissionService.emitDocument(input, {
      series,
      schoolNif: TEST_SCHOOL_NIF,
      privateKeyPem: TEST_PRIVATE_KEY_PEM,
    });

    // Primeiro documento assume 54
    expect(document.documentNumber).toBe("FR 2026/54");
    expect(document.docNumber).toBe(54);
    // Deve encadear no hash herdado
    expect(document.previousDocumentHash).toBe(inheritedHash);
    expect(document.plaintext).toContain(`;${inheritedHash}`);

    // Próximo documento da série será 55
    expect(updatedSeries.currentNumber).toBe(54);
    expect(updatedSeries.documentsEmittedCount).toBe(1);
    expect(updatedSeries.lastHash).toBe(document.hash);
  });

  // ─── CENÁRIO 10: Integridade Fiscal e Bloqueio de Mutação ─────────────────
  it("Cenário 10: Bloqueio estrito de UPDATE / DELETE em documentos emitidos e séries iniciadas", async () => {
    const series = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FT",
      fiscalYear: 2026,
    });

    const { document, updatedSeries } = await FiscalEmissionService.emitDocument(
      {
        schoolId: TEST_SCHOOL_ID,
        docType: "FT",
        seriesCode: "2026",
        invoiceDate: "2026-10-16",
        customerNif: "5001234567",
        customerName: "Cliente Teste",
        lines: [
          {
            productCode: "SERV-01",
            productDescription: "Serviço Escolar",
            quantity: 1,
            unitPrice: 5000.0,
            taxPercentage: 14,
          },
        ],
      },
      {
        series,
        schoolNif: TEST_SCHOOL_NIF,
        privateKeyPem: TEST_PRIVATE_KEY_PEM,
      }
    );

    // 1. Tentativa de DELETE deve ser rejeitada
    expect(() => {
      FiscalEmissionService.assertDocumentImmutability("DELETE", document);
    }).toThrow(/JAMAIS pode ser eliminado/);

    // 2. Tentativa de UPDATE deve ser rejeitada
    expect(() => {
      FiscalEmissionService.assertDocumentImmutability("UPDATE", document);
    }).toThrow(/é imutável.*Nota de Crédito/);

    // 3. Tentativa de reconfigurar série já com documentos emitidos deve ser rejeitada
    expect(() => {
      FiscalSeriesService.assertCanUpdateSeriesConfig(updatedSeries);
    }).toThrow(/já possui documentos emitidos e está bloqueada/);

    // 4. Tentativa de emitir documento com data anterior à última emitida na série deve falhar (cronologia)
    await expect(
      FiscalEmissionService.emitDocument(
        {
          schoolId: TEST_SCHOOL_ID,
          docType: "FT",
          seriesCode: "2026",
          invoiceDate: "2026-10-10", // Anterior a 2026-10-16!
          customerNif: "5001234567",
          lines: [
            {
              productCode: "S1",
              productDescription: "Item",
              quantity: 1,
              unitPrice: 100,
              taxPercentage: 14,
            },
          ],
        },
        {
          series: updatedSeries,
          schoolNif: TEST_SCHOOL_NIF,
          privateKeyPem: TEST_PRIVATE_KEY_PEM,
        }
      )
    ).rejects.toThrow(/Violação de cronologia fiscal AGT/);
  });

  // ─── TESTE DO GERADOR E VALIDADOR DO SAF-T (AO) ──────────────────────────
  it("Validação SAF-T (AO): TotalDebit e TotalCredit batem com a soma das linhas dos documentos", async () => {
    let seriesFT = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "FT",
      fiscalYear: 2026,
    });

    let seriesNC = FiscalSeriesService.createInitialSeries({
      schoolId: TEST_SCHOOL_ID,
      seriesCode: "2026",
      documentType: "NC",
      fiscalYear: 2026,
    });

    // Emitir FT 1 (10.000 + 1.400 = 11.400)
    const { document: doc1, updatedSeries: s1 } = await FiscalEmissionService.emitDocument(
      {
        schoolId: TEST_SCHOOL_ID,
        docType: "FT",
        seriesCode: "2026",
        invoiceDate: "2026-10-16",
        customerNif: "5001234567",
        customerName: "Cliente 1",
        lines: [
          {
            productCode: "PROP-01",
            productDescription: "Propina",
            quantity: 1,
            unitPrice: 10000.0,
            taxPercentage: 14,
          },
        ],
      },
      {
        series: seriesFT,
        schoolNif: TEST_SCHOOL_NIF,
        privateKeyPem: TEST_PRIVATE_KEY_PEM,
      }
    );
    seriesFT = s1;

    // Emitir FT 2 (20.000 + 0 = 20.000 Isento)
    const { document: doc2 } = await FiscalEmissionService.emitDocument(
      {
        schoolId: TEST_SCHOOL_ID,
        docType: "FT",
        seriesCode: "2026",
        invoiceDate: "2026-10-16",
        customerNif: "999999999",
        customerName: "Consumidor Final",
        lines: [
          {
            productCode: "PROP-02",
            productDescription: "Ensino Primário",
            quantity: 1,
            unitPrice: 20000.0,
            taxPercentage: 0,
            taxExemptionCode: "M11",
            taxExemptionReason: "Isenção no domínio da educação",
          },
        ],
      },
      {
        series: seriesFT,
        schoolNif: TEST_SCHOOL_NIF,
        privateKeyPem: TEST_PRIVATE_KEY_PEM,
      }
    );

    // Emitir NC (estorno parcial de 3.000 Kz)
    const { document: docNC } = await FiscalEmissionService.emitDocument(
      {
        schoolId: TEST_SCHOOL_ID,
        docType: "NC",
        seriesCode: "2026",
        invoiceDate: "2026-10-16",
        customerNif: "5001234567",
        customerName: "Cliente 1",
        lines: [
          {
            productCode: "PROP-01",
            productDescription: "Estorno Parcial Propina",
            quantity: 1,
            unitPrice: 3000.0,
            taxPercentage: 14,
          },
        ],
        creditNoteDetails: {
          originalDocumentNumber: "FT 2026/1",
          originalDocumentDate: "2026-10-16",
          rectificationReason: "Acordo de desconto pós-faturação",
        },
      },
      {
        series: seriesNC,
        schoolNif: TEST_SCHOOL_NIF,
        privateKeyPem: TEST_PRIVATE_KEY_PEM,
      }
    );

    // Gerar XML do SAF-T (AO)
    const xml = SaftGenerator.generateXml({
      company: {
        name: "Complexo Escolar EduKamba",
        nif: TEST_SCHOOL_NIF,
        address: "Av. Deolinda Rodrigues, Luanda",
        city: "Luanda",
      },
      fiscalYear: 2026,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      documents: [doc1, doc2, docNC],
    });

    expect(xml).toContain("<AuditFileVersion>1.01_01</AuditFileVersion>");
    expect(xml).toContain(`<CompanyID>${TEST_SCHOOL_NIF}</CompanyID>`);
    expect(xml).toContain("<NumberOfEntries>3</NumberOfEntries>");
    expect(xml).toContain("<TotalCredit>30000.00</TotalCredit>"); // 10.000 + 20.000
    expect(xml).toContain("<TotalDebit>3000.00</TotalDebit>"); // 3.000 da NC

    // Validação automática de integridade do SAF-T
    const validation = SaftGenerator.validateSaftIntegrity(xml);
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.summary.numberOfEntries).toBe(3);
    expect(validation.summary.totalCredit).toBe(30000.0);
    expect(validation.summary.totalDebit).toBe(3000.0);
  });

  // ─── TESTE DO QR CODE OFICIAL AGT ─────────────────────────────────────────
  it("Gera e analisa payload do QR Code estruturado oficial da AGT", async () => {
    const payload = buildAgtQrPayload({
      nifEmissor: "5000123456",
      nifCliente: "5009876543",
      pais: "AO",
      tipoDoc: "FT",
      estado: "N",
      data: "2026-10-16",
      numDoc: "FT 2026/1",
      hash4Chars: "Ab12",
      totalLiquido: 25000.0,
      totalIva: 3500.0,
      totalDocumento: 28500.0,
    });

    const expected =
      "A:5000123456*B:5009876543*C:AO*D:FT*E:N*F:20261016*G:FT 2026/1*H:Ab12*I1:25000.00*I2:3500.00*I3:28500.00";
    expect(payload).toBe(expected);

    const parsed = parseAgtQrPayload(payload);
    expect(parsed.nifEmissor).toBe("5000123456");
    expect(parsed.nifCliente).toBe("5009876543");
    expect(parsed.tipoDoc).toBe("FT");
    expect(parsed.totalLiquido).toBe(25000.0);
    expect(parsed.totalIva).toBe(3500.0);
    expect(parsed.totalDocumento).toBe(28500.0);

    // Gerar imagem DataURL do QR Code
    const dataUrl = await generateAgtQrDataUrl(payload);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
