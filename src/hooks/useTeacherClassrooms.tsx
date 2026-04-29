import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAcademicYear } from "@/context/AcademicYearContext";

/**
 * Turmas em que o professor tem horário (`schedules`) para o ano letivo globalmente selecionado.
 * Inclui `subject_id` da linha `teachers`.
 *
 * Para não-professores, `isTeacher` é false e os consumidores devem ignorar os filtros.
 */
export const useTeacherClassrooms = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { selectedYearId } = useAcademicYear();
  const isTeacher = role === "TEACHER";

  const [classroomIds, setClassroomIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (roleLoading) return;
    if (!user || !isTeacher) {
      setClassroomIds([]);
      setSubjectId(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const teacherRes = await supabase
        .from("teachers")
        .select("subject_id")
        .eq("profile_id", user.id)
        .maybeSingle();

      const sid = (teacherRes.data?.subject_id as string | null) ?? null;

      if (!selectedYearId) {
        if (!cancelled) {
          setClassroomIds([]);
          setSubjectId(sid);
          setLoading(false);
        }
        return;
      }

      const schedRes = await supabase
        .from("schedules")
        .select("classroom_id")
        .eq("teacher_id", user.id)
        .eq("academic_year_id", selectedYearId);

      if (cancelled) return;
      const ids = Array.from(
        new Set(
          (schedRes.data ?? [])
            .map((s: { classroom_id: string | null }) => s.classroom_id)
            .filter((id): id is string => !!id),
        ),
      );
      setClassroomIds(ids);
      setSubjectId(sid);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isTeacher, roleLoading, selectedYearId]);

  return { isTeacher, classroomIds, subjectId, loading };
};
