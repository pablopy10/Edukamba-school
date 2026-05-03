import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  defaultAttendancePrefetchRange,
  fetchPresencasAttendance,
  fetchPresencasStudents,
  presencasAttendanceQueryKey,
  presencasStudentsQueryKey,
  type PresencasAttendanceKeyInput,
  type PresencasStudentsKeyInput,
} from "@/lib/offline/presencasQueries";

export async function resolveDefaultAcademicYearId(schoolId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, is_active, start_date")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: true });

  if (error) throw error;
  const list = data ?? [];
  const active = list.find((y) => y.is_active);
  const stored =
    typeof localStorage !== "undefined" ? localStorage.getItem("selected_academic_year_id") : null;
  const initial =
    active?.id ?? (stored && list.some((y) => y.id === stored) ? stored : list[0]?.id ?? null);
  return initial;
}

/** Turmas e alunos do professor + presenças num intervalo alargado (cache offline). */
export async function prefetchTeacherData(
  qc: QueryClient,
  args: { userId: string; schoolId: string; academicYearId: string },
): Promise<void> {
  const { userId, schoolId, academicYearId } = args;

  const schedRes = await supabase
    .from("schedules")
    .select("classroom_id")
    .eq("teacher_id", userId)
    .eq("academic_year_id", academicYearId);

  const classroomIds = Array.from(
    new Set(
      (schedRes.data ?? [])
        .map((s: { classroom_id: string | null }) => s.classroom_id)
        .filter((id): id is string => !!id),
    ),
  );

  if (classroomIds.length === 0) return;

  const { data: rooms, error: roomsErr } = await supabase
    .from("classrooms")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .in("id", classroomIds)
    .order("name");

  if (roomsErr) throw roomsErr;

  await qc.prefetchQuery({
    queryKey: ["teacherPrefetch", "classrooms", schoolId, academicYearId, userId] as const,
    queryFn: async () => rooms ?? [],
  });

  const { startDate, endDate } = defaultAttendancePrefetchRange();

  const baseStudents = (classroomId: string): PresencasStudentsKeyInput => ({
    schoolId,
    classroomId,
    isTeacher: true,
    teacherClassroomIds: classroomIds,
    isParent: false,
    parentLoading: false,
    childIds: [],
    isStudent: false,
    studentLoading: false,
    studentId: null,
  });

  const baseAttendance = (classroomId: string): PresencasAttendanceKeyInput => ({
    schoolId,
    classroomId,
    isTeacher: true,
    teacherClassroomIds: classroomIds,
    startDate,
    endDate,
  });

  const tasks: Promise<unknown>[] = [];

  tasks.push(
    qc.prefetchQuery({
      queryKey: presencasStudentsQueryKey(baseStudents("all")),
      queryFn: () => fetchPresencasStudents(baseStudents("all")),
    }),
  );
  tasks.push(
    qc.prefetchQuery({
      queryKey: presencasAttendanceQueryKey(baseAttendance("all")),
      queryFn: () => fetchPresencasAttendance(baseAttendance("all")),
    }),
  );

  for (const cid of classroomIds) {
    tasks.push(
      qc.prefetchQuery({
        queryKey: presencasStudentsQueryKey(baseStudents(cid)),
        queryFn: () => fetchPresencasStudents(baseStudents(cid)),
      }),
    );
    tasks.push(
      qc.prefetchQuery({
        queryKey: presencasAttendanceQueryKey(baseAttendance(cid)),
        queryFn: () => fetchPresencasAttendance(baseAttendance(cid)),
      }),
    );
  }

  await Promise.all(tasks);
}
