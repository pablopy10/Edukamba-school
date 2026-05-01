import { supabase } from "@/integrations/supabase/client";

type Option = { id: string; name: string; period?: string | null };
export type TimeSlotRow = {
  id: string;
  shift: "MORNING" | "AFTERNOON" | "EVENING";
  start_time: string;
  end_time: string;
  position: number;
  is_break: boolean;
  label: string | null;
};
export type ScheduleRow = {
  id: string;
  classroom_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  shift: "MORNING" | "AFTERNOON" | "EVENING" | null;
  notes: string | null;
};
type SubjectOpt = Option;
type TeacherOpt = Option & { subjectId?: string | null };

const trim5 = (t: string) => t?.slice(0, 5) ?? "";

export type HorariosFetchScope = {
  isParent: boolean;
  parentClassroomIds: string[];
  isTeacher: boolean;
  teacherClassroomIds: string[];
  isStudent: boolean;
  studentClassroomId: string | null;
  studentSubjectIds: string[];
  studentTeacherIds: string[];
};

export type HorariosDataset = {
  classrooms: Option[];
  subjects: SubjectOpt[];
  teachers: TeacherOpt[];
  timeSlots: TimeSlotRow[];
  schedules: ScheduleRow[];
};

/** Dados paralelos dos horários (mesma lógica que a página usava em `loadAll`). */
export async function fetchHorariosDataset(
  schoolId: string,
  selectedYearId: string | null,
  scope: HorariosFetchScope,
): Promise<HorariosDataset> {
  let classroomsQuery = supabase
    .from("classrooms")
    .select("id, name, period")
    .eq("school_id", schoolId)
    .order("name");
  if (selectedYearId) classroomsQuery = classroomsQuery.eq("academic_year_id", selectedYearId);
  const [classroomsRes, subjectsRes, teachersRes, slotsRes, schedulesRes] = await Promise.all([
    classroomsQuery,
    supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
    supabase
      .from("teachers")
      .select("id, profile_id, subject_id, profiles:profile_id ( full_name )")
      .eq("school_id", schoolId),
    supabase.from("school_time_slots").select("*").eq("school_id", schoolId).order("shift").order("position"),
    supabase.from("schedules").select("*").eq("school_id", schoolId),
  ]);

  let classroomList = (classroomsRes.data ?? []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    name: c.name as string,
    period: (c.period as string | null) ?? null,
  }));
  if (scope.isParent) {
    classroomList = classroomList.filter((c) => scope.parentClassroomIds.includes(c.id));
  }
  if (scope.isTeacher) {
    classroomList = classroomList.filter((c) => scope.teacherClassroomIds.includes(c.id));
  }
  if (scope.isStudent && scope.studentClassroomId) {
    classroomList = classroomList.filter((c) => c.id === scope.studentClassroomId);
  }

  let subjectList = (subjectsRes.data ?? []).map((s) => ({ id: s.id, name: s.name }));
  let teacherList = (teachersRes.data ?? [])
    .filter((t: { profile_id?: string | null }) => !!t.profile_id)
    .map((t: any) => ({
      id: t.profile_id as string,
      name: (t.profiles?.full_name as string) ?? "Sem nome",
      subjectId: (t.subject_id as string | null) ?? null,
    }));
  if (scope.isStudent) {
    const subjSet = new Set(scope.studentSubjectIds);
    const teachSet = new Set(scope.studentTeacherIds);
    subjectList = subjectList.filter((s) => subjSet.has(s.id));
    teacherList = teacherList.filter((t) => teachSet.has(t.id));
  }

  return {
    classrooms: classroomList,
    subjects: subjectList,
    teachers: teacherList,
    timeSlots: (slotsRes.data ?? []).map((s: any) => ({
      id: s.id,
      shift: s.shift,
      start_time: trim5(s.start_time),
      end_time: trim5(s.end_time),
      position: s.position,
      is_break: s.is_break,
      label: s.label,
    })),
    schedules: (schedulesRes.data ?? []).map((s: any) => ({
      id: s.id,
      classroom_id: s.classroom_id,
      subject_id: s.subject_id,
      teacher_id: s.teacher_id,
      day_of_week: s.day_of_week,
      start_time: trim5(s.start_time),
      end_time: trim5(s.end_time),
      room: s.room,
      shift: s.shift,
      notes: s.notes,
    })),
  };
}
