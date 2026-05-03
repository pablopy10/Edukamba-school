import { supabase } from "@/integrations/supabase/client";
import { resolveDefaultAcademicYearId } from "@/lib/offline/resolveDefaultAcademicYearId";

/** Escola + ano + papel guardados na cache persistente ao login (`teacherPrefetch`). Offline o contexto pode falhar; isto permite as mesmas queryKeys da pré-carga. */
export type TeacherSessionScopeData = {
  schoolId: string;
  academicYearId: string;
  role: string | null;
};

export function teacherSessionScopeQueryKey(userId: string) {
  return ["teacherPrefetch", "sessionScope", userId] as const;
}

export async function fetchTeacherSessionScopeFromProfile(userId: string): Promise<TeacherSessionScopeData | null> {
  const { data: p } = await supabase.from("profiles").select("school_id, role").eq("id", userId).maybeSingle();
  if (!p?.school_id) return null;
  const academicYearId = await resolveDefaultAcademicYearId(p.school_id);
  if (!academicYearId) return null;
  return {
    schoolId: p.school_id,
    academicYearId,
    role: typeof p.role === "string" ? p.role : null,
  };
}
