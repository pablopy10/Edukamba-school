import { supabase } from "@/integrations/supabase/client";
import type {
  DadosFaturaPropinas,
  ResultadoClienteVendus,
  ResultadoFaturaVendus,
  ResultadoSaftVendus,
} from "@/services/vendusService";

type EdgeErrorBody = { ok?: boolean; error?: string; operation?: string };

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

/** Descarrega SAF-T XML do Vendus para o período indicado. */
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

/** Abre PDF Vendus via proxy autenticado (Edge Function). */
export async function downloadVendusDocumentPdf(documentId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sessão expirada.");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL não configurado.");

  const res = await fetch(`${supabaseUrl}/functions/v1/vendus-billing`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "download_pdf", document_id: documentId }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error((errBody as { error?: string }).error ?? `Erro HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendus-${documentId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSaftXmlInBrowser(filename: string, xml: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
