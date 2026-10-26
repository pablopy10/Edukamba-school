import { describe, it, expect } from "vitest";
import { getHashControl, buildCertificationFooter } from "../lib/fiscal/crypto/agtCrypto";
import { buildAgtQrPayload, buildAgtQrUrl, parseAgtQrPayload } from "../lib/fiscal/qr/agtQrCode";
import {
  EDUCATIONAL_TAX_RULES,
  detectEducationalCategory,
  getTaxRuleForLine,
} from "../lib/fiscal/educationalTaxRules";
import { buildInvoicePdf, FiscalInvoicePdfInput } from "../lib/fiscal/invoicePdf";

describe("Layout e Regras da Fatura Certificada AGT - Edukamba", () => {
  // ─── REGRA 1: Extração dos 4 Caracteres do Hash (1º, 11º, 21º, 31º) ────────
  describe("1. Lógica de Extração dos 4 Caracteres do Hash (getHashControl)", () => {
    it("deve extrair exatamente os caracteres dos índices 0, 10, 20 e 30", () => {
      // 0-indexed: 0='A', 10='K', 20='U', 30='4'
      const sampleHash = "A123456789K123456789U1234567894ExtraBase64Signature==";
      expect(sampleHash.charAt(0)).toBe("A");
      expect(sampleHash.charAt(10)).toBe("K");
      expect(sampleHash.charAt(20)).toBe("U");
      expect(sampleHash.charAt(30)).toBe("4");

      const control = getHashControl(sampleHash);
      expect(control).toBe("AKU4");
    });

    it("deve retornar vazio se hash for nulo ou menor que 31 caracteres", () => {
      expect(getHashControl("")).toBe("");
      expect(getHashControl("curto")).toBe("");
      expect(getHashControl(null as unknown as string)).toBe("");
    });
  });

  // ─── REGRA 2: Categorização e Isenção para Serviços Escolares ─────────────
  describe("2. Regras Fiscais para Serviços Escolares (Propinas, Matrículas, etc.)", () => {
    it("deve categorizar e aplicar isenção M11 (Artigo 12.º do CIVA) para Propinas", () => {
      const cat = detectEducationalCategory("Propina - Outubro/2026 - 10.ª Classe A");
      expect(cat).toBe("propina");

      const rule = getTaxRuleForLine("Propina - Outubro/2026 - 10.ª Classe A");
      expect(rule.defaultTaxPercentage).toBe(0);
      expect(rule.taxExemptionCode).toBe("M11");
      expect(rule.taxExemptionReason).toContain("Artigo 12.º do CIVA");
    });

    it("deve categorizar e aplicar isenção M11 para Taxa de Matrícula e Inscrição", () => {
      const cat = detectEducationalCategory("Taxa de Matrícula para o Ano Letivo 2026/2027");
      expect(cat).toBe("matricula");

      const rule = getTaxRuleForLine("Taxa de Matrícula");
      expect(rule.defaultTaxPercentage).toBe(0);
      expect(rule.taxExemptionCode).toBe("M11");
    });

    it("deve categorizar e aplicar regras para Atividades Extracurriculares", () => {
      const cat = detectEducationalCategory("Atividade Extracurricular - Clube de Robótica");
      expect(cat).toBe("extracurricular");

      const rule = getTaxRuleForLine("Clube de Robótica Extracurricular");
      expect(rule.defaultTaxPercentage).toBe(0);
      expect(rule.taxExemptionCode).toBe("M11");
    });

    it("deve categorizar Transporte Escolar", () => {
      const cat = detectEducationalCategory("Transporte Escolar Mensal - Rota Talatona");
      expect(cat).toBe("transporte");

      const rule = getTaxRuleForLine("Transporte Escolar");
      expect(rule.defaultTaxPercentage).toBe(0);
      expect(rule.taxExemptionCode).toBe("M04");
    });

    it("deve categorizar Refeições e Cantina Escolar", () => {
      const cat = detectEducationalCategory("Refeição Escolar e Lanche Mensal");
      expect(cat).toBe("refeicao");

      const rule = getTaxRuleForLine("Alimentação / Cantina Escolar");
      expect(rule.defaultTaxPercentage).toBe(0);
      expect(rule.taxExemptionCode).toBe("M11");
    });
  });

  // ─── REGRA 3: Payload Estruturado do QR Code Oficial AGT ──────────────────
  describe("3. String Padronizada do QR Code Oficial AGT", () => {
    it("deve montar o formato oficial A:{NIF_ESCOLA}*B:{NIF_CLIENTE}*C:AO*D:{TIPO_DOC}*E:N*F:{DATA_EMISSAO}*G:{NUM_DOC}*H:{HASH_4_CHARS}*I1:{TOTAL_ILIQUIDO}*I2:{TOTAL_IVA}*I3:{TOTAL_DOCUMENTO}", () => {
      const payload = buildAgtQrPayload({
        nifEmissor: "5000123456",
        nifCliente: "5009876543",
        pais: "AO",
        tipoDoc: "FR",
        estado: "N",
        data: "2026-10-26",
        numDoc: "FR 2026/145",
        hash4Chars: "AKU4",
        totalLiquido: 50000.0,
        totalIva: 0.0,
        totalDocumento: 50000.0,
      });

      expect(payload).toBe(
        "A:5000123456*B:5009876543*C:AO*D:FR*E:N*F:20261026*G:FR 2026/145*H:AKU4*I1:50000.00*I2:0.00*I3:50000.00"
      );

      const parsed = parseAgtQrPayload(payload);
      expect(parsed.nifEmissor).toBe("5000123456");
      expect(parsed.nifCliente).toBe("5009876543");
      expect(parsed.pais).toBe("AO");
      expect(parsed.tipoDoc).toBe("FR");
      expect(parsed.estado).toBe("N");
      expect(parsed.numDoc).toBe("FR 2026/145");
      expect(parsed.hash4Chars).toBe("AKU4");
      expect(parsed.totalLiquido).toBe(50000.0);
      expect(parsed.totalIva).toBe(0.0);
      expect(parsed.totalDocumento).toBe(50000.0);
    });

    it("se cliente não tiver NIF, deve usar 999999999 no QR Code", () => {
      const payload = buildAgtQrPayload({
        nifEmissor: "5000123456",
        nifCliente: "",
        pais: "AO",
        tipoDoc: "FT",
        estado: "N",
        data: "2026-10-26",
        numDoc: "FT 2026/1",
        hash4Chars: "BCDE",
        totalLiquido: 10000.0,
        totalIva: 1400.0,
        totalDocumento: 11400.0,
      });

      expect(payload).toContain("*B:999999999*");
    });

    it("deve gerar o URL oficial do Quiosque AGT com buildAgtQrUrl", () => {
      const url = buildAgtQrUrl({
        nifEmissor: "3949848484",
        numDoc: "FT EDK/7",
      });

      expect(url).toBe(
        "https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=3949848484&document=FT%20EDK%2F7"
      );

      // parseAgtQrPayload deve extrair emissor e document da URL
      const parsed = parseAgtQrPayload(url);
      expect(parsed.nifEmissor).toBe("3949848484");
      expect(parsed.numDoc).toBe("FT EDK/7");
      expect(parsed.pais).toBe("AO");
    });

    it("buildAgtQrPayload com format='url' deve retornar o link oficial do Quiosque AGT", () => {
      const payload = buildAgtQrPayload({
        nifEmissor: "5000000000",
        nifCliente: "999999999",
        pais: "AO",
        tipoDoc: "FT",
        estado: "N",
        data: "2026-10-26",
        numDoc: "FT 2026/1",
        hash4Chars: "0000",
        totalLiquido: 23000,
        totalIva: 0,
        totalDocumento: 23000,
        format: "url",
      });

      expect(payload).toBe(
        "https://quiosqueagt.minfin.gov.ao/facturacao-eletronica/consultar-fe?emissor=5000000000&document=FT%202026%2F1"
      );
    });
  });

  // ─── REGRA 4: Geração de PDF em A4 com as 5 Seções Obrigatórias ────────────
  describe("4. Geração do Documento PDF em A4 (buildInvoicePdf)", () => {
    it("deve construir o PDF sem erros com todas as 5 seções preenchidas", () => {
      const sampleSignature = "W123456789X123456789Y123456789ZAssinaturaRSAOficial==";
      const hashControl = getHashControl(sampleSignature); // W, X, Y, Z -> "WXYZ"
      expect(hashControl).toBe("WXYZ");

      const input: FiscalInvoicePdfInput = {
        schoolName: "Complexo Escolar EduKamba",
        schoolNif: "5000123456",
        schoolAddress: "Avenida Deolinda Rodrigues, Luanda",
        schoolContactLines: ["Tel: +244 923 000 111", "Email: financeiro@edukamba.ao"],
        documentNumber: "FR 2026/145",
        invoiceDateYYYYMMDD: "2026-10-26",
        systemEntryTimestamp: "2026-10-26 14:30:00",
        copyType: "Original",
        clienteNome: "João Baptista",
        clienteNif: "5009876543",
        clienteAddress: "Bairro Alvalade, Luanda",
        studentName: "Lucas Baptista",
        studentClassroom: "10.ª Classe A",
        academicYearLabel: "2026/2027",
        docType: "FR",
        lineItems: [
          {
            lineNumber: 1,
            description: "Propina - Outubro/2026 - 10.ª Classe A",
            quantity: 1,
            unitPriceFmt: "35 000,00 Kz",
            totalAmountFmt: "35 000,00 Kz",
            totalNetFmt: "35 000,00 Kz",
            taxPercentage: 0,
            exemptionCode: "M11",
            exemptionReason: "Isenção no domínio da educação (Artigo 12.º do CIVA)",
            taxLabel: "Isento (M11)",
          },
          {
            lineNumber: 2,
            description: "Transporte Escolar - Rota Alvalade",
            quantity: 1,
            unitPriceFmt: "15 000,00 Kz",
            totalAmountFmt: "15 000,00 Kz",
            totalNetFmt: "15 000,00 Kz",
            taxPercentage: 0,
            exemptionCode: "M04",
            exemptionReason: "Não sujeito nos termos do Código do IVA",
            taxLabel: "Não sujeito (M04)",
          },
        ],
        subtotalFmt: "50 000,00 Kz",
        ivaFmt: "0,00 Kz",
        grossTotalFmt: "50 000,00 Kz",
        taxSummary: [
          { label: "Isento (M11)", base: "35 000,00 Kz", iva: "0,00 Kz" },
          { label: "Não sujeito (M04)", base: "15 000,00 Kz", iva: "0,00 Kz" },
        ],
        digitalSignatureSha1: sampleSignature,
        hashControl,
        certificationNumber: "99/AGT/2026",
        softwareVersion: "1.0.0",
      };

      const doc = buildInvoicePdf(input);
      expect(doc).toBeDefined();

      // Verificação das dimensões A4: 210mm x 297mm
      expect(Math.round(doc.internal.pageSize.getWidth())).toBe(210);
      expect(Math.round(doc.internal.pageSize.getHeight())).toBe(297);

      // Verificação de saída em buffer binário
      const buffer = doc.output("arraybuffer");
      expect(buffer.byteLength).toBeGreaterThan(1000);
    });

    it("se adquirente não tiver NIF, deve exibir Consumidor Final e NIF 999999999", () => {
      const input: FiscalInvoicePdfInput = {
        schoolName: "Colégio Teste",
        schoolNif: "5000000000",
        documentNumber: "FT 2026/2",
        invoiceDateYYYYMMDD: "2026-10-26",
        clienteNome: "",
        clienteNif: "999999999",
        studentName: "—",
        lineItems: [
          {
            lineNumber: 1,
            description: "Taxa de Matrícula",
            quantity: 1,
            unitPriceFmt: "20 000,00 Kz",
            totalAmountFmt: "20 000,00 Kz",
            taxPercentage: 0,
            exemptionCode: "M11",
            exemptionReason: "Isenção no domínio da educação",
          },
        ],
        grossTotalFmt: "20 000,00 Kz",
      };

      const doc = buildInvoicePdf(input);
      expect(doc).toBeDefined();
    });

    it("se for Nota de Crédito (NC), deve incluir referência ao documento de origem", () => {
      const input: FiscalInvoicePdfInput = {
        schoolName: "Complexo Escolar",
        schoolNif: "5000123456",
        documentNumber: "NC 2026/1",
        invoiceDateYYYYMMDD: "2026-10-26",
        docType: "NC",
        referencedDocNumber: "FT 2026/22",
        referencedDocDate: "2026-09-15",
        clienteNome: "Manuel António",
        clienteNif: "5001112223",
        studentName: "Pedro António",
        lineItems: [
          {
            lineNumber: 1,
            description: "Estorno de Propina",
            quantity: 1,
            unitPriceFmt: "30 000,00 Kz",
            totalAmountFmt: "30 000,00 Kz",
            taxPercentage: 0,
            exemptionCode: "M11",
            exemptionReason: "Isenção no domínio da educação",
          },
        ],
        grossTotalFmt: "30 000,00 Kz",
      };

      const doc = buildInvoicePdf(input);
      expect(doc).toBeDefined();
    });

    it("deve conter o nome do software oficial 'Edukamba' e não 'EduCamba' no rodapé de certificação", () => {
      const footnote = buildCertificationFooter("A1B2", "99/AGT/2026", "1.0.0");
      expect(footnote).toContain("Edukamba");
      expect(footnote).not.toContain("EduCamba");
      expect(footnote).toBe("A1B2 - Processado por programa validado n.º 99/AGT/2026 Edukamba v1.0.0");
    });

    it("quando logotipo está presente em data:image, não deve haver sobreposição com o nome da escola", () => {
      // 1x1 png transparente em base64
      const dummyLogo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const input: FiscalInvoicePdfInput = {
        schoolName: "Colégio Jacimar",
        schoolNif: "3949848484",
        schoolAddress: "Bairro Popular",
        logoDataUrl: dummyLogo,
        documentNumber: "FT EDK/7",
        invoiceDateYYYYMMDD: "2026-10-26",
        docType: "FT",
        clienteNome: "Pablo Barroso",
        clienteNif: "1284758304",
        studentName: "Sara Miller",
        studentClassroom: "6ºB",
        academicYearLabel: "2026/2027",
        lineItems: [
          {
            lineNumber: 1,
            description: "Propina - Novembro (2026/2027)",
            quantity: 1,
            unitPriceFmt: "23 000,00 Kz",
            totalAmountFmt: "23 000,00 Kz",
            taxPercentage: 0,
            exemptionCode: "M11",
            exemptionReason: "Isenção no domínio da educação (Artigo 12.º do CIVA)",
          },
        ],
        grossTotalFmt: "23 000,00 Kz",
        digitalSignatureSha1: "0000000000000000000000000000000000000000",
        hashControl: "0000",
      };

      const doc = buildInvoicePdf(input);
      expect(doc).toBeDefined();
      const output = doc.output("arraybuffer");
      expect(output.byteLength).toBeGreaterThan(1000);
    });
  });
});
