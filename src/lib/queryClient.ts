import { QueryClient } from "@tanstack/react-query";

export const QUERY_HOUR_MS = 1000 * 60 * 60;
export const QUERY_DAY_MS = QUERY_HOUR_MS * 24;

/** Cliente TanStack Query único para a app (Horários, Perfil, Presenças persistidas, etc.). */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: QUERY_DAY_MS * 14,
        /** Cache persistido primeiro; evita ficar sem dados quando a UI nativa marca offline. */
        networkMode: "offlineFirst",
        refetchOnReconnect: true,
        refetchOnMount: true,
        refetchOnWindowFocus: true,
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        /**
         * Obriga a correr mutationFn/onMutate mesmo com navigator offline ou Capacitor em falha —
         * as páginas (Presenças, etc.) fazem enqueue na fila manualmente dentro do mutationFn.
         */
        networkMode: "always",
        gcTime: QUERY_DAY_MS * 14,
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

export const queryClient = createAppQueryClient();
