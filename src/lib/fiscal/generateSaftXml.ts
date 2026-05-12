/**
 * SAF-T AO 1.01_01 — alinhamento estrutural com o XSD público (ex.: github.com/assoft-portugal/SAF-T-AO).
 * Exemplos resumidos (Invoice ao nível raiz com poucos elementos) omitam blocos obrigatórios do schema;
 * aqui segue a sequência completa esperada pela validação (DocumentStatus, SpecialRegimes, dois SourceID…).
 * Software certificado, validação oficial e calendário de entrega continuam política AGT/contabilidade.
 */

export type SaftSchoolInfo = {
  name: string;
  /** NIF da escola (emitente) — CompanyID pode coincidir onde não há RC distinto */
  taxRegistrationNumber?: string | null;
  address?: string | null;
};

export type SaftInvoiceRow = {
  invoice_date: string;
  document_number: string;
  /** Hash da fatura (AGT); obrigatório no XML — sem isto deve ser recusado antes da exportação */
  document_hash?: string | null;
  hash_control?: string | null;
  /** Opcional ISO — data/hora de registo para SystemEntryDate / InvoiceStatusDate */
  invoice_issued_at?: string | null;
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

/** Detalhe e cidade fallback para estruturas de morada (ISO). */
function addressParts(raw: string | null | undefined): { detail: string; city: string } {
  const t = raw?.trim() ?? "";
  if (!t) return { detail: "Morada não indicada na aplicação", city: "Luanda" };
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { detail: parts.slice(0, -1).join(", "), city: parts[parts.length - 1]!.slice(0, 50) };
  return { detail: t.slice(0, 200), city: "Luanda" };
}

function companyAoXml(school: SaftSchoolInfo): string {
  const { detail, city } = addressParts(school.address);
  return `
    <CompanyAddress>
      <AddressDetail>${esc(detail)}</AddressDetail>
      <City>${esc(city)}</City>
      <Country>AO</Country>
    </CompanyAddress>`;
}

function billingAddressXml(customerLine: string, cityFallback: string): string {
  return `
    <BillingAddress>
      <AddressDetail>${esc(customerLine)}</AddressDetail>
      <City>${esc((cityFallback || "Luanda").slice(0, 50))}</City>
      <Country>AO</Country>
    </BillingAddress>`;
}

function toDateTimeUtc(isoOrDate: string | null | undefined, dateYYYYMMDD: string): string {
  if (isoOrDate?.trim()) {
    const d = new Date(isoOrDate.trim());
    if (!Number.isNaN(d.getTime())) return d.toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  const d = dateYYYYMMDD.trim().slice(0, 10);
  return `${d}T12:00:00Z`;
}

function sumMoney(arr: readonly number[]): string {
  const s = arr.reduce((a, b) => a + Number(b ?? 0), 0);
  return (Math.round((s + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** ProductID XSD: formato «NomeApp/NomeProdutor», sem barras dentro de cada parte. */
function saftAoProductId(appNameRaw: string, producerRaw: string): string {
  const app = appNameRaw.replace(/\//g, " ").trim() || "Edukamba";
  const producer = producerRaw.replace(/\//g, " ").trim() || app;
  return `${app}/${producer}`.slice(0, 255);
}

/** Motivo de isenção: 6–60 caracteres (SAFAOTaxExemption). */
function taxExemptionReasonText(raw: string): string {
  const fallback = "Isenção no domínio da educação, conforme normas aplicáveis";
  const trimmed = raw.trim();
  let t =
    trimmed.length >= 6
      ? trimmed.slice(0, 60)
      : fallback.slice(0, 60);
  if (t.length < 6) t = fallback.slice(0, 60);
  return t;
}

/** Código tipo M10, M11 … (SAFAOTaxExemptionCode). */
function taxExemptionSaftCode(raw: string | undefined): string {
  const t = (raw ?? "M10").trim().toUpperCase();
  if (/^(M[0-9]{2})+$/.test(t)) return t;
  return "M10";
}

/** Conforme restrição pattern do XSD (ex.: FT EDK/123). */
function normalizeInvoiceNo(documentNumberRaw: string, idxFallback: number): string {
  const t = documentNumberRaw.trim();
  if (t) return t;
  return `FT EDK/${idxFallback}`;
}

/** Valida só o mínimo de pattern para InvoiceNo; caso contrário sanitiza série com seguro. */
function safeInvoiceNoFromDb(documentNumber: string, idxFallback: number): string {
  let n = normalizeInvoiceNo(documentNumber, idxFallback);
  if (!/^[^ ]+ .+\/[0-9]+$/.test(n)) {
    const m = /^FT\s*(.+)$/i.exec(n.trim());
    if (m) n = `FT ${m[1]!.replace(/^\/\s*/, "")}`;
    else n = `FT GERAL/${idxFallback}`;
  }
  return n;
}

/** Corpo FiscalYear: ano civil do período reportado ou da primeira fatura. */
function fiscalYearNum(yearFromExport: number, invoicesInPeriod: SaftInvoiceRow[]): number {
  if (invoicesInPeriod.length > 0) {
    const first = invoicesInPeriod[0]!.invoice_date.slice(0, 10);
    const y = parseInt(first.slice(0, 4), 10);
    if (!Number.isNaN(y)) return y;
  }
  return yearFromExport;
}

/**
 * Gera SAF-T AO 1.01_01 para mês indicado (invoices filtradas por invoice_date dentro do período).
 */
export function generateSaftXml(input: {
  year: number;
  month: number;
  /** 1-based month */
  school: SaftSchoolInfo;
  softwareName?: string;
  /** Sem validação oficial na AGT usar "0" conforme XSD */
  softwareValidationNumber?: string;
  /** Denominação do produtor do software (campo direito em ProductID) */
  productProducerName?: string;
  productVersion?: string;
  /**
   * Tipo programa: conforme XSD (I integrado, F facturação, etc.).
   * @see TaxAccountingBasis no SAF-T AO
   */
  taxAccountingBasis?: "A" | "C" | "F" | "I" | "P" | "Q" | "R" | "S" | "E";
  invoices: SaftInvoiceRow[];
  /** ISO date (YYYY-MM-DD) quando o SAF-T foi produzido */
  dateCreated?: string;
  /**
   * NIF da **entidade produtora do software** (campo Header `ProductCompanyTaxID`), não da escola emitente.
   * Se omitido usa o NIF da escola apenas como recurso residual — configure sempre o valor certificado quando aplicável.
   */
  productCompanyTaxId?: string | null;
}): string {
  const {
    year,
    month,
    school,
    invoices,
    taxAccountingBasis = "F",
    softwareValidationNumber = "0",
    productVersion,
  } = input;
  const softwareName = input.softwareName ?? "Edukamba";
  const productIdCombined = saftAoProductId(softwareName, input.productProducerName ?? softwareName);
  const softwareVer = input.productVersion ?? "1.0.0";

  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const ld = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(ld).padStart(2, "0")}`;

  const fis = invoices.filter((inv) => {
    const d = inv.invoice_date.slice(0, 10);
    return d >= periodStart && d <= periodEnd;
  });

  for (let i = 0; i < fis.length; i++) {
    const h = fis[i]?.document_hash?.trim();
    if (!h) {
      throw new Error(
        `Fatura ${safeInvoiceNoFromDb(String(fis[i]?.document_number ?? ""), i + 1)} sem document_hash registado — ` +
          "complete os dados AGT antes de exportar SAF-T.",
      );
    }
  }

  const dateCreatedIso = input.dateCreated?.trim()?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  const uniqueCustomers = new Map<string, { name: string; nif: string }>();
  for (const inv of fis) {
    const key = inv.customer_nif.trim();
    if (!uniqueCustomers.has(key)) uniqueCustomers.set(key, { name: inv.customer_name.trim(), nif: inv.customer_nif.trim() });
  }

  let customerIx = 0;
  const customerBlocks = [...uniqueCustomers.values()]
    .map((c) => {
      customerIx += 1;
      const cid = `C_${customerIx}`;
      const nome = esc(c.name.slice(0, 200));
      const nif = esc(c.nif);
      const { detail: bd, city } = addressParts(`${c.name} (${c.nif})`);
      return `
    <Customer>
      <CustomerID>${cid}</CustomerID>
      <AccountID>CLIENTE_${customerIx}</AccountID>
      <CustomerTaxID>${nif}</CustomerTaxID>
      <CompanyName>${nome}</CompanyName>${billingAddressXml(`${bd}`, city)}
      <SelfBillingIndicator>0</SelfBillingIndicator>
    </Customer>`;
    })
    .join("");

  const fy = fiscalYearNum(year, fis);

  const taxIdSchool = esc(school.taxRegistrationNumber?.trim() ?? "555555555");
  const taxIdProductCompany = esc(
    (input.productCompanyTaxId?.trim() ?? school.taxRegistrationNumber?.trim() ?? "555555555"),
  );
  const companyName = esc(school.name.trim().slice(0, 200));

  /** Totais 4.1 XSD: só CreditAmount por linha → TotalCredit soma montantes; TotalDebit 0. */
  let totalCredit = "0.00";
  const creditTotals: number[] = [];

  const invoiceBlocks = fis
    .map((inv, idx) => {
      const docDate = esc(inv.invoice_date.slice(0, 10));
      const total = Number(inv.gross_total);
      const totalStr = (Math.round((total + Number.EPSILON) * 100) / 100).toFixed(2);
      creditTotals.push(Number(totalStr));
      const cur = (inv.currency ?? "AOA").toUpperCase();
      if (cur !== "AOA") {
        throw new Error(`Moeda não suportada no exportador SAF-T: ${cur} (requer apenas AOA).`);
      }

      const exCode = esc(taxExemptionSaftCode(inv.exemption_code));
      const exReason = esc(taxExemptionReasonText(inv.exemption_reason ?? "Isenção no domínio da educação"));
      const lineDesc = esc(inv.line_description ?? "Propinas / mensalidades");
      const productDesc = esc(inv.line_description ?? "Propinas / mensalidades");
      const invNoEsc = esc(safeInvoiceNoFromDb(inv.document_number.trim(), idx + 1));

      const entryDtEsc = esc(toDateTimeUtc(inv.invoice_issued_at, inv.invoice_date));

      const cidKeys = [...uniqueCustomers.keys()];
      const custKey = inv.customer_nif.trim();
      const custIdx = Math.max(0, cidKeys.indexOf(custKey)) + 1;
      const customerIdEsc = esc(`C_${custIdx}`);
      const hashVal = esc((inv.document_hash ?? "").trim().slice(0, 172));
      const hc = esc((inv.hash_control ?? "1").trim().slice(0, 70));

      const sourceId = esc("Edukamba".slice(0, 30));

      const periodRaw = Number.parseInt(inv.invoice_date.slice(5, 7), 10);
      const periodMonth =
        Number.isFinite(periodRaw) && periodRaw >= 1 && periodRaw <= 12 ? periodRaw : month;

      return `
    <Invoice>
      <InvoiceNo>${invNoEsc}</InvoiceNo>
      <DocumentStatus>
        <InvoiceStatus>N</InvoiceStatus>
        <InvoiceStatusDate>${entryDtEsc}</InvoiceStatusDate>
        <Reason>Emitido pela aplicação</Reason>
        <SourceID>${sourceId}</SourceID>
        <SourceBilling>P</SourceBilling>
      </DocumentStatus>
      <Hash>${hashVal}</Hash>
      <HashControl>${hc}</HashControl>
      <Period>${periodMonth}</Period>
      <InvoiceDate>${docDate}</InvoiceDate>
      <InvoiceType>FT</InvoiceType>
      <SpecialRegimes>
        <SelfBillingIndicator>0</SelfBillingIndicator>
        <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
        <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
      </SpecialRegimes>
      <SourceID>${sourceId}</SourceID>
      <SystemEntryDate>${entryDtEsc}</SystemEntryDate>
      <CustomerID>${customerIdEsc}</CustomerID>
      <Line>
        <LineNumber>1</LineNumber>
        <ProductCode>SERV-EDUC-01</ProductCode>
        <ProductDescription>${productDesc}</ProductDescription>
        <Quantity>1</Quantity>
        <UnitOfMeasure>UN</UnitOfMeasure>
        <UnitPrice>${totalStr}</UnitPrice>
        <TaxBase>${totalStr}</TaxBase>
        <TaxPointDate>${docDate}</TaxPointDate>
        <Description>${lineDesc}</Description>
        <CreditAmount>${totalStr}</CreditAmount>
        <Tax>
          <TaxType>IVA</TaxType>
          <TaxCountryRegion>AO</TaxCountryRegion>
          <TaxCode>ISE</TaxCode>
          <TaxPercentage>0.00</TaxPercentage>
        </Tax>
        <TaxExemptionReason>${exReason}</TaxExemptionReason>
        <TaxExemptionCode>${exCode}</TaxExemptionCode>
      </Line>
      <DocumentTotals>
        <TaxPayable>0.00</TaxPayable>
        <NetTotal>${totalStr}</NetTotal>
        <GrossTotal>${totalStr}</GrossTotal>
      </DocumentTotals>
    </Invoice>`;
    })
    .join("");

  totalCredit = sumMoney(creditTotals);

  const nEntries = fis.length;
  const totalDebit = "0.00";

  const headerInner = `
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${taxIdSchool}</CompanyID>
    <TaxRegistrationNumber>${taxIdSchool}</TaxRegistrationNumber>
    <TaxAccountingBasis>${taxAccountingBasis}</TaxAccountingBasis>
    <CompanyName>${companyName}</CompanyName>${companyAoXml(school)}
    <FiscalYear>${fy}</FiscalYear>
    <StartDate>${periodStart}</StartDate>
    <EndDate>${periodEnd}</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
    <DateCreated>${dateCreatedIso}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductCompanyTaxID>${taxIdProductCompany}</ProductCompanyTaxID>
    <SoftwareValidationNumber>${esc(softwareValidationNumber)}</SoftwareValidationNumber>
    <ProductID>${esc(productIdCombined)}</ProductID>
    <ProductVersion>${esc(softwareVer.slice(0, 30))}</ProductVersion>
    <HeaderComment>SAF-T educação — período ${year}-${String(month).padStart(2, "0")}</HeaderComment>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
  <Header>${headerInner}
  </Header>
  <MasterFiles>${customerBlocks}
  </MasterFiles>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${nEntries}</NumberOfEntries>
      <TotalDebit>${totalDebit}</TotalDebit>
      <TotalCredit>${totalCredit}</TotalCredit>${invoiceBlocks}
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
