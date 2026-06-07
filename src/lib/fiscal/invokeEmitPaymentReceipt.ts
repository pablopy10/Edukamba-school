import { supabase } from "@/integrations/supabase/client";

export type EmitPaymentReceiptResult = {
  payment_id: string;
  status: "created" | "skipped" | "error";
  receipt_id?: string;
  receipt_number?: string;
  vendus_document_id?: string;
  vendus_document_number?: string;
  vendus_pdf_url?: string;
  detail?: string;
};

/**
 * Chama a Edge Function `emit-payment-receipt` para gerar comprovativos internos
 * (escolas com faturação externa).
 */
export async function invokeEmitPaymentReceipt(paymentIds: string[]): Promise<{
  ok: boolean;
  results?: EmitPaymentReceiptResult[];
  message?: string;
}> {
  const ids = [...new Set(paymentIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true, results: [] };
  const { data, error } = await supabase.functions.invoke("emit-payment-receipt", {
    body: { payment_ids: ids },
  });
  if (error) return { ok: false, message: error.message };
  const body = data as { ok?: boolean; results?: EmitPaymentReceiptResult[]; error?: string } | null;
  return {
    ok: body?.ok ?? false,
    results: body?.results,
    message: body?.error,
  };
}
