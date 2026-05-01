import { QueryClient, onlineManager } from "@tanstack/react-query";

/**
 * Cliente TanStack Query partilhado (offline-first, cache persistente na web/Capacitor).
 * Estado de rede: preferir sincronização com `@/hooks/useOfflineSync`/`onlineManager`
 * na app Capacitor (Network listener > navigator.onLine).
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 60 * 24,
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 1;
        },
        networkMode: "offlineFirst",
        refetchOnReconnect: true,
      },
      mutations: {
        networkMode: "offlineFirst",
        retry: (failureCount, _err) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

export const queryClient = createAppQueryClient();

/** Usado pelo SyncManager quando a rede Capacitor muda antes do browser. */
export function setTanStackOnline(online: boolean) {
  onlineManager.setOnline(online);
}
