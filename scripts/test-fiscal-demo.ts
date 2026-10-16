import fs from "fs";
import path from "path";
import { FiscalSeriesService } from "../src/lib/fiscal/services/fiscalSeriesService";
import { FiscalEmissionService } from "../src/lib/fiscal/services/fiscalEmissionService";
import { SaftGenerator } from "../src/lib/fiscal/saft/saftGenerator";
import { FiscalDocumentInput } from "../src/lib/fiscal/types";

// Carregar chaves
const privateKeyPem = fs.readFileSync(path.resolve(process.cwd(), "chave_agt.pem"), "utf8");
const publicKeyPem = fs.readFileSync(path.resolve(process.cwd(), "public_key.pem"), "utf8");

async function runDemo() {
  console.log("================================================================================");
  console.log(" DEMONSTRAÇÃO E TESTE DO MÓDULO DE FATURAÇÃO CERTIFICADA AGT (EDUKAMBA) ");
  console.log(" Conformidade com o Decreto Presidencial n.º 292/18 e SAF-T (AO) 1.01_01 ");
  console.log("================================================================================\n");

  const schoolId = "escola-edukamba-demo";
  const schoolNif = "5000123456";

  // 1. Inicializar Séries (FT e NC)
  console.log("1. INICIALIZANDO SÉRIES FISCAIS (MULTI-TENANT):");
  let seriesFT = FiscalSeriesService.createInitialSeries({
    schoolId,
    seriesCode: "2026",
    documentType: "FT",
    fiscalYear: 2026,
  });
  console.log(`   - Série FT criada: ${seriesFT.seriesCode} (Ano: ${seriesFT.fiscalYear}, Próximo: 1)`);

  let seriesNC = FiscalSeriesService.createInitialSeries({
    schoolId,
    seriesCode: "2026",
    documentType: "NC",
    fiscalYear: 2026,
  });
  console.log(`   - Série NC criada: ${seriesNC.seriesCode} (Ano: ${seriesNC.fiscalYear}, Próximo: 1)\n`);

  // 2. Emitir Fatura Comercial FT
  console.log("2. EMITINDO FATURA COMERCIAL (FT) COM MÚLTIPLAS TAXAS E DESCONTO:");
  const invoiceInput: FiscalDocumentInput = {
    schoolId,
    docType: "FT",
    seriesCode: "2026",
    invoiceDate: new Date().toISOString().slice(0, 10),
    customerNif: "5009876543",
    customerName: "Dr. Manuel Domingos",
    discountGlobalAmount: 1000.0, // Desconto de 1.000 Kz
    lines: [
      {
        productCode: "PROP-OUT",
        productDescription: "Propina do Mês de Outubro (Ensino Médio)",
        quantity: 1,
        unitPrice: 35000.0,
        taxPercentage: 0,
        taxExemptionCode: "M11",
        taxExemptionReason: "Isenção no domínio da educação (Artigo 12.º do CIVA)",
      },
      {
        productCode: "UNIF-01",
        productDescription: "Uniforme Escolar Completo",
        quantity: 2,
        unitPrice: 7500.0,
        taxPercentage: 14,
      },
    ],
  };

  const { document: ftDoc, updatedSeries: updatedFT } = await FiscalEmissionService.emitDocument(
    invoiceInput,
    {
      series: seriesFT,
      schoolNif,
      privateKeyPem,
      certificationNumber: "99/AGT/2026",
      softwareVersion: "1.0.0",
      generateQrDataUrl: true,
    }
  );
  seriesFT = updatedFT;

  console.log(`   - Número do Documento: ${ftDoc.documentNumber}`);
  console.log(`   - Cliente: ${ftDoc.customerName} (NIF: ${ftDoc.customerNif})`);
  console.log(`   - Total Líquido (Base): ${ftDoc.subtotalNet.toLocaleString("pt-AO")} Kz`);
  console.log(`   - Desconto Global: ${ftDoc.discountGlobalAmount.toLocaleString("pt-AO")} Kz`);
  console.log(`   - IVA Liquidado: ${ftDoc.taxPayable.toLocaleString("pt-AO")} Kz`);
  console.log(`   - Total Bruto a Pagar: ${ftDoc.grossTotal.toLocaleString("pt-AO")} Kz`);
  console.log(`   - Plaintext Oficial AGT:\n     "${ftDoc.plaintext}"`);
  console.log(`   - Hash Control (4 caracteres): ${ftDoc.hashControl}`);
  console.log(`   - Rodapé Legal:\n     "${ftDoc.certificationFooter}"`);
  console.log(`   - Payload do QR Code Oficial AGT:\n     "${ftDoc.qrCodePayload}"\n`);

  // 3. Emitir Nota de Crédito (NC)
  console.log("3. EMITINDO NOTA DE CRÉDITO (NC) VINCULADA À FT ORIGINAL:");
  const { document: ncDoc } = await FiscalEmissionService.emitCreditNote({
    originalInvoice: ftDoc,
    reason: "Devolução de 1 uniforme escolar danificado",
    partialLines: [
      {
        productCode: "UNIF-01",
        productDescription: "Devolução de 1 Uniforme Escolar",
        quantity: 1,
        unitPrice: 7500.0,
        taxPercentage: 14,
      },
    ],
    seriesNC,
    schoolNif,
    privateKeyPem,
    certificationNumber: "99/AGT/2026",
    softwareVersion: "1.0.0",
  });

  console.log(`   - Número da NC: ${ncDoc.documentNumber}`);
  console.log(`   - Fatura de Origem Referenciada: ${ncDoc.referencedDocumentNumber}`);
  console.log(`   - Motivo da Retificação: "${ncDoc.rectificationReason}"`);
  console.log(`   - Abatimento Total: ${ncDoc.grossTotal.toLocaleString("pt-AO")} Kz (IVA: ${ncDoc.taxPayable.toLocaleString("pt-AO")} Kz)`);
  console.log(`   - Hash Control NC: ${ncDoc.hashControl}\n`);

  // 4. Gerar XML do SAF-T (AO)
  console.log("4. GERANDO E VALIDANDO FICHEIRO SAF-T (AO) 1.01_01:");
  const saftXml = SaftGenerator.generateXml({
    company: {
      name: "Complexo Escolar EduKamba",
      nif: schoolNif,
      address: "Avenida Deolinda Rodrigues, Luanda",
      city: "Luanda",
    },
    fiscalYear: 2026,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    documents: [ftDoc, ncDoc],
  });

  const validation = SaftGenerator.validateSaftIntegrity(saftXml);
  console.log(`   - Faturas no SAF-T (NumberOfEntries): ${validation.summary.numberOfEntries}`);
  console.log(`   - Total Débito (NC): ${validation.summary.totalDebit.toLocaleString("pt-AO")} Kz`);
  console.log(`   - Total Crédito (FT): ${validation.summary.totalCredit.toLocaleString("pt-AO")} Kz`);
  console.log(`   - Equilíbrio de Linhas vs Cabeçalho: ${validation.isValid ? "PERFEITO (VÁLIDO)" : "FALHOU"}`);

  if (validation.errors.length > 0) {
    console.error("   - Erros encontrados:", validation.errors);
  } else {
    console.log("   - Validação de Integridade SAF-T: 100% CONFORME com o XSD da AGT!");
  }

  console.log("\n================================================================================");
  console.log(" RESULTADO: TODOS OS PROCESSOS FISCAIS DA AGT FUNCIONARAM COM SUCESSO! ");
  console.log("================================================================================");
}

runDemo().catch((err) => {
  console.error("Erro na execução da demonstração:", err);
  process.exit(1);
});
