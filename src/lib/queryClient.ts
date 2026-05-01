import { QueryClient } from "@tanstack/react-query";

/** Cliente TanStack Query único para a app (Horários, Perfil, Pagamentos, etc.). */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: (failureCount) => {
          if (typeof navigator !== "undefined" && !navigator.onLine) return false;
          return failureCount < 1;
        },
      },
    },
  });
}

export const queryClient = createAppQueryClient();
