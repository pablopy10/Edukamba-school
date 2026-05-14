import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Para professores definidos como diretores de turma (`classrooms.homeroom_teacher_id`),
 * devolve os IDs dos alunos dessas turmas (visibilidade de inscrições, cobranças, etc.).
 */
export function useHomeroomStudentIds(
  schoolId: string | null,
  role: string | null,
  userId: string | null,
): { ids: string[]; loading: boolean } {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!schoolId || !userId || role !== "TEACHER") {
      setIds([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const { data: rooms, error: rErr } = await supabase
        .from("classrooms")
        .select("id")
        .eq("school_id", schoolId)
        .eq("homeroom_teacher_id", userId);
      if (cancelled) return;
      if (rErr || !rooms?.length) {
        setIds([]);
        setLoading(false);
        return;
      }
      const cid = rooms.map((r: { id: string }) => r.id);
      const { data: studs, error: sErr } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId)
        .in("classroom_id", cid);
      if (cancelled) return;
      setIds(!sErr && studs?.length ? studs.map((s: { id: string }) => s.id) : []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolId, role, userId]);

  return { ids, loading };
}
