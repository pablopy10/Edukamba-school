import { useEffect, useState } from "react";
import { Trophy, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/context/AcademicYearContext";

interface Props {
  variant: "best" | "worst";
}

export const ClassroomPerformanceCard = ({ variant }: Props) => {
  const { selectedYear } = useAcademicYear();
  const [name, setName] = useState<string>("—");
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Resolve the school + the set of term ids that belong to the selected year so we
      // can include grades whose assessment date is inside the year window OR whose
      // assessment is linked (via term) to the selected year.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle();
      const schoolId = profile?.school_id ?? null;

      let termIds: string[] = [];
      if (selectedYear?.id && schoolId) {
        const { data: ts } = await supabase
          .from("academic_terms")
          .select("id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", selectedYear.id);
        termIds = (ts ?? []).map((t) => t.id);
      }

      const query = supabase
        .from("grades")
        .select("score, assessments!inner(date, term_id, classroom_id, school_id, classrooms(name))");
      const { data: grades } = schoolId
        ? await query.eq("assessments.school_id", schoolId)
        : await query;

      type Row = {
        score: number;
        assessments: {
          date: string | null;
          term_id: string | null;
          classroom_id: string | null;
          classrooms: { name: string | null } | null;
        } | null;
      };

      const buckets = new Map<string, { name: string; sum: number; count: number }>();
      ((grades ?? []) as unknown as Row[]).forEach((g) => {
        const cid = g.assessments?.classroom_id;
        const cname = g.assessments?.classrooms?.name;
        if (!cid || !cname) return;
        // Year scoping: include if date inside year window OR term linked to the year
        if (selectedYear) {
          const d = g.assessments?.date ?? null;
          const inDate = d ? d >= selectedYear.start_date && d <= selectedYear.end_date : false;
          const inTerm = g.assessments?.term_id ? termIds.includes(g.assessments.term_id) : false;
          if (!inDate && !inTerm) return;
        }
        const b = buckets.get(cid) ?? { name: cname, sum: 0, count: 0 };
        b.sum += Number(g.score) || 0;
        b.count += 1;
        buckets.set(cid, b);
      });

      const ranked = [...buckets.values()]
        .filter((b) => b.count > 0)
        .map((b) => ({ name: b.name, avg: b.sum / b.count }))
        .sort((a, b) => b.avg - a.avg);

      if (cancelled) return;
      if (ranked.length === 0) {
        setName("Sem dados");
        setScore(null);
        return;
      }
      const pick = variant === "best" ? ranked[0] : ranked[ranked.length - 1];
      setName(pick.name);
      setScore(pick.avg);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [variant, selectedYear]);

  const isBest = variant === "best";
  const Icon = isBest ? Trophy : TrendingDown;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          isBest
            ? "bg-pastel-green text-pastel-green-foreground"
            : "bg-pastel-pink text-pastel-pink-foreground",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-bold text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">
          {isBest ? "Turma com melhor desempenho" : "Turma com pior desempenho"}
        </p>
      </div>
      {score !== null && (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            isBest ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          Média {score.toFixed(1)}
        </span>
      )}
    </div>
  );
};