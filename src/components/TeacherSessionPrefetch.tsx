import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { prefetchTeacherData } from "@/lib/prefetchTeacherData";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Sessão restaurada ou ano letivo mudou: repõe cache persistido (`alunos`, `turmas`, presenças)
 * sem depender apenas do ecrã de login (app nativa / refresh).
 *
 * Se `teacherId`/ano/`school_id` faltarem, o prefetch não corre (evita queryKey incompleta).
 */
export function TeacherSessionPrefetch() {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { selectedYearId } = useAcademicYear();

  useEffect(() => {
    if (roleLoading || !user?.id || role !== "TEACHER" || !selectedYearId) return;
    let cancelled = false;

    /** Evita saturar CPU/rede antes do primeiro frame e do restore do TanStack Persist. */
    const schedulePrefetch = (): (() => void) => {
      if (typeof requestIdleCallback !== "undefined") {
        const id = requestIdleCallback(
          () => {
            void run();
          },
          { timeout: 2800 },
        );
        return () => cancelIdleCallback(id);
      }
      const t = window.setTimeout(() => void run(), 120);
      return () => clearTimeout(t);
    };

    async function run() {
      if (cancelled) return;
      const { data } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();

      if (cancelled || !data?.school_id) return;

      try {
        await prefetchTeacherData(queryClient, {
          userId: user.id,
          schoolId: data.school_id,
          academicYearId: selectedYearId,
        });
      } catch {
        /* prefetch best-effort */
      }
    }

    const cancelSchedule = schedulePrefetch();
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [user?.id, role, roleLoading, selectedYearId]);

  return null;
}
