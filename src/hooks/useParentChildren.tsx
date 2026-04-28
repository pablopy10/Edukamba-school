import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export type ParentChild = {
  id: string;
  full_name: string;
  classroom_id: string | null;
  classroom_name: string | null;
};

/**
 * Returns the list of students whose parent_id is the current user.
 * Use this to scope all PARENT-facing data to their own children.
 */
export const useParentChildren = () => {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user || role !== "PARENT") {
      setChildren([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, classroom_id, classrooms(name)")
        .eq("parent_id", user.id)
        .order("full_name");
      if (cancelled) return;
      const list: ParentChild[] = ((data ?? []) as Array<{
        id: string;
        full_name: string;
        classroom_id: string | null;
        classrooms: { name: string | null } | null;
      }>).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        classroom_id: s.classroom_id,
        classroom_name: s.classrooms?.name ?? null,
      }));
      setChildren(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, role, authLoading, roleLoading]);

  const isParent = role === "PARENT";
  const childIds = children.map((c) => c.id);
  const classroomIds = Array.from(new Set(children.map((c) => c.classroom_id).filter(Boolean) as string[]));

  return { isParent, children, childIds, classroomIds, loading };
};