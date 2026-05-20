import { supabase } from "@/integrations/supabase/client";

type EdgeBody = {
  ok?: boolean;
  error?: string;
  invoice_id?: string;
  document_number?: string;
};

/**
 * Anula FT existente (estado A). Chama `cancel-fiscal-invoice` com JWT staff.
 */
export async function invokeCancelFiscalInvoice(
  invoiceId: string,
  cancellationReason: string,
): Promise<{ ok: boolean; message?: string; documentNumber?: string }> {
  const id = invoiceId?.trim();
  const reason = cancellationReason?.trim();
  if (!id) return { ok: false, message: "Identificador de fatura inválido." };
  if (!reason || reason.length < 6) {
    return { ok: false, message: "O motivo da anulação é obrigatório (mínimo 6 caracteres)." };
  }

  const { data, error } = await supabase.functions.invoke("cancel-fiscal-invoice", {
    body: { invoice_id: id, cancellation_reason: reason },
  });

  if (error) return { ok: false, message: error.message };

  const body = (data ?? {}) as EdgeBody;
  if (typeof body.error === "string") return { ok: false, message: body.error };
  if (body.ok !== true) return { ok: false, message: "Não foi possível anular a fatura." };

  return {
    ok: true,
    documentNumber: body.document_number?.trim() || undefined,
  };
}
