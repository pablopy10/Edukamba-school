import { useEffect, useState } from "react";
import { Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademicYear } from "@/context/AcademicYearContext";

interface HonorEntry {
  id: string;
  name: string;
  avg: number;
}

type Term = { id: string; term_number: number; name: string; start_date: string; end_date: string };

const medalColor = (i: number) =>
  i === 0
    ? "bg-pastel-yellow text-pastel-yellow-foreground"
    : i === 1
    ? "bg-pastel-lilac text-pastel-lilac-foreground"
    : i === 2
    ? "bg-pastel-pink text-pastel-pink-foreground"
    : "bg-muted text-muted-foreground";

export const HonorRollCard = () => {
  const [entries, setEntries] = useState<HonorEntry[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("all");
  const [minAverage, setMinAverage] = useState<number>(14);
  const [maxScore, setMaxScore] = useState<number>(20);
  const { selectedYearId, selectedYear } = useAcademicYear();

  useEffect(() => {
    let cancelled = false;
    const loadTerms = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.school_id) return;
      // Read honor roll thresholds from school settings
      const { data: schoolRow } = await supabase
        .from("schools")
        .select("settings")
        .eq("id", profile.school_id)
        .maybeSingle();
      const s = (schoolRow?.settings ?? {}) as { honor_roll_min_average?: number; grading_max_score?: number };
      if (typeof s.honor_roll_min_average === "number" && !Number.isNaN(s.honor_roll_min_average)) {
        setMinAverage(s.honor_roll_min_average);
      }
      if (typeof s.grading_max_score === "number" && !Number.isNaN(s.grading_max_score)) {
        setMaxScore(s.grading_max_score);
      }
      // Restrict to terms of the currently selected academic year
      let q = supabase
        .from("academic_terms")
        .select("id, term_number, name, start_date, end_date")
        .eq("school_id", profile.school_id)
        .order("term_number");
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data } = await q;
      if (cancelled) return;
      const ts = (data ?? []) as Term[];
      setTerms(ts);
      // Auto-select current term
      const today = new Date().toISOString().slice(0, 10);
      const current = ts.find((t) => today >= t.start_date && today <= t.end_date);
      setSelectedTermId(current?.id ?? "all");
    };
    loadTerms();
    return () => { cancelled = true; };
  }, [selectedYearId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let q = supabase
        .from("grades")
        .select("score, students(id, full_name), assessments!inner(academic_year_id, term_id, date)");
      if (selectedYearId) q = q.eq("assessments.academic_year_id", selectedYearId);
      const { data } = await q;

      type Row = {
        score: number;
        students: { id: string; full_name: string } | null;
        assessments: { academic_year_id: string | null; term_id: string | null; date: string | null } | null;
      };

      const buckets = new Map<string, { name: string; sum: number; count: number }>();
      ((data ?? []) as unknown as Row[]).forEach((g) => {
        const s = g.students;
        if (!s) return;
        // Term filtering
        if (selectedTermId !== "all") {
          const a = g.assessments;
          let effective = a?.term_id ?? null;
          if (!effective && a?.date) {
            const t = terms.find((tt) => a.date! >= tt.start_date && a.date! <= tt.end_date);
            effective = t?.id ?? null;
          }
          if (effective !== selectedTermId) return;
        }
        const b = buckets.get(s.id) ?? { name: s.full_name, sum: 0, count: 0 };
        b.sum += Number(g.score) || 0;
        b.count += 1;
        buckets.set(s.id, b);
      });

      const ranked: HonorEntry[] = [...buckets.entries()]
        .filter(([, b]) => b.count > 0)
        .map(([id, b]) => ({ id, name: b.name, avg: b.sum / b.count }))
        .filter((e) => e.avg >= minAverage)
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 20);

      if (!cancelled) setEntries(ranked);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedTermId, terms, selectedYearId, minAverage]);

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-yellow text-pastel-yellow-foreground">
            <Medal className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Quadro de Honra</h3>
            <p className="text-xs text-muted-foreground">Média ≥ {minAverage}/{maxScore}</p>
          </div>
        </div>
        {terms.length > 0 && (
          <Select value={selectedTermId} onValueChange={setSelectedTermId}>
            <SelectTrigger className="h-8 w-[140px] rounded-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">Todo o ano</SelectItem>
              {terms.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
          Nenhum aluno com média ≥ {minAverage}.
        </p>
      ) : (
        <ol className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-2 -mr-2">
          {entries.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${medalColor(i)}`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {e.name}
              </span>
              <span className="shrink-0 text-sm font-bold text-foreground">
                {e.avg.toFixed(1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};