import { supabase } from "@/integrations/supabase/client";

export type PresencasStudentRow = {
  id: string;
  full_name: string;
  classroom_id: string | null;
  enrollment_number?: string | null;
};

export type PresencasAttendanceRow = {
  id: string;
  student_id: string;
  date: string;
  status: string;
  notes: string | null;
};

export type PresencasAttendanceMap = Record<string, PresencasAttendanceRow>;

const fmtISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Janela larga (~5 meses) para prefetch e trabalho offline fora da vista mensal atual. */
export function defaultAttendancePrefetchRange(reference = new Date()) {
  const pad = 2;
  const start = new Date(reference.getFullYear(), reference.getMonth() - pad, 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + pad + 1, 0);
  return { startDate: fmtISO(start), endDate: fmtISO(end) };
}

/** Mês de calendário completo `{startDate,endDate}` em formato ISO (`yyyy-mm-dd`). */
export function attendancePackMonth(reference: Date): { startDate: string; endDate: string } {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  return {
    startDate: fmtISO(new Date(y, m, 1)),
    endDate: fmtISO(new Date(y, m + 1, 0)),
  };
}

/**
 * Une **todos os meses de calendário** que intersectam algum dia da lista — ex.: semana Seg–Dom
 * pode cobrir dois meses; faz um só fetch desse período corrido para cache local.
 */
export function attendancePackRangeFromDates(days: readonly Date[]): { startDate: string; endDate: string } {
  if (!days.length) return attendancePackMonth(new Date());
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const day of days) {
    const t = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    minTs = Math.min(minTs, t);
    maxTs = Math.max(maxTs, t);
  }
  const lo = new Date(minTs);
  const hi = new Date(maxTs);
  const start = new Date(lo.getFullYear(), lo.getMonth(), 1);
  const end = new Date(hi.getFullYear(), hi.getMonth() + 1, 0);
  return { startDate: fmtISO(start), endDate: fmtISO(end) };
}

export type PresencasStudentsKeyInput = {
  schoolId: string;
  classroomId: string;
  isTeacher: boolean;
  teacherClassroomIds: string[];
  isParent: boolean;
  parentLoading: boolean;
  childIds: string[];
  isStudent: boolean;
  studentLoading: boolean;
  studentId: string | null;
};

export function presencasStudentsQueryKey(input: PresencasStudentsKeyInput) {
  const teacherKey =
    input.isTeacher && input.teacherClassroomIds.length > 0
      ? [...input.teacherClassroomIds].sort().join(",")
      : "_";
  const parentKey = input.isParent ? [...input.childIds].sort().join(",") : "_";
  return [
    "presencas",
    "students",
    input.schoolId,
    input.classroomId,
    teacherKey,
    parentKey,
    input.isParent,
    input.isTeacher,
    input.isStudent,
    input.studentId,
  ] as const;
}

export async function fetchPresencasStudents(input: PresencasStudentsKeyInput): Promise<PresencasStudentRow[]> {
  if (input.isParent && input.parentLoading) return [];
  if (input.isStudent && input.studentLoading) return [];
  if (input.isTeacher && input.teacherClassroomIds.length === 0) return [];

  let studentsQuery = supabase
    .from("students")
    .select("id, full_name, classroom_id, enrollment_number")
    .eq("school_id", input.schoolId)
    .order("full_name");

  if (input.classroomId !== "all") {
    studentsQuery = studentsQuery.eq("classroom_id", input.classroomId);
  } else if (input.isTeacher && input.teacherClassroomIds.length > 0) {
    studentsQuery = studentsQuery.in("classroom_id", input.teacherClassroomIds);
  }

  if (input.isParent) {
    if (input.childIds.length === 0) return [];
    studentsQuery = studentsQuery.in("id", input.childIds);
  }
  if (input.isStudent) {
    if (!input.studentId) return [];
    studentsQuery = studentsQuery.eq("id", input.studentId);
  }

  const { data, error } = await studentsQuery;
  if (error) throw error;
  return (data ?? []) as PresencasStudentRow[];
}

export type PresencasAttendanceKeyInput = {
  schoolId: string;
  classroomId: string;
  isTeacher: boolean;
  teacherClassroomIds: string[];
  startDate: string;
  endDate: string;
};

export function presencasAttendanceQueryKey(input: PresencasAttendanceKeyInput) {
  const teacherKey =
    input.isTeacher && input.teacherClassroomIds.length > 0
      ? [...input.teacherClassroomIds].sort().join(",")
      : "_";
  return [
    "presencas",
    "attendance",
    input.schoolId,
    input.classroomId,
    teacherKey,
    input.startDate,
    input.endDate,
  ] as const;
}

function rowsToAttendanceMap(rows: unknown[] | null): PresencasAttendanceMap {
  const map: PresencasAttendanceMap = {};
  (rows ?? []).forEach((row: any) => {
    map[`${row.student_id}__${row.date}`] = row as PresencasAttendanceRow;
  });
  return map;
}

export async function fetchPresencasAttendance(input: PresencasAttendanceKeyInput): Promise<PresencasAttendanceMap> {
  let q = supabase
    .from("attendance")
    .select("id, student_id, date, status, notes")
    .eq("school_id", input.schoolId)
    .gte("date", input.startDate)
    .lte("date", input.endDate);

  if (input.classroomId !== "all") {
    q = q.eq("classroom_id", input.classroomId);
  } else if (input.isTeacher && input.teacherClassroomIds.length > 0) {
    q = q.in("classroom_id", input.teacherClassroomIds);
  }

  const { data, error } = await q;
  if (error) throw error;
  return rowsToAttendanceMap(data ?? []);
}
