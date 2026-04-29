import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadPendingSync, savePendingSync, type PendingSyncEntry } from "@/lib/pendingSyncStorage";

/** Disparado quando pelo menos um pedido pendente foi sincronizado com sucesso. */
export const OFFLINE_SYNC_FLUSH_EVENT = "edukamba-offline-sync-flushed";

type OfflineSyncContextValue = {
  /** Estado derivado de `navigator.onLine` + eventos window online/offline. */
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  /** Enfileira um pedido REST PostgREST (URL completa, método, body JSON ou null). */
  enqueuePendingSync: (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => void;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

async function runFlushOnce(): Promise<number> {
  const queue = loadPendingSync();
  if (queue.length === 0) return 0;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return 0;

  const apikey = supabase.supabaseKey;
  let succeeded = 0;

  const remaining: PendingSyncEntry[] = [];

  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    const headers: Record<string, string> = {
      apikey,
      Authorization: `Bearer ${session.access_token}`,
      Prefer: "return=minimal",
    };
    if (entry.method !== "DELETE") {
      headers["Content-Type"] = "application/json";
    }

    try {
      const res = await fetch(entry.url, {
        method: entry.method,
        headers,
        body: entry.method === "DELETE" ? undefined : entry.body ?? undefined,
      });
      if (!res.ok) {
        remaining.push(...queue.slice(i));
        break;
      }
      succeeded++;
    } catch {
      remaining.push(...queue.slice(i));
      break;
    }
  }

  savePendingSync(remaining);
  if (succeeded > 0) {
    window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_FLUSH_EVENT));
  }
  return succeeded;
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pending, setPending] = useState<PendingSyncEntry[]>(() => loadPendingSync());
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refreshPendingFromStorage = useCallback(() => {
    setPending(loadPendingSync());
  }, []);

  const flushPending = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (loadPendingSync().length === 0) return;

    flushingRef.current = true;
    setSyncing(true);
    try {
      await runFlushOnce();
      refreshPendingFromStorage();
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [refreshPendingFromStorage]);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void flushPending();
  }, [isOnline, flushPending]);

  const enqueuePendingSync = useCallback(
    (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => {
      const next = [...loadPendingSync(), { ...entry, createdAt: Date.now() }].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      savePendingSync(next);
      setPending(next);
      if (typeof navigator !== "undefined" && navigator.onLine) {
        void flushPending();
      }
    },
    [flushPending],
  );

  const value = useMemo(
    () => ({
      isOnline,
      pendingCount: pending.length,
      syncing,
      enqueuePendingSync,
    }),
    [isOnline, pending.length, syncing, enqueuePendingSync],
  );

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSync(): OfflineSyncContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  }
  return ctx;
}
