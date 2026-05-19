import { supabase } from "@/integrations/supabase/client";

/** Resposta da Edge Function `get-r2-upload-url`. */
export type R2PresignResponse = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
};

export type UploadFileToR2Options = {
  file: File;
  /**
   * Pasta lógica no bucket (validada no servidor).
   * Ex.: avatars | documents | receipts | chat-attachments
   */
  prefix?: string;
  /** Progresso 0–100 (usa XHR; omitir para fetch simples). */
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

async function requestPresignedUrl(file: File, prefix: string): Promise<R2PresignResponse> {
  const { data, error } = await supabase.functions.invoke<R2PresignResponse>("get-r2-upload-url", {
    body: {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      prefix,
    },
  });

  if (error) {
    throw new R2UploadError(error.message ?? "Failed to obtain upload URL");
  }

  if (!data?.uploadUrl || !data.publicUrl) {
    throw new R2UploadError(
      (data as { error?: string } | null)?.error ?? "Invalid presign response from server",
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
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
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
          `R2 upload failed (${xhr.status}): ${xhr.responseText || xhr.statusText}`,
          xhr.status,
        ),
      );
    };

    xhr.onerror = () => reject(new R2UploadError("Network error during R2 upload"));
    xhr.onabort = () => reject(new R2UploadError("R2 upload aborted"));

    xhr.send(file);
  });
}

async function putFileWithFetch(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new R2UploadError(
      `R2 upload failed (${res.status}): ${text || res.statusText}`,
      res.status,
    );
  }
}

/**
 * Upload seguro para Cloudflare R2 via Presigned URL.
 * 1) Pede URL assinado à Edge Function (credenciais só no servidor).
 * 2) PUT binário directo para o R2.
 * 3) Devolve o URL público a guardar na base de dados (Supabase).
 */
export async function uploadFileToR2(
  file: File,
  options?: Omit<UploadFileToR2Options, "file">,
): Promise<string> {
  const prefix = options?.prefix ?? "documents";
  const { uploadUrl, publicUrl } = await requestPresignedUrl(file, prefix);

  if (options?.onProgress) {
    await putFileWithXHR(uploadUrl, file, options.onProgress);
  } else {
    await putFileWithFetch(uploadUrl, file);
  }

  return publicUrl;
}

/** Upload de Blob (ex.: PDF gerado no cliente) via presigned PUT. */
export async function uploadBlobToR2(
  blob: Blob,
  fileName: string,
  options?: Omit<UploadFileToR2Options, "file"> & { contentType?: string },
): Promise<string> {
  const type = options?.contentType ?? (blob.type || "application/octet-stream");
  const file = new File([blob], fileName, { type });
  return uploadFileToR2(file, options);
}
