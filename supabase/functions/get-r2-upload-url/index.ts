/**
 * Gera Presigned URL (PUT) para upload directo do browser/app → Cloudflare R2.
 * Credenciais R2 ficam apenas nos secrets da Edge Function (nunca no React).
 *
 * Secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ACCESS_KEY_ID, CLOUDFLARE_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_BASE_URL
 *
 * Body JSON: { fileName: string, fileType: string, prefix?: string }
 * Response:   { uploadUrl, publicUrl, key, expiresIn }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.700.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.700.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRESIGN_EXPIRES_SEC = 300; // 5 minutos

/** Pastas permitidas no bucket (evita paths arbitrários). */
const ALLOWED_PREFIXES = new Set([
  "avatars",
  "documents",
  "receipts",
  "expense-receipts",
  "payment-proofs",
  "school-logos",
  "chat-attachments",
  "invoice-proofs",
  "school-invoice-proofs",
  "exports",
]);

/** Prefixos permitidos antes de existir escola no perfil (ex.: onboarding). */
const PREFIXES_WITHOUT_SCHOOL = new Set(["school-logos"]);

interface PresignRequest {
  fileName?: string;
  fileType?: string;
  prefix?: string;
}

function corsJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "file";
}

function extensionFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  };
  return map[mime] ?? null;
}

function buildObjectKey(opts: {
  prefix: string;
  schoolId: string;
  userId: string;
  fileName: string;
  fileType: string;
}): string {
  const safeName = sanitizeFileName(opts.fileName);
  const extFromName = safeName.includes(".") ? safeName.split(".").pop() : null;
  const extFromMime = extensionFromMime(opts.fileType);
  const ext = (extFromName ?? extFromMime ?? "bin").toLowerCase();
  const stem = safeName.replace(/\.[^.]+$/, "") || "file";
  const id = crypto.randomUUID();
  return `${opts.prefix}/${opts.schoolId}/${opts.userId}/${id}-${stem}.${ext}`;
}

function publicUrlForKey(publicBase: string, key: string): string {
  const base = publicBase.replace(/\/+$/, "");
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encoded}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return corsJson({ error: "Method not allowed" }, 405);
  }

  try {
    const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("CLOUDFLARE_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("CLOUDFLARE_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("R2_BUCKET_NAME");
    const publicBase = Deno.env.get("R2_PUBLIC_BASE_URL");

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
      console.error("get-r2-upload-url: missing R2 env secrets");
      return corsJson({ error: "R2 storage not configured on server" }, 500);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return corsJson({ error: "Missing authorization" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return corsJson({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("school_id, is_active")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profErr) {
      return corsJson({ error: "Invalid profile" }, 403);
    }

    const body = (await req.json()) as PresignRequest;
    const prefixEarly = (body.prefix?.trim() || "documents").replace(/^\/+|\/+$/g, "");

    const schoolId =
      profile?.school_id ??
      (PREFIXES_WITHOUT_SCHOOL.has(prefixEarly) ? "onboarding" : null);

    if (!schoolId) {
      return corsJson({ error: "School required for this upload" }, 403);
    }
    if (profile?.is_active === false) {
      return corsJson({ error: "Account inactive" }, 403);
    }

    const fileName = body.fileName?.trim();
    const fileType = body.fileType?.trim() || "application/octet-stream";
    const prefix = prefixEarly;

    if (!fileName) {
      return corsJson({ error: "fileName is required" }, 400);
    }
    if (!ALLOWED_PREFIXES.has(prefix)) {
      return corsJson({ error: `prefix not allowed. Use one of: ${[...ALLOWED_PREFIXES].join(", ")}` }, 400);
    }
    if (fileType.length > 127) {
      return corsJson({ error: "fileType too long" }, 400);
    }

    const key = buildObjectKey({
      prefix,
      schoolId,
      userId: userData.user.id,
      fileName,
      fileType,
    });

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

    const s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: PRESIGN_EXPIRES_SEC });
    const publicUrl = publicUrlForKey(publicBase, key);

    return corsJson({
      uploadUrl,
      publicUrl,
      key,
      expiresIn: PRESIGN_EXPIRES_SEC,
    });
  } catch (e) {
    console.error("get-r2-upload-url:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return corsJson({ error: msg }, 500);
  }
});
