import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queryClient } from "@/lib/queryClient";
import { prefetchTeacherData } from "@/lib/prefetchTeacherData";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";

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

    async function run() {
      if (cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id")
        .eq("id", user.id)
        .maybeSingle();

      const schoolIdPrefetch = effectiveSchoolIdFromProfile(data);
      if (cancelled || !schoolIdPrefetch) return;

      try {
        await prefetchTeacherData(queryClient, {
          userId: user.id,
          schoolId: schoolIdPrefetch,
          academicYearId: selectedYearId,
          profileRole: role,
        });
      } catch {
        /* prefetch best-effort */
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, role, roleLoading, selectedYearId]);

  return null;
}
