import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { QUERY_DAY_MS } from "@/lib/queryClient";
import {
  fetchTeacherSessionScopeFromProfile,
  teacherSessionScopeQueryKey,
} from "@/lib/offline/teacherSessionScope";

/**
 * Escola + ano + role persistidos com o prefetch de login (`teacherPrefetch.sessionScope`).
 * Permite Presenças / horários alinharem offline quando `profiles` e o ano letivo no contexto falham.
 */
export function useTeacherSessionScope() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  return useQuery({
    queryKey: teacherSessionScopeQueryKey(user?.id ?? "__none__"),
    queryFn: async () => {
      const r = await fetchTeacherSessionScopeFromProfile(user!.id);
      if (!r) throw new Error("Perfil do professor incompleto offline");
      return r;
    },
    enabled: Boolean(user?.id && !roleLoading && role === "TEACHER"),
    staleTime: QUERY_DAY_MS * 24,
    networkMode: "offlineFirst",
    gcTime: QUERY_DAY_MS * 14,
  });
}
