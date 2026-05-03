import type { SupportedStorage } from "@supabase/supabase-js";
import { QUERY_CACHE_STORAGE_KEY } from "@/lib/queryPersister";
import { queryClient } from "@/lib/queryClient";

/** Memória SSR / fallback (sem persistência entre pedidos no servidor). */
const memoryBucket = new Map<string, string>();

function isLikelyQuotaError(e: unknown): boolean {
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    if (e.name === "QuotaExceededError") return true;
    const code = (e as DOMException).code;
    if (code === 22 || code === 1014) return true;
  }
  const msg =
    typeof e === "object" &&
    e !== null &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
      ? (e as Error).message
      : "";
  const m = msg.toLowerCase();
  return (
    msg.includes("QuotaExceeded") ||
    m.includes("quota") ||
    msg.includes("exceeded") ||
    m.includes("not enough space") ||
    m.includes("storage is disabled")
  );
}

function freeLocalStorageChunkForAuth(): void {
  try {
    window.localStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  /** Evita que o cliente volte logo a gravar no disco o mesmo volume após remover a chave. */
  queryClient.clear();
}

/**
 * Adaptador GoTrue compatível com `localStorage`, com recuperação quando a quota está cheia —
 * cenário típico com cache TanStack Query persistido volumoso (offline).
 */
export const authSessionStorage: SupportedStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return memoryBucket.get(key) ?? null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryBucket.get(key) ?? null;
    }
  },
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") {
      memoryBucket.set(key, value);
      return;
    }
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      if (isLikelyQuotaError(e)) {
        freeLocalStorageChunkForAuth();
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch {
          memoryBucket.set(key, value);
          return;
        }
      }
      try {
        memoryBucket.set(key, value);
      } catch {
        throw e;
      }
    }
  },
  removeItem(key: string): void {
    if (typeof window === "undefined") {
      memoryBucket.delete(key);
      return;
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    memoryBucket.delete(key);
  },
};
