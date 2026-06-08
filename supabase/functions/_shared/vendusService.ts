/**
 * Serviço de integração com a API Vendus Angola (v1.1).
 * Isolamento multi-conta: cada instância recebe a API Key da escola.
 *
 * Base URL configurável via VENDUS_API_BASE_URL (default: documentação oficial).
 * Autenticação: HTTP Basic (API Key como username, password vazio).
 */
import axios, { AxiosError, type AxiosInstance } from "https://esm.sh/axios@1.7.9";

/** URL oficial documentada; api.vendus.ao/v1 pode ser configurada via env. */
const DEFAULT_VENDUS_BASE_URL = "https://www.vendus.co.ao/ws/v1.1";

export type VendusDocumentType = "FT" | "FR";

export type DadosClienteVendus = {
  profileId: string;
  nome: string;
  nif: string | null;
  email: string | null;
  /** ID já persistido em profiles.vendus_client_id */
  vendusClientId?: string | null;
};

export type VendusTaxId = "NOR" | "OUT" | "INT" | "IVA-CAB" | "RED" | "ISE";

export type ItemFaturaVendus = {
  titulo: string;
  referencia?: string;
  quantidade?: number | string;
  precoBruto: number | string;
  /** Taxa Vendus: NOR (14%), ISE (isento), etc. */
  taxId?: VendusTaxId;
  descontoValor?: number | string | null;
  descontoPercentagem?: number | string | null;
};

export type PagamentoVendus = {
  id: string;
  valor: number | string;
  dataVencimento?: string;
};

export type DadosFaturaPropinas = {
  tipo: VendusDocumentType;
  clientId: string;
  itens: ItemFaturaVendus[];
  pagamentos?: PagamentoVendus[];
  descontoValor?: number | string | null;
  descontoPercentagem?: number | string | null;
  data?: string;
  dataFornecimento?: string;
  notas?: string;
  referenciaExterna?: string;
  registerId?: number | string;
};

export type ResultadoClienteVendus = {
  vendusClientId: string;
  criado: boolean;
};

export type ResultadoFaturaVendus = {
  documentId: string;
  documentNumber: string;
  pdfUrl: string;
  tipo: string;
  valorBruto?: string;
};

export type ResultadoSaftVendus = {
  ano: number;
  mes: number;
  xml: string;
};

export class VendusApiError extends Error {
  readonly status?: number;
  readonly vendusPayload?: unknown;

  constructor(message: string, status?: number, vendusPayload?: unknown) {
    super(message);
    this.name = "VendusApiError";
    this.status = status;
    this.vendusPayload = vendusPayload;
  }
}

function resolveBaseUrl(customBase?: string): string {
  const fromEnv = Deno.env.get("VENDUS_API_BASE_URL")?.trim();
  const base = (customBase ?? fromEnv ?? DEFAULT_VENDUS_BASE_URL).replace(/\/+$/, "");
  return base;
}

function parseVendusQty(value: number | string | undefined): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "1").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) throw new VendusApiError("Quantidade de item inválida.");
  return n;
}

function parseVendusMoney(value: number | string): number {
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new VendusApiError(`Valor monetário inválido: ${value}`);
  return Math.round(n * 100) / 100;
}

const VENDUS_TAX_IDS = new Set<VendusTaxId>(["NOR", "OUT", "INT", "IVA-CAB", "RED", "ISE"]);

function normalizeVendusTaxId(value: VendusTaxId | undefined): VendusTaxId {
  if (value && VENDUS_TAX_IDS.has(value)) return value;
  return "NOR";
}

function buildVendusDocumentItem(item: ItemFaturaVendus): Record<string, unknown> {
  const row: Record<string, unknown> = {
    title: item.titulo.trim(),
    qty: parseVendusQty(item.quantidade),
    gross_price: parseVendusMoney(item.precoBruto),
    tax_id: normalizeVendusTaxId(item.taxId),
  };
  if (item.referencia?.trim()) row.reference = item.referencia.trim();
  if (item.descontoValor != null && Number(item.descontoValor) > 0) {
    row.discount_amount = parseVendusMoney(item.descontoValor);
  }
  if (item.descontoPercentagem != null && Number(item.descontoPercentagem) > 0) {
    row.discount_percentage = parseVendusMoney(item.descontoPercentagem);
  }
  return row;
}

