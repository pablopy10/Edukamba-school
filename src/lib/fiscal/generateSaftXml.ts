/** Registo suficiente para SAF-T AO 1.01 (subconjunto mínimo; validação contra XSD oficial no contabilista). */

export type SaftSchoolInfo = {
  name: string;
  /** NIF da escola (emitente) */
  taxRegistrationNumber?: string | null;
  address?: string | null;
};

export type SaftInvoiceRow = {
  invoice_date: string;
  document_number: string;
  customer_name: string;
  customer_nif: string;
  gross_total: number;
  currency?: string;
  exemption_code?: string;
  exemption_reason?: string;
  line_description?: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Produz SAF-T AO (estrutura mínima) para o período ano/mês UTC.
 */
export function generateSaftXml(input: {
  year: number;
  month: number;
  /** 1-based month */
  school: SaftSchoolInfo;
  softwareName?: string;
  softwareVersion?: string;
  invoices: SaftInvoiceRow[];
}): string {
  const { year, month, school, invoices } = input;
  const softwareName = input.softwareName ?? "Edukamba";
  const softwareVersion = input.softwareVersion ?? "1.0.0";

  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const ld = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(ld).padStart(2, "0")}`;
  const fis = invoices.filter((inv) => {
    const d = inv.invoice_date.slice(0, 10);
    return d >= periodStart && d <= periodEnd;
  });

  const uniqueCustomers = new Map<string, { name: string; nif: string }>();
  for (const inv of fis) {
    const key = inv.customer_nif;
    if (!uniqueCustomers.has(key)) uniqueCustomers.set(key, { name: inv.customer_name, nif: inv.customer_nif });
  }

  const customerLines = [...uniqueCustomers.values()]
    .map(
      (c, i) => `
    <Customer>
      <CustomerID>${esc(`C_${i + 1}`)}</CustomerID>
      <AccountID>Desconhecido</AccountID>
      <CustomerTaxID>${esc(c.nif)}</CustomerTaxID>
      <CompanyName>${esc(c.name)}</CompanyName>
    </Customer>`,
    )
    .join("");

  const invoiceBlocks = fis
    .map((inv, idx) => {
      const cur = (inv.currency ?? "AOA").toUpperCase();
      const exCode = esc(inv.exemption_code ?? "M10");
      const exReason = esc(inv.exemption_reason ?? "Isenção no domínio da educação");
      const lineDesc = esc(inv.line_description ?? "Propinas / mensalidades");
      const total = Number(inv.gross_total).toFixed(2);
      const docNr = esc(inv.document_number);
      const cid = [...uniqueCustomers.keys()].indexOf(inv.customer_nif) + 1;
      const date = esc(inv.invoice_date.slice(0, 10));
      return `
    <Invoice>
      <InvoiceNo>${idx + 1}</InvoiceNo>
      <DocumentStatus>
        <InvoiceStatus>F</InvoiceStatus>
        <InvoiceStatusDate>${date}</InvoiceStatusDate>
        <Reason>Emitido pela aplicação</Reason>
      </DocumentStatus>
      <Hash>HASH_PLACEHOLDER_${idx}</Hash>
      <InvoiceDate>${date}</InvoiceDate>
      <InvoiceType>FT</InvoiceType>
      <SpecialRegimes>M00</SpecialRegimes>
      <InvoiceNumber>${docNr}</InvoiceNumber>
      <DocumentNumber>${docNr}</DocumentNumber>
      <ATCUD>AT_DOC_${year}${String(month).padStart(2, "0")}_${idx + 1}</ATCUD>
      <CustomerID>C_${cid}</CustomerID>
      <Line>
        <LineNumber>1</LineNumber>
        <ProductDescription>${lineDesc}</ProductDescription>
        <Quantity>1</Quantity>
        <UnitOfMeasure>Unidade</UnitOfMeasure>
        <UnitPrice>${total}</UnitPrice>
        <TaxBase>${total}</TaxBase>
        <TaxExemptionCode>${exCode}</TaxExemptionCode>
        <TaxExemptionReason>${exReason}</TaxExemptionReason>
        <CreditAmount>${total}</CreditAmount>
      </Line>
      <DocumentTotals>
        <TaxPayable>${total}</TaxPayable>
        <NetTotal>${total}</NetTotal>
        <GrossTotal>${total}</GrossTotal>
        <Currency>
          <CurrencyCode>${cur}</CurrencyCode>
        </Currency>
      </DocumentTotals>
    </Invoice>`;
    })
    .join("");

  const taxIdSchool = esc(school.taxRegistrationNumber?.trim() ?? "555555555");

  const headerStart = periodStart;

  const headerEnd = periodEnd;

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
  <Header>
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${taxIdSchool}</CompanyID>
    <TaxRegistrationNumber>${taxIdSchool}</TaxRegistrationNumber>
    <CompanyName>${esc(school.name)}</CompanyName>
    <CurrencyCode>AOA</CurrencyCode>
    <TaxAccountingBasis>${esc(school.address ?? "")}</TaxAccountingBasis>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${taxIdSchool}</ProductCompanyTaxID>
    <SoftwareCompanyName>${esc(softwareName)}</SoftwareCompanyName>
    <SoftwareID>${esc(softwareName)}</SoftwareID>
    <SoftwareVersion>${esc(softwareVersion)}</SoftwareVersion>
    <ProductID>${esc(softwareName)}</ProductID>
    <HeaderComment>SAF-T educação — período ${year}-${String(month).padStart(2, "0")}</HeaderComment>
    <StartDate>${headerStart}</StartDate>
    <EndDate>${headerEnd}</EndDate>
  </Header>
  <MasterFiles>
    <Customers>${customerLines}
    </Customers>
  </MasterFiles>
  <SourceDocuments>
    <SalesInvoices>
${invoiceBlocks}
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>`;
}

export function downloadSaftXmlInBrowser(filename: string, xml: string) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
