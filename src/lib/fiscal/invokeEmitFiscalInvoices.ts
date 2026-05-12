import { supabase } from "@/integrations/supabase/client";

export type EmitFiscalInvoicesResult = {
  payment_id: string;
  status: "emitted" | "skipped" | "error";
  detail?: string;
};

type EdgeBody = {
  results?: EmitFiscalInvoicesResult[];
  error?: string;
};

/**
 * Chama a Edge Function `emit-fiscal-invoices` com o JWT actual (staff).
 * Requer `AGT_RSA_PRIVATE_KEY_PEM` nas secrets do Supabase.
 */
export async function invokeEmitFiscalInvoices(paymentIds: string[]): Promise<{
  ok: boolean;
  results?: EmitFiscalInvoicesResult[];
  message?: string;
}> {
  const ids = [...new Set(paymentIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true, results: [] };
  const { data, error } = await supabase.functions.invoke("emit-fiscal-invoices", {
    body: { payment_ids: ids },
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  const body = (data ?? {}) as EdgeBody;
  if (typeof body.error === "string") {
    return { ok: false, message: body.error };
  }
  const results = Array.isArray(body.results) ? body.results : [];
  const anyErr = results.some((r) => r.status === "error");
  return {
    ok: !anyErr,
    results,
    message: anyErr ? "Uma ou mais faturas não foram emitidas — ver detalhes." : undefined,
  };
}
