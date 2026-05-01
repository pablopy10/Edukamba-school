import { useQuery } from "@tanstack/react-query";
import { fetchHorariosDataset, type HorariosDataset, type HorariosFetchScope } from "@/lib/api/fetchHorariosDataset";
import { qk } from "./keys";

function scopeFingerprint(s: HorariosFetchScope): string {
  return [
    s.isParent ? "p" : "",
    s.isTeacher ? "t" : "",
    s.isStudent ? "s" : "",
    s.parentClassroomIds.slice().sort().join(","),
    s.teacherClassroomIds.slice().sort().join(","),
    s.studentClassroomId ?? "",
    s.studentSubjectIds.slice().sort().join(","),
    s.studentTeacherIds.slice().sort().join(","),
  ].join("|");
}

export function useHorariosDatasetQuery(args: {
  schoolId: string | null;
  academicYearId: string | null;
  scope: HorariosFetchScope;
  parentLoading: boolean;
  teacherLoading: boolean;
  studentLoading: boolean;
}) {
  const { schoolId, academicYearId, scope, parentLoading, teacherLoading, studentLoading } = args;

  const scopeKey = scopeFingerprint(scope);

  const enabled =
    !!schoolId &&
    !parentLoading &&
    !(scope.isTeacher && teacherLoading) &&
    !(scope.isStudent && studentLoading);

  return useQuery({
    queryKey: qk.horariosDataset([scopeKey], schoolId, academicYearId),
    queryFn: () => fetchHorariosDataset(schoolId!, academicYearId, scope),
    enabled,
    staleTime: 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    networkMode: "offlineFirst",
  });
}
