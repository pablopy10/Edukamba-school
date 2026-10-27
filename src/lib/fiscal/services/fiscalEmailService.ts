import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { buildInvoicePdf, resolveFiscalInvoicePdfInput } from "../invoicePdf";

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-AO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0) + " Kz";

export interface SendFiscalEmailParams {
  invoiceId: string;
  recipientEmail?: string;
  recipientName?: string;
  studentId?: string;
  pdfBase64?: string;
}

export interface SendFiscalEmailResult {
  ok: boolean;
  message?: string;
  sentTo?: string;
}

/**
 * Serviço responsável por gerar o PDF do documento fiscal emitido e despachar
 * o email transacional com o PDF anexado para o cliente/encarregado.
 */
export class FiscalEmailService {
  /**
   * Envia o email com o PDF oficial anexado para um documento fiscal.
   */
  static async sendDocumentEmail(params: SendFiscalEmailParams): Promise<SendFiscalEmailResult> {
    try {
      const invoiceId = params.invoiceId.trim();
      if (!invoiceId) {
        return { ok: false, message: "invoiceId é obrigatório" };
      }

      // 1. Carregar fatura emitida
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();

      if (invErr || !inv) {
        return { ok: false, message: invErr?.message || "Fatura não encontrada." };
      }

      // 2. Gerar PDF em base64 se não fornecido
      let pdfBase64 = params.pdfBase64;
      if (!pdfBase64) {
        const payload = await resolveFiscalInvoicePdfInput(inv as Tables<"invoices">, fmtAOA);
        const doc = buildInvoicePdf(payload);
        const dataUri = doc.output("datauristring");
        pdfBase64 = dataUri.split(",")[1];
      }

      const docNumber = inv.document_number?.trim() || "DOC";
      const docType = inv.doc_type || inv.document_type || "FT";
      const grossTotal = Number(inv.gross_total || 0);

      const pdfFilename = `${docType}_${docNumber.replace(/[\s/]/g, "_")}.pdf`;

      // 3. Invocar Edge Function send-fiscal-email com o anexo PDF
      const { data, error } = await supabase.functions.invoke("send-fiscal-email", {
        body: {
          school_id: inv.school_id,
          invoice_id: inv.id,
          recipient_email: params.recipientEmail,
          recipient_name: params.recipientName,
          student_id: params.studentId || inv.student_id,
          document_number: docNumber,
          document_type: docType,
          gross_total: grossTotal,
          pdf_base64: pdfBase64,
          pdf_name: pdfFilename,
        },
      });

      if (error) {
        console.warn("[FiscalEmailService] Erro ao invocar send-fiscal-email:", error.message);
        return { ok: false, message: error.message };
      }

      if (data && (data as Record<string, unknown>).ok) {
        return {
          ok: true,
          sentTo: (data as Record<string, unknown>).sent_to as string | undefined,
        };
      }

      return { ok: true, message: "Email enviado ou ignorado sem erros bloqueantes." };
    } catch (e) {
      console.warn("[FiscalEmailService] Exceção não fatal ao enviar email fiscal:", e);
      return { ok: false, message: (e as Error).message };
    }
  }
}
