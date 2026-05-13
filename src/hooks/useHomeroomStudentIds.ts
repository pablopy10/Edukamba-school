import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Para professores definidos como diretores de turma (`classrooms.homeroom_teacher_id`),
 * devolve os IDs dos alunos dessas turmas (visibilidade de inscrições, etc.).
 */
export function useHomeroomStudentIds(schoolId: string | null, role: string | null, userId: string | null): string[] {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (!schoolId || !userId || role !== "TEACHER") {
      setIds([]);
      return;
    }
    let cancelled = false;

    void (async () => {
      const { data: rooms, error: rErr } = await supabase
        .from("classrooms")
        .select("id")
        .eq("school_id", schoolId)
        .eq("homeroom_teacher_id", userId);
      if (rErr || !rooms?.length) {
        if (!cancelled) setIds([]);
        return;
      }
      const cid = rooms.map((r: { id: string }) => r.id);
      const { data: studs, error: sErr } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .in("classroom_id", cid);
      if (!cancelled) {
        setIds(!sErr && studs?.length ? studs.map((s: { id: string }) => s.id) : []);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolId, role, userId]);

  return ids;
}
