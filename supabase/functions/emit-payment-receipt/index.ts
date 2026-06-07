/**
 * Emite Comprovativo de Recebimento interno (não fiscal) para escolas com faturação externa.
 * Com vendus_api_key configurada: emite FR no Vendus e regista metadados fiscais.
 * Sem Vendus: dispara webhook genérico para sistema externo.
 *
 * Body: { payment_ids: string[] }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { emitVendusInvoiceForPayment } from "../_shared/vendusPaymentFlow.ts";
import { logVendusFailure } from "../_shared/vendusAuth.ts";
import { externalBillingUserMessage } from "../_shared/externalBillingUserMessage.ts";
import { VendusApiError } from "../_shared/vendusService.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type ReceiptResult = {
  payment_id: string;
  status: "created" | "skipped" | "error";
  receipt_id?: string;
  receipt_number?: string;
  vendus_document_id?: string;
  vendus_document_number?: string;
  vendus_pdf_url?: string;
  detail?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!anonKey) return corsJson({ error: "Variáveis Supabase em falta" }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const paymentIds: string[] = body.payment_ids ?? [];
    if (!paymentIds.length) return corsJson({ ok: true, results: [] });

    const results: ReceiptResult[] = [];

    for (const paymentId of paymentIds) {
      try {
        const { data: payment, error: payErr } = await admin
          .from("payments")
          .select(
            "id, school_id, student_id, amount_paid, method, payment_date, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id",
          )
          .eq("id", paymentId)
          .single();
        if (payErr || !payment) {
          results.push({ payment_id: paymentId, status: "error", detail: payErr?.message ?? "Pagamento não encontrado." });
          continue;
        }

        const { data: school } = await admin
          .from("schools")
          .select("webhook_billing_url, webhook_billing_secret, vendus_api_key, usa_faturacao_externa")
          .eq("id", payment.school_id)
          .single();

        const vendusApiKey = school?.vendus_api_key?.trim() ?? "";

        const { data: existing } = await admin
          .from("payment_receipts")
          .select("id, receipt_number, description, vendus_document_id, vendus_document_number, vendus_pdf_url")
          .eq("payment_id", paymentId)
          .maybeSingle();

        if (existing) {
          if (existing.vendus_document_id?.trim()) {
            results.push({
              payment_id: paymentId,
              status: "skipped",
              receipt_id: existing.id,
              receipt_number: existing.receipt_number,
              vendus_document_id: existing.vendus_document_id ?? undefined,
              vendus_document_number: existing.vendus_document_number ?? undefined,
              vendus_pdf_url: existing.vendus_pdf_url ?? undefined,
              detail: "Comprovativo já existe.",
            });
            continue;
          }

          if (vendusApiKey) {
            try {
              const vendusResult = await emitVendusInvoiceForPayment(admin, vendusApiKey, payment);
              const descBase = String(existing.description ?? "Pagamento").trim();
              const descWithDoc = vendusResult.vendusDocumentNumber
                ? `${descBase} · ${vendusResult.vendusDocumentNumber}`
                : descBase;
              await admin
                .from("payment_receipts")
                .update({
                  description: descWithDoc,
                  vendus_document_id: vendusResult.vendusDocumentId,
                  vendus_document_number: vendusResult.vendusDocumentNumber,
                  vendus_pdf_url: vendusResult.vendusPdfUrl,
                })
                .eq("id", existing.id);

              results.push({
                payment_id: paymentId,
                status: "created",
                receipt_id: existing.id,
                receipt_number: existing.receipt_number,
                vendus_document_id: vendusResult.vendusDocumentId,
                vendus_document_number: vendusResult.vendusDocumentNumber,
                vendus_pdf_url: vendusResult.vendusPdfUrl,
                detail: "Fatura emitida (comprovativo já existia).",
              });
            } catch (vendusErr) {
              const msg = vendusErr instanceof Error ? vendusErr.message : String(vendusErr);
              await logVendusFailure(admin, {
                schoolId: payment.school_id,
                operation: "emit_payment_receipt_vendus_retry",
                paymentId: payment.id,
                errorMessage: msg,
                httpStatus: vendusErr instanceof VendusApiError ? vendusErr.status ?? null : null,
                responsePayload: vendusErr instanceof VendusApiError ? vendusErr.vendusPayload : undefined,
              });
              results.push({
                payment_id: paymentId,
                status: "error",
                detail: externalBillingUserMessage(msg),
              });
            }
            continue;
          }

          results.push({
            payment_id: paymentId,
            status: "skipped",
            receipt_id: existing.id,
            receipt_number: existing.receipt_number,
            detail: "Comprovativo já existe (integração fiscal não configurada).",
          });
          continue;
        }

        const { data: student } = await admin
          .from("students")
          .select("full_name, tax_id, parent_id")
          .eq("id", payment.student_id ?? "")
          .maybeSingle();

        let parentTaxId: string | null = null;
        if (student?.parent_id) {
          const { data: parent } = await admin
            .from("profiles")
            .select("tax_id")
            .eq("id", student.parent_id)
            .maybeSingle();
          parentTaxId = parent?.tax_id ?? null;
        }

        const { error: seqErr } = await admin
          .from("billing_config")
          .upsert({ school_id: payment.school_id, series: "EDK", last_sequence: 0 }, { onConflict: "school_id", ignoreDuplicates: true });

        if (seqErr) {
          results.push({ payment_id: paymentId, status: "error", detail: seqErr.message });
          continue;
        }

        const { data: config } = await admin
          .from("billing_config")
          .select("receipt_sequence")
          .eq("school_id", payment.school_id)
          .single();

        const nextSeq = (config?.receipt_sequence ?? 0) + 1;
        await admin
          .from("billing_config")
          .update({ receipt_sequence: nextSeq })
          .eq("school_id", payment.school_id);

        const receiptNumber = `REC ${nextSeq}`;
        const clienteNome = student?.full_name ?? "Cliente";
        const clienteNif = student?.tax_id?.trim() || parentTaxId?.trim() || null;

        let description = "Pagamento de propina";
        if (payment.activity_fee_id) description = "Pagamento de atividade extracurricular";
        if (payment.transport_fee_id) description = "Pagamento de transporte";
        if (payment.enrollment_fee_id) description = "Pagamento de matrícula";
        if (payment.meal_fee_id) description = "Pagamento de refeições";
        if (payment.event_fee_id) description = "Pagamento de evento";

        let vendusMeta: {
          vendusDocumentId?: string;
          vendusDocumentNumber?: string;
          vendusPdfUrl?: string;
        } = {};

        if (vendusApiKey) {
          try {
            const vendusResult = await emitVendusInvoiceForPayment(admin, vendusApiKey, payment);
            vendusMeta = {
              vendusDocumentId: vendusResult.vendusDocumentId,
              vendusDocumentNumber: vendusResult.vendusDocumentNumber,
              vendusPdfUrl: vendusResult.vendusPdfUrl,
            };
            if (vendusResult.vendusDocumentNumber) {
              description = `${description} · ${vendusResult.vendusDocumentNumber}`;
            }
          } catch (vendusErr) {
            const msg = vendusErr instanceof Error ? vendusErr.message : String(vendusErr);
            await logVendusFailure(admin, {
              schoolId: payment.school_id,
              operation: "emit_payment_receipt_vendus",
              paymentId: payment.id,
              profileId: student?.parent_id ?? null,
              errorMessage: msg,
              httpStatus: vendusErr instanceof VendusApiError ? vendusErr.status ?? null : null,
              responsePayload: vendusErr instanceof VendusApiError ? vendusErr.vendusPayload : undefined,
            });
            results.push({
              payment_id: paymentId,
              status: "error",
              detail: externalBillingUserMessage(msg),
            });
            continue;
          }
        }

        const { data: receipt, error: insErr } = await admin.from("payment_receipts").insert({
          school_id: payment.school_id,
          payment_id: paymentId,
          student_id: payment.student_id,
          receipt_number: receiptNumber,
          amount: payment.amount_paid,
          payment_method: payment.method,
          payment_date: payment.payment_date ?? new Date().toISOString().slice(0, 10),
          description,
          cliente_nome: clienteNome,
          cliente_nif: clienteNif,
          vendus_document_id: vendusMeta.vendusDocumentId ?? null,
          vendus_document_number: vendusMeta.vendusDocumentNumber ?? null,
          vendus_pdf_url: vendusMeta.vendusPdfUrl ?? null,
        }).select("id, receipt_number").single();

        if (insErr) {
          results.push({ payment_id: paymentId, status: "error", detail: insErr.message });
          continue;
        }

        if (payment.student_id) {
          const { data: lastStmt } = await admin
            .from("account_statements")
            .select("balance_after")
            .eq("school_id", payment.school_id)
            .eq("student_id", payment.student_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const prevBalance = Number(lastStmt?.balance_after ?? 0);
          await admin.from("account_statements").insert({
            school_id: payment.school_id,
            student_id: payment.student_id,
            movement_type: "RC",
            description: `${receiptNumber} - ${description}`,
            debit_amount: 0,
            credit_amount: Number(payment.amount_paid),
            balance_after: prevBalance - Number(payment.amount_paid),
            reference_date: payment.payment_date ?? new Date().toISOString().slice(0, 10),
          });
        }

        // Webhook genérico apenas quando Vendus NÃO está configurado
        if (!vendusApiKey && school?.webhook_billing_url?.trim()) {
          try {
            const webhookPayload = {
              event: "payment.validated",
              payment_id: paymentId,
              receipt_number: receiptNumber,
              amount: payment.amount_paid,
              payment_method: payment.method,
              payment_date: payment.payment_date,
              student_name: clienteNome,
              student_nif: clienteNif,
              description,
              timestamp: new Date().toISOString(),
            };
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (school.webhook_billing_secret?.trim()) {
              headers["X-Webhook-Secret"] = school.webhook_billing_secret.trim();
            }
            fetch(school.webhook_billing_url.trim(), {
              method: "POST",
              headers,
              body: JSON.stringify(webhookPayload),
            }).catch(() => { /* ignore */ });
          } catch { /* ignore */ }
        }

        results.push({
          payment_id: paymentId,
          status: "created",
          receipt_id: receipt!.id,
          receipt_number: receipt!.receipt_number,
          vendus_document_id: vendusMeta.vendusDocumentId,
          vendus_document_number: vendusMeta.vendusDocumentNumber,
          vendus_pdf_url: vendusMeta.vendusPdfUrl,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ payment_id: paymentId, status: "error", detail: msg });
      }
    }

    return corsJson({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("emit-payment-receipt error:", msg);
    return corsJson({ error: msg }, 500);
  }
});
