import { useQuery, useIsRestoring } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * For users with the STUDENT role, returns the student record linked to their
 * auth user (via students.user_id) plus derived info needed to scope filters
 * across the app: their classroom, subjects taught in that classroom, teachers
 * who teach that classroom, and the dominant shift of those schedules.
 *
 * For non-students, `isStudent` is false and consumers should bypass scoping.
 */
export type StudentShift = "MORNING" | "AFTERNOON" | "EVENING";

type StudentSelfData = {
  studentId: string | null;
  classroomId: string | null;
  classroomName: string | null;
  subjectIds: string[];
  teacherIds: string[];
  shift: StudentShift | null;
};

async function fetchStudentSelf(userId: string): Promise<StudentSelfData> {
  const { data: stu } = await supabase
    .from("students")
    .select("id, classroom_id, classrooms:classroom_id(name)")
    .eq("user_id", userId)
    .maybeSingle();

  const sid = (stu as any)?.id ?? null;
  const cid = (stu as any)?.classroom_id ?? null;
  const cname = (stu as any)?.classrooms?.name ?? null;

  if (!cid) {
    return {
      studentId: sid,
      classroomId: null,
      classroomName: cname,
      subjectIds: [],
      teacherIds: [],
      shift: null,
    };
  }

  const { data: schs } = await supabase
    .from("schedules")
    .select("subject_id, teacher_id, shift")
    .eq("classroom_id", cid);

  const subj = new Set<string>();
  const teach = new Set<string>();
  const shiftCounts: Record<string, number> = {};
  (schs ?? []).forEach((s: any) => {
    if (s.subject_id) subj.add(s.subject_id);
    if (s.teacher_id) teach.add(s.teacher_id);
    if (s.shift) shiftCounts[s.shift] = (shiftCounts[s.shift] ?? 0) + 1;
  });
  const dominantShift = Object.entries(shiftCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    studentId: sid,
    classroomId: cid,
    classroomName: cname,
    subjectIds: Array.from(subj),
    teacherIds: Array.from(teach),
    shift: (dominantShift as StudentShift | null) ?? null,
  };
}

export const useStudentSelf = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const isStudent = role === "STUDENT";
  const persistRestoring = useIsRestoring();

  const q = useQuery({
    queryKey: ["student-self", user?.id],
    enabled: !!user?.id && isStudent && !roleLoading,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    networkMode: "offlineFirst",
    placeholderData: (previousData) => previousData,
    queryFn: () => fetchStudentSelf(user!.id),
  });

  const data = q.data;

  const loading =
    roleLoading ||
    (!!user?.id &&
      isStudent &&
      !roleLoading &&
      !data &&
      !persistRestoring &&
      (q.isPending || q.isLoading));

  if (!isStudent) {
    return {
      isStudent: false as const,
      studentId: null,
      classroomId: null,
      classroomName: null,
      subjectIds: [] as string[],
      teacherIds: [] as string[],
      shift: null as StudentShift | null,
      loading: false,
    };
  }

  return {
    isStudent: true as const,
    studentId: data?.studentId ?? null,
    classroomId: data?.classroomId ?? null,
    classroomName: data?.classroomName ?? null,
    subjectIds: data?.subjectIds ?? [],
    teacherIds: data?.teacherIds ?? [],
    shift: data?.shift ?? null,
    loading,
  };
};
