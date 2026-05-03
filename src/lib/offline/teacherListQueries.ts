import { supabase } from "@/integrations/supabase/client";
import type { StudentRow } from "@/components/alunos/StudentFormDialog";
import type { ClassroomRow } from "@/components/turmas/ClassroomFormDialog";

type ClassroomOpt = { id: string; name: string };

/** Fingerprint estável das turmas do horário (ordenado) — evita cache errado se o horário mudar com o mesmo ano. */
function classroomScopeKey(classroomIds: readonly string[]): string {
  return [...classroomIds].sort().join("|");
}

/** Lista de alunos do professor (persistida para offline). */
export function teacherAlunosQueryKey(
  teacherId: string,
  academicYearId: string,
  classroomIds: readonly string[],
): readonly ["alunos", string, string, string] {
  return ["alunos", teacherId, academicYearId, classroomScopeKey(classroomIds)] as const;
}

export type TeacherAlunosQueryData = {
  students: StudentRow[];
  classrooms: ClassroomOpt[];
};

export async function fetchTeacherAlunosQuery(args: {
  academicYearId: string;
  classroomIds: string[];
}): Promise<TeacherAlunosQueryData> {
  const { academicYearId, classroomIds } = args;
  if (classroomIds.length === 0) {
    return { students: [], classrooms: [] };
  }

  const studentsQuery = supabase
    .from("students")
    .select(
      "id, full_name, email, phone, birth_date, gender, enrollment_number, classroom_id, avatar_color, school_id, classrooms(id, name)",
    )
    .order("created_at", { ascending: false })
    .in("classroom_id", classroomIds);

  const classroomsQuery = supabase
    .from("classrooms")
    .select("id, name")
    .eq("academic_year_id", academicYearId)
    .in("id", classroomIds)
    .order("name");

  const [{ data: sData, error: sErr }, { data: cData, error: cErr }] = await Promise.all([
    studentsQuery,
    classroomsQuery,
  ]);

  if (sErr) throw sErr;
  if (cErr) throw cErr;

  const classroomList = (cData ?? []) as ClassroomOpt[];
  return {
    students: (sData ?? []) as unknown as StudentRow[],
    classrooms: classroomList,
  };
}

export type TeacherTurmasClassroom = ClassroomRow & {
  courses?: { id: string; name: string } | null;
  academic_years?: { id: string; label: string } | null;
  studentCount: number;
};

export type TeacherTurmasQueryData = {
  classrooms: TeacherTurmasClassroom[];
  courses: { id: string; name: string }[];
  years: { id: string; label: string; is_active: boolean | null }[];
};

export function teacherTurmasQueryKey(
  teacherId: string,
  academicYearId: string,
  classroomIds: readonly string[],
): readonly ["turmas", string, string, string] {
  return ["turmas", teacherId, academicYearId, classroomScopeKey(classroomIds)] as const;
}

/** Turmas + contagens + listas auxiliares para filtros (persistido para offline). */
export async function fetchTeacherTurmasQuery(args: {
  academicYearId: string;
  classroomIds: string[];
}): Promise<TeacherTurmasQueryData> {
  const { academicYearId, classroomIds } = args;
  if (classroomIds.length === 0) {
    return { classrooms: [], courses: [], years: [] };
  }

  const classroomSelect = `id, name, grade_level, period, course_id, academic_year_id, school_id,
                 courses(id, name), academic_years(id, label)`;

  const [
    classroomsRes,
    { data: cs, error: coursesError },
    { data: ys, error: yearsError },
    { data: studentRows, error: studentsError },
  ] = await Promise.all([
    supabase
      .from("classrooms")
      .select(classroomSelect)
      .eq("academic_year_id", academicYearId)
      .in("id", classroomIds)
      .order("name", { ascending: true }),
    supabase.from("courses").select("id, name").order("name"),
    supabase.from("academic_years").select("id, label, is_active").order("start_date", { ascending: true }),
    supabase.from("students").select("id, classroom_id"),
  ]);

  const aggregateError =
    classroomsRes.error ?? coursesError ?? yearsError ?? studentsError;
  if (aggregateError) throw aggregateError;

  const list = classroomsRes.data ?? [];
  const studentCountByClass = new Map<string, number>();
  (studentRows ?? []).forEach((s) => {
    if (s.classroom_id) {
      studentCountByClass.set(s.classroom_id, (studentCountByClass.get(s.classroom_id) ?? 0) + 1);
    }
  });

  const classrooms = (list as Record<string, unknown>[]).map((c) => ({
    ...c,
    studentCount: studentCountByClass.get(c.id as string) ?? 0,
  })) as TeacherTurmasClassroom[];

  const courseIds = new Set(classrooms.map((row) => row.course_id).filter(Boolean) as string[]);
  const filteredCourses = (cs ?? []).filter((course) => courseIds.has(course.id));

  return {
    classrooms,
    courses: filteredCourses,
    years: ys ?? [],
  };
}
