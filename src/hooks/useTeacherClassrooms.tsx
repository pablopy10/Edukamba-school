import { useIsRestoring, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { QUERY_DAY_MS } from "@/lib/queryClient";
import {
  fetchTeacherScheduleScope,
  teacherScheduleScopeQueryKey,
} from "@/lib/offline/teacherScheduleScope";
import { useTeacherSessionScope } from "@/hooks/useTeacherSessionScope";

/**
 * Turmas onde o professor tem horário (`schedules`) para o ano letivo seleccionado + `subject_id` de `teachers`.
 * Mesma query persistida que o prefetch de login — em disco aparece antes da rede responder.
 */
export const useTeacherClassrooms = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { selectedYearId } = useAcademicYear();
  const persistRestoring = useIsRestoring();
  const isTeacher = role === "TEACHER";
  const { data: persistSessionScope } = useTeacherSessionScope();
  const academicYearForSchedule = selectedYearId ?? persistSessionScope?.academicYearId ?? null;

  const queryEnabled =
    !roleLoading && !!user?.id && isTeacher && !!academicYearForSchedule;

  const scopeQuery = useQuery({
    queryKey: teacherScheduleScopeQueryKey(user?.id ?? "__none__", academicYearForSchedule ?? "__none__"),
    queryFn: () => fetchTeacherScheduleScope(user!.id!, academicYearForSchedule!),
    enabled: queryEnabled,
    staleTime: QUERY_DAY_MS * 24,
    networkMode: "offlineFirst",
    gcTime: QUERY_DAY_MS * 14,
  });

  if (!user || roleLoading || !isTeacher) {
    return {
      isTeacher,
      classroomIds: [] as string[],
      subjectId: null as string | null,
      loading: false,
    };
  }

  const classroomIds = scopeQuery.data?.classroomIds ?? [];
  const subjectId = scopeQuery.data?.subjectId ?? null;

  /** Com cache persistente os dados aparecem no mesmo instante da hidratação; não ficar à espera só da rede. */
  const loading = queryEnabled && scopeQuery.isPending && !persistRestoring;

  return { isTeacher, classroomIds, subjectId, loading };
};
