import { supabase } from "@/integrations/supabase/client";
import { teacherScheduleClassroomsFingerprint } from "@/lib/offline/teacherListQueries";

export type TeacherAssessmentRow = {
  id: string;
  title: string;
  type: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  weight: number | null;
  description: string | null;
  classroom_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
  term_id: string | null;
  created_by: string | null;
};

export type AvaliacoesTermPack = {
  id: string;
  term_number: number;
  name: string;
  start_date: string;
  end_date: string;
};

export type AvaliacoesHolidayPack = { id: string; name: string; start_date: string; end_date: string };

export type AvaliacoesTeacherOption = { id: string; name: string; subject_id?: string | null };

export type TeacherAvaliacoesPack = {
  assessments: TeacherAssessmentRow[];
  classrooms: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  teachers: AvaliacoesTeacherOption[];
  terms: AvaliacoesTermPack[];
  holidays: AvaliacoesHolidayPack[];
};


export function teacherAvaliacoesPackQueryKey(
  userId: string,
  schoolId: string,
  academicYearId: string,
  classroomFingerprint: string,
): readonly ["teacherPrefetch", "avaliacoes", string, string, string, string] {
  return ["teacherPrefetch", "avaliacoes", userId, schoolId, academicYearId, classroomFingerprint];
}

export function teacherSubjectDetailQueryKey(schoolId: string, subjectId: string) {
  return ["teacherPrefetch", "subjectDetail", schoolId, subjectId] as const;
}

export async function fetchTeacherSubjectDetail(
  schoolId: string,
  subjectId: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("id", subjectId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.name) return null;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  return { id: data.id as string, name: name || "—" };
}

export async function fetchTeacherAvaliacoesPack(args: {
  schoolId: string;
  academicYearId: string;
  classroomIds: string[];
}): Promise<TeacherAvaliacoesPack> {
  const { schoolId, academicYearId, classroomIds } = args;
  if (classroomIds.length === 0) {
    return { assessments: [], classrooms: [], subjects: [], teachers: [], terms: [], holidays: [] };
  }

  const termsBase = supabase
    .from("academic_terms")
    .select("id, term_number, name, start_date, end_date")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .order("term_number");

  const holidaysBase = supabase
    .from("school_holidays")
    .select("id, name, start_date, end_date")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .order("start_date");

  const assessmentsQuery = supabase
    .from("assessments")
    .select(
      "id,title,type,date,start_time,end_time,room,weight,description,classroom_id,subject_id,teacher_id,term_id,academic_year_id,created_by",
    )
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .order("date", { ascending: false })
    .in("classroom_id", classroomIds);

  const classroomsQuery = supabase
    .from("classrooms")
    .select("id, name")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .order("name");

  const [aRes, cRes, sRes, tRes, termRes, holRes] = await Promise.all([
    assessmentsQuery,
    classroomsQuery,
    supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("teachers").select("id, profile_id, subject_id, profiles:profile_id(full_name)").eq("school_id", schoolId),
    termsBase,
    holidaysBase,
  ]);

  const classroomFullList = (cRes.data ?? []) as { id: string; name: string }[];
  const classroomList = classroomFullList.filter((c) => classroomIds.includes(c.id));

  const teacherListRaw = (
    (tRes.data ?? []) as {
      profile_id?: string | null;
      subject_id?: string | null;
      profiles?: { full_name?: string | null } | null;
    }[]
  ).filter((t) => !!t.profile_id);

  const teacherList: AvaliacoesTeacherOption[] = teacherListRaw
    .map((t) => ({
      id: t.profile_id as string,
      name: t.profiles?.full_name?.trim() || "Sem nome",
      subject_id: t.subject_id ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));

  const subjectList = (sRes.data ?? []) as { id: string; name: string }[];

  const bulkErr = [aRes, cRes, sRes, tRes, termRes, holRes].find((r) => r.error)?.error;
  if (bulkErr) throw bulkErr;

  return {
    assessments: (aRes.data ?? []) as TeacherAssessmentRow[],
    classrooms: classroomList.map((c) => ({ id: c.id, name: c.name })),
    subjects: subjectList.map((s) => ({ id: s.id, name: s.name })),
    teachers: teacherList,
    terms: ((termRes.data ?? []) as AvaliacoesTermPack[]) ?? [],
    holidays: ((holRes.data ?? []) as AvaliacoesHolidayPack[]) ?? [],
  };
}
