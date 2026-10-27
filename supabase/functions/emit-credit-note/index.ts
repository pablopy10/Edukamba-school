/**
 * Emite Nota de Crédito (NC) certificada pela AGT que retifica uma fatura existente (FT/FR).
 * 
 * Regras AGT e Decreto Presidencial n.º 292/18:
 * 1. Imutabilidade fiscal: Nunca apagar ou alterar valores da fatura original
 * 2. Série e encadeamento próprio (NC EDK/1, NC EDK/2...)
 * 3. Assinatura digital RSA (SHA-1) encadeada com o hash anterior da série NC
 * 4. Vinculação obrigatória à fatura de origem (original_invoice_id, original_invoice_number, original_invoice_date)
 * 5. Consistência de impostos: replica taxas de IVA e motivos de isenção
 * 6. Bloqueio de saldo e sobrecrédito: valor creditado total não pode exceder o original
 * 7. Marcação visual de status na fatura original (PARTIALLY_CREDITED ou FULLY_CREDITED)
 * 8. Atualização de auditoria nos pagamentos associados (has_credit_note, credit_note_number, credited_amount)
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
  const t = raw.trim().slice(0, 250);
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

function extractHashControl(sigB64: string): string {
  const clean = sigB64.trim();
  if (clean.length < 31) return "0000";
  return `${clean.charAt(0)}${clean.charAt(10)}${clean.charAt(20)}${clean.charAt(30)}`;
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
  const selected_item = (body as { selected_item?: unknown }).selected_item;
  const items_to_credit = (body as { items_to_credit?: unknown }).items_to_credit;

  if (typeof invoice_id !== "string" || !invoice_id.trim()) {
    return corsJson({ error: "invoice_id obrigatório" }, 400);
  }
  if (!reason) {
    return corsJson({ error: "O motivo da nota de crédito é obrigatório (mínimo 6 caracteres)." }, 400);
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

  // 1. Carregar fatura original
  const { data: originalInvoice, error: invErr } = await adminClient
    .from("invoices")
    .select("*")
    .eq("id", invoice_id.trim())
    .maybeSingle();

  if (invErr) return corsJson({ error: invErr.message }, 400);
  if (!originalInvoice?.id) return corsJson({ error: "Fatura não encontrada." }, 404);

  const status = String(originalInvoice.invoice_status ?? "N").trim().toUpperCase();
  if (status === "A") {
    return corsJson({ error: "Não é possível emitir NC para fatura já anulada." }, 409);
  }

  const originalTotal = Number(originalInvoice.gross_total);
  const schoolId = originalInvoice.school_id;

  // 2. Verificar saldo disponível e prevenir sobrecrédito
  const { data: existingNCs, error: ncQueryErr } = await adminClient
    .from("invoices")
    .select("id, gross_total, doc_number, document_number")
    .or(`original_invoice_id.eq.${originalInvoice.id},referenced_invoice_id.eq.${originalInvoice.id}`)
    .in("doc_type", ["NC", "nc"]);

  if (ncQueryErr) return corsJson({ error: ncQueryErr.message }, 500);

  const alreadyCredited = (existingNCs || []).reduce((acc, row) => acc + Number(row.gross_total || 0), 0);
  const remainingBalance = Math.round((originalTotal - alreadyCredited + Number.EPSILON) * 100) / 100;

  if (remainingBalance <= 0.001) {
    return corsJson({
      error: `A fatura ${originalInvoice.document_number} já se encontra 100% creditada (Total: ${originalTotal.toFixed(2)} Kz).`,
    }, 409);
  }

  // Determinar valor da NC (total ou parcial)
  let ncAmount = remainingBalance;
  if (typeof partial_amount === "number" && partial_amount > 0) {
    ncAmount = Math.min(partial_amount, remainingBalance);
  }

  if (ncAmount > remainingBalance + 0.01) {
    return corsJson({
      error: `Sobrecrédito rejeitado: valor solicitado (${ncAmount.toFixed(2)} Kz) excede o saldo remanescente disponível (${remainingBalance.toFixed(2)} Kz).`,
    }, 400);
  }

  // 3. Obter ou reservar número na série fiscal de NC (NC-EDK para evitar colisão com FT em invoices_school_series_doc_uq)
  const ncSeriesCode = "NC-EDK";
  const currentFiscalYear = new Date().getFullYear();
  const invoiceDate = formatInvoiceDate(new Date());
  const issuedAt = new Date().toISOString();

  // Tentar reservar número atómico pela RPC oficial da série fiscal
  let nextNumber: number;
  let documentNumber: string;
  let previousHash = "";

  const { data: reserveData, error: reserveErr } = await adminClient.rpc(
    "billing_reserve_series_next_number",
    {
      _school_id: schoolId,
      _doc_type: "NC",
      _series_code: ncSeriesCode,
      _fiscal_year: currentFiscalYear,
      _document_date: invoiceDate,
    }
  );

  if (!reserveErr && reserveData && reserveData.length > 0) {
    const row = reserveData[0];
    nextNumber = row.doc_number;
    documentNumber = row.document_number_full || `NC EDK/${nextNumber}`;
    previousHash = (row.previous_document_hash ?? "").trim();
  } else {
    // Fallback sequencial seguro com verificação na tabela invoices para NCs
    const { data: lastNC } = await adminClient
      .from("invoices")
      .select("document_number, document_hash, doc_number")
      .eq("school_id", schoolId)
      .or(`doc_type.eq.NC,series.eq.${ncSeriesCode}`)
      .order("doc_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    nextNumber = (lastNC?.doc_number ?? 0) + 1;
    documentNumber = `NC EDK/${nextNumber}`;
    previousHash = (lastNC?.document_hash ?? "").trim();
  }

  const totalStr = formatTotalForSigning(ncAmount);

  // 4. Plaintext AGT para NC: DataFatura;DataHoraCriacao;NumeroFatura;Total;HashAnterior
  const plaintext = `${invoiceDate};${issuedAt};${documentNumber};${totalStr};${previousHash}`;

  // 5. Criptografia SHA-1 e Assinatura RSA-SHA1
  const documentHash = await sha1HexUtf8(plaintext);
  const signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);
  const hashControl = extractHashControl(signatureBase64);

  // 6. Montar descrição das linhas creditadas
  let lineDesc = `NC ref. ${originalInvoice.document_number} — ${reason}`;
  if (typeof selected_item === "string" && selected_item.trim()) {
    lineDesc += ` [${selected_item.trim()}]`;
  }

  // 7. Inserir registo da NC na tabela invoices
  // Nota: payment_id nulo para não colidir no índice único invoices_payment_id_uq
  const insertPayload: Record<string, unknown> = {
    school_id: schoolId,
    student_id: originalInvoice.student_id ?? null,
    parent_profile_id: originalInvoice.parent_profile_id ?? null,
    payment_id: null,
    series: ncSeriesCode,
    doc_number: nextNumber,
    document_number: documentNumber,
    doc_type: "NC",
    document_type: "NC",
    invoice_date: invoiceDate,
    invoice_issued_at: issuedAt,
    gross_total: ncAmount,
    net_total: ncAmount, // Base educacional padrão ou líquida
    tax_payable: 0,
    currency: originalInvoice.currency ?? "AOA",
    original_invoice_id: originalInvoice.id,
    original_invoice_number: originalInvoice.document_number,
    original_invoice_date: originalInvoice.invoice_date,
    credit_reason: reason,
    referenced_invoice_id: originalInvoice.id,
    original_document_number: originalInvoice.document_number,
    original_document_date: originalInvoice.invoice_date,
    rectification_reason: reason,
    line_description: lineDesc,
    agt_signing_plaintext: plaintext,
    digital_signature_sha1_b64: signatureBase64,
    document_hash: documentHash,
    previous_document_hash: previousHash || null,
    hash_control: hashControl,
    cliente_nome: originalInvoice.cliente_nome,
    cliente_nif: originalInvoice.cliente_nif,
    exemption_code: originalInvoice.exemption_code ?? "M11",
    exemption_reason: originalInvoice.exemption_reason ?? "Isenção no domínio da educação",
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

  // 8. Inserir linha correspondente em invoice_lines (para SAF-T completo)
  try {
    await adminClient.from("invoice_lines").insert({
      invoice_id: inserted.id,
      line_number: 1,
      product_code: "SERV-EDUC-01",
      product_description: lineDesc,
      quantity: 1,
      unit_of_measure: "UN",
      unit_price: ncAmount,
      credit_amount: ncAmount,
      debit_amount: 0,
      tax_type: "IVA",
      tax_country_region: "AO",
      tax_code: "ISE",
      tax_percentage: 0,
      tax_exemption_code: originalInvoice.exemption_code ?? "M11",
      tax_exemption_reason: originalInvoice.exemption_reason ?? "Isenção no domínio da educação",
    });
  } catch (lineErr) {
    console.warn("emit-credit-note: non-fatal invoice_lines insert issue:", lineErr);
  }

  // 9. Atualizar estado de crédito na fatura original e auditoria no pagamento
  const newTotalCredited = Math.round((alreadyCredited + ncAmount + Number.EPSILON) * 100) / 100;
  const newCreditStatus = newTotalCredited >= (originalTotal - 0.01) ? "FULLY_CREDITED" : "PARTIALLY_CREDITED";

  // Atualizar fatura de origem
  await adminClient
    .from("invoices")
    .update({
      credit_status: newCreditStatus,
      credited_amount: newTotalCredited,
    })
    .eq("id", originalInvoice.id);

  // Atualizar pagamento associado
  if (originalInvoice.payment_id) {
    await adminClient
      .from("payments")
      .update({
        has_credit_note: true,
        credit_note_id: inserted.id,
        credit_note_number: documentNumber,
        credited_amount: newTotalCredited,
        credited_at: issuedAt,
      })
      .eq("id", originalInvoice.payment_id);

    // Atualizar itens do pagamento (se existirem)
    await adminClient
      .from("payment_items")
      .update({
        has_credit_note: true,
        credit_note_id: inserted.id,
        credit_note_number: documentNumber,
        credited_amount: newTotalCredited,
        credited_at: issuedAt,
      })
      .eq("payment_id", originalInvoice.payment_id);
  }

  // 10. Confirmar série fiscal
  try {
    await adminClient.rpc("billing_commit_series_emission", {
      _school_id: schoolId,
      _doc_type: "NC",
      _series_code: ncSeriesCode,
      _fiscal_year: currentFiscalYear,
      _new_hash: documentHash,
      _doc_date: invoiceDate,
    });
  } catch (commitErr) {
    console.warn("emit-credit-note: non-fatal billing_commit_series_emission issue:", commitErr);
  }

  return corsJson({
    ok: true,
    credit_note_id: inserted.id,
    document_number: inserted.document_number,
    source_invoice_number: originalInvoice.document_number,
    credited_amount: ncAmount,
    total_credited: newTotalCredited,
    credit_status: newCreditStatus,
    remaining_balance: Math.max(0, originalTotal - newTotalCredited),
    hash_control: hashControl,
  });
});
