import { supabase } from "@/integrations/supabase/client";

export type AcademicTermRow = {
  id: string;
  name: string;
  term_number: number;
  start_date: string;
  end_date: string;
};

export function academicTermsQueryKey(schoolId: string, academicYearId: string) {
  return ["notas", "terms", schoolId, academicYearId] as const;
}

export async function fetchAcademicTerms(
  schoolId: string,
  academicYearId: string,
): Promise<AcademicTermRow[]> {
  const { data, error } = await supabase
    .from("academic_terms")
    .select("id, name, term_number, start_date, end_date")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .order("term_number");

  if (error) throw error;
  return (data ?? []) as AcademicTermRow[];
}

export type TeacherGradeRowRaw = {
  id: string;
  score: number;
  teacher_comment: string | null;
  student_id: string | null;
  assessments:
    | {
        id: string;
        title: string;
        date: string;
        classroom_id: string | null;
        subject_id: string | null;
        term_id: string | null;
        academic_year_id: string | null;
        subjects: { name: string | null } | null;
        classrooms: { name: string | null } | null;
      }
    | Array<{
        id: string;
        title: string;
        date: string;
        classroom_id: string | null;
        subject_id: string | null;
        term_id: string | null;
        academic_year_id: string | null;
        subjects: { name: string | null } | null;
        classrooms: { name: string | null } | null;
      }>;
  students: { full_name: string | null; classroom_id: string | null } | null;
};

export function teacherGradesQueryKey(
  schoolId: string,
  academicYearId: string,
  termId: string,
  classroomId: string,
  subjectId: string,
) {
  return ["notas", "grades", "teacher", schoolId, academicYearId, termId, classroomId, subjectId] as const;
}

export async function fetchTeacherGradesPack(args: {
  schoolId: string;
  academicYearId: string;
  termId: string;
  classroomId: string;
  subjectId: string;
}): Promise<TeacherGradeRowRaw[]> {
  const q = supabase
    .from("grades")
    .select(
      `
        id,
        score,
        teacher_comment,
        student_id,
        assessments!inner (
          id,
          title,
          date,
          classroom_id,
          subject_id,
          term_id,
          academic_year_id,
          subjects (name),
          classrooms (name)
        ),
        students (full_name, classroom_id)
      `,
    )
    .eq("assessments.academic_year_id", args.academicYearId)
    .eq("assessments.school_id", args.schoolId)
    .eq("assessments.term_id", args.termId)
    .eq("assessments.classroom_id", args.classroomId)
    .eq("assessments.subject_id", args.subjectId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TeacherGradeRowRaw[];
}
