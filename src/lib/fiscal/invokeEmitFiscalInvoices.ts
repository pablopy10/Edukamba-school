import { supabase } from "@/integrations/supabase/client";

export type EmitFiscalInvoicesResult = {
  payment_id: string;
  status: "emitted" | "skipped" | "error";
  detail?: string;
  invoice_id?: string;
  document_number?: string;
};

type EdgeBody = {
  results?: EmitFiscalInvoicesResult[];
  error?: string;
};

const GENERIC_EMIT_FAIL = "Não foi possível gerar a FT automaticamente.";

/** Texto legível para toasts quando a emissão falha ou é ignorada (prioriza `detail` da Edge). */
export function formatEmitFiscalInvoicesFailureDescription(
  results: EmitFiscalInvoicesResult[] | undefined,
  options?: { includeSkipped?: boolean; topLevelMessage?: string },
): string {
  const includeSkipped = options?.includeSkipped ?? false;
  const lines: string[] = [];

  for (const r of results ?? []) {
    if (r.status === "error") {
      const d = r.detail?.trim();
      lines.push(d || `Erro no pagamento ${r.payment_id.slice(0, 8)}…`);
    } else if (includeSkipped && r.status === "skipped") {
      const d = r.detail?.trim();
      if (d) lines.push(d);
    }
  }

  const unique = [...new Set(lines)].filter(Boolean);
  if (unique.length > 0) {
    const head = unique.slice(0, 3).join(" · ");
    if (unique.length > 3) return `${head} · (+${unique.length - 3})`;
    return head;
  }

  const top = options?.topLevelMessage?.trim();
  if (top) return top;
  return GENERIC_EMIT_FAIL;
}

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
  if (typeof body.error === "string" && body.error.trim()) {
    return { ok: false, message: body.error.trim(), results: body.results };
  }
  const results = Array.isArray(body.results) ? body.results : [];
  const anyErr = results.some((r) => r.status === "error");
  return {
    ok: !anyErr,
    results,
    message: anyErr
      ? formatEmitFiscalInvoicesFailureDescription(results, { topLevelMessage: body.error })
      : undefined,
  };
}
