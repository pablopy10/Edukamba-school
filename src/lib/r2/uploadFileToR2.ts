import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { compressImageForUpload } from "@/lib/r2/compressImageForUpload";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Limite do upload via Edge Function (contorna CORS no Capacitor). */
const EDGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** PUT directo para R2 (presigned). */
const PRESIGN_PUT_TIMEOUT_MS = 180_000;

/**
 * POST para upload-to-r2: o telemóvel envia o ficheiro inteiro ao Supabase antes a função correr.
 * 2 min era pouco → EarlyDrop no log quando o cliente abortava (não é CORS).
 */
const EDGE_POST_TIMEOUT_MS = 600_000;

/** Resposta da Edge Function `get-r2-upload-url`. */
export type R2PresignResponse = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
};

type R2UploadResponse = {
  publicUrl: string;
  key: string;
};

export type UploadFileToR2Options = {
  file: File;
  /**
   * Pasta lógica no bucket (validada no servidor).
   * Ex.: avatars | documents | receipts | chat-attachments
   */
  prefix?: string;
  /** Progresso 0–100 (usa XHR). */
  onProgress?: (percent: number) => void;
};

export class R2UploadError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "R2UploadError";
  }
}

async function parseInvokeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* ignore */
    }
    return error.message;
  }
  if (error instanceof FunctionsFetchError) {
    return (
      "Não foi possível contactar o servidor de upload. Verifique a ligação e se as funções " +
      "get-r2-upload-url / upload-to-r2 estão publicadas no Supabase."
    );
  }
  if (error instanceof Error) return error.message;
  return "Erro desconhecido no upload";
}

async function requestPresignedUrl(file: File, prefix: string): Promise<R2PresignResponse> {
  const { data, error } = await supabase.functions.invoke<R2PresignResponse>("get-r2-upload-url", {
    body: {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      prefix,
    },
  });

  if (error) {
    throw new R2UploadError(await parseInvokeError(error));
  }

  if (!data?.uploadUrl || !data.publicUrl) {
    throw new R2UploadError(
      (data as { error?: string } | null)?.error ?? "Resposta inválida do servidor (presign)",
    );
  }

  return data;
}

function putFileWithXHR(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.timeout = PRESIGN_PUT_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(
        new R2UploadError(
          `Falha ao enviar para o armazenamento (${xhr.status}): ${xhr.responseText || xhr.statusText}`,
          xhr.status,
        ),
      );
    };

    xhr.onerror = () => {
      const hint = isNativeMobileApp()
        ? " Isto é CORS no bucket R2 — adicione https://localhost e capacitor://localhost em AllowedOrigins com PUT."
        : " Verifique a política CORS do bucket R2 (método PUT) para o domínio da app.";
      reject(new R2UploadError(`Falha de rede no envio directo para o armazenamento.${hint}`));
    };
    xhr.ontimeout = () =>
      reject(new R2UploadError("Upload directo expirou — rede lenta ou ficheiro demasiado grande."));
    xhr.onabort = () => reject(new R2UploadError("Upload cancelado"));

    xhr.send(file);
  });
}

async function uploadViaEdgeFunction(
  file: File,
  prefix: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new R2UploadError("Sessão expirada — inicie sessão novamente");
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new R2UploadError("Configuração Supabase em falta na app");
  }

  const url = `${SUPABASE_URL}/functions/v1/upload-to-r2`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = EDGE_POST_TIMEOUT_MS;
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", file.name);
    xhr.setRequestHeader("x-file-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-prefix", prefix);

    if (onProgress) {
      onProgress(0);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      };
    }

    xhr.onload = () => {
      let payload: R2UploadResponse & { error?: string };
      try {
        payload = JSON.parse(xhr.responseText) as R2UploadResponse & { error?: string };
      } catch {
        reject(new R2UploadError(`Resposta inválida do servidor (${xhr.status})`));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload.publicUrl) {
        onProgress?.(100);
        resolve(payload.publicUrl);
        return;
      }

      reject(
        new R2UploadError(
          payload.error ?? `Upload falhou (${xhr.status})`,
          xhr.status,
        ),
      );
    };

    xhr.onerror = () => {
      reject(
        new R2UploadError(
          "Não foi possível contactar o servidor de upload. Verifique a ligação e se a função upload-to-r2 está publicada.",
        ),
      );
    };
    xhr.ontimeout = () => {
      reject(
        new R2UploadError(
          "Upload cancelado por tempo esgotado (10 min). Use Wi‑Fi, uma foto mais pequena ou tente outra rede. " +
            "Isto não é CORS — o pedido chegou ao Supabase mas a ligação foi interrompida.",
        ),
      );
    };

    xhr.send(file);
  });
}

async function prepareFileForUpload(file: File): Promise<File> {
  if (!isNativeMobileApp() || !file.type.startsWith("image/")) return file;
  return compressImageForUpload(file);
}

async function uploadViaPresignedUrl(
  file: File,
  prefix: string,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { uploadUrl, publicUrl } = await requestPresignedUrl(file, prefix);
  await putFileWithXHR(uploadUrl, file, onProgress);
  return publicUrl;
}

/**
 * Upload seguro para Cloudflare R2.
 * - App nativa (Capacitor) ≤5 MB: via Edge Function (sem CORS no R2).
 * - Resto: presigned PUT directo; fallback para Edge se ≤5 MB e o PUT falhar.
 */
export async function uploadFileToR2(
  file: File,
  options?: Omit<UploadFileToR2Options, "file">,
): Promise<string> {
  const prefix = options?.prefix ?? "documents";
  const onProgress = options?.onProgress;
  const prepared = await prepareFileForUpload(file);

  if (prepared.size > EDGE_UPLOAD_MAX_BYTES && isNativeMobileApp()) {
    throw new R2UploadError(
      `Ficheiro demasiado grande (${(prepared.size / (1024 * 1024)).toFixed(1)} MB). Máximo 5 MB na app móvel.`,
    );
  }

  const canUseEdge = prepared.size <= EDGE_UPLOAD_MAX_BYTES;

  if (isNativeMobileApp() && canUseEdge) {
    try {
      return await uploadViaEdgeFunction(prepared, prefix, onProgress);
    } catch (edgeErr) {
      /* fallback presigned se edge falhar (ex.: função não deployada) */
      try {
        return await uploadViaPresignedUrl(prepared, prefix, onProgress);
      } catch {
        throw edgeErr;
      }
    }
  }

  try {
    return await uploadViaPresignedUrl(prepared, prefix, onProgress);
  } catch (presignErr) {
    if (canUseEdge) {
      try {
        return await uploadViaEdgeFunction(prepared, prefix, onProgress);
      } catch {
        /* mantém erro original */
      }
    }
    throw presignErr;
  }
}

/** Upload de Blob (ex.: PDF gerado no cliente). */
export async function uploadBlobToR2(
  blob: Blob,
  fileName: string,
  options?: Omit<UploadFileToR2Options, "file"> & { contentType?: string },
): Promise<string> {
  const type = options?.contentType ?? (blob.type || "application/octet-stream");
  const file = new File([blob], fileName, { type });
  return uploadFileToR2(file, options);
}
