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

const OFFLINE_SYNC_MODE_KEY = "edukamba_offline_sync_mode";

/** Disparado quando pelo menos um pedido pendente foi sincronizado com sucesso. */
export const OFFLINE_SYNC_FLUSH_EVENT = "edukamba-offline-sync-flushed";

export type OfflineSyncMode = "auto" | "manual";

/** Resultado de `syncNow()` / flush da fila offline. */
export type OfflineFlushResult = {
  successCount: number;
  remainingPending: number;
  blocked?: "no_network" | "no_session" | "server_or_network";
  /** Último código HTTP quando `blocked === "server_or_network"`. */
  httpStatus?: number;
};

type OfflineSyncContextValue = {
  /** Ligado: rede disponível (Capacitor Network na app nativa; navigator na web). */
  isOnline: boolean;
  /** WebView/network percebidos como suficientes para tentar REST. */
  networkAvailableForSync: boolean;
  pendingCount: number;
  syncing: boolean;
  /** `auto`: fila despacha ao voltar rede · `manual`: apenas em «Sincronizar». */
  syncMode: OfflineSyncMode;
  setSyncMode: (mode: OfflineSyncMode) => void;
  /** Força processamento da fila (manual ou reforço). Devolve contagens úteis para feedback UI. */
  syncNow: () => Promise<OfflineFlushResult>;
  /** Enfileira um pedido REST PostgREST (URL completa, método, body JSON ou null). */
  enqueuePendingSync: (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => void;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

/** Combina estado explícito com `navigator.onLine` do WebView (em Android o plugin Capacitor por vezes fica atrás ou não dispara). */
function navigatorReportsOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

async function refreshAuthForSync(): Promise<void> {
  try {
    const { error } = await supabase.auth.refreshSession();
    if (error) await supabase.auth.getSession();
  } catch {
    await supabase.auth.getSession();
  }
}

type RunFlushOnceResult = {
  succeeded: number;
  stopReason?: "no_session" | "failed";
  failedHttpStatus?: number;
};

/** Processa a fila em disco: pelo menos uma entrada bem-sucedida por chamada até falha; re-tenta uma vez em 401/403 com token novo. */
async function runFlushOnce(): Promise<RunFlushOnceResult> {
  const queue = loadPendingSync();
  if (queue.length === 0) return { succeeded: 0 };

  await refreshAuthForSync();

  const remaining: PendingSyncEntry[] = [];
  let succeeded = 0;

  const loadAccessToken = async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  let accessToken = await loadAccessToken();
  if (!accessToken) {
    const { data } = await supabase.auth.refreshSession();
    accessToken = data.session?.access_token ?? null;
  }
  if (!accessToken) {
    return { succeeded: 0, stopReason: "no_session" };
  }

  const apikey = supabase.supabaseKey;

  outer: for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    let retriedAuth = false;

    for (;;) {
      const headers: Record<string, string> = {
        apikey,
        Authorization: `Bearer ${accessToken}`,
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

        if (res.ok) {
          succeeded++;
          continue outer;
        }

        if ((res.status === 401 || res.status === 403) && !retriedAuth) {
          retriedAuth = true;
          await supabase.auth.refreshSession();
          const next = await loadAccessToken();
          if (next) {
            accessToken = next;
            continue;
          }
        }

        remaining.push(...queue.slice(i));
        savePendingSync(remaining);
        return { succeeded, stopReason: "failed", failedHttpStatus: res.status };
      } catch {
        remaining.push(...queue.slice(i));
        savePendingSync(remaining);
        return { succeeded, stopReason: "failed" };
      }
    }
  }

  savePendingSync(remaining);
  return { succeeded };
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const [syncMode, setSyncModeState] = useState<OfflineSyncMode>(() => {
    if (typeof localStorage === "undefined") return "auto";
    const v = localStorage.getItem(OFFLINE_SYNC_MODE_KEY);
    return v === "manual" ? "manual" : "auto";
  });

  const [pending, setPending] = useState<PendingSyncEntry[]>(() => loadPendingSync());
  const [syncing, setSyncing] = useState(false);
  /** Uma só sincronização de cada vez — chamadas paralelas esperam pela mesma Promise. */
  const flushInFlightRef = useRef<Promise<OfflineFlushResult> | null>(null);

  /** Última vez que um flush automático iniciou — evita tempestades em visibility + rede. */
  const lastFlushStartRef = useRef(0);

  const refreshPendingFromStorage = useCallback(() => {
    setPending(loadPendingSync());
  }, []);

  /** Estado explícito (Capacitor) OU `navigator.onLine` do WebView (Android pode divergir do plugin). */
  const syncWouldAllowAttempts = () => isOnlineRef.current || navigatorReportsOnline();

  /** Várias tentativas enquanto a fila diminui (ex.: primeiro POST liberta o seguinte PATCH). Um único evento + invalidate no fim. */
  const flushPending = useCallback(async (): Promise<OfflineFlushResult> => {
    if (flushInFlightRef.current !== null) {
      return flushInFlightRef.current;
    }

    const execute = async (): Promise<OfflineFlushResult> => {
      const initialRemaining = loadPendingSync().length;
      if (initialRemaining === 0) {
        return { successCount: 0, remainingPending: 0 };
      }

      if (!syncWouldAllowAttempts()) {
        return {
          successCount: 0,
          remainingPending: initialRemaining,
          blocked: "no_network",
        };
      }

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

      if (!syncWouldAllowAttempts()) {
        return {
          successCount: 0,
          remainingPending: loadPendingSync().length,
          blocked: "no_network",
        };
      }

      setSyncing(true);
      let totalSucceeded = 0;
      let blocked: OfflineFlushResult["blocked"];
      let httpStatus: number | undefined;
      try {
        while (syncWouldAllowAttempts() && loadPendingSync().length > 0) {
          const batch = await runFlushOnce();
          totalSucceeded += batch.succeeded;
          refreshPendingFromStorage();
          if (batch.succeeded === 0) {
            if (batch.stopReason === "no_session") blocked = "no_session";
            else if (batch.stopReason === "failed") blocked = "server_or_network";
            httpStatus = batch.failedHttpStatus;
            break;
          }
        }
        refreshPendingFromStorage();
        if (totalSucceeded > 0) {
          window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_FLUSH_EVENT));
          onlineManager.setOnline(true);
          await queryClient.invalidateQueries();
        }
      } finally {
        setSyncing(false);
      }

      const remainingPending = loadPendingSync().length;
      return {
        successCount: totalSucceeded,
        remainingPending,
        blocked,
        httpStatus,
      };
    };

    const promise = execute().finally(() => {
      if (flushInFlightRef.current === promise) {
        flushInFlightRef.current = null;
      }
    });
    flushInFlightRef.current = promise;
    return promise;
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

  const setSyncMode = useCallback((mode: OfflineSyncMode) => {
    try {
      localStorage.setItem(OFFLINE_SYNC_MODE_KEY, mode);
    } catch {
      /* quota / private mode */
    }
    setSyncModeState(mode);
    if (mode === "auto") {
      queueMicrotask(() => void flushPendingRef.current());
    }
  }, []);

  const syncNow = useCallback(() => flushPending(), [flushPending]);

  useEffect(() => {
    if (syncMode !== "auto") return;
    if (!syncWouldAllowAttempts()) return;
    void flushPending();
  }, [isOnline, flushPending, syncMode]);

  /** Ao voltar ao primeiro plano, re-checa rede (nativo) e tenta sincronizar se houver pendências. */
  useEffect(() => {
    const tryFlushOnForeground = async () => {
      if (syncMode !== "auto") return;
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
  }, [syncMode]);

  /** TanStack só refaz pedidos quando `onlineManager` está alinhado (offlineFirst). */
  useEffect(() => {
    onlineManager.setOnline(isOnline || navigatorReportsOnline());
  }, [isOnline]);

  /** Arranque com fila em disco: tenta libertar assim que há rede (timing do WebView/session). */
  useEffect(() => {
    if (syncMode !== "auto") return undefined;
    const id = window.setTimeout(() => {
      if (loadPendingSync().length === 0) return;
      void flushPendingRef.current?.();
    }, 900);
    return () => window.clearTimeout(id);
  }, [syncMode]);

  const enqueuePendingSync = useCallback(
    (entry: Pick<PendingSyncEntry, "url" | "method" | "body">) => {
      const next = [...loadPendingSync(), { ...entry, createdAt: Date.now() }].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      savePendingSync(next);
      setPending(next);
      if (
        syncMode === "auto" &&
        (isOnlineRef.current || navigatorReportsOnline())
      ) {
        void flushPending();
      }
    },
    [flushPending, syncMode],
  );

  const value = useMemo(
    () => ({
      isOnline,
      networkAvailableForSync: isOnline || navigatorReportsOnline(),
      pendingCount: pending.length,
      syncing,
      syncMode,
      setSyncMode,
      syncNow,
      enqueuePendingSync,
    }),
    [
      isOnline,
      pending.length,
      syncing,
      syncMode,
      setSyncMode,
      syncNow,
      enqueuePendingSync,
    ],
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
