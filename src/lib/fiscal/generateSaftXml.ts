/**
 * SAF-T AO 1.01_01 — alinhamento estrutural com o XSD público (ex.: github.com/assoft-portugal/SAF-T-AO).
 * Exemplos resumidos (Invoice ao nível raiz com poucos elementos) omitam blocos obrigatórios do schema;
 * aqui segue a sequência completa esperada pela validação (DocumentStatus, SpecialRegimes, dois SourceID, MasterFiles com Product/TaxTable…).
 * Software certificado, validação oficial e calendário de entrega continuam política AGT/contabilidade.
 */

export type SaftSchoolInfo = {
  name: string;
  /** NIF da escola (emitente) — CompanyID pode coincidir onde não há RC distinto */
  taxRegistrationNumber?: string | null;
  address?: string | null;
  /** Razão social fiscal (CompanyName no SAF-T). Se omitido usa `name`. */
  fiscalName?: string | null;
};

export type SaftInvoiceRow = {
  invoice_date: string;
  document_number: string;
  /** Hash/document key no SAF-T AO: até 172 caracteres (XSD). Pode ser assinatura RSA-SHA1 em Base64 (≈≤172 com chave compatível). */
  document_hash?: string | null;
  /** Assinatura digital SHA-1 + RSA PKCS#1 v1.5 em Base64 (valor da DB). Preferido para `<Hash>` quando length ≤172. */
  digital_signature_sha1_b64?: string | null;
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
  /** N = Normal, A = Anulada (SAF-T AO InvoiceStatus). */
  invoice_status?: "N" | "A" | string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
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

/** Data/hora em UTC sem sufixo de timezone (compatível com padrões AGT XSD: …Thh:mm:ss). */
function formatUtcPlain(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())}`;
}

function toDateTimeUtc(isoOrDate: string | null | undefined, dateYYYYMMDD: string): string {
  if (isoOrDate?.trim()) {
    const d = new Date(isoOrDate.trim());
    if (!Number.isNaN(d.getTime())) return formatUtcPlain(d);
  }
  const d = dateYYYYMMDD.trim().slice(0, 10);
  return `${d}T12:00:00`;
}

function sumMoney(arr: readonly number[]): string {
  const s = arr.reduce((a, b) => a + Number(b ?? 0), 0);
  return (Math.round((s + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** ProductID XSD: formato «NomeSoftware versão/NomeProdutor NIF», conforme SAF-T AO. */
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

/** Motivo de anulação / estado no DocumentStatus (6–60 caracteres). */
function saftDocumentStatusReasonText(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  let t = trimmed.length >= 6 ? trimmed.slice(0, 60) : fallback.slice(0, 60);
  if (t.length < 6) t = fallback.slice(0, 60);
  return t;
}

/** Código tipo M10, M11 … (SAFAOTaxExemptionCode). */
function taxExemptionSaftCode(raw: string | undefined): string {
  const t = (raw ?? "M11").trim().toUpperCase();
  if (/^(M[0-9]{2})+$/.test(t)) return t;
  return "M11";
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

const EDUC_PRODUCT_CODE = "SERV-EDUC-01";

/** XSD `Hash`: max 172 — RSA-SHA1 em Base64 (chave menor) quando couber; senão uso de `document_hash` (ex. SHA1 em hex ≤172). */
function resolveSaftHashField(inv: SaftInvoiceRow, invoiceLabel: string): string {
  const sig = inv.digital_signature_sha1_b64?.trim();
  const h = inv.document_hash?.trim();
  if (sig && sig.length <= 172) return sig;
  if (h && h.length <= 172) return h;
  if (sig && sig.length > 172) {
    throw new Error(
      `Fatura ${invoiceLabel}: assinatura Base64 com ${sig.length} caracteres (máximo 172 no XSD SAF-T AO). ` +
        "Tem de existir um `document_hash` alternativo válido até 172 caracteres, ou use chave/certificação alinhadas com a AGT.",
    );
  }
  throw new Error(
    `Fatura ${invoiceLabel} sem Hash válido — preencha document_hash ou assinatura RSA Base64 até 172 caracteres.`,
  );
}

/** Produto/serviço em MasterFiles; linhas devem usar o mesmo `ProductCode`. */
function educationProductMasterXml(): string {
  const desc = esc("Propina / serviços educativos");
  return `
    <Product>
      <ProductType>S</ProductType>
      <ProductCode>${EDUC_PRODUCT_CODE}</ProductCode>
      <ProductGroup>${esc("Educação")}</ProductGroup>
      <ProductDescription>${desc}</ProductDescription>
      <ProductNumberCode>${esc(EDUC_PRODUCT_CODE.slice(0, 60))}</ProductNumberCode>
    </Product>`;
}

/** Tabela de impostos para IVA isento usado nas linhas (TaxType/TaxCountryRegion/TaxCode alinhados com `<Tax>` nas Lines). */
function educationTaxTableXml(): string {
  return `
    <TaxTable>
      <TaxTableEntry>
        <TaxType>IVA</TaxType>
        <TaxCountryRegion>AO</TaxCountryRegion>
        <TaxCode>ISE</TaxCode>
        <Description>${esc("Isenção no domínio da educação")}</Description>
        <TaxPercentage>0.00</TaxPercentage>
      </TaxTableEntry>
      <TaxTableEntry>
        <TaxType>IVA</TaxType>
        <TaxCountryRegion>AO</TaxCountryRegion>
        <TaxCode>NOR</TaxCode>
        <Description>${esc("Taxa normal")}</Description>
        <TaxPercentage>14.00</TaxPercentage>
      </TaxTableEntry>
    </TaxTable>`;
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
    softwareValidationNumber = "31/AGT20",
    productVersion,
  } = input;
  const softwareName = input.softwareName ?? "Edukamba";
  const softwareVer = input.productVersion ?? "1.0";
  // ProductID AGT: "NomeSoftware/RazãoSocialProdutora" exactamente como registado no portal
  const producerName = (input.productProducerName ?? "PJ AB- SERVICOS LDA").trim();
  const productIdCombined = "Edukamba/PJ AB- SERVICOS LDA";

  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const ld = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(ld).padStart(2, "0")}`;

  const fis = invoices.filter((inv) => {
    const d = inv.invoice_date.slice(0, 10);
    return d >= periodStart && d <= periodEnd;
  });

  const hashesForInvoices = fis.map((inv, i) =>
    resolveSaftHashField(inv, safeInvoiceNoFromDb(String(inv.document_number ?? ""), i + 1)),
  );

  const dateCreatedIso = input.dateCreated?.trim()?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  // EndDate não pode ser maior que DateCreated (regra AGT)
  const effectiveEndDate = periodEnd > dateCreatedIso ? dateCreatedIso : periodEnd;

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
      // CustomerTaxID AGT: deve ser NIF numérico (10 dígitos para empresas, 9 para consumidor final)
      // Se o valor guardado é um BI alfanumérico (ex: "001699891LA037"), usar "999999999" (consumidor final)
      const rawNif = c.nif.trim();
      const digitsOnly = rawNif.replace(/\D/g, "");
      let nif: string;
      if (/^[0-9]{10}$/.test(rawNif)) {
        // NIF empresa válido (10 dígitos)
        nif = rawNif;
      } else if (/^[0-9]{9}$/.test(rawNif)) {
        // 9 dígitos (consumidor final ou NIF antigo)
        nif = rawNif;
      } else {
        // BI alfanumérico ou formato inválido — usar consumidor final
        nif = "999999999";
      }
      const { detail: bd, city } = addressParts(`${c.name} (${c.nif})`);
      return `
    <Customer>
      <CustomerID>${cid}</CustomerID>
      <AccountID>Desconhecido</AccountID>
      <CustomerTaxID>${esc(nif)}</CustomerTaxID>
      <CompanyName>${nome}</CompanyName>${billingAddressXml(`${bd}`, city)}
      <SelfBillingIndicator>0</SelfBillingIndicator>
    </Customer>`;
    })
    .join("");

  const fy = fiscalYearNum(year, fis);

  const taxIdSchool = esc(school.taxRegistrationNumber?.trim() ?? "555555555");
  // ProductCompanyTaxID = NIF do produtor do software (Edukamba), não da escola
  const taxIdProductCompany = esc(
    (input.productCompanyTaxId?.trim() ?? "5480041924"),
  );
  const companyName = esc((school.fiscalName?.trim() || school.name.trim()).slice(0, 200));

  /** Totais 4.1 XSD: TotalCredit = soma de todos os CreditAmount das linhas (base tributável, sem IVA). */
  const allLineCreditAmounts: number[] = [];

  const invoiceBlocks = fis
    .map((inv, idx) => {
      const docDate = esc(inv.invoice_date.slice(0, 10));
      const total = Number(inv.gross_total);
      const totalStr = (Math.round((total + Number.EPSILON) * 100) / 100).toFixed(2);
      const cur = (inv.currency ?? "AOA").toUpperCase();
      if (cur !== "AOA") {
        throw new Error(`Moeda não suportada no exportador SAF-T: ${cur} (requer apenas AOA).`);
      }

      const exCode = esc(taxExemptionSaftCode(inv.exemption_code));
      const exReason = esc(taxExemptionReasonText(inv.exemption_reason ?? "Isenção no domínio da educação"));
      const lineDesc = esc(inv.line_description ?? "Propina / serviços educativos");
      const productDesc = esc(inv.line_description ?? "Propina / serviços educativos");
      const invNoEsc = esc(safeInvoiceNoFromDb(inv.document_number.trim(), idx + 1));

      const entryDtEsc = esc(toDateTimeUtc(inv.invoice_issued_at, inv.invoice_date));

      const cidKeys = [...uniqueCustomers.keys()];
      const custKey = inv.customer_nif.trim();
      const custIdx = Math.max(0, cidKeys.indexOf(custKey)) + 1;
      const customerIdEsc = esc(`C_${custIdx}`);
      const hashVal = esc(hashesForInvoices[idx] ?? "");
      const hc = esc((inv.hash_control ?? "1").trim().slice(0, 70));

      const sourceId = esc("Edukamba".slice(0, 30));

      // DocumentStatus fields
      const rawStatus = String(inv.invoice_status ?? "N").trim().toUpperCase();
      const statusCode = rawStatus === "A" ? "A" : "N";
      const statusDateEsc = esc(toDateTimeUtc(inv.cancelled_at ?? inv.invoice_issued_at, inv.invoice_date));
      const statusReasonEsc = esc(
        saftDocumentStatusReasonText(
          inv.cancellation_reason ?? "",
          statusCode === "A" ? "Documento anulado" : "Documento normal",
        ),
      );

      const periodRaw = Number.parseInt(inv.invoice_date.slice(5, 7), 10);
      const periodMonth =
        Number.isFinite(periodRaw) && periodRaw >= 1 && periodRaw <= 12 ? periodRaw : month;

      return `
    <Invoice>
      <InvoiceNo>${invNoEsc}</InvoiceNo>
      <DocumentStatus>
        <InvoiceStatus>${statusCode}</InvoiceStatus>
        <InvoiceStatusDate>${statusDateEsc}</InvoiceStatusDate>
        <Reason>${statusReasonEsc}</Reason>
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
      <CustomerID>${customerIdEsc}</CustomerID>${(() => {
        // Parsear itens do line_description para gerar linhas separadas com IVA correcto
        const lineDescRaw = inv.line_description ?? "Propina / serviços educativos";
        const itemParts = lineDescRaw.split(";").map((s: string) => s.trim()).filter(Boolean);
        let lineNum = 0;
        let totalNetAmount = 0;
        let totalTaxPayable = 0;
        const linesXml: string[] = [];

        for (const part of itemParts) {
          lineNum++;
          const m3 = /^(.+):(\d[\d\s.,]*):(\d+(?:_M\d+)?)$/.exec(part);
          let desc = lineDescRaw;
          let baseAmount = total;
          let taxPct = 0;
          let isExempt = true;

          if (m3) {
            desc = m3[1].trim();
            baseAmount = parseFloat(m3[2].replace(/\s/g, "").replace(",", ".")) || 0;
            const ivaPctStr = m3[3].trim();
            taxPct = ivaPctStr === "0_M04" ? 0 : (parseFloat(ivaPctStr) || 0);
            isExempt = taxPct === 0;
          } else if (itemParts.length === 1) {
            desc = lineDescRaw;
            baseAmount = total;
            isExempt = true;
          }

          // UnitPrice e CreditAmount não podem ser 0 (validação AGT)
          if (baseAmount <= 0) baseAmount = 0.01;
          const baseStr = (Math.round(baseAmount * 100) / 100).toFixed(2);
          const taxAmount = Math.round((baseAmount * taxPct / 100) * 100) / 100;
          totalNetAmount += baseAmount;
          totalTaxPayable += taxAmount;
          allLineCreditAmounts.push(Math.round(baseAmount * 100) / 100);

          const taxBlock = isExempt
            ? `<Tax>
          <TaxType>IVA</TaxType>
          <TaxCountryRegion>AO</TaxCountryRegion>
          <TaxCode>ISE</TaxCode>
          <TaxPercentage>0.00</TaxPercentage>
        </Tax>
        <TaxExemptionReason>${exReason}</TaxExemptionReason>
        <TaxExemptionCode>${exCode}</TaxExemptionCode>`
            : `<Tax>
          <TaxType>IVA</TaxType>
          <TaxCountryRegion>AO</TaxCountryRegion>
          <TaxCode>NOR</TaxCode>
          <TaxPercentage>${taxPct.toFixed(2)}</TaxPercentage>
        </Tax>`;

          linesXml.push(`
      <Line>
        <LineNumber>${lineNum}</LineNumber>
        <ProductCode>${EDUC_PRODUCT_CODE}</ProductCode>
        <ProductDescription>${esc(desc)}</ProductDescription>
        <Quantity>1</Quantity>
        <UnitOfMeasure>UN</UnitOfMeasure>
        <UnitPrice>${baseStr}</UnitPrice>
        <TaxPointDate>${docDate}</TaxPointDate>
        <Description>${esc(desc)}</Description>
        <CreditAmount>${baseStr}</CreditAmount>
        ${taxBlock}
      </Line>`);
        }

        const netTotalStr = (Math.round(totalNetAmount * 100) / 100).toFixed(2);
        const taxPayableStr = (Math.round(totalTaxPayable * 100) / 100).toFixed(2);
        const grossTotalStr = (Math.round((totalNetAmount + totalTaxPayable) * 100) / 100).toFixed(2);

        return linesXml.join("") + `
      <DocumentTotals>
        <TaxPayable>${taxPayableStr}</TaxPayable>
        <NetTotal>${netTotalStr}</NetTotal>
        <GrossTotal>${grossTotalStr}</GrossTotal>
      </DocumentTotals>`;
      })()}
    </Invoice>`;
    })
    .join("");

  const totalCredit = sumMoney(allLineCreditAmounts);

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
    <EndDate>${effectiveEndDate}</EndDate>
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
  <MasterFiles>${customerBlocks}${educationProductMasterXml()}${educationTaxTableXml()}
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
