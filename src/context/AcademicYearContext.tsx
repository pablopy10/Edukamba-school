import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AcademicYear = {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean | null;
};

type Ctx = {
  years: AcademicYear[];
  selectedYearId: string | null;
  selectedYear: AcademicYear | null;
  setSelectedYearId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const AcademicYearContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "selected_academic_year_id";

export const AcademicYearProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) {
      setYears([]);
      setSelectedYearIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.school_id) {
      setYears([]);
      setSelectedYearIdState(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("academic_years")
      .select("id, label, start_date, end_date, is_active")
      .eq("school_id", profile.school_id)
      .order("start_date", { ascending: false });
    const list = (data ?? []) as AcademicYear[];
    setYears(list);

    // Default to the school's active academic year; fall back to the last valid manual choice.
    const active = list.find((y) => y.is_active);
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = active?.id ?? (stored && list.some((y) => y.id === stored) ? stored : list[0]?.id ?? null);
    if (initial) localStorage.setItem(STORAGE_KEY, initial);
    setSelectedYearIdState(initial);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setSelectedYearId = useCallback((id: string) => {
    setSelectedYearIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const selectedYear = useMemo(
    () => years.find((y) => y.id === selectedYearId) ?? null,
    [years, selectedYearId],
  );

  const value = useMemo<Ctx>(
    () => ({ years, selectedYearId, selectedYear, setSelectedYearId, loading, refresh: load }),
    [years, selectedYearId, selectedYear, setSelectedYearId, loading, load],
  );

  return <AcademicYearContext.Provider value={value}>{children}</AcademicYearContext.Provider>;
};

export const useAcademicYear = () => {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) throw new Error("useAcademicYear must be used within AcademicYearProvider");
  return ctx;
};