import { supabase } from "@/integrations/supabase/client";
import type {
  DadosFaturaPropinas,
  ResultadoClienteVendus,
  ResultadoFaturaVendus,
  ResultadoSaftVendus,
} from "@/services/vendusService";

type EdgeErrorBody = { ok?: boolean; error?: string; operation?: string };

function getVendusFunctionUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL não configurado.");
  return `${supabaseUrl}/functions/v1/vendus-billing`;
}

async function getAccessToken(): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sessão expirada.");
  return token;
}

async function invokeVendusBilling<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data?: T; message?: string }> {
  const { data, error } = await supabase.functions.invoke("vendus-billing", { body });
  if (error) return { ok: false, message: error.message };
  const payload = (data ?? {}) as T & EdgeErrorBody;
  if (typeof payload.error === "string" && payload.error.trim()) {
    return { ok: false, message: payload.error.trim() };
  }
  return { ok: payload.ok === true, data: payload };
}

/** Pedido binário (PDF / XML) via fetch directo — evita limites do invoke JSON. */
async function fetchVendusBillingFile(
  body: Record<string, unknown>,
): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; message: string }> {
  try {
    const token = await getAccessToken();
    const res = await fetch(getVendusFunctionUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        ok: false,
        message: (errBody as { error?: string }).error ?? `Erro HTTP ${res.status}`,
      };
    }

    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="?([^";\n]+)"?/i.exec(disposition);
    const filename = match?.[1]?.trim() || "download";
    const blob = await res.blob();
    return { ok: true, blob, filename };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Sincroniza encarregado como cliente Vendus (cria se necessário). */
export async function invokeVendusCriarOuProcurarCliente(input: {
  profileId: string;
  nome: string;
  nif?: string | null;
  email?: string | null;
  vendusClientId?: string | null;
}): Promise<{ ok: boolean; result?: ResultadoClienteVendus; message?: string }> {
  const res = await invokeVendusBilling<ResultadoClienteVendus & { ok: boolean }>({
    action: "criar_ou_procurar_cliente",
    profile_id: input.profileId,
    nome: input.nome,
    nif: input.nif ?? null,
    email: input.email ?? null,
    vendus_client_id: input.vendusClientId ?? null,
  });
  if (!res.ok || !res.data) return { ok: false, message: res.message };
  return {
    ok: true,
    result: {
      vendusClientId: res.data.vendusClientId,
      criado: !!res.data.criado,
    },
  };
}

/** Emite FT/FR de propinas no Vendus. */
export async function invokeVendusEmitirFaturaPropinas(
  dadosFatura: DadosFaturaPropinas,
): Promise<{ ok: boolean; result?: ResultadoFaturaVendus; message?: string }> {
  const res = await invokeVendusBilling<ResultadoFaturaVendus & { ok: boolean }>({
    action: "emitir_fatura_propinas",
    dados_fatura: dadosFatura,
  });
  if (!res.ok || !res.data) return { ok: false, message: res.message };
  return {
    ok: true,
    result: {
      documentId: res.data.documentId,
      documentNumber: res.data.documentNumber,
      pdfUrl: res.data.pdfUrl,
      tipo: res.data.tipo,
      valorBruto: res.data.valorBruto,
    },
  };
}

/** Descarrega SAF-T XML do Vendus para o período indicado (JSON — uso interno). */
export async function invokeVendusDescarregarSaft(
  mes: number,
  ano: number,
): Promise<{ ok: boolean; result?: ResultadoSaftVendus; message?: string }> {
  const res = await invokeVendusBilling<ResultadoSaftVendus & { ok: boolean }>({
    action: "descarregar_saft",
    mes,
    ano,
  });
  if (!res.ok || !res.data?.xml) return { ok: false, message: res.message ?? "SAF-T indisponível." };
  return {
    ok: true,
    result: { ano: res.data.ano, mes: res.data.mes, xml: res.data.xml },
  };
}

/** Descarrega ficheiro SAF-T do Vendus conforme mês/ano seleccionados. */
export async function downloadVendusSaftFile(mes: number, ano: number): Promise<void> {
  const res = await fetchVendusBillingFile({
    action: "download_saft",
    mes,
    ano,
  });
  if (!res.ok) throw new Error(res.message);
  triggerBrowserDownload(res.blob, res.filename);
}

/** Descarrega PDF de fatura Vendus (staff ou encarregado autorizado). */
export async function downloadVendusDocumentPdf(input: {
  documentId: string;
  paymentId?: string;
  filenameHint?: string;
}): Promise<void> {
  const res = await fetchVendusBillingFile({
    action: "download_pdf",
    document_id: input.documentId,
    payment_id: input.paymentId,
  });
  if (!res.ok) throw new Error(res.message);
  const filename = input.filenameHint?.trim() || res.filename;
  triggerBrowserDownload(res.blob, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export function downloadSaftXmlInBrowser(filename: string, xml: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  triggerBrowserDownload(blob, filename);
}

/** @deprecated Use downloadVendusDocumentPdf */
export async function downloadVendusDocumentPdfLegacy(documentId: string): Promise<void> {
  await downloadVendusDocumentPdf({ documentId });
}
