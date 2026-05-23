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

  try {
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

    // Determine school_id
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
      return corsJson({ error: "Nenhuma escola encontrada." }, 400);
    }

    // Reserve next invoice number (use userClient — RPC checks auth role)
    const { data: rpcRows, error: rpcErr } = await userClient.rpc("billing_reserve_next_invoice", {
      _school_id: targetSchoolId,
    });
    if (rpcErr) return corsJson({ error: `Reserva FT: ${rpcErr.message}` }, 500);
    const slot = (rpcRows as { serie: string; seq: number }[] | null)?.[0];
    if (!slot?.serie || slot.seq == null) {
      return corsJson({ error: "Falha a reservar número de fatura (billing_config em falta?)." }, 500);
    }

    const series = String(slot.serie).trim();
    const seq = Number(slot.seq);
    const documentNumberFull = `FT ${series}/${seq}`;

    // Calculate total from proforma (pt-AO format: "513.000,00" → 513000.00)
    // Remove currency symbols, letters, and whitespace; keep only digits, dots, commas
    const totalCleaned = String(pp.total ?? "0").replace(/[^0-9.,]/g, "");
    // pt-AO uses dot as thousands separator and comma as decimal: "513.000,00" → "513000.00"
    const totalParsed = totalCleaned.replace(/\./g, "").replace(",", ".");
    let grossTotal = Number(totalParsed) || 0;

    // Fallback: se total é 0 mas há items, calcular a partir dos items + IVA
    if (grossTotal === 0) {
      const ppItems = pp.items as Array<{ total_amount?: string; unit_amount?: string; quantity?: number; iva_pct?: string }> | null;
      if (ppItems && ppItems.length > 0) {
        let subtotal = 0;
        let totalIva = 0;
        for (const item of ppItems) {
          const rawAmt = String(item.total_amount ?? item.unit_amount ?? "0").replace(/[^0-9.,]/g, "");
          const amt = Number(rawAmt.replace(/\./g, "").replace(",", ".")) || 0;
          const qty = item.quantity || 1;
          const base = amt * qty;
          subtotal += base;
          const pct = item.iva_pct === "0_M04" ? 0 : (Number(String(item.iva_pct ?? "0").replace(/[^0-9]/g, "")) || 0);
          totalIva += base * pct / 100;
        }
        grossTotal = Math.round((subtotal + totalIva) * 100) / 100;
      }
      // Último fallback: usar iva_percentage da proforma sobre o subtotal
      if (grossTotal === 0) {
        const subtotalCleaned = String(pp.subtotal ?? "0").replace(/[^0-9.,]/g, "");
        const subtotalNum = Number(subtotalCleaned.replace(/\./g, "").replace(",", ".")) || 0;
        const ivaPct = Number(pp.iva_percentage) || 0;
        grossTotal = Math.round((subtotalNum + subtotalNum * ivaPct / 100) * 100) / 100;
      }
    }

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
    const signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);
    const hash_control = (((Math.max(seq, 1) - 1) % 10) + 1).toString();

    // Build line description from proforma items (inclui valor por item para PDF multi-linha)
    const items = pp.items as Array<{ description?: string; total_amount?: string; iva_pct?: string }> | null;
    const lineDescription = items?.map((i) => {
      const desc = i.description || "Serviço";
      const amount = i.total_amount || "0";
      const iva = i.iva_pct || "0";
      return `${desc}:${amount}:${iva}`;
    }).filter(Boolean).join("; ") || "Serviços (conversão PP)";

    // Insert invoice — try with order_reference_pp, fallback without if column missing
    const basePayload = {
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
      invoice_status: "N",
    };

    // Try with order_reference_pp
    let res = await adminClient.from("invoices")
      .insert({ ...basePayload, order_reference_pp: pp.document_number })
      .select("id, document_number").single();

    // Fallback: column might not exist yet
    if (res.error && /order_reference_pp/.test(res.error.message)) {
      res = await adminClient.from("invoices")
        .insert(basePayload)
        .select("id, document_number").single();
    }

    if (res.error || !res.data) {
      return corsJson({ error: res.error?.message ?? "Erro ao inserir fatura" }, 500);
    }

    const invoice = res.data;

    // Mark proforma as converted (ignore if column missing)
    const upd = await adminClient
      .from("proforma_invoices")
      .update({ converted_invoice_id: invoice.id } as Record<string, unknown>)
      .eq("id", proforma_id);
    // Ignore update error (column might not exist)
    if (upd.error) console.warn("update proforma converted_invoice_id:", upd.error.message);

    return corsJson({
      ok: true,
      invoice_id: invoice.id,
      document_number: invoice.document_number,
      order_reference: pp.document_number,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("convert-proforma-to-invoice unhandled:", msg);
    return corsJson({ error: msg }, 500);
  }
});
