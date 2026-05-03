import { supabase } from "@/integrations/supabase/client";

/** Turmas onde o professor tem horário + disciplina (`teachers.subject_id`). Mesma fonte que o prefetch do login — cache persistível. */
export type TeacherScheduleScope = {
  classroomIds: string[];
  subjectId: string | null;
};

export function teacherScheduleScopeQueryKey(teacherProfileId: string, academicYearId: string) {
  return ["teacherPrefetch", "scheduleScope", teacherProfileId, academicYearId] as const;
}

export async function fetchTeacherScheduleScope(
  teacherProfileId: string,
  academicYearId: string,
): Promise<TeacherScheduleScope> {
  const [{ data: teacherRow, error: tErr }, { data: schedData, error: sErr }] = await Promise.all([
    supabase.from("teachers").select("subject_id").eq("profile_id", teacherProfileId).maybeSingle(),
    supabase
      .from("schedules")
      .select("classroom_id")
      .eq("teacher_id", teacherProfileId)
      .eq("academic_year_id", academicYearId),
  ]);

  if (tErr) throw tErr;
  if (sErr) throw sErr;

  const subjectId = (teacherRow?.subject_id as string | null) ?? null;
  const classroomIds = Array.from(
    new Set(
      (schedData ?? [])
        .map((s: { classroom_id: string | null }) => s.classroom_id)
        .filter((id): id is string => !!id),
    ),
  );

  return { classroomIds, subjectId };
}
