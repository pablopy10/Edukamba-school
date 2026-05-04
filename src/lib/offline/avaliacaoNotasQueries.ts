import { supabase } from "@/integrations/supabase/client";

export type AvaliacaoNotasAssessmentPack = {
  id: string;
  title: string;
  type: string;
  date: string;
  weight: number | null;
  classroom_id: string | null;
  subject_id: string | null;
  classroom_name?: string;
  subject_name?: string;
};

export type AvaliacaoNotasStudentRow = {
  id: string;
  full_name: string;
  enrollment_number: string | null;
  avatar_color: string | null;
};

/** Chave igual ao prefetch de login (`scope`: `full` turma inteira ou `student:<uuid>` modo aluno). */
export function avaliacaoNotasPackQueryKey(assessmentId: string, scopeKey: string) {
  return ["avaliacaoNotas", "pack", assessmentId, scopeKey] as const;
}

export async function fetchAvaliacaoNotasPack(params: {
  assessmentId: string;
  visibleStudentId: string | null;
}): Promise<{
  assessment: AvaliacaoNotasAssessmentPack;
  visibleStudents: AvaliacaoNotasStudentRow[];
  gradeRowsTemplate: Record<
    string,
    {
      student_id: string;
      id?: string;
      score: string;
      teacher_comment: string;
      original_score?: number;
      original_comment?: string | null;
    }
  >;
}> {
  const { assessmentId, visibleStudentId } = params;
  const { data: a, error: aErr } = await supabase
    .from("assessments")
    .select("id, title, type, date, weight, classroom_id, subject_id, classrooms:classroom_id(name), subjects:subject_id(name)")
    .eq("id", assessmentId)
    .maybeSingle();

  if (aErr || !a) throw aErr ?? new Error("Avaliação não encontrada");

  const assessment: AvaliacaoNotasAssessmentPack = {
    id: a.id as string,
    title: a.title as string,
    type: a.type as string,
    date: a.date as string,
    weight: (a.weight as number | null) ?? null,
    classroom_id: (a.classroom_id as string | null) ?? null,
    subject_id: (a.subject_id as string | null) ?? null,
    classroom_name: (a as { classrooms?: { name?: string } | null }).classrooms?.name,
    subject_name: (a as { subjects?: { name?: string } | null }).subjects?.name,
  };

  if (!assessment.classroom_id) {
    return {
      assessment,
      visibleStudents: [],
      gradeRowsTemplate: {},
    };
  }

  const [stuRes, gRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, enrollment_number, avatar_color")
      .eq("classroom_id", assessment.classroom_id)
      .order("full_name"),
    supabase.from("grades").select("id, student_id, score, teacher_comment").eq("assessment_id", assessmentId),
  ]);

  const studentList = (stuRes.data ?? []) as AvaliacaoNotasStudentRow[];

  const visibleStudents =
    visibleStudentId !== null ? studentList.filter((s) => s.id === visibleStudentId) : studentList;

  const gradeRowsTemplate: Record<
    string,
    {
      student_id: string;
      id?: string;
      score: string;
      teacher_comment: string;
      original_score?: number;
      original_comment?: string | null;
    }
  > = {};

  studentList.forEach((s) => {
    gradeRowsTemplate[s.id] = { student_id: s.id, score: "", teacher_comment: "" };
  });
  for (const g of gRes.data ?? []) {
    const row = g as { id: string; student_id: string; score?: number | null; teacher_comment?: string | null };
    if (!gradeRowsTemplate[row.student_id]) continue;
    gradeRowsTemplate[row.student_id] = {
      id: row.id,
      student_id: row.student_id,
      score: row.score?.toString() ?? "",
      teacher_comment: row.teacher_comment ?? "",
      original_score: row.score ?? undefined,
      original_comment: row.teacher_comment ?? null,
    };
  }

  return { assessment, visibleStudents, gradeRowsTemplate };
}
