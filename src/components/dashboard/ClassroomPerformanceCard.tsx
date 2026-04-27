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
      let query = supabase
        .from("grades")
        .select("score, assessments(date, classroom_id, classrooms(name))");

      if (selectedYear) {
        query = query.gte("assessments.date", selectedYear.start_date).lte("assessments.date", selectedYear.end_date);
      }

      const { data: grades } = await query;

      type Row = {
        score: number;
        assessments: {
          date: string | null;
          classroom_id: string | null;
          classrooms: { name: string | null } | null;
        } | null;
      };

      const buckets = new Map<string, { name: string; sum: number; count: number }>();
      ((grades ?? []) as unknown as Row[]).forEach((g) => {
        const cid = g.assessments?.classroom_id;
        const cname = g.assessments?.classrooms?.name;
        if (!cid || !cname) return;
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