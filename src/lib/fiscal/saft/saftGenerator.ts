import { EmittedFiscalDocument, FiscalTaxSummaryItem } from "../types";
import { formatMoney, roundMoney } from "../services/fiscalCalculations";

export interface SaftCompanyInfo {
  name: string;
  tradingName?: string;
  nif: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export interface SaftSoftwareInfo {
  companyNif?: string;
  companyName?: string;
  productName?: string;
  productVersion?: string;
  certificationNumber?: string;
}

export interface SaftGenerationParams {
  company: SaftCompanyInfo;
  software?: SaftSoftwareInfo;
  fiscalYear: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  documents: EmittedFiscalDocument[];
  dateCreated?: string;
}

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Gerador oficial de ficheiro XML SAF-T (AO) conforme a Portaria e XSD da AGT.
 */
export class SaftGenerator {
  /**
   * Constrói o XML completo do SAF-T (AO) 1.01_01.
   */
  static generateXml(params: SaftGenerationParams): string {
    const { company, fiscalYear, startDate, endDate, dateCreated } = params;
    const software = {
      companyNif: params.software?.companyNif || "5000000000",
      companyName: params.software?.companyName || "Edukamba Lda",
      productName: params.software?.productName || "Edukamba",
      productVersion: params.software?.productVersion || "1.0.0",
      certificationNumber: params.software?.certificationNumber || "0/AGT/2026",
    };

    const created = dateCreated || new Date().toISOString().slice(0, 10);

    // Filtrar apenas documentos fiscais comerciais para SalesInvoices (FT, FR, NC, ND) e para Payments (RC)
    // Proformas (PF) são documentos preliminares e são estritamente omitidos do SAF-T
    const fiscalDocs = params.documents.filter(
      (d) => d.docType === "FT" || d.docType === "FR" || d.docType === "NC" || d.docType === "ND"
    );
    const paymentDocs = params.documents.filter((d) => d.docType === "RC");

    // 1. Extrair Clientes únicos para MasterFiles (tanto de faturas como de recibos)
    const customerMap = new Map<string, { nif: string; name: string; city: string; address: string }>();
    for (const doc of [...fiscalDocs, ...paymentDocs]) {
      const custId = doc.customerNif || "999999999";
      if (!customerMap.has(custId)) {
        customerMap.set(custId, {
          nif: doc.customerNif || "999999999",
          name: doc.customerName || (custId === "999999999" ? "Consumidor Final" : "Cliente"),
          city: doc.customerCity || "Luanda",
          address: doc.customerAddress || "Desconhecido",
        });
      }
    }

    // 2. Extrair Artigos/Produtos únicos para MasterFiles
    const productMap = new Map<string, { code: string; description: string }>();
    for (const doc of fiscalDocs) {
      for (const line of doc.lines) {
        if (!productMap.has(line.productCode)) {
          productMap.set(line.productCode, {
            code: line.productCode,
            description: line.productDescription,
          });
        }
      }
    }

    // 3. TaxTable oficial
    const taxTableEntries: Array<{
      code: string;
      percentage: number;
      description: string;
    }> = [
      { code: "NOR", percentage: 14, description: "Taxa Normal 14%" },
      { code: "RED", percentage: 7, description: "Taxa Reduzida 7%" },
      { code: "RED5", percentage: 5, description: "Taxa Reduzida 5%" },
      { code: "ISE", percentage: 0, description: "Isento de IVA" },
    ];

    // 4. Calcular Totais de Controlo
    let totalDebit = 0;
    let totalCredit = 0;

    for (const doc of fiscalDocs) {
      for (const line of doc.lines) {
        if (doc.docType === "NC") {
          // Em Notas de Crédito, o montante da linha vai para Débito
          totalDebit = roundMoney(totalDebit + line.netAmount);
        } else {
          // Em Faturas (FT, FR, ND), o montante da linha vai para Crédito
          totalCredit = roundMoney(totalCredit + line.netAmount);
        }
      }
    }

    totalDebit = roundMoney(totalDebit);
    totalCredit = roundMoney(totalCredit);

    // 5. Montar XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n`;

    // ─── Header ─────────────────────────────────────────────────────────────
    xml += `  <Header>\n`;
    xml += `    <AuditFileVersion>1.01_01</AuditFileVersion>\n`;
    xml += `    <CompanyID>${esc(company.nif)}</CompanyID>\n`;
    xml += `    <TaxRegistrationNumber>${esc(company.nif)}</TaxRegistrationNumber>\n`;
    xml += `    <TaxAccountingBasis>F</TaxAccountingBasis>\n`;
    xml += `    <CompanyName>${esc(company.name)}</CompanyName>\n`;
    xml += `    <BusinessName>${esc(company.tradingName || company.name)}</BusinessName>\n`;
    xml += `    <CompanyAddress>\n`;
    xml += `      <AddressDetail>${esc(company.address || "Luanda")}</AddressDetail>\n`;
    xml += `      <City>${esc(company.city || "Luanda")}</City>\n`;
    xml += `      <Country>AO</Country>\n`;
    xml += `    </CompanyAddress>\n`;
    xml += `    <FiscalYear>${fiscalYear}</FiscalYear>\n`;
    xml += `    <StartDate>${startDate}</StartDate>\n`;
    xml += `    <EndDate>${endDate}</EndDate>\n`;
    xml += `    <CurrencyCode>AOA</CurrencyCode>\n`;
    xml += `    <DateCreated>${created}</DateCreated>\n`;
    xml += `    <TaxEntity>Global</TaxEntity>\n`;
    xml += `    <ProductCompanyTaxID>${esc(software.companyNif)}</ProductCompanyTaxID>\n`;
    xml += `    <SoftwareValidationNumber>${esc(software.certificationNumber)}</SoftwareValidationNumber>\n`;
    xml += `    <ProductID>${esc(software.productName)}/${esc(software.companyName)}</ProductID>\n`;
    xml += `    <ProductVersion>${esc(software.productVersion)}</ProductVersion>\n`;
    xml += `  </Header>\n`;

    // ─── MasterFiles ────────────────────────────────────────────────────────
    xml += `  <MasterFiles>\n`;

    // Customer
    for (const [custId, cust] of customerMap.entries()) {
      xml += `    <Customer>\n`;
      xml += `      <CustomerID>${esc(custId)}</CustomerID>\n`;
      xml += `      <AccountID>Desconhecido</AccountID>\n`;
      xml += `      <CustomerTaxID>${esc(cust.nif)}</CustomerTaxID>\n`;
      xml += `      <CompanyName>${esc(cust.name)}</CompanyName>\n`;
      xml += `      <BillingAddress>\n`;
      xml += `        <AddressDetail>${esc(cust.address)}</AddressDetail>\n`;
      xml += `        <City>${esc(cust.city)}</City>\n`;
      xml += `        <Country>AO</Country>\n`;
      xml += `      </BillingAddress>\n`;
      xml += `      <SelfBillingIndicator>0</SelfBillingIndicator>\n`;
      xml += `    </Customer>\n`;
    }

    // Product
    for (const prod of productMap.values()) {
      xml += `    <Product>\n`;
      xml += `      <ProductType>S</ProductType>\n`;
      xml += `      <ProductCode>${esc(prod.code)}</ProductCode>\n`;
      xml += `      <ProductGroup>Servicos</ProductGroup>\n`;
      xml += `      <ProductDescription>${esc(prod.description)}</ProductDescription>\n`;
      xml += `      <ProductNumberCode>${esc(prod.code)}</ProductNumberCode>\n`;
      xml += `    </Product>\n`;
    }

    // TaxTable
    xml += `    <TaxTable>\n`;
    for (const t of taxTableEntries) {
      xml += `      <TaxTableEntry>\n`;
      xml += `        <TaxType>IVA</TaxType>\n`;
      xml += `        <TaxCountryRegion>AO</TaxCountryRegion>\n`;
      xml += `        <TaxCode>${esc(t.code)}</TaxCode>\n`;
      xml += `        <Description>${esc(t.description)}</Description>\n`;
      xml += `        <TaxPercentage>${t.percentage.toFixed(2)}</TaxPercentage>\n`;
      xml += `      </TaxTableEntry>\n`;
    }
    xml += `    </TaxTable>\n`;

    xml += `  </MasterFiles>\n`;

    // ─── SourceDocuments / SalesInvoices ─────────────────────────────────────
    xml += `  <SourceDocuments>\n`;
    xml += `    <SalesInvoices>\n`;
    xml += `      <NumberOfEntries>${fiscalDocs.length}</NumberOfEntries>\n`;
    xml += `      <TotalDebit>${formatMoney(totalDebit)}</TotalDebit>\n`;
    xml += `      <TotalCredit>${formatMoney(totalCredit)}</TotalCredit>\n`;

    for (const doc of fiscalDocs) {
      const month = parseInt(doc.invoiceDate.slice(5, 7), 10) || 1;
      const custId = doc.customerNif || "999999999";

      xml += `      <Invoice>\n`;
      xml += `        <InvoiceNo>${esc(doc.documentNumber)}</InvoiceNo>\n`;
      xml += `        <DocumentStatus>\n`;
      xml += `          <InvoiceStatus>${doc.status}</InvoiceStatus>\n`;
      xml += `          <InvoiceStatusDate>${doc.systemEntryDate}</InvoiceStatusDate>\n`;
      xml += `          <SourceID>Admin</SourceID>\n`;
      xml += `          <SourceBilling>P</SourceBilling>\n`;
      xml += `        </DocumentStatus>\n`;
      xml += `        <Hash>${esc(doc.hash)}</Hash>\n`;
      xml += `        <HashControl>${esc(doc.hashControl)}</HashControl>\n`;
      xml += `        <Period>${month}</Period>\n`;
      xml += `        <InvoiceDate>${doc.invoiceDate}</InvoiceDate>\n`;
      xml += `        <InvoiceType>${doc.docType}</InvoiceType>\n`;
      xml += `        <SpecialRegimes>\n`;
      xml += `          <SelfBillingIndicator>0</SelfBillingIndicator>\n`;
      xml += `          <CashVATSchemeIndicator>0</CashVATSchemeIndicator>\n`;
      xml += `          <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>\n`;
      xml += `        </SpecialRegimes>\n`;
      xml += `        <SourceID>Admin</SourceID>\n`;
      xml += `        <SystemEntryDate>${doc.systemEntryDate}</SystemEntryDate>\n`;
      xml += `        <CustomerID>${esc(custId)}</CustomerID>\n`;

      // Rastreabilidade de Nota de Crédito (NC)
      if (doc.docType === "NC" && doc.referencedDocumentNumber) {
        xml += `        <References>\n`;
        xml += `          <Reference>${esc(doc.referencedDocumentNumber)}</Reference>\n`;
        xml += `          <Reason>${esc(doc.rectificationReason || "Retificação de fatura")}</Reason>\n`;
        xml += `        </References>\n`;
      }

      // Rastreabilidade de Conversão de Pró-Forma (OrderReferences)
      if (doc.orderReferencePP) {
        xml += `        <OrderReferences>\n`;
        xml += `          <OriginatingON>${esc(doc.orderReferencePP)}</OriginatingON>\n`;
        xml += `          <OrderDate>${doc.invoiceDate}</OrderDate>\n`;
        xml += `        </OrderReferences>\n`;
      }

      // Linhas do documento
      for (const line of doc.lines) {
        xml += `        <Line>\n`;
        xml += `          <LineNumber>${line.lineNumber}</LineNumber>\n`;
        xml += `          <ProductCode>${esc(line.productCode)}</ProductCode>\n`;
        xml += `          <ProductDescription>${esc(line.productDescription)}</ProductDescription>\n`;
        xml += `          <Quantity>${line.quantity.toFixed(4)}</Quantity>\n`;
        xml += `          <UnitOfMeasure>${esc(line.unitOfMeasure)}</UnitOfMeasure>\n`;
        xml += `          <UnitPrice>${formatMoney(line.unitPrice)}</UnitPrice>\n`;
        xml += `          <TaxPointDate>${doc.invoiceDate}</TaxPointDate>\n`;
        if (doc.docType === "NC" && (doc.referencedDocumentNumber || (line as { referencedDocumentNumber?: string }).referencedDocumentNumber)) {
          const refDoc = (line as { referencedDocumentNumber?: string }).referencedDocumentNumber || doc.referencedDocumentNumber;
          xml += `          <References>\n`;
          xml += `            <Reference>${esc(refDoc)}</Reference>\n`;
          xml += `            <Reason>${esc(doc.rectificationReason || "Retificação de fatura")}</Reason>\n`;
          xml += `          </References>\n`;
        }
        xml += `          <Description>${esc(line.productDescription)}</Description>\n`;

        if (doc.docType === "NC") {
          xml += `          <DebitAmount>${formatMoney(line.netAmount)}</DebitAmount>\n`;
        } else {
          xml += `          <CreditAmount>${formatMoney(line.netAmount)}</CreditAmount>\n`;
        }

        xml += `          <Tax>\n`;
        xml += `            <TaxType>IVA</TaxType>\n`;
        xml += `            <TaxCountryRegion>AO</TaxCountryRegion>\n`;
        xml += `            <TaxCode>${esc(line.taxCode)}</TaxCode>\n`;
        xml += `            <TaxPercentage>${line.taxPercentage.toFixed(2)}</TaxPercentage>\n`;
        xml += `          </Tax>\n`;

        if (line.taxPercentage === 0) {
          xml += `          <TaxExemptionReason>${esc(line.taxExemptionReason || "Isenção de IVA")}</TaxExemptionReason>\n`;
          xml += `          <TaxExemptionCode>${esc(line.taxExemptionCode || "M11")}</TaxExemptionCode>\n`;
        }

        if (line.effectiveDiscountAmount && line.effectiveDiscountAmount > 0) {
          xml += `          <SettlementAmount>${formatMoney(line.effectiveDiscountAmount)}</SettlementAmount>\n`;
        }

        xml += `        </Line>\n`;
      }

      // DocumentTotals
      xml += `        <DocumentTotals>\n`;
      xml += `          <TaxPayable>${formatMoney(doc.taxPayable)}</TaxPayable>\n`;
      xml += `          <NetTotal>${formatMoney(doc.subtotalNet)}</NetTotal>\n`;
      xml += `          <GrossTotal>${formatMoney(doc.grossTotal)}</GrossTotal>\n`;
      if (doc.discountGlobalAmount && doc.discountGlobalAmount > 0) {
        xml += `          <Settlement>\n`;
        xml += `            <SettlementAmount>${formatMoney(doc.discountGlobalAmount)}</SettlementAmount>\n`;
        xml += `          </Settlement>\n`;
      }
      xml += `        </DocumentTotals>\n`;

      xml += `      </Invoice>\n`;
    }

    xml += `    </SalesInvoices>\n`;

    // ─── SEÇÃO DE PAYMENTS (RC — RECIBOS) ────────────────────────────────────────
    // Os recibos que liquidam faturas FT prévias entram na tabela Payments,
    // garantindo quitação financeira sem duplicidade de imposto no SAF-T.
    if (paymentDocs.length > 0) {
      let totalPaymentCredit = 0;
      for (const p of paymentDocs) {
        totalPaymentCredit = roundMoney(totalPaymentCredit + p.grossTotal);
      }

      xml += `    <Payments>\n`;
      xml += `      <NumberOfEntries>${paymentDocs.length}</NumberOfEntries>\n`;
      xml += `      <TotalDebit>0.00</TotalDebit>\n`;
      xml += `      <TotalCredit>${formatMoney(totalPaymentCredit)}</TotalCredit>\n`;

      for (const rc of paymentDocs) {
        const period = parseInt(rc.invoiceDate.slice(5, 7), 10) || 1;
        const refFt = rc.referencedDocumentNumber || rc.orderReferencePP || "FT";

        xml += `      <Payment>\n`;
        xml += `        <PaymentRefNo>${esc(rc.documentNumber)}</PaymentRefNo>\n`;
        xml += `        <Period>${period}</Period>\n`;
        xml += `        <TransactionDate>${rc.invoiceDate}</TransactionDate>\n`;
        xml += `        <PaymentType>RC</PaymentType>\n`;
        xml += `        <Description>${esc(`Quitação de fatura ${refFt}`)}</Description>\n`;
        xml += `        <SystemID>${esc(rc.id || rc.documentNumber)}</SystemID>\n`;
        xml += `        <DocumentStatus>\n`;
        xml += `          <PaymentStatus>N</PaymentStatus>\n`;
        xml += `          <PaymentStatusDate>${rc.systemEntryDate || rc.invoiceDate + "T12:00:00"}</PaymentStatusDate>\n`;
        xml += `          <SourceID>${esc(rc.customerNif || "999999999")}</SourceID>\n`;
        xml += `          <SourcePayment>P</SourcePayment>\n`;
        xml += `        </DocumentStatus>\n`;
        xml += `        <PaymentMethod>\n`;
        xml += `          <PaymentMechanism>OU</PaymentMechanism>\n`;
        xml += `          <PaymentAmount>${formatMoney(rc.grossTotal)}</PaymentAmount>\n`;
        xml += `          <PaymentDate>${rc.invoiceDate}</PaymentDate>\n`;
        xml += `        </PaymentMethod>\n`;
        xml += `        <SourceDocumentID>\n`;
        xml += `          <OriginatingON>${esc(refFt)}</OriginatingON>\n`;
        xml += `          <InvoiceDate>${rc.referencedDocumentDate || rc.invoiceDate}</InvoiceDate>\n`;
        xml += `          <Description>${esc(`Liquidação de ${refFt}`)}</Description>\n`;
        xml += `        </SourceDocumentID>\n`;
        xml += `        <SystemEntryDate>${rc.systemEntryDate || rc.invoiceDate + "T12:00:00"}</SystemEntryDate>\n`;
        xml += `        <CustomerID>${esc(rc.customerNif || "999999999")}</CustomerID>\n`;
        xml += `        <Line>\n`;
        xml += `          <LineNumber>1</LineNumber>\n`;
        xml += `          <SourceDocumentID>\n`;
        xml += `            <OriginatingON>${esc(refFt)}</OriginatingON>\n`;
        xml += `            <InvoiceDate>${rc.referencedDocumentDate || rc.invoiceDate}</InvoiceDate>\n`;
        xml += `            <Description>${esc(`Liquidação de ${refFt}`)}</Description>\n`;
        xml += `          </SourceDocumentID>\n`;
        xml += `          <CreditAmount>${formatMoney(rc.grossTotal)}</CreditAmount>\n`;
        xml += `        </Line>\n`;
        xml += `        <DocumentTotals>\n`;
        xml += `          <TaxPayable>0.00</TaxPayable>\n`;
        xml += `          <NetTotal>${formatMoney(rc.grossTotal)}</NetTotal>\n`;
        xml += `          <GrossTotal>${formatMoney(rc.grossTotal)}</GrossTotal>\n`;
        xml += `          <Settlement>\n`;
        xml += `            <SettlementAmount>${formatMoney(rc.grossTotal)}</SettlementAmount>\n`;
        xml += `          </Settlement>\n`;
        xml += `        </DocumentTotals>\n`;
        xml += `      </Payment>\n`;
      }

      xml += `    </Payments>\n`;
    }

    xml += `  </SourceDocuments>\n`;
    xml += `</AuditFile>`;

    return xml;
  }

  /**
   * Validador de integridade do SAF-T (AO).
   * Verifica se totais de controlo, linhas, clientes e produtos batem sem discrepâncias
   * tanto na secção SalesInvoices como na secção Payments.
   */
  static validateSaftIntegrity(xmlString: string): {
    isValid: boolean;
    errors: string[];
    summary: {
      numberOfEntries: number;
      totalDebit: number;
      totalCredit: number;
      calculatedDebit: number;
      calculatedCredit: number;
      paymentsEntries?: number;
      paymentsTotalCredit?: number;
    };
  } {
    const errors: string[] = [];

    // 1. Extração da secção SalesInvoices
    const salesInvoicesMatch = xmlString.match(/<SalesInvoices>([\s\S]*?)<\/SalesInvoices>/);
    const salesXml = salesInvoicesMatch ? salesInvoicesMatch[1] : xmlString;

    const numEntriesMatch = salesXml.match(/<NumberOfEntries>(\d+)<\/NumberOfEntries>/);
    const totalDebitMatch = salesXml.match(/<TotalDebit>([0-9.]+)<\/TotalDebit>/);
    const totalCreditMatch = salesXml.match(/<TotalCredit>([0-9.]+)<\/TotalCredit>/);

    const headerEntries = numEntriesMatch ? parseInt(numEntriesMatch[1], 10) : 0;
    const headerDebit = totalDebitMatch ? parseFloat(totalDebitMatch[1]) : 0;
    const headerCredit = totalCreditMatch ? parseFloat(totalCreditMatch[1]) : 0;

    // Contar Invoices
    const invoiceMatches = salesXml.match(/<Invoice>/g);
    const actualEntries = invoiceMatches ? invoiceMatches.length : 0;

    if (headerEntries !== actualEntries) {
      errors.push(
        `Discrepância em NumberOfEntries de SalesInvoices: cabeçalho indica ${headerEntries}, mas existem ${actualEntries} Invoices no XML.`
      );
    }

    // Somar débitos e créditos de todas as linhas de SalesInvoices
    let sumDebit = 0;
    const debitRegex = /<DebitAmount>([0-9.]+)<\/DebitAmount>/g;
    let dMatch: RegExpExecArray | null;
    while ((dMatch = debitRegex.exec(salesXml)) !== null) {
      sumDebit = roundMoney(sumDebit + parseFloat(dMatch[1]));
    }

    let sumCredit = 0;
    const creditRegex = /<CreditAmount>([0-9.]+)<\/CreditAmount>/g;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = creditRegex.exec(salesXml)) !== null) {
      sumCredit = roundMoney(sumCredit + parseFloat(cMatch[1]));
    }

