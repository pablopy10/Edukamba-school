/**
 * Emite Comprovativo de Recebimento interno (não fiscal) para escolas com faturação externa.
 * Dispara webhook genérico quando configurado.
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

type PaymentRow = {
  id: string;
  school_id: string;
  amount_paid: number;
  method: string | null;
  payment_date: string | null;
  student_fee_id: string | null;
  activity_fee_id: string | null;
  transport_fee_id: string | null;
  enrollment_fee_id: string | null;
  meal_fee_id: string | null;
  event_fee_id: string | null;
};

async function resolveStudentIdFromPayment(
  admin: ReturnType<typeof createClient>,
  payment: PaymentRow,
): Promise<string | null> {
  if (payment.student_fee_id) {
    const { data } = await admin.from("student_fees").select("student_id").eq("id", payment.student_fee_id).maybeSingle();
    if (data?.student_id) return data.student_id;
  }
  if (payment.activity_fee_id) {
    const { data } = await admin.from("activity_fees").select("student_id").eq("id", payment.activity_fee_id).maybeSingle();
    if (data?.student_id) return data.student_id;
  }
  if (payment.transport_fee_id) {
    const { data } = await admin.from("transport_fees").select("student_id").eq("id", payment.transport_fee_id).maybeSingle();
    if (data?.student_id) return data.student_id;
  }
  if (payment.enrollment_fee_id) {
    const { data } = await admin.from("enrollment_fees").select("student_id").eq("id", payment.enrollment_fee_id).maybeSingle();
    if (data?.student_id) return data.student_id;
  }
  if (payment.meal_fee_id) {
    const { data } = await admin.from("meal_fees").select("student_id").eq("id", payment.meal_fee_id).maybeSingle();
    if (data?.student_id) return data.student_id;
  }
  if (payment.event_fee_id) {
    const { data } = await admin.from("event_fees").select("student_id").eq("id", payment.event_fee_id).maybeSingle();
    if (data?.student_id) return data.student_id;
  }
  return null;
}

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
            "id, school_id, amount_paid, method, payment_date, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id",
          )
          .eq("id", paymentId)
          .single();
        if (payErr || !payment) {
          results.push({ payment_id: paymentId, status: "error", detail: payErr?.message ?? "Pagamento não encontrado." });
          continue;
        }

        const studentId = await resolveStudentIdFromPayment(admin, payment as PaymentRow);

        const { data: school } = await admin
          .from("schools")
          .select("webhook_billing_url, webhook_billing_secret, usa_faturacao_externa")
          .eq("id", payment.school_id)
          .single();

        const { data: existing } = await admin
          .from("payment_receipts")
          .select("id, receipt_number")
          .eq("payment_id", paymentId)
          .maybeSingle();

        if (existing) {
          results.push({
            payment_id: paymentId,
            status: "skipped",
            receipt_id: existing.id,
            receipt_number: existing.receipt_number,
            detail: "Comprovativo já existe.",
          });
          continue;
        }

        const { data: student } = await admin
          .from("students")
          .select("full_name, tax_id, parent_id")
          .eq("id", studentId ?? "")
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

        const { data: receipt, error: insErr } = await admin.from("payment_receipts").insert({
          school_id: payment.school_id,
          payment_id: paymentId,
          student_id: studentId,
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

        if (studentId) {
          const { data: lastStmt } = await admin
            .from("account_statements")
            .select("balance_after")
            .eq("school_id", payment.school_id)
            .eq("student_id", studentId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const prevBalance = Number(lastStmt?.balance_after ?? 0);
          await admin.from("account_statements").insert({
            school_id: payment.school_id,
            student_id: studentId,
            movement_type: "RC",
            description: `${receiptNumber} - ${description}`,
            debit_amount: 0,
            credit_amount: Number(payment.amount_paid),
            balance_after: prevBalance - Number(payment.amount_paid),
            reference_date: payment.payment_date ?? new Date().toISOString().slice(0, 10),
          });
        }

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
