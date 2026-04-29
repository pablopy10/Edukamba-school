/** Chave em localStorage para pedidos à espera de rede (Presenças / Notas). */
export const PENDING_SYNC_STORAGE_KEY = "pending_sync";

export type PendingSyncEntry = {
  url: string;
  method: string;
  /** JSON serializado do body ou null (ex.: DELETE sem body). */
  body: string | null;
  createdAt: number;
};

export function loadPendingSync(): PendingSyncEntry[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingSyncEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export function savePendingSync(entries: PendingSyncEntry[]): void {
  localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(entries));
}
