import { supabase } from "@/integrations/supabase/client";

/** Buckets Supabase Storage usados antes da migração para R2. */
export type LegacyStorageBucket =
  | "documents"
  | "chat-attachments"
  | "expense-receipts"
  | "school-logos"
  | "school-invoice-proofs"
  | "payment-proofs";

const SIGNED_URL_TTL_SEC = 3600;

/** Valor guardado na BD: URL público R2 ou path relativo no Supabase Storage. */
export function isPublicFileUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Devolve URL utilizável no browser: pass-through para R2/HTTP; signed URL para paths legados.
 */
export async function resolveFileUrl(
  urlOrPath: string,
  legacyBucket: LegacyStorageBucket,
): Promise<string> {
  const raw = urlOrPath?.trim();
  if (!raw) {
    throw new Error("Empty file reference");
  }
  if (isPublicFileUrl(raw)) {
    return raw;
  }

  const { data, error } = await supabase.storage
    .from(legacyBucket)
    .createSignedUrl(raw, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to resolve file URL");
  }
  return data.signedUrl;
}

/** Abre ficheiro num novo separador (R2 directo ou Supabase signed). */
export async function openFileUrl(
  urlOrPath: string,
  legacyBucket: LegacyStorageBucket,
): Promise<void> {
  const url = await resolveFileUrl(urlOrPath, legacyBucket);
  window.open(url, "_blank", "noopener,noreferrer");
}