/** Vendus aceita apenas YYYY-MM-DD; payments.payment_date é timestamptz. */
export function normalizeVendusDate(value: string | null | undefined): string {
  if (!value?.trim()) return new Date().toISOString().slice(0, 10);
  const trimmed = value.trim();
  const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function extractVendusErrorMessage(payload: unknown, fallback: string): string {
  if (payload == null) return fallback;
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (typeof payload !== "object") return fallback;
  const obj = payload as Record<string, unknown>;
  const candidates = [obj.message, obj.error, obj.detail, obj.description];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  if (Array.isArray(obj.errors) && obj.errors.length > 0) {
    return obj.errors.map((e) => {
      if (typeof e === "string") return e;
      if (e && typeof e === "object") {
        const row = e as Record<string, unknown>;
        if (typeof row.message === "string" && row.message.trim()) return row.message.trim();
      }
      return JSON.stringify(e);
    }).join("; ");
  }
  if (Array.isArray(obj.feedback) && obj.feedback.length > 0) {
    const first = obj.feedback[0] as Record<string, unknown> | undefined;
    const msg = first?.message ?? first?.text;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return fallback;
}

type VendusPaymentMethodRow = {
  id?: string | number;
  title?: string;
  type?: string;
  status?: string;
};

type VendusRegisterRow = {
  id?: string | number;
  store_id?: string | number;
  status?: string;
  situation?: string;
  isActive?: string;
  subscription_active?: string;
  type?: string;
  mode?: string;
};

type ResolvedVendusRegister = {
  id: string;
  mode: "normal" | "tests";
};

function isVendusRegisterActive(r: VendusRegisterRow): boolean {
  if (String(r.situation ?? "on").toLowerCase() === "off") return false;
  if (String(r.isActive ?? "yes").toLowerCase() === "no") return false;
  if (String(r.subscription_active ?? "yes").toLowerCase() === "no") return false;
  return true;
}

function resolveDocumentMode(registerMode?: string): "normal" | "tests" {
  const envMode = Deno.env.get("VENDUS_DOCUMENT_MODE")?.trim().toLowerCase();
  if (envMode === "tests" || envMode === "test") return "tests";
  if (envMode === "normal") return "normal";
  return String(registerMode ?? "normal").toLowerCase() === "tests" ? "tests" : "normal";
}

function isApiRegister(r: VendusRegisterRow): boolean {
  return String(r.type ?? "").trim().toLowerCase() === "api";
}

function unwrapVendusList<T>(data: T[] | { data?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { data?: T[] }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
}

function vendusNumericId(value: string | number): number | string {
  const n = Number(value);
  return Number.isFinite(n) ? n : String(value);
}

function vendusOfficialPaymentType(raw: string): string {
  const t = raw.trim().toUpperCase();
  const dash = t.indexOf(" - ");
  return dash > 0 ? t.slice(0, dash).trim() : t;
}

export class VendusService {
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private paymentMethodsCache: VendusPaymentMethodRow[] | null = null;
  private defaultRegisterCache: ResolvedVendusRegister | null = null;

  constructor(vendusApiKey: string, options?: { baseUrl?: string }) {
    const key = vendusApiKey?.trim();
    if (!key) {
      throw new VendusApiError("vendus_api_key é obrigatória para instanciar VendusService.");
    }
    this.apiKey = key;
    this.baseUrl = resolveBaseUrl(options?.baseUrl);
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60_000,
      auth: { username: key, password: "" },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      validateStatus: () => true,
    });
  }

  getPdfUrl(documentId: string | number, mode?: "normal" | "tests"): string {
    const id = String(documentId).trim();
    const docMode = mode ?? resolveDocumentMode();
    return `${this.baseUrl}/documents/${id}.pdf?mode=${docMode}`;
  }

  private pdfModesToTry(): Array<"normal" | "tests"> {
    const envMode = Deno.env.get("VENDUS_DOCUMENT_MODE")?.trim().toLowerCase();
    if (envMode === "tests" || envMode === "test") return ["tests", "normal"];
    if (envMode === "normal") return ["normal", "tests"];
    return ["tests", "normal"];
  }

  private isPdfBytes(data: ArrayBuffer): boolean {
    if (data.byteLength < 4) return false;
    const head = new Uint8Array(data.slice(0, 4));
    return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  }

  /** Obtém bytes do PDF; tenta mode tests e normal (documentos de formação). */
  async fetchDocumentPdf(documentId: string | number): Promise<Uint8Array> {
    const id = String(documentId).trim();
    if (!id) throw new VendusApiError("ID de documento inválido.");

    const authHeader = "Basic " + btoa(`${this.apiKey}:`);
    let lastStatus = 404;
    let lastDetail = "";

    for (const mode of this.pdfModesToTry()) {
      const attempts = [
        `${this.baseUrl}/documents/${id}.pdf?mode=${mode}&download=1`,
        `${this.baseUrl}/documents/${id}.pdf?mode=${mode}`,
        `${this.baseUrl}/documents/${id}/?output=pdf&download=1&mode=${mode}`,
      ];

      for (const url of attempts) {
        const res = await fetch(url, {
          headers: { Authorization: authHeader, Accept: "application/pdf,*/*" },
        });
        lastStatus = res.status;
        if (!res.ok) {
          lastDetail = await res.text().catch(() => "");
          continue;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (this.isPdfBytes(bytes.buffer)) return bytes;
        lastDetail = new TextDecoder().decode(bytes.slice(0, 200));
      }
    }

    throw new VendusApiError(
      `Falha ao obter PDF (${lastStatus}).`,
      lastStatus,
      lastDetail.slice(0, 500),
    );
  }

  /** Lista métodos de pagamento configurados na conta Vendus. */
  async listPaymentMethods(): Promise<VendusPaymentMethodRow[]> {
    if (this.paymentMethodsCache) return this.paymentMethodsCache;
    const data = await this.request<VendusPaymentMethodRow[] | { data?: VendusPaymentMethodRow[] }>(
      "GET",
      "/documents/paymentmethods/",
    );
    this.paymentMethodsCache = unwrapVendusList(data);
    return this.paymentMethodsCache;
  }

  /**
   * Converte tipo oficial (NU, TB, CC…) para o ID numérico exigido em payments[].id.
   * A API Vendus não aceita o código do tipo directamente.
   */
  async resolvePaymentMethodId(officialType: string): Promise<string> {
    const type = officialType.trim().toUpperCase();
    if (!type) throw new VendusApiError("Tipo de pagamento Vendus inválido.");

    const methods = await this.listPaymentMethods();
    const active = methods.filter((m) => String(m.status ?? "on").toLowerCase() !== "off");
    const match =
      active.find((m) => vendusOfficialPaymentType(String(m.type ?? "")) === type) ??
      active.find((m) => vendusOfficialPaymentType(String(m.type ?? "")) === "NU") ??
      active[0];

    const id = match?.id != null ? String(match.id).trim() : "";
    if (!id) {
      throw new VendusApiError(
        `Método de pagamento Vendus "${type}" não encontrado. Configure métodos em APPS > API no Vendus.`,
      );
    }
    return id;
  }

  private async listRegisters(
    params?: Record<string, string | number>,
  ): Promise<VendusRegisterRow[]> {
    try {
      const data = await this.request<VendusRegisterRow[] | { data?: VendusRegisterRow[] }>(
        "GET",
        "/registers/",
        undefined,
        params,
      );
      return unwrapVendusList(data);
    } catch (e) {
      if (e instanceof VendusApiError && e.status === 404) return [];
      throw e;
    }
  }

  /** Caixa do tipo API activa — obrigatória para emissão programática de FR/FT. */
  async resolveDefaultRegister(): Promise<ResolvedVendusRegister> {
    if (this.defaultRegisterCache) return this.defaultRegisterCache;

    let apiRegisters: VendusRegisterRow[] = [];
    for (const params of [
      { isActive: "yes", type: "api" },
      { isActive: "yes" },
      {},
    ] as Record<string, string>[]) {
      const list = (await this.listRegisters(params)).filter(isVendusRegisterActive);
      apiRegisters = list.filter(isApiRegister);
      if (apiRegisters.length) break;
    }

    const reg = apiRegisters[0];
    const id = reg?.id != null ? String(reg.id).trim() : "";
    if (!id) {
      throw new VendusApiError(
        "Não existe caixa do tipo API activa. Vá a Configuração > Definições > Lojas e Caixas, crie ou edite uma caixa com tipo «API (Integração Programática)».",
      );
    }

    const resolved: ResolvedVendusRegister = {
      id,
      mode: resolveDocumentMode(reg.mode),
    };
    this.defaultRegisterCache = resolved;
    return resolved;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    data?: unknown,
    params?: Record<string, string | number>,
  ): Promise<T> {
    try {
      const response = await this.client.request<T>({
        method,
        url: path.startsWith("/") ? path : `/${path}`,
        data,
        params,
      });

      if (response.status >= 200 && response.status < 300) {
        return response.data;
      }

      throw new VendusApiError(
        extractVendusErrorMessage(response.data, `Vendus HTTP ${response.status}`),
        response.status,
        response.data,
      );
    } catch (err) {
      if (err instanceof VendusApiError) throw err;
      if (err instanceof AxiosError) {
        throw new VendusApiError(
          extractVendusErrorMessage(err.response?.data, err.message || "Erro de rede Vendus"),
          err.response?.status,
          err.response?.data,
        );
      }
      throw new VendusApiError(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Verifica profiles.vendus_client_id; se ausente, cria cliente via POST /clients/.
   */
  async criarOuProcurarCliente(dadosCliente: DadosClienteVendus): Promise<ResultadoClienteVendus> {
    const existingId = dadosCliente.vendusClientId?.trim();
    if (existingId) {
      try {
        await this.request<Record<string, unknown>>("GET", `/clients/${existingId}/`);
        return { vendusClientId: existingId, criado: false };
      } catch (e) {
        if (e instanceof VendusApiError && e.status === 404) {
          // ID obsoleto — recriar abaixo
        } else {
          throw e;
        }
      }
    }

    const nome = dadosCliente.nome?.trim() || "Cliente";
    const email = dadosCliente.email?.trim() || undefined;
    const nif = dadosCliente.nif?.trim() || undefined;

    const payload: Record<string, unknown> = {
      name: nome,
      country: "AO",
      send_email: email ? "yes" : "no",
      external_reference: `edukamba:profile:${dadosCliente.profileId}`,
    };
    if (nif) payload.fiscal_id = nif;
    if (email) payload.email = email;

    const created = await this.request<{ id?: string | number }>("POST", "/clients/", payload);
    const newId = created?.id != null ? String(created.id).trim() : "";
    if (!newId) {
      throw new VendusApiError("Vendus não devolveu ID ao criar cliente.", 201, created);
    }
    return { vendusClientId: newId, criado: true };
  }

  /**
   * Emite FT ou FR (propinas) via POST /documents/.
   */
  async emitirFaturaPropinas(dadosFatura: DadosFaturaPropinas): Promise<ResultadoFaturaVendus> {
    const clientId = dadosFatura.clientId?.trim();
    if (!clientId) throw new VendusApiError("clientId é obrigatório para emitir fatura.");
    if (!dadosFatura.itens?.length) throw new VendusApiError("A fatura deve conter pelo menos um item.");

    const today = new Date().toISOString().slice(0, 10);
    const docDate = normalizeVendusDate(dadosFatura.data ?? today);
    const supplyDate = normalizeVendusDate(dadosFatura.dataFornecimento ?? dadosFatura.data ?? today);
    const items = dadosFatura.itens.map((item) => buildVendusDocumentItem(item));

    const register = dadosFatura.registerId != null
      ? { id: String(dadosFatura.registerId).trim(), mode: resolveDocumentMode() }
      : await this.resolveDefaultRegister();

    const payload: Record<string, unknown> = {
      type: dadosFatura.tipo,
      mode: register.mode,
      register_id: vendusNumericId(register.id),
      client: { id: vendusNumericId(clientId) },
      items,
      date: docDate,
      date_supply: supplyDate,
    };

    if (dadosFatura.notas?.trim()) payload.notes = dadosFatura.notas.trim();
    if (dadosFatura.referenciaExterna?.trim()) {
      payload.external_reference = dadosFatura.referenciaExterna.trim();
    }
    if (dadosFatura.descontoValor != null && Number(dadosFatura.descontoValor) > 0) {
      payload.discount_amount = parseVendusMoney(dadosFatura.descontoValor);
    }
    if (dadosFatura.descontoPercentagem != null && Number(dadosFatura.descontoPercentagem) > 0) {
      payload.discount_percentage = parseVendusMoney(dadosFatura.descontoPercentagem);
    }

    // FR com pagamento imediato — payments[].id é o ID Vendus, não o código NU/TB/CC
    if (dadosFatura.pagamentos?.length) {
      payload.payments = await Promise.all(
        dadosFatura.pagamentos.map(async (p) => ({
          id: vendusNumericId(await this.resolvePaymentMethodId(p.id)),
          amount: parseVendusMoney(p.valor),
          ...(p.dataVencimento ? { date_due: normalizeVendusDate(p.dataVencimento) } : {}),
        })),
      );
    }

    const doc = await this.request<{
      id?: string | number;
      number?: string;
      type?: string;
      amount_gross?: string;
    }>("POST", "/documents/", payload);

    const documentId = doc?.id != null ? String(doc.id).trim() : "";
    const documentNumber = doc?.number?.trim() || "";
    if (!documentId) {
      throw new VendusApiError("Vendus não devolveu ID do documento.", 201, doc);
    }

    return {
      documentId,
      documentNumber,
      pdfUrl: this.getPdfUrl(documentId),
      tipo: doc?.type?.trim() || dadosFatura.tipo,
      valorBruto: doc?.amount_gross,
    };
  }

  /**
   * Exporta SAF-T via GET /taxauthority/saft/?year=&month=
   * Devolve XML bruto (decodifica base64 se necessário).
   */
  async descarregarSaft(mes: number, ano: number): Promise<ResultadoSaftVendus> {
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      throw new VendusApiError("Ano inválido para exportação SAF-T.");
    }
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new VendusApiError("Mês inválido para exportação SAF-T (1-12).");
    }

    const data = await this.request<{ year?: number | string; month?: number | string; xml?: string }>(
      "GET",
      "/taxauthority/saft/",
      undefined,
      { year: ano, month: mes },
    );

    const rawXmlField = data?.xml;
    if (!rawXmlField?.trim()) {
      throw new VendusApiError("Vendus não devolveu conteúdo SAF-T para o período indicado.", 404, data);
    }

    let xml = rawXmlField.trim();
    if (!xml.startsWith("<?xml") && !xml.startsWith("<")) {
      try {
        xml = new TextDecoder().decode(
          Uint8Array.from(atob(xml.replace(/\s/g, "")), (c) => c.charCodeAt(0)),
        );
      } catch {
        throw new VendusApiError("Não foi possível decodificar o XML SAF-T devolvido pelo Vendus.", 500, data);
      }
    }

    return {
      ano,
      mes,
      xml,
    };
  }
}
