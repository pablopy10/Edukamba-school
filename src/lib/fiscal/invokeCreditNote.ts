import { supabase } from "@/integrations/supabase/client";

type EdgeBody = {
  ok?: boolean;
  error?: string;
  credit_note_id?: string;
  document_number?: string;
};

/**
 * Emite Nota de Crédito (NC) que retifica uma FT existente.
 * Chama `emit-credit-note` com JWT staff.
 * 
 * A NC:
 * - Tem numeração própria (NC EDK/1, NC EDK/2...)
 * - Referencia a FT original no campo source_billing (OrderReferences AGT)
 * - Contém motivo obrigatório (mínimo 6 caracteres)
 * - Valores aparecem positivos no PDF mas subtraem do volume de faturação
 */
export async function invokeCreditNote(
  invoiceId: string,
  reason: string,
  partialAmount?: number,
): Promise<{ ok: boolean; message?: string; documentNumber?: string; creditNoteId?: string }> {
  const id = invoiceId?.trim();
  const reasonText = reason?.trim();
  
  if (!id) return { ok: false, message: "Identificador de fatura inválido." };
  if (!reasonText || reasonText.length < 6) {
    return { ok: false, message: "O motivo da nota de crédito é obrigatório (mínimo 6 caracteres)." };
  }

  const { data, error } = await supabase.functions.invoke("emit-credit-note", {
    body: { 
      invoice_id: id, 
      reason: reasonText,
      partial_amount: partialAmount ?? null,
    },
  });

  if (error) return { ok: false, message: error.message };

  const body = (data ?? {}) as EdgeBody;
  if (typeof body.error === "string") return { ok: false, message: body.error };
  if (body.ok !== true) return { ok: false, message: "Não foi possível emitir a nota de crédito." };

  return {
    ok: true,
    documentNumber: body.document_number?.trim() || undefined,
    creditNoteId: body.credit_note_id?.trim() || undefined,
  };
}
