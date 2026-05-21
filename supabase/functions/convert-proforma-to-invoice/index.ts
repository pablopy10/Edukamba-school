/**
 * Converte uma Fatura Pró-Forma (PP) numa Fatura (FT) com OrderReferences.
 * Gera a FT com assinatura AGT e liga-a à PP original via order_reference_pp.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import forge from "https://esm.sh/node-forge@1.3.1";

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


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

  const pemRaw = Deno.env.get("AGT_RSA_PRIVATE_KEY_PEM") ?? "";
  const pem = normalizePrivateKeyPem(pemRaw);
  if (!pem || !/PRIVATE KEY/.test(pem)) {
    return corsJson({ error: "AGT_RSA_PRIVATE_KEY_PEM não configurada." }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : userClient;

  // Verify user
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

  let body: { proforma_id?: string; school_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "JSON inválido" }, 400);
  }

  const { proforma_id, school_id } = body;
  if (!proforma_id) return corsJson({ error: "proforma_id é obrigatório" }, 400);

  // Load the proforma
  const { data: pp, error: ppErr } = await adminClient
    .from("proforma_invoices")
    .select("*")
    .eq("id", proforma_id)
    .maybeSingle();

  if (ppErr || !pp) return corsJson({ error: ppErr?.message ?? "Pró-forma não encontrada" }, 404);

  // Check if already converted
  if (pp.converted_invoice_id) {
    return corsJson({ error: `Já convertida na fatura ${pp.converted_invoice_id}` }, 409);
  }

  // Determine school_id — use provided or fetch first school from platform
  let targetSchoolId = school_id?.trim() || null;
  if (!targetSchoolId) {
    const { data: firstSchool } = await adminClient
      .from("schools")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    targetSchoolId = firstSchool?.id ?? null;
  }
  if (!targetSchoolId) {
    return corsJson({ error: "Nenhuma escola encontrada na plataforma. Crie uma escola primeiro." }, 400);
  }

  // Reserve next invoice number
  const { data: rpcRows, error: rpcErr } = await adminClient.rpc("billing_reserve_next_invoice", {
    _school_id: targetSchoolId,
  });
  if (rpcErr) return corsJson({ error: rpcErr.message }, 500);
  const slot = (rpcRows as { serie: string; seq: number }[] | null)?.[0];
  if (!slot?.serie || slot.seq == null) {
    return corsJson({ error: "Falha a reservar número de fatura." }, 500);
  }

  const series = String(slot.serie).trim();
  const seq = Number(slot.seq);
  const documentNumberFull = `FT ${series}/${seq}`;

  // Calculate total from proforma
  const totalRaw = pp.total?.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "") ?? "0";
  const grossTotal = Number(totalRaw) || 0;
  const totalStr = formatTotalForSigning(grossTotal);

  // Get previous document hash for chain
  let previousDocumentHash = "";
  if (seq > 1) {
    const { data: prev } = await adminClient
      .from("invoices")
      .select("document_hash")
      .eq("school_id", targetSchoolId)
      .eq("series", series)
      .eq("doc_number", seq - 1)
      .maybeSingle();
    previousDocumentHash = prev?.document_hash?.trim() ?? "";
  }

  // Build plaintext and sign
  const now = new Date();
  const invoiceDateYYYYMMDD = now.toISOString().slice(0, 10);
  const issuedAtISO = now.toISOString();
  const plaintext = `${invoiceDateYYYYMMDD};${issuedAtISO};${documentNumberFull};${totalStr};${previousDocumentHash}`;

  const document_hash = await sha1HexUtf8(plaintext);
  let signatureBase64 = "";
  try {
    signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);
  } catch (e) {
    return corsJson({ error: `Erro ao assinar: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  const hash_control = (((Math.max(seq, 1) - 1) % 10) + 1).toString();

  // Build line description from proforma items
  const items = pp.items as Array<{ description?: string }> | null;
  const lineDescription = items?.map((i) => i.description).filter(Boolean).join("; ") || "Serviços (conversão PP)";

  // Insert invoice with order_reference_pp
  const { data: invoice, error: insErr } = await adminClient.from("invoices").insert({
    school_id: targetSchoolId,
    series,
    doc_number: seq,
    document_number: documentNumberFull,
    invoice_date: invoiceDateYYYYMMDD,
    invoice_issued_at: issuedAtISO,
    gross_total: grossTotal,
    line_description: lineDescription,
    agt_signing_plaintext: plaintext,
    digital_signature_sha1_b64: signatureBase64,
    document_hash,
    previous_document_hash: previousDocumentHash || null,
    hash_control,
    cliente_nome: pp.client_name ?? "Cliente",
    cliente_nif: pp.client_nif ?? "999999999",
    order_reference_pp: pp.document_number,
    invoice_status: "N",
  }).select("id, document_number").single();

  if (insErr) return corsJson({ error: insErr.message }, 500);

  // Mark proforma as converted
  await adminClient
    .from("proforma_invoices")
    .update({ converted_invoice_id: invoice.id })
    .eq("id", proforma_id);

  return corsJson({
    ok: true,
    invoice_id: invoice.id,
    document_number: invoice.document_number,
    order_reference: pp.document_number,
  });
});
