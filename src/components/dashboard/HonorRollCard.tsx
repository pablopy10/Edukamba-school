import { useEffect, useState } from "react";
import { Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HonorEntry {
  id: string;
  name: string;
  avg: number;
}

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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("grades")
        .select("score, students(id, full_name)");

      type Row = {
        score: number;
        students: { id: string; full_name: string } | null;
      };

      const buckets = new Map<string, { name: string; sum: number; count: number }>();
      ((data ?? []) as unknown as Row[]).forEach((g) => {
        const s = g.students;
        if (!s) return;
        const b = buckets.get(s.id) ?? { name: s.full_name, sum: 0, count: 0 };
        b.sum += Number(g.score) || 0;
        b.count += 1;
        buckets.set(s.id, b);
      });

      const ranked: HonorEntry[] = [...buckets.entries()]
        .filter(([, b]) => b.count > 0)
        .map(([id, b]) => ({ id, name: b.name, avg: b.sum / b.count }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 5);

      if (!cancelled) setEntries(ranked);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-yellow text-pastel-yellow-foreground">
          <Medal className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">Quadro de Honra</h3>
          <p className="text-xs text-muted-foreground">Melhores médias</p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
          Sem notas registadas.
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