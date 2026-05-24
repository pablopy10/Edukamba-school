/**
 * Re-assina todas as faturas de uma série, recalculando a cadeia de hash.
 * Uso: POST com body { school_id, series? }
 * Requer: AGT_RSA_PRIVATE_KEY_PEM nas secrets.
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
    const der = forge.util.decode64(
      pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    );
    const asn1 = forge.asn1.fromDer(der);
    privateKey = forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
  }
  const md = forge.md.sha1.create();
  md.update(plaintext, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

function formatTotalForSigning(amount: number): string {
  return (Math.round((amount + Number.EPSILON) * 100) / 100).toFixed(2);
}

/**
 * Formata data/hora para a string de assinatura AGT: YYYY-MM-DDTHH:MM:SS
 * Sem milissegundos, sem sufixo Z.
 */
function formatIssuedAtForSigning(isoOrTimestamp: string, dateFallback: string): string {
  if (isoOrTimestamp?.trim()) {
    const d = new Date(isoOrTimestamp.trim());
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }
  }
  return `${dateFallback.slice(0, 10)}T12:00:00`;
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
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is authenticated
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return corsJson({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    let body: { school_id?: string; series?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const schoolId = body.school_id?.trim();
    if (!schoolId) return corsJson({ error: "school_id é obrigatório" }, 400);

    // Load all invoices for this school, ordered by series + doc_number
    let query = admin
      .from("invoices")
      .select("id, series, doc_number, document_number, invoice_date, invoice_issued_at, gross_total, document_hash, agt_signing_plaintext, digital_signature_sha1_b64, previous_document_hash")
      .eq("school_id", schoolId)
      .order("doc_number", { ascending: true });

    if (body.series?.trim()) {
      query = query.eq("series", body.series.trim());
    }

    const { data: invoices, error: loadErr } = await query;
    if (loadErr) return corsJson({ error: loadErr.message }, 500);
    if (!invoices || invoices.length === 0) return corsJson({ ok: true, message: "Nenhuma fatura encontrada.", updated: 0 });

    // Group by series
    const bySeries = new Map<string, typeof invoices>();
    for (const inv of invoices) {
      const s = inv.series || "EDK";
      if (!bySeries.has(s)) bySeries.set(s, []);
      bySeries.get(s)!.push(inv);
    }

    let totalUpdated = 0;
    const errors: string[] = [];

    for (const [series, seriesInvoices] of bySeries) {
      // Sort by doc_number ascending
      seriesInvoices.sort((a, b) => (a.doc_number || 0) - (b.doc_number || 0));

      let previousSignatureBase64 = "";

      for (const inv of seriesInvoices) {
        try {
          const invoiceDateYYYYMMDD = String(inv.invoice_date ?? "").slice(0, 10);
          const issuedAtISO = formatIssuedAtForSigning(inv.invoice_issued_at, invoiceDateYYYYMMDD);
          const documentNumberFull = inv.document_number?.trim() || `FT ${series}/${inv.doc_number}`;
          const totalAmountString = formatTotalForSigning(Number(inv.gross_total) || 0);

          // AGT: o último campo da string de assinatura é a assinatura Base64 do documento anterior
          // (vazio para o primeiro documento da série)
          const plaintext = `${invoiceDateYYYYMMDD};${issuedAtISO};${documentNumberFull};${totalAmountString};${previousSignatureBase64}`;
          const document_hash = await sha1HexUtf8(plaintext);
          const signatureBase64 = signPlaintextRSA_SHA1(plaintext, pem);

          // Update in DB
          const { error: updErr } = await admin
            .from("invoices")
            .update({
              agt_signing_plaintext: plaintext,
              document_hash,
              digital_signature_sha1_b64: signatureBase64,
              previous_document_hash: previousSignatureBase64 || null,
            })
            .eq("id", inv.id);

          if (updErr) {
            errors.push(`${documentNumberFull}: ${updErr.message}`);
          } else {
            totalUpdated++;
          }

          // Chain: next invoice uses THIS document's Base64 signature
          previousSignatureBase64 = signatureBase64;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${inv.document_number}: ${msg}`);
          // If we fail, try to use existing signature for chaining continuity
          previousSignatureBase64 = inv.digital_signature_sha1_b64 || previousSignatureBase64;
        }
      }
    }

    return corsJson({
      ok: true,
      updated: totalUpdated,
      total: invoices.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("resign-invoices error:", msg);
    return corsJson({ error: msg }, 500);
  }
});
