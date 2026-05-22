/**
 * Emite Nota de Crédito (NC) que retifica uma FT existente.
 * Usa a tabela `invoices` com document_number prefixado "NC" para manter
 * compatibilidade com a estrutura existente.
 * 
 * Regras AGT:
 * 1. Nunca apagar ou editar a FT original
 * 2. NC tem numeração própria (NC EDK/1, NC EDK/2...)
 * 3. Referência obrigatória à FT retificada (SourceBilling)
 * 4. Motivo justificado obrigatório (6-60 caracteres)
 * 5. Hash e assinatura AGT próprios
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import forge from "https://esm.sh/node-forge@1.3.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMIT_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "DIRECTOR", "TREASURER"]);

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 200);
  return t.length >= 6 ? t : null;
}

function normalizePrivateKeyPem(raw: string): string {
  let pem = raw.trim();
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
    pem = pem.slice(1, -1).trim();
  }
  return pem.replace(/\\n/g, "\n").trim();
}

async function sha1HexUtf8(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-1", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function signPlaintextRSA_SHA1(plaintext: string, pem: string): string {
  const privateKey = forge.pki.privateKeyFromPem(pem);
  const md = forge.md.sha1.create();
  md.update(plaintext, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

function formatTotalForSigning(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

function formatInvoiceDate(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d.includes("T") ? d : `${d}T12:00:00`) : d;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  
  if (!supabaseUrl || !anonKey) return corsJson({ error: "Variáveis Supabase em falta" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

  const pemRaw = Deno.env.get("AGT_RSA_PRIVATE_KEY_PEM") ?? "";
  const pem = normalizePrivateKeyPem(pemRaw);
  if (!pem || !/PRIVATE KEY/.test(pem)) {
    return corsJson({ error: "AGT_RSA_PRIVATE_KEY_PEM não configurada." }, 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "JSON inválido" }, 400);
  }

  const invoice_id = (body as { invoice_id?: unknown }).invoice_id;
  const reason = normalizeReason((body as { reason?: unknown }).reason);
  const partial_amount = (body as { partial_amount?: unknown }).partial_amount;

  if (typeof invoice_id !== "string" || !invoice_id.trim()) {
    return corsJson({ error: "invoice_id obrigatório" }, 400);
  }
  if (!reason) {
    return corsJson({ error: "reason obrigatório (mínimo 6 caracteres)." }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : userClient;

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

  const { data: profile, error: profErr } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profErr) return corsJson({ error: profErr.message }, 400);
  const role = String(profile?.role ?? "");
  if (!EMIT_ROLES.has(role)) {
    return corsJson({ error: "Sem permissão para emitir notas de crédito." }, 403);
  }

  // Carregar FT original
  const { data: originalInvoice, error: invErr } = await adminClient
    .from("invoices")
    .select("*")
    .eq("id", invoice_id.trim())
    .maybeSingle();

  if (invErr) return corsJson({ error: invErr.message }, 400);
  if (!originalInvoice?.id) return corsJson({ error: "Fatura não encontrada." }, 404);

  const status = String(originalInvoice.invoice_status ?? "N").trim().toUpperCase();
  if (status === "A") {
    return corsJson({ error: "Não é possível emitir NC para fatura anulada." }, 409);
  }

  // Determinar valor da NC (total ou parcial)
  const originalTotal = Number(originalInvoice.gross_total);
  let ncAmount = originalTotal;
  if (typeof partial_amount === "number" && partial_amount > 0 && partial_amount < originalTotal) {
    ncAmount = partial_amount;
  }

  // Obter última NC da escola para numeração sequencial
  const schoolId = originalInvoice.school_id;
  const series = "EDK";

  const { data: lastNC } = await adminClient
    .from("invoices")
    .select("document_number, document_hash")
    .eq("school_id", schoolId)
    .like("document_number", `NC ${series}/%`)
    .order("doc_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextNumber = 1;
  if (lastNC?.document_number) {
    const match = /NC\s+\w+\/(\d+)$/i.exec(lastNC.document_number);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }

  const documentNumber = `NC ${series}/${nextNumber}`;
  const invoiceDate = formatInvoiceDate(new Date());
  const issuedAt = new Date().toISOString();
  const totalStr = formatTotalForSigning(ncAmount);

  // Plaintext AGT para NC: DataFatura;DataHoraCriacao;NumeroFatura;Total;HashAnterior
  const previousHash = lastNC?.document_hash?.trim() || "";
  const plaintext = `${invoiceDate};${issuedAt};${documentNumber};${totalStr};${previousHash}`;

  // Hash SHA-1
  const documentHash = await sha1HexUtf8(plaintext);

  // Assinatura RSA-SHA1
  const signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);

  // Hash control
  const hashControl = (((Math.max(nextNumber, 1) - 1) % 10) + 1).toString();

  // Inserir NC na tabela invoices (mesma tabela que FT, com document_number prefixado NC)
  const insertPayload: Record<string, unknown> = {
    school_id: schoolId,
    student_id: originalInvoice.student_id ?? null,
    parent_profile_id: originalInvoice.parent_profile_id ?? null,
    series,
    doc_number: nextNumber,
    document_number: documentNumber,
    invoice_date: invoiceDate,
    invoice_issued_at: issuedAt,
    gross_total: ncAmount,
    currency: originalInvoice.currency ?? "AOA",
    line_description: `NC ref. ${originalInvoice.document_number} — ${reason}`,
    agt_signing_plaintext: plaintext,
    digital_signature_sha1_b64: signatureBase64,
    document_hash: documentHash,
    previous_document_hash: previousHash || null,
    hash_control: hashControl,
    cliente_nome: originalInvoice.cliente_nome,
    cliente_nif: originalInvoice.cliente_nif,
    exemption_code: originalInvoice.exemption_code ?? null,
    exemption_reason: originalInvoice.exemption_reason ?? null,
    invoice_status: "N",
    cancellation_reason: reason,
  };

  const { data: inserted, error: insertErr } = await adminClient
    .from("invoices")
    .insert(insertPayload)
    .select("id, document_number")
    .single();

  if (insertErr) {
    console.error("emit-credit-note: insert error", insertErr);
    return corsJson({ error: insertErr.message }, 500);
  }

  return corsJson({
    ok: true,
    credit_note_id: inserted.id,
    document_number: inserted.document_number,
    source_invoice_number: originalInvoice.document_number,
  });
});
