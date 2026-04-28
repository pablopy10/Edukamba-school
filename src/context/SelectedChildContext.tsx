import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

export type ChildOption = {
  id: string;
  full_name: string;
  classroom_id: string | null;
  classroom_name: string | null;
};

type Ctx = {
  isParent: boolean;
  children: ChildOption[];
  selectedChildId: string | null;
  selectedChild: ChildOption | null;
  setSelectedChildId: (id: string | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SelectedChildContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "selected_child_id";

export const SelectedChildProvider = ({ children: kids }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isParent = role === "PARENT";

  const load = useCallback(async () => {
    if (authLoading || roleLoading) return;
    if (!user || role !== "PARENT") {
      setChildren([]);
      setSelectedChildIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("students")
      .select("id, full_name, classroom_id, classrooms(name)")
      .eq("parent_id", user.id)
      .order("full_name");
    const list: ChildOption[] = ((data ?? []) as Array<{
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

    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored && list.some((c) => c.id === stored) ? stored : (list[0]?.id ?? null);
    if (initial) localStorage.setItem(STORAGE_KEY, initial);
    setSelectedChildIdState(initial);
    setLoading(false);
  }, [user?.id, role, authLoading, roleLoading]);

  useEffect(() => { load(); }, [load]);

  const setSelectedChildId = useCallback((id: string | null) => {
    setSelectedChildIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const selectedChild = useMemo(
    () => children.find((c) => c.id === selectedChildId) ?? null,
    [children, selectedChildId],
  );

  const value = useMemo<Ctx>(
    () => ({ isParent, children, selectedChildId, selectedChild, setSelectedChildId, loading, refresh: load }),
    [isParent, children, selectedChildId, selectedChild, setSelectedChildId, loading, load],
  );

  return <SelectedChildContext.Provider value={value}>{kids}</SelectedChildContext.Provider>;
};

export const useSelectedChild = () => {
  const ctx = useContext(SelectedChildContext);
  if (!ctx) throw new Error("useSelectedChild must be used within SelectedChildProvider");
  return ctx;
};