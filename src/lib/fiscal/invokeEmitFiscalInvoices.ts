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

import { emitFiscalInvoiceDirect } from "./emitFiscalInvoiceDirect";

/**
 * Chama a Edge Function `emit-fiscal-invoices` com o JWT actual (staff).
 * Se a Edge Function falhar (ex: segredo não configurado ou indisponibilidade),
 * executa automaticamente o fallback direto no cliente (emitFiscalInvoiceDirect).
 */
export async function invokeEmitFiscalInvoices(paymentIds: string[]): Promise<{
  ok: boolean;
  results?: EmitFiscalInvoicesResult[];
  message?: string;
}> {
  const ids = [...new Set(paymentIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true, results: [] };

  const finalResults: EmitFiscalInvoicesResult[] = [];
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id ?? null;

  for (const pid of ids) {
    try {
      // 1. Chamar a RPC transacional PostgreSQL validate_and_invoice_payment
      const { data: rpcRows, error: rpcErr } = await supabase.rpc("validate_and_invoice_payment", {
        _payment_id: pid,
        _admin_user_id: userId,
        _doc_type: "FT",
        _channels: ["EMAIL"],
      });

      if (!rpcErr && rpcRows) {
        const inv = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        if (inv?.invoice_id) {
          finalResults.push({
            payment_id: pid,
            status: "emitted",
            invoice_id: inv.invoice_id,
            document_number: inv.document_number,
          });
          continue;
        }
      }

      if (rpcErr) {
        console.warn("[invokeEmitFiscalInvoices] RPC validate_and_invoice_payment avisou:", rpcErr.message);
      }

      // 2. Fallback: emissão direta no cliente
      const directRes = await emitFiscalInvoiceDirect(pid);
      if (directRes.ok && directRes.invoice_id) {
        finalResults.push({
          payment_id: pid,
          status: "emitted",
          invoice_id: directRes.invoice_id,
          document_number: directRes.document_number,
        });
      } else {
        finalResults.push({
          payment_id: pid,
          status: "error",
          detail: directRes.message || rpcErr?.message || "Falha na emissão da fatura fiscal.",
        });
      }
    } catch (err: unknown) {
      finalResults.push({
        payment_id: pid,
        status: "error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const anyErr = finalResults.some((r) => r.status === "error");
  return {
    ok: !anyErr,
    results: finalResults,
    message: anyErr ? formatEmitFiscalInvoicesFailureDescription(finalResults) : undefined,
  };
}
