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

export type ItemFaturaVendus = {
  titulo: string;
  referencia?: string;
  quantidade?: number | string;
  precoBruto: number | string;
  /** Código de isenção AGT (ex.: M11 educação) */
  taxExemption?: string | null;
  taxExemptionLaw?: string | null;
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

function formatMoney(value: number | string): string {
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) throw new VendusApiError(`Valor monetário inválido: ${value}`);
  return n.toFixed(2);
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
    return obj.errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("; ");
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
  status?: string;
  isActive?: string;
};

function unwrapVendusList<T>(data: T[] | { data?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as { data?: T[] }).data)) {
    return (data as { data: T[] }).data;
  }
  return [];
}

export class VendusService {
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;
  private paymentMethodsCache: VendusPaymentMethodRow[] | null = null;
  private defaultRegisterIdCache: string | null = null;

  constructor(vendusApiKey: string, options?: { baseUrl?: string }) {
    const key = vendusApiKey?.trim();
    if (!key) {
      throw new VendusApiError("vendus_api_key é obrigatória para instanciar VendusService.");
    }
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

  getPdfUrl(documentId: string | number): string {
    return `${this.baseUrl}/documents/${documentId}.pdf`;
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
      active.find((m) => String(m.type ?? "").trim().toUpperCase() === type) ??
      active.find((m) => String(m.type ?? "").trim().toUpperCase() === "NU") ??
      active[0];

    const id = match?.id != null ? String(match.id).trim() : "";
    if (!id) {
      throw new VendusApiError(
        `Método de pagamento Vendus "${type}" não encontrado. Configure métodos em APPS > API no Vendus.`,
      );
    }
    return id;
  }

  /** Primeira caixa/POS activa — necessária para emissão de FR/FT. */
  async resolveDefaultRegisterId(): Promise<string | undefined> {
    if (this.defaultRegisterIdCache) return this.defaultRegisterIdCache;

    const data = await this.request<VendusRegisterRow[] | { data?: VendusRegisterRow[] }>(
      "GET",
      "/registers/",
      undefined,
      { isActive: "yes" },
    );
    const registers = unwrapVendusList(data);
    const reg =
      registers.find((r) => String(r.status ?? "").toLowerCase() !== "off") ??
      registers[0];

    const id = reg?.id != null ? String(reg.id).trim() : "";
    if (id) this.defaultRegisterIdCache = id;
    return id || undefined;
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
    const items = dadosFatura.itens.map((item) => {
      const row: Record<string, unknown> = {
        title: item.titulo,
        qty: item.quantidade ?? "1",
        gross_price: formatMoney(item.precoBruto),
        type_id: "S",
        stock_control: "0",
      };
      if (item.referencia?.trim()) row.reference = item.referencia.trim();
      if (item.taxExemption?.trim()) {
        row.tax_exemption = item.taxExemption.trim();
        row.tax_exemption_law = item.taxExemptionLaw?.trim() ||
          "Isenção no domínio da educação (AGT Angola)";
      }
      if (item.descontoValor != null && Number(item.descontoValor) > 0) {
        row.discount_amount = formatMoney(item.descontoValor);
      }
      if (item.descontoPercentagem != null && Number(item.descontoPercentagem) > 0) {
        row.discount_percentage = formatMoney(item.descontoPercentagem);
      }
      return row;
    });

    const payload: Record<string, unknown> = {
      type: dadosFatura.tipo,
      mode: "normal",
      date: dadosFatura.data ?? today,
      date_supply: dadosFatura.dataFornecimento ?? dadosFatura.data ?? today,
      client: { id: clientId },
      items,
      stock_operation: "none",
      ifthenpay: "no",
      eupago: "no",
      print_discount: "no",
      return_qrcode: "1",
    };

    const registerId = dadosFatura.registerId != null
      ? String(dadosFatura.registerId).trim()
      : await this.resolveDefaultRegisterId();
    if (registerId) payload.register_id = registerId;

    if (dadosFatura.notas?.trim()) payload.notes = dadosFatura.notas.trim();
    if (dadosFatura.referenciaExterna?.trim()) {
      payload.external_reference = dadosFatura.referenciaExterna.trim();
    }
    if (dadosFatura.descontoValor != null && Number(dadosFatura.descontoValor) > 0) {
      payload.discount_amount = formatMoney(dadosFatura.descontoValor);
    }
    if (dadosFatura.descontoPercentagem != null && Number(dadosFatura.descontoPercentagem) > 0) {
      payload.discount_percentage = formatMoney(dadosFatura.descontoPercentagem);
    }

    // FR/FT com pagamento imediato — payments[].id é o ID Vendus, não o código NU/TB/CC
    if (dadosFatura.pagamentos?.length) {
      payload.payments = await Promise.all(
        dadosFatura.pagamentos.map(async (p) => ({
          id: await this.resolvePaymentMethodId(p.id),
          amount: formatMoney(p.valor),
          ...(p.dataVencimento ? { date_due: p.dataVencimento } : {}),
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
