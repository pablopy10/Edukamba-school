/**
 * Emite Recibo (RC) para liquidar uma Fatura (FT) pendente.
 * O RC referencia a FT, actualiza o saldo do aluno para 0 (ou parcial).
 *
 * Body: { invoice_id, payment_method?, payment_date? }
 * Requer: AGT_RSA_PRIVATE_KEY_PEM
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
  let privateKey: forge.pki.rsa.PrivateKey;
  try {
    privateKey = forge.pki.privateKeyFromPem(pem);
  } catch {
    const der = forge.util.decode64(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
    const asn1 = forge.asn1.fromDer(der);
    privateKey = forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
  }
  const md = forge.md.sha1.create();
  md.update(plaintext, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

function formatTotal(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

function formatIssuedAt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return corsJson({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJson({ error: "Missing authorization" }, 401);

    const pemRaw = Deno.env.get("AGT_RSA_PRIVATE_KEY_PEM") ?? "";
    const pem = normalizePrivateKeyPem(pemRaw);
    if (!pem || !/PRIVATE KEY/.test(pem)) {
      return corsJson({ error: "AGT_RSA_PRIVATE_KEY_PEM não configurada." }, 503);
    }

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
    const invoiceId = body.invoice_id?.trim();
    if (!invoiceId) return corsJson({ error: "invoice_id é obrigatório" }, 400);

    // Buscar FT original
    const { data: ft, error: ftErr } = await admin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (ftErr || !ft) return corsJson({ error: "Fatura não encontrada" }, 404);
    if (ft.invoice_status === "A") return corsJson({ error: "Fatura anulada não pode ser liquidada" }, 400);
    if (ft.doc_type !== "FT") return corsJson({ error: "Apenas faturas (FT) podem ser liquidadas com RC" }, 400);

    // Verificar se já existe RC para esta FT
    const { data: existingRc } = await admin
      .from("invoices")
      .select("id, document_number")
      .eq("referenced_invoice_id", invoiceId)
      .eq("doc_type", "RC")
      .eq("invoice_status", "N")
      .maybeSingle();
    if (existingRc) {
      return corsJson({ error: `Já existe recibo ${existingRc.document_number} para esta fatura` }, 409);
    }

    // Reservar número RC
    const { data: slot, error: slotErr } = await admin.rpc("billing_reserve_next_doc_number", {
      _school_id: ft.school_id,
      _doc_type: "RC",
    });
    if (slotErr) return corsJson({ error: slotErr.message }, 500);
    const s = (slot as { serie: string; seq: number }[])?.[0];
    if (!s) return corsJson({ error: "Falha a reservar número de recibo" }, 500);

    const documentNumber = `RC ${s.serie}/${s.seq}`;
    const issuedAt = new Date();
    const issuedAtStr = formatIssuedAt(issuedAt);
    const invoiceDateYYYYMMDD = issuedAt.toISOString().slice(0, 10);
    const grossTotal = Number(ft.gross_total);
    const totalStr = formatTotal(grossTotal);

    // Buscar último hash da série RC para encadeamento
    const { data: lastRc } = await admin
      .from("invoices")
      .select("digital_signature_sha1_b64")
      .eq("school_id", ft.school_id)
      .eq("doc_type", "RC")
      .order("doc_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousSignature = lastRc?.digital_signature_sha1_b64?.trim() ?? "";

    // Assinar
    const plaintext = `${invoiceDateYYYYMMDD};${issuedAtStr};${documentNumber};${totalStr};${previousSignature}`;
    const documentHash = await sha1HexUtf8(plaintext);
    const signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);
    const hashControl = (((Math.max(s.seq, 1) - 1) % 10) + 1).toString();

    // Inserir RC
    const { data: rc, error: rcErr } = await admin.from("invoices").insert({
      school_id: ft.school_id,
      student_id: ft.student_id,
      parent_profile_id: ft.parent_profile_id,
      series: s.serie,
      doc_number: s.seq,
      doc_type: "RC",
      document_number: documentNumber,
      invoice_date: invoiceDateYYYYMMDD,
      invoice_issued_at: issuedAt.toISOString(),
      gross_total: grossTotal,
      net_total: grossTotal,
      tax_payable: 0,
      line_description: `Recibo ref. ${ft.document_number}`,
      referenced_invoice_id: invoiceId,
      payment_method: body.payment_method ?? "Numerário",
      payment_date: body.payment_date ?? invoiceDateYYYYMMDD,
      agt_signing_plaintext: plaintext,
      digital_signature_sha1_b64: signatureBase64,
      document_hash: documentHash,
      previous_document_hash: previousSignature || null,
      hash_control: hashControl,
      cliente_nome: ft.cliente_nome,
      cliente_nif: ft.cliente_nif,
    }).select("id, document_number").single();

    if (rcErr) return corsJson({ error: rcErr.message }, 500);

    // Registar crédito na conta corrente
    if (ft.student_id) {
      const { data: lastStmt } = await admin
        .from("account_statements")
        .select("balance_after")
        .eq("school_id", ft.school_id)
        .eq("student_id", ft.student_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const prevBalance = Number(lastStmt?.balance_after ?? 0);
      await admin.from("account_statements").insert({
        school_id: ft.school_id,
        student_id: ft.student_id,
        invoice_id: rc!.id,
        movement_type: "RC",
        description: `Pagamento ${documentNumber} ref. ${ft.document_number}`,
        debit_amount: 0,
        credit_amount: grossTotal,
        balance_after: prevBalance - grossTotal,
        reference_date: invoiceDateYYYYMMDD,
      });
    }

    return corsJson({
      ok: true,
      receipt_id: rc!.id,
      document_number: rc!.document_number,
      referenced_invoice: ft.document_number,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("emit-receipt error:", msg);
    return corsJson({ error: msg }, 500);
  }
});
