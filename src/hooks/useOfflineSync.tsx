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
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { supabase } from "@/integrations/supabase/client";
import { loadPendingSync, savePendingSync, type PendingSyncEntry } from "@/lib/pendingSyncStorage";
import { setTanStackOnline } from "@/lib/queryClient";

/** Disparado quando pelo menos um pedido pendente foi sincronizado com sucesso. */
export const OFFLINE_SYNC_FLUSH_EVENT = "edukamba-offline-sync-flushed";

/** Estados agregados para UI (principalmente indicador Capacitor). */
export type SyncUiState = "synced" | "pending_upload" | "offline";

export type SyncManagerContextValue = {
  /** Ligado: rede disponível (Capacitor Network na app nativa; navigator na web). */
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  /** Resumo alto nível para o indicador visual. */
  syncUiState: SyncUiState;
  /** Enfileira um pedido REST PostgREST (URL completa, método, body JSON ou null). */
  enqueuePendingSync: (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => void;
  /** Força reprocessamento da fila (quando online). */
  flushSyncQueue: () => Promise<void>;
};

const OfflineSyncContext = createContext<SyncManagerContextValue | null>(null);

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

/** Deve ficar dentro de `PersistQueryClientProvider` para aceder ao QueryClient. */
function SyncManagerCore({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const [pending, setPending] = useState<PendingSyncEntry[]>(() => loadPendingSync());
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refreshPendingFromStorage = useCallback(() => {
    setPending(loadPendingSync());
  }, []);

  const invalidateAfterFlush = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const flushPending = useCallback(async () => {
    if (flushingRef.current) return;
    if (!isOnlineRef.current) return;
    if (loadPendingSync().length === 0) return;

    flushingRef.current = true;
    setSyncing(true);
    try {
      const n = await runFlushOnce();
      refreshPendingFromStorage();
      if (n > 0) {
        invalidateAfterFlush();
      }
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [refreshPendingFromStorage, invalidateAfterFlush]);

  /** Rede: Capacitor na shell nativa (mais fiável); sincroniza TanStack onlineManager + navigator. */
  useEffect(() => {
    const applyBrowser = () => {
      const on = navigator.onLine;
      setTanStackOnline(on);
      setIsOnline(on);
    };

    if (Capacitor.isNativePlatform()) {
      let removed = false;
      let listener: { remove: () => Promise<void> } | undefined;

      void Network.getStatus().then((s) => {
        if (removed) return;
        const on = !!s.connected;
        setTanStackOnline(on);
        setIsOnline(on);
      });

      void Network.addListener("networkStatusChange", (status) => {
        const on = !!status.connected;
        setTanStackOnline(on);
        setIsOnline(on);
      }).then((handle) => {
        listener = handle;
      });

      return () => {
        removed = true;
        void listener?.remove();
      };
    }

    applyBrowser();
    window.addEventListener("online", applyBrowser);
    window.addEventListener("offline", applyBrowser);
    return () => {
      window.removeEventListener("online", applyBrowser);
      window.removeEventListener("offline", applyBrowser);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void flushPending();
  }, [isOnline, flushPending]);

  /** Outros separadores atualizaram o localStorage (ex.: outro separador ou extensões). */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "pending_sync") {
        refreshPendingFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshPendingFromStorage]);

  const enqueuePendingSync = useCallback(
    (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => {
      const next = [...loadPendingSync(), { ...entry, createdAt: Date.now() }].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      savePendingSync(next);
      setPending(next);
      if (isOnlineRef.current) {
        void flushPending();
      }
    },
    [flushPending],
  );

  const syncUiState: SyncUiState = useMemo(() => {
    if (!isOnline) return "offline";
    if (pending.length > 0) return "pending_upload";
    return "synced";
  }, [isOnline, pending.length]);

  const value = useMemo(
    (): SyncManagerContextValue => ({
      isOnline,
      pendingCount: pending.length,
      syncing,
      syncUiState,
      enqueuePendingSync,
      flushSyncQueue: flushPending,
    }),
    [isOnline, pending.length, syncing, syncUiState, enqueuePendingSync, flushPending],
  );

  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  return <SyncManagerCore>{children}</SyncManagerCore>;
}

export function useOfflineSync(): SyncManagerContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  }
  return ctx;
}

/** Alias explícito para arquitectura offline-first / SyncManager. */
export function useSyncManager(): SyncManagerContextValue {
  return useOfflineSync();
}
