import { QueryClient } from "@tanstack/react-query";

const DAY_MS = 1000 * 60 * 60 * 24;

/** Cliente TanStack Query único para a app (Horários, Perfil, Presenças persistidas, etc.). */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DAY_MS * 24,
        gcTime: DAY_MS * 14,
        networkMode: "offlineFirst",
        refetchOnReconnect: true,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        networkMode: "offlineFirst",
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

export const queryClient = createAppQueryClient();
