import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TENANT_CHANGED_EVENT } from "@/lib/tenantBroadcast";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";

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
  /** Escola efectiva na sessão (inclui `support_context_school_id` — modo suporte SUPER_ADMIN). */
  schoolId: string | null;
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
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantEpoch, setTenantEpoch] = useState(0);

  useEffect(() => {
    const onTenant = () => setTenantEpoch((e) => e + 1);
    window.addEventListener(TENANT_CHANGED_EVENT, onTenant);
    return () => window.removeEventListener(TENANT_CHANGED_EVENT, onTenant);
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) {
      setYears([]);
      setSelectedYearIdState(null);
      setSchoolId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setSchoolId(null);
    try {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) {
        console.error("AcademicYearContext: profile", profileError);
        setYears([]);
        setSelectedYearIdState(null);
        return;
      }
      const effectiveSid = effectiveSchoolIdFromProfile(profile);
      if (!effectiveSid) {
        setYears([]);
        setSelectedYearIdState(null);
        return;
      }
      setSchoolId(effectiveSid);

      const { data, error: yearsError } = await supabase
        .from("academic_years")
        .select("id, label, start_date, end_date, is_active")
        .eq("school_id", effectiveSid)
        .order("start_date", { ascending: true });
      if (yearsError) {
        console.error("AcademicYearContext: academic_years", yearsError);
        setYears([]);
        setSelectedYearIdState(null);
        return;
      }
      const list = (data ?? []) as AcademicYear[];
      setYears(list);

      const active = list.find((y) => y.is_active);
      const stored = localStorage.getItem(STORAGE_KEY);
      const initial = active?.id ?? (stored && list.some((y) => y.id === stored) ? stored : list[0]?.id ?? null);
      if (initial) localStorage.setItem(STORAGE_KEY, initial);
      setSelectedYearIdState(initial);
    } finally {
      setLoading(false);
    }
  }, [user?.id, tenantEpoch]);

  useEffect(() => {
    void load();
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
    () => ({ years, selectedYearId, selectedYear, schoolId, setSelectedYearId, loading, refresh: load }),
    [years, selectedYearId, selectedYear, schoolId, setSelectedYearId, loading, load],
  );

  return <AcademicYearContext.Provider value={value}>{children}</AcademicYearContext.Provider>;
};

export const useAcademicYear = () => {
  const ctx = useContext(AcademicYearContext);
  if (!ctx) throw new Error("useAcademicYear must be used within AcademicYearProvider");
  return ctx;
};
