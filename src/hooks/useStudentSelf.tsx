import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * For users with the STUDENT role, returns the student record linked to their
 * auth user (via students.user_id) plus derived info needed to scope filters
 * across the app: their classroom, subjects taught in that classroom, teachers
 * who teach that classroom, and the dominant shift of those schedules.
 *
 * For non-students, `isStudent` is false and consumers should bypass scoping.
 */
export type StudentShift = "MORNING" | "AFTERNOON" | "EVENING";

export const useStudentSelf = () => {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const isStudent = role === "STUDENT";

  const [studentId, setStudentId] = useState<string | null>(null);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [classroomName, setClassroomName] = useState<string | null>(null);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [shift, setShift] = useState<StudentShift | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (roleLoading) return;
    if (!user || !isStudent) {
      setStudentId(null);
      setClassroomId(null);
      setClassroomName(null);
      setSubjectIds([]);
      setTeacherIds([]);
      setShift(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: stu } = await supabase
        .from("students")
        .select("id, classroom_id, classrooms:classroom_id(name)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const sid = (stu as any)?.id ?? null;
      const cid = (stu as any)?.classroom_id ?? null;
      const cname = (stu as any)?.classrooms?.name ?? null;
      setStudentId(sid);
      setClassroomId(cid);
      setClassroomName(cname);
      if (!cid) {
        setSubjectIds([]);
        setTeacherIds([]);
        setShift(null);
        setLoading(false);
        return;
      }
      const { data: schs } = await supabase
        .from("schedules")
        .select("subject_id, teacher_id, shift")
        .eq("classroom_id", cid);
      if (cancelled) return;
      const subj = new Set<string>();
      const teach = new Set<string>();
      const shiftCounts: Record<string, number> = {};
      (schs ?? []).forEach((s: any) => {
        if (s.subject_id) subj.add(s.subject_id);
        if (s.teacher_id) teach.add(s.teacher_id);
        if (s.shift) shiftCounts[s.shift] = (shiftCounts[s.shift] ?? 0) + 1;
      });
      setSubjectIds(Array.from(subj));
      setTeacherIds(Array.from(teach));
      const dominantShift = Object.entries(shiftCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      setShift((dominantShift as StudentShift | null) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isStudent, roleLoading]);

  return { isStudent, studentId, classroomId, classroomName, subjectIds, teacherIds, shift, loading };
};