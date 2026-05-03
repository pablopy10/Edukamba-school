import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_DAY_MS } from "@/lib/queryClient";
import {
  fetchTeacherAlunosQuery,
  fetchTeacherTurmasQuery,
  teacherAlunosQueryKey,
  teacherTurmasQueryKey,
} from "@/lib/offline/teacherListQueries";
import {
  academicTermsQueryKey,
  fetchAcademicTerms,
  fetchTeacherGradesPack,
  teacherGradesQueryKey,
} from "@/lib/offline/teacherNotasQueries";
import {
  anchoredWideAttendancePrefetchRange,
  fetchPresencasAttendance,
  fetchPresencasStudents,
  presencasAttendanceQueryKey,
  presencasStudentsQueryKey,
  touchPresencasWideRangeAnchor,
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

  /** Alinha página Presenças / prefetch mesmo após dias sem rede (datas na queryKey estáveis pela sessão). */
  touchPresencasWideRangeAnchor();
  const { startDate, endDate } = anchoredWideAttendancePrefetchRange();

  await qc.prefetchQuery({
    queryKey: teacherAlunosQueryKey(userId, academicYearId, classroomIds),
    queryFn: () => fetchTeacherAlunosQuery({ academicYearId, classroomIds }),
    networkMode: "offlineFirst",
    staleTime: QUERY_DAY_MS * 24,
  });
  await qc.prefetchQuery({
    queryKey: teacherTurmasQueryKey(userId, academicYearId, classroomIds),
    queryFn: () => fetchTeacherTurmasQuery({ academicYearId, classroomIds }),
    networkMode: "offlineFirst",
    staleTime: QUERY_DAY_MS * 24,
  });

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
    staleTime: QUERY_DAY_MS * 24,
    networkMode: "offlineFirst",
  });

  const { data: teacherRow } = await supabase.from("teachers").select("subject_id").eq("profile_id", userId).maybeSingle();
  const subjectId = (teacherRow?.subject_id as string | null) ?? null;
  if (subjectId) {
    const termRows = await qc.fetchQuery({
      queryKey: academicTermsQueryKey(schoolId, academicYearId),
      queryFn: () => fetchAcademicTerms(schoolId, academicYearId),
      networkMode: "offlineFirst",
      staleTime: QUERY_DAY_MS * 24,
    });
    const gradeTasks: Promise<unknown>[] = [];
    for (const term of termRows) {
      for (const cid of classroomIds) {
        gradeTasks.push(
          qc.prefetchQuery({
            queryKey: teacherGradesQueryKey(schoolId, academicYearId, term.id, cid, subjectId),
            queryFn: () =>
              fetchTeacherGradesPack({
                schoolId,
                academicYearId,
                termId: term.id,
                classroomId: cid,
                subjectId,
              }),
            networkMode: "offlineFirst",
            staleTime: QUERY_DAY_MS * 24,
          }),
        );
      }
    }
    await Promise.all(gradeTasks);
  }

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
      networkMode: "offlineFirst",
      staleTime: QUERY_DAY_MS * 24,
    }),
  );
  tasks.push(
    qc.prefetchQuery({
      queryKey: presencasAttendanceQueryKey(baseAttendance("all")),
      queryFn: () => fetchPresencasAttendance(baseAttendance("all")),
      networkMode: "offlineFirst",
      staleTime: QUERY_DAY_MS * 24,
    }),
  );

  for (const cid of classroomIds) {
    tasks.push(
      qc.prefetchQuery({
        queryKey: presencasStudentsQueryKey(baseStudents(cid)),
        queryFn: () => fetchPresencasStudents(baseStudents(cid)),
        networkMode: "offlineFirst",
        staleTime: QUERY_DAY_MS * 24,
      }),
    );
    tasks.push(
      qc.prefetchQuery({
        queryKey: presencasAttendanceQueryKey(baseAttendance(cid)),
        queryFn: () => fetchPresencasAttendance(baseAttendance(cid)),
        networkMode: "offlineFirst",
        staleTime: QUERY_DAY_MS * 24,
      }),
    );
  }

  await Promise.all(tasks);
}
