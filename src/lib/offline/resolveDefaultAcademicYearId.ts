import { supabase } from "@/integrations/supabase/client";

/** Mesma lógica que o topo do painel (`AcademicYearContext`) e o prefetch de login. */
export async function resolveDefaultAcademicYearId(schoolId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("academic_years")
    .select("id, is_active, start_date")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: true });

  if (error) throw error;
  const list = data ?? [];
  const active = list.find((y) => y.is_active);
  const stored =
    typeof localStorage !== "undefined" ? localStorage.getItem("selected_academic_year_id") : null;
  const initial =
    active?.id ?? (stored && list.some((y) => y.id === stored) ? stored : list[0]?.id ?? null);
  return initial;
}
