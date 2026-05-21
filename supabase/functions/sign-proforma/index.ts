/**
 * Assina o plaintext de uma Fatura Pró-Forma (PP) com a chave RSA AGT
 * e devolve o hash SHA-1 (hex) + os 4 primeiros caracteres (hash_control).
 *
 * Usa a mesma chave AGT_RSA_PRIVATE_KEY_PEM das faturas fiscais.
 * Não persiste nada — apenas assina e devolve.
 */
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

  let body: { document_number?: string; issue_date?: string; total?: string } = {};
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "JSON inválido" }, 400);
  }

  const { document_number, issue_date, total } = body;
  if (!document_number || !issue_date || !total) {
    return corsJson({ error: "document_number, issue_date e total são obrigatórios" }, 400);
  }

  // Plaintext AGT: DataFatura;DataHoraCriacao;NumeroFatura;Total;HashAnterior
  // Para PP: hash anterior vazio (série independente)
  const issuedAtISO = new Date().toISOString();
  const plaintext = `${issue_date};${issuedAtISO};${document_number};${total};`;

  // SHA-1 do plaintext
  const document_hash = await sha1HexUtf8(plaintext);

  // Assinatura RSA-SHA1 PKCS#1 v1.5
  let signatureBase64 = "";
  try {
    const privateKey = forge.pki.privateKeyFromPem(pem);
    const md = forge.md.sha1.create();
    md.update(plaintext, "utf8");
    signatureBase64 = forge.util.encode64(privateKey.sign(md));
  } catch (e) {
    return corsJson({ error: `Erro ao assinar: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  // Hash control: primeiros 4 chars do hash SHA-1 (uppercase)
  const hash_control = document_hash.slice(0, 4).toUpperCase();

  return corsJson({
    document_hash,
    hash_control,
    signature_base64: signatureBase64,
    plaintext,
  });
});
