/**
 * Helpers partilhados para Edge Functions Vendus (auth, resolução de escola, logs).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const vendusCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function vendusCorsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...vendusCorsHeaders, "Content-Type": "application/json" },
  });
}

export async function authenticateStaffRequest(req: Request): Promise<{
  ok: true;
  userId: string;
  admin: SupabaseClient;
} | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, response: vendusCorsJson({ error: "Missing authorization" }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!anonKey) {
    return { ok: false, response: vendusCorsJson({ error: "Variáveis Supabase em falta" }, 500) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { ok: false, response: vendusCorsJson({ error: "Unauthorized" }, 401) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  return { ok: true, userId: userData.user.id, admin };
}

export async function resolveSchoolVendusKey(
  admin: SupabaseClient,
  userId: string,
  schoolIdOverride?: string,
): Promise<{
  ok: true;
  schoolId: string;
  vendusApiKey: string;
} | { ok: false; response: Response }> {
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("school_id, support_context_school_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profErr || !profile) {
    return { ok: false, response: vendusCorsJson({ error: "Perfil não encontrado." }, 403) };
  }

  const schoolId = schoolIdOverride?.trim() ||
    (profile.support_context_school_id ?? profile.school_id ?? "").trim();
  if (!schoolId) {
    return { ok: false, response: vendusCorsJson({ error: "Escola não identificada." }, 403) };
  }

  const allowedRoles = ["ADMIN", "SUPER_ADMIN", "DIRECTOR", "TREASURER", "SECRETARY"];
  const role = String(profile.role ?? "");
  if (!allowedRoles.includes(role)) {
    return { ok: false, response: vendusCorsJson({ error: "Sem permissão para operações Vendus." }, 403) };
  }

  const { data: school, error: schoolErr } = await admin
    .from("schools")
    .select("id, vendus_api_key, usa_faturacao_externa")
    .eq("id", schoolId)
    .maybeSingle();

  if (schoolErr || !school) {
    return { ok: false, response: vendusCorsJson({ error: "Escola não encontrada." }, 404) };
  }

  const vendusApiKey = school.vendus_api_key?.trim() ?? "";
  if (!vendusApiKey) {
    return {
      ok: false,
      response: vendusCorsJson({
        error: "Integração Vendus não configurada para esta escola (vendus_api_key ausente).",
      }, 422),
    };
  }

  return { ok: true, schoolId, vendusApiKey };
}

/** Obtém API Key Vendus de uma escola (sem verificação de role — usar após autorização explícita). */
export async function resolveVendusKeyForSchool(
  admin: SupabaseClient,
  schoolId: string,
): Promise<{ ok: true; vendusApiKey: string } | { ok: false; response: Response }> {
  if (!schoolId.trim()) {
    return { ok: false, response: vendusCorsJson({ error: "Escola inválida." }, 400) };
  }
  const { data: school, error } = await admin
    .from("schools")
    .select("vendus_api_key")
    .eq("id", schoolId)
    .maybeSingle();
  if (error || !school) {
    return { ok: false, response: vendusCorsJson({ error: "Escola não encontrada." }, 404) };
  }
  const vendusApiKey = school.vendus_api_key?.trim() ?? "";
  if (!vendusApiKey) {
    return {
      ok: false,
      response: vendusCorsJson({ error: "Integração Vendus não configurada para esta escola." }, 422),
    };
  }
  return { ok: true, vendusApiKey };
}

const VENDUS_STAFF_ROLES = ["ADMIN", "SUPER_ADMIN", "DIRECTOR", "TREASURER", "SECRETARY"];

/** Staff da escola ou encarregado do pagamento pode descarregar PDF Vendus associado. */
export async function authorizeVendusDocumentDownload(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
  paymentIdHint?: string,
): Promise<
  | { ok: true; schoolId: string; documentNumber: string | null; paymentId: string }
  | { ok: false; response: Response }
> {
  const docId = documentId.trim();
  if (!docId) {
    return { ok: false, response: vendusCorsJson({ error: "document_id é obrigatório." }, 400) };
  }

  let receiptQuery = admin
    .from("payment_receipts")
    .select("payment_id, school_id, vendus_document_id, vendus_document_number")
    .eq("vendus_document_id", docId);

  if (paymentIdHint?.trim()) {
    receiptQuery = receiptQuery.eq("payment_id", paymentIdHint.trim());
  }

  const { data: receipt, error: recErr } = await receiptQuery.maybeSingle();
  if (recErr || !receipt?.payment_id || !receipt.school_id) {
    return { ok: false, response: vendusCorsJson({ error: "Documento Vendus não encontrado." }, 404) };
  }

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("role, school_id, support_context_school_id")
    .eq("id", userId)
    .maybeSingle();
  if (profErr || !profile) {
    return { ok: false, response: vendusCorsJson({ error: "Perfil não encontrado." }, 403) };
  }

  const role = String(profile.role ?? "");
  const effectiveSchool = (profile.support_context_school_id ?? profile.school_id ?? "").trim();

  if (VENDUS_STAFF_ROLES.includes(role)) {
    if (effectiveSchool !== receipt.school_id) {
      return { ok: false, response: vendusCorsJson({ error: "Sem permissão para este documento." }, 403) };
    }
    return {
      ok: true,
      schoolId: receipt.school_id,
      documentNumber: receipt.vendus_document_number ?? null,
      paymentId: receipt.payment_id,
    };
  }

  if (role === "PARENT") {
    const { data: payment, error: payErr } = await admin
      .from("payments")
      .select("submitted_by, student_id")
      .eq("id", receipt.payment_id)
      .maybeSingle();
    if (payErr || !payment) {
      return { ok: false, response: vendusCorsJson({ error: "Pagamento não encontrado." }, 404) };
    }
    let allowed = payment.submitted_by === userId;
    if (!allowed && payment.student_id) {
      const { data: student } = await admin
        .from("students")
        .select("parent_id")
        .eq("id", payment.student_id)
        .maybeSingle();
      allowed = student?.parent_id === userId;
    }
    if (!allowed) {
      return { ok: false, response: vendusCorsJson({ error: "Sem permissão para este documento." }, 403) };
    }
    return {
      ok: true,
      schoolId: receipt.school_id,
      documentNumber: receipt.vendus_document_number ?? null,
      paymentId: receipt.payment_id,
    };
  }

  return { ok: false, response: vendusCorsJson({ error: "Sem permissão para operações Vendus." }, 403) };
}

export async function logVendusFailure(
  admin: SupabaseClient,
  entry: {
    schoolId: string;
    operation: string;
    errorMessage: string;
    paymentId?: string | null;
    profileId?: string | null;
    httpStatus?: number | null;
    requestPayload?: unknown;
    responsePayload?: unknown;
  },
): Promise<void> {
  try {
    await admin.from("vendus_integration_logs").insert({
      school_id: entry.schoolId,
      operation: entry.operation,
      payment_id: entry.paymentId ?? null,
      profile_id: entry.profileId ?? null,
      http_status: entry.httpStatus ?? null,
      request_payload: entry.requestPayload ?? null,
      response_payload: entry.responsePayload ?? null,
      error_message: entry.errorMessage.slice(0, 4000),
    });
  } catch (e) {
    console.error("vendus_integration_logs insert failed:", e);
  }
}
