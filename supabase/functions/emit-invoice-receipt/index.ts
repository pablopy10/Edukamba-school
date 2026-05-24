/**
 * Emite Fatura-Recibo (FR) — venda ao balcão / pronto pagamento.
 * Documento que nasce pago (não precisa de RC posterior).
 *
 * Body: {
 *   school_id, student_id?,
 *   cliente_nome, cliente_nif?,
 *   items: [{ description, quantity?, unit_price, tax_code?, tax_percentage? }],
 *   payment_method?
 * }
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

type ItemInput = {
  description: string;
  quantity?: number;
  unit_price: number;
  tax_code?: string;       // ISE | NOR
  tax_percentage?: number; // 0 | 14
};

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

    const schoolId = body.school_id?.trim();
    if (!schoolId) return corsJson({ error: "school_id é obrigatório" }, 400);

    const items: ItemInput[] = body.items;
    if (!items?.length) return corsJson({ error: "items é obrigatório (pelo menos 1 item)" }, 400);

    const clienteNome = body.cliente_nome?.trim() || "Consumidor Final";
    const clienteNif = body.cliente_nif?.trim() || "999999999";

    // Calcular totais
    let netTotal = 0;
    let taxPayable = 0;
    const lines: Array<ItemInput & { lineNet: number; lineTax: number }> = [];

    for (const item of items) {
      const qty = item.quantity ?? 1;
      const lineNet = Math.round(qty * item.unit_price * 100) / 100;
      const taxPct = item.tax_percentage ?? 0;
      const lineTax = Math.round(lineNet * taxPct / 100 * 100) / 100;
      netTotal += lineNet;
      taxPayable += lineTax;
      lines.push({ ...item, lineNet, lineTax });
    }
    const grossTotal = Math.round((netTotal + taxPayable) * 100) / 100;

    // Reservar número FR
    const { data: slot, error: slotErr } = await admin.rpc("billing_reserve_next_doc_number", {
      _school_id: schoolId,
      _doc_type: "FR",
    });
    if (slotErr) return corsJson({ error: slotErr.message }, 500);
    const s = (slot as { serie: string; seq: number }[])?.[0];
    if (!s) return corsJson({ error: "Falha a reservar número" }, 500);

    const documentNumber = `FR ${s.serie}/${s.seq}`;
    const issuedAt = new Date();
    const issuedAtStr = formatIssuedAt(issuedAt);
    const invoiceDateYYYYMMDD = issuedAt.toISOString().slice(0, 10);
    const totalStr = formatTotal(grossTotal);

    // Encadeamento — buscar último FR da série
    const { data: lastFr } = await admin
      .from("invoices")
      .select("digital_signature_sha1_b64")
      .eq("school_id", schoolId)
      .eq("doc_type", "FR")
      .order("doc_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousSignature = lastFr?.digital_signature_sha1_b64?.trim() ?? "";

    // Assinar
    const plaintext = `${invoiceDateYYYYMMDD};${issuedAtStr};${documentNumber};${totalStr};${previousSignature}`;
    const documentHash = await sha1HexUtf8(plaintext);
    const signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);
    const hashControl = (((Math.max(s.seq, 1) - 1) % 10) + 1).toString();

    // Montar line_description compacta para compatibilidade
    const lineDescParts = lines.map(l => {
      const taxPct = l.tax_percentage ?? 0;
      const taxSuffix = taxPct === 0 ? "0_M11" : String(taxPct);
      return `${l.description}:${formatTotal(l.lineNet)}:${taxSuffix}`;
    });

    // Inserir FR
    const { data: fr, error: frErr } = await admin.from("invoices").insert({
      school_id: schoolId,
      student_id: body.student_id || null,
      series: s.serie,
      doc_number: s.seq,
      doc_type: "FR",
      document_number: documentNumber,
      invoice_date: invoiceDateYYYYMMDD,
      invoice_issued_at: issuedAt.toISOString(),
      gross_total: grossTotal,
      net_total: netTotal,
      tax_payable: taxPayable,
      line_description: lineDescParts.join(";"),
      payment_method: body.payment_method ?? "Numerário",
      payment_date: invoiceDateYYYYMMDD,
      agt_signing_plaintext: plaintext,
      digital_signature_sha1_b64: signatureBase64,
      document_hash: documentHash,
      previous_document_hash: previousSignature || null,
      hash_control: hashControl,
      cliente_nome: clienteNome,
      cliente_nif: clienteNif,
    }).select("id, document_number").single();

    if (frErr) return corsJson({ error: frErr.message }, 500);

    // Inserir linhas individuais
    const lineInserts = lines.map((l, idx) => ({
      invoice_id: fr!.id,
      line_number: idx + 1,
      product_code: "SERV-EDUC-01",
      product_description: l.description,
      quantity: l.quantity ?? 1,
      unit_price: l.unit_price,
      credit_amount: l.lineNet,
      tax_type: "IVA",
      tax_country_region: "AO",
      tax_code: (l.tax_percentage ?? 0) > 0 ? "NOR" : "ISE",
      tax_percentage: l.tax_percentage ?? 0,
      tax_exemption_code: (l.tax_percentage ?? 0) === 0 ? "M11" : null,
      tax_exemption_reason: (l.tax_percentage ?? 0) === 0 ? "Isenção no domínio da educação" : null,
    }));
    await admin.from("invoice_lines").insert(lineInserts);

    return corsJson({
      ok: true,
      invoice_id: fr!.id,
      document_number: fr!.document_number,
      gross_total: grossTotal,
      net_total: netTotal,
      tax_payable: taxPayable,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("emit-invoice-receipt error:", msg);
    return corsJson({ error: msg }, 500);
  }
});