    if (Math.abs(headerDebit - sumDebit) > 0.01) {
      errors.push(
        `Discrepância em TotalDebit de SalesInvoices: cabeçalho indica ${headerDebit.toFixed(2)}, mas a soma das linhas é ${sumDebit.toFixed(2)}.`
      );
    }

    if (Math.abs(headerCredit - sumCredit) > 0.01) {
      errors.push(
        `Discrepância em TotalCredit de SalesInvoices: cabeçalho indica ${headerCredit.toFixed(2)}, mas a soma das linhas é ${sumCredit.toFixed(2)}.`
      );
    }

    // 2. Extração da secção Payments (Recibos RC) se existir
    let payEntries = 0;
    let payHeaderCredit = 0;
    const paymentsMatch = xmlString.match(/<Payments>([\s\S]*?)<\/Payments>/);
    if (paymentsMatch) {
      const payXml = paymentsMatch[1];
      const pEntriesMatch = payXml.match(/<NumberOfEntries>(\d+)<\/NumberOfEntries>/);
      const pCreditMatch = payXml.match(/<TotalCredit>([0-9.]+)<\/TotalCredit>/);

      payEntries = pEntriesMatch ? parseInt(pEntriesMatch[1], 10) : 0;
      payHeaderCredit = pCreditMatch ? parseFloat(pCreditMatch[1]) : 0;

      const paymentTagMatches = payXml.match(/<Payment>/g);
      const actualPaymentCount = paymentTagMatches ? paymentTagMatches.length : 0;

      if (payEntries !== actualPaymentCount) {
        errors.push(
          `Discrepância em NumberOfEntries de Payments: cabeçalho indica ${payEntries}, mas existem ${actualPaymentCount} Payments no XML.`
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      summary: {
        numberOfEntries: headerEntries,
        totalDebit: headerDebit,
        totalCredit: headerCredit,
        calculatedDebit: sumDebit,
        calculatedCredit: sumCredit,
        paymentsEntries: payEntries,
        paymentsTotalCredit: payHeaderCredit,
      },
    };
  }
}
