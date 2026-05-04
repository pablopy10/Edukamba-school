import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_DAY_MS } from "@/lib/queryClient";
import {
  fetchTeacherScheduleScope,
  teacherScheduleScopeQueryKey,
} from "@/lib/offline/teacherScheduleScope";
import {
  fetchTeacherAlunosQuery,
  fetchTeacherTurmasQuery,
  teacherAlunosQueryKey,
  teacherTurmasQueryKey,
  teacherScheduleClassroomsFingerprint,
} from "@/lib/offline/teacherListQueries";
import {
  avaliacaoNotasPackQueryKey,
  fetchAvaliacaoNotasPack,
} from "@/lib/offline/avaliacaoNotasQueries";
import {
  fetchTeacherAvaliacoesPack,
  teacherAvaliacoesPackQueryKey,
  fetchTeacherSubjectDetail,
  teacherSubjectDetailQueryKey,
} from "@/lib/offline/teacherAvaliacoesQueries";
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
import { teacherSessionScopeQueryKey } from "@/lib/offline/teacherSessionScope";

export { resolveDefaultAcademicYearId } from "@/lib/offline/resolveDefaultAcademicYearId";

/** Turmas e alunos do professor + presenças num intervalo alargado (cache offline). */
export async function prefetchTeacherData(
  qc: QueryClient,
  args: { userId: string; schoolId: string; academicYearId: string; profileRole?: string | null },
): Promise<void> {
  const { userId, schoolId, academicYearId, profileRole } = args;

  await qc.prefetchQuery({
    queryKey: teacherSessionScopeQueryKey(userId),
    queryFn: () =>
      Promise.resolve({
        schoolId,
        academicYearId,
        role: profileRole ?? null,
      }),
    staleTime: QUERY_DAY_MS * 24,
    networkMode: "offlineFirst",
  });

  const scope = await fetchTeacherScheduleScope(userId, academicYearId);
  const { classroomIds, subjectId } = scope;

  await qc.prefetchQuery({
    queryKey: teacherScheduleScopeQueryKey(userId, academicYearId),
    queryFn: () => Promise.resolve(scope),
    staleTime: QUERY_DAY_MS * 24,
    networkMode: "offlineFirst",
  });

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

  const classroomFp = teacherScheduleClassroomsFingerprint(classroomIds);
  try {
    const avalData = await qc.fetchQuery({
      queryKey: teacherAvaliacoesPackQueryKey(userId, schoolId, academicYearId, classroomFp),
      queryFn: () => fetchTeacherAvaliacoesPack({ schoolId, academicYearId, classroomIds }),
      staleTime: QUERY_DAY_MS * 24,
      networkMode: "offlineFirst",
    });
    await Promise.all(
      (avalData.assessments ?? []).map((a) =>
        qc.prefetchQuery({
          queryKey: avaliacaoNotasPackQueryKey(a.id, "full"),
          queryFn: () =>
            fetchAvaliacaoNotasPack({
              assessmentId: a.id,
              visibleStudentId: null,
            }),
          staleTime: QUERY_DAY_MS * 24,
          networkMode: "offlineFirst",
        }),
      ),
    );
  } catch {
    /* best-effort: avaliações e alunos/notas por avaliação */
  }

  if (subjectId) {
    try {
      await qc.prefetchQuery({
        queryKey: teacherSubjectDetailQueryKey(schoolId, subjectId),
        queryFn: () => fetchTeacherSubjectDetail(schoolId, subjectId),
        staleTime: QUERY_DAY_MS * 24,
        networkMode: "offlineFirst",
      });
    } catch {
      /* best-effort nome da disciplina */
    }

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
