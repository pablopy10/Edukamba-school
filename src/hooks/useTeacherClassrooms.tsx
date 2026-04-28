import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Returns the classroom IDs the current user teaches (via schedules.teacher_id),
 * the teacher's primary subject_id (from teachers row) and a `loading` flag.
 *
 * For non-teacher roles, `isTeacher` is false and consumers should bypass any filtering.
 */
export const useTeacherClassrooms = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
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
      const [schedRes, teacherRes] = await Promise.all([
        supabase
          .from("schedules")
          .select("classroom_id")
          .eq("teacher_id", user.id),
        supabase
          .from("teachers")
          .select("subject_id")
          .eq("profile_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const ids = Array.from(
        new Set(
          (schedRes.data ?? [])
            .map((s: any) => s.classroom_id as string | null)
            .filter((id): id is string => !!id),
        ),
      );
      setClassroomIds(ids);
      setSubjectId((teacherRes.data?.subject_id as string | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isTeacher, roleLoading]);

  return { isTeacher, classroomIds, subjectId, loading };
};
