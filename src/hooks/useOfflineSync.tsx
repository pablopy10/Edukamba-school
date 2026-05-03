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
import { onlineManager } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { loadPendingSync, savePendingSync, type PendingSyncEntry } from "@/lib/pendingSyncStorage";

/** Disparado quando pelo menos um pedido pendente foi sincronizado com sucesso. */
export const OFFLINE_SYNC_FLUSH_EVENT = "edukamba-offline-sync-flushed";

type OfflineSyncContextValue = {
  /** Ligado: rede disponível (Capacitor Network na app nativa; navigator na web). */
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  /** Enfileira um pedido REST PostgREST (URL completa, método, body JSON ou null). */
  enqueuePendingSync: (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => void;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

/** Combina estado explícito com `navigator.onLine` do WebView (em Android o plugin Capacitor por vezes fica atrás ou não dispara). */
function navigatorReportsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

async function refreshAuthForSync(): Promise<void> {
  if (!navigatorReportsOnline()) return;
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error) await supabase.auth.getSession();
  } catch {
    await supabase.auth.getSession();
  }
}

async function runFlushOnce(): Promise<number> {
  const queue = loadPendingSync();
  if (queue.length === 0) return 0;

  await refreshAuthForSync();

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
  return succeeded;
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const [pending, setPending] = useState<PendingSyncEntry[]>(() => loadPendingSync());
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  /** Última vez que um flush automático iniciou — evita tempestades em visibility + rede. */
  const lastFlushStartRef = useRef(0);

  const refreshPendingFromStorage = useCallback(() => {
    setPending(loadPendingSync());
  }, []);

  /** Estado explícito (Capacitor) OU `navigator.onLine` do WebView (Android pode divergir do plugin). */
  const syncWouldAllowAttempts = () => isOnlineRef.current || navigatorReportsOnline();

  /** Várias tentativas enquanto a fila diminui (ex.: primeiro POST liberta o seguinte PATCH). Um único evento + invalidate no fim. */
  const flushPending = useCallback(async () => {
    if (flushingRef.current) return;
    if (loadPendingSync().length === 0) return;

    if (!syncWouldAllowAttempts()) return;

    if (
      Capacitor.isNativePlatform() &&
      navigatorReportsOnline() &&
      !isOnlineRef.current
    ) {
      try {
        const s = await Network.getStatus();
        if (s.connected) {
          isOnlineRef.current = true;
          setIsOnline(true);
        }
      } catch {
        isOnlineRef.current = true;
        setIsOnline(true);
      }
    } else if (navigatorReportsOnline() && !isOnlineRef.current) {
      isOnlineRef.current = true;
      setIsOnline(true);
    }

    if (!syncWouldAllowAttempts()) return;

    flushingRef.current = true;
    setSyncing(true);
    try {
      let totalSucceeded = 0;
      while (syncWouldAllowAttempts() && loadPendingSync().length > 0) {
        const n = await runFlushOnce();
        refreshPendingFromStorage();
        totalSucceeded += n;
        if (n === 0) break;
      }
      refreshPendingFromStorage();
      if (totalSucceeded > 0) {
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_FLUSH_EVENT));
        onlineManager.setOnline(true);
        await queryClient.invalidateQueries();
      }
    } finally {
      flushingRef.current = false;
      setSyncing(false);
    }
  }, [refreshPendingFromStorage]);

  /** Rede: Capacitor + sempre eventos `online`/`offline` do WebView (crítico no Android nativo). */
  useEffect(() => {
    const up = () => {
      isOnlineRef.current = true;
      setIsOnline(true);
      onlineManager.setOnline(true);
    };
    const down = () => {
      isOnlineRef.current = false;
      setIsOnline(false);
      onlineManager.setOnline(false);
    };

    window.addEventListener("online", up);
    window.addEventListener("offline", down);

    let removed = false;
    let capRemove: { remove: () => Promise<void> } | undefined;

    if (Capacitor.isNativePlatform()) {
      void Network.getStatus().then((s) => {
        if (!removed) {
          const ok = s.connected || navigatorReportsOnline();
          isOnlineRef.current = ok;
          setIsOnline(ok);
          onlineManager.setOnline(ok);
        }
      });

      void Network.addListener("networkStatusChange", (status) => {
        const ok = status.connected || navigatorReportsOnline();
        isOnlineRef.current = ok;
        setIsOnline(ok);
        onlineManager.setOnline(ok);
      }).then((handle) => {
        capRemove = handle;
      });
    }

    return () => {
      removed = true;
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      void capRemove?.remove();
    };
  }, []);

  const flushPendingRef = useRef(flushPending);
  flushPendingRef.current = flushPending;

  useEffect(() => {
    if (!syncWouldAllowAttempts()) return;
    void flushPending();
  }, [isOnline, flushPending]);

  /** Ao voltar ao primeiro plano, re-checa rede (nativo) e tenta sincronizar se houver pendências. */
  useEffect(() => {
    const tryFlushOnForeground = async () => {
      if (document.visibilityState !== "visible") return;
      if (loadPendingSync().length === 0) return;
      const now = Date.now();
      if (now - lastFlushStartRef.current < 800) return;
      lastFlushStartRef.current = now;

      let connected = isOnlineRef.current;
      if (Capacitor.isNativePlatform()) {
        try {
          const status = await Network.getStatus();
          connected = status.connected || navigatorReportsOnline();
          isOnlineRef.current = connected;
          setIsOnline(connected);
        } catch {
          if (navigatorReportsOnline()) {
            isOnlineRef.current = true;
            setIsOnline(true);
            connected = true;
          }
        }
      }

      const allowFlush = connected || navigatorReportsOnline();
      if (!allowFlush) return;
      onlineManager.setOnline(allowFlush);
      await flushPendingRef.current();
    };

    document.addEventListener("visibilitychange", tryFlushOnForeground);
    void tryFlushOnForeground();
    return () => document.removeEventListener("visibilitychange", tryFlushOnForeground);
  }, []);

  /** TanStack só refaz pedidos quando `onlineManager` está alinhado (offlineFirst). */
  useEffect(() => {
    onlineManager.setOnline(isOnline || navigatorReportsOnline());
  }, [isOnline]);

  /** Arranque com fila em disco: tenta libertar assim que há rede (timing do WebView/session). */
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (loadPendingSync().length === 0) return;
      void flushPendingRef.current?.();
    }, 900);
    return () => window.clearTimeout(id);
  }, []);

  const enqueuePendingSync = useCallback(
    (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => {
      const next = [...loadPendingSync(), { ...entry, createdAt: Date.now() }].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      savePendingSync(next);
      setPending(next);
      if (isOnlineRef.current || navigatorReportsOnline()) {
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
