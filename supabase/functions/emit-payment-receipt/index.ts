/**
 * Emite Comprovativo de Recebimento interno (não fiscal) para escolas com faturação externa.
 * Regista na conta corrente e dispara webhook para o sistema externo.
 *
 * Body: { payment_ids: string[] }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
        // Check if receipt already exists
        const { data: existing } = await admin
          .from("payment_receipts")
          .select("id, receipt_number")
          .eq("payment_id", paymentId)
          .maybeSingle();
        if (existing) {
          results.push({ payment_id: paymentId, status: "skipped", receipt_id: existing.id, receipt_number: existing.receipt_number, detail: "Comprovativo já existe." });
          continue;
        }

        // Load payment with student info
        const { data: payment, error: payErr } = await admin
          .from("payments")
          .select("id, school_id, student_id, amount_paid, method, payment_date, student_fee_id, activity_fee_id, transport_fee_id")
          .eq("id", paymentId)
          .single();
        if (payErr || !payment) {
          results.push({ payment_id: paymentId, status: "error", detail: payErr?.message ?? "Pagamento não encontrado." });
          continue;
        }

        // Get student info
        const { data: student } = await admin
          .from("students")
          .select("full_name, tax_id, parent_id")
          .eq("id", payment.student_id ?? "")
          .maybeSingle();

        // Get parent tax_id
        let parentTaxId: string | null = null;
        if (student?.parent_id) {
          const { data: parent } = await admin
            .from("profiles")
            .select("tax_id")
            .eq("id", student.parent_id)
            .maybeSingle();
          parentTaxId = parent?.tax_id ?? null;
        }

        // Reserve receipt number
        const { error: seqErr } = await admin
          .from("billing_config")
          .upsert({ school_id: payment.school_id, series: "EDK", last_sequence: 0 }, { onConflict: "school_id", ignoreDuplicates: true });

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

        // Build description
        let description = "Pagamento de propina";
        if (payment.activity_fee_id) description = "Pagamento de atividade extracurricular";
        if (payment.transport_fee_id) description = "Pagamento de transporte";

        // Insert receipt
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
        }).select("id, receipt_number").single();

        if (insErr) {
          results.push({ payment_id: paymentId, status: "error", detail: insErr.message });
          continue;
        }

        // Register in account_statements (if student exists)
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

        // Fire webhook to external billing system
        const { data: school } = await admin
          .from("schools")
          .select("webhook_billing_url, webhook_billing_secret")
          .eq("id", payment.school_id)
          .single();

        if (school?.webhook_billing_url?.trim()) {
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
            // Fire and forget — don't block on webhook response
            fetch(school.webhook_billing_url.trim(), {
              method: "POST",
              headers,
              body: JSON.stringify(webhookPayload),
            }).catch(() => { /* ignore webhook failures */ });
          } catch { /* ignore */ }
        }

        results.push({
          payment_id: paymentId,
          status: "created",
          receipt_id: receipt!.id,
          receipt_number: receipt!.receipt_number,
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
