import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Classroom {
  id: string;
  name: string;
}

interface WeekBucket {
  week: string;
  present: number;
  absent: number;
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const AttendanceCard = () => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("ALL");
  const [data, setData] = useState<WeekBucket[]>([]);

  const monthRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      start,
      end,
      label: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
    };
  }, []);

  useEffect(() => {
    supabase
      .from("classrooms")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data }) => setClassrooms(data ?? []));
  }, []);

  useEffect(() => {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const load = async () => {
      let query = supabase
        .from("attendance")
        .select("date, notes, schedules(classroom_id)")
        .gte("date", fmt(monthRange.start))
        .lt("date", fmt(monthRange.end));

      const { data: rows } = await query;

      const filtered = (rows ?? []).filter((r) => {
        if (classroomId === "ALL") return true;
        const sched = (r as { schedules: { classroom_id: string | null } | null }).schedules;
        return sched?.classroom_id === classroomId;
      });

      // Group into weeks of the month (W1..W5)
      const weeks: WeekBucket[] = Array.from({ length: 5 }, (_, i) => ({
        week: `Sem ${i + 1}`,
        present: 0,
        absent: 0,
      }));

      filtered.forEach((row) => {
        const d = new Date((row as { date: string }).date);
        const weekIdx = Math.min(4, Math.floor((d.getDate() - 1) / 7));
        const notes = ((row as { notes: string | null }).notes ?? "").toUpperCase();
        const isAbsent = notes.includes("ABSEN") || notes.includes("FALT");
        if (isAbsent) weeks[weekIdx].absent += 1;
        else weeks[weekIdx].present += 1;
      });

      // Trim trailing empty weeks if month has 4 weeks
      const trimmed = weeks.slice(0, new Date(monthRange.end.getTime() - 1).getDate() > 28 ? 5 : 4);
      setData(trimmed);
    };
    load();
  }, [classroomId, monthRange.start, monthRange.end]);

  const maxValue = Math.max(10, ...data.flatMap((d) => [d.present, d.absent]));
  const yMax = Math.ceil(maxValue / 5) * 5 || 10;
  const isEmpty = data.every((d) => d.present === 0 && d.absent === 0);

  return (
    <div className="flex h-full flex-col gap-5 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-foreground">Frequência</h3>
          <p className="text-xs text-muted-foreground">{monthRange.label}</p>
        </div>
        <Select value={classroomId} onValueChange={setClassroomId}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] rounded-full border-border bg-background px-3 text-xs font-medium">
            <SelectValue placeholder="Turma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as turmas</SelectItem>
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-yellow" /> Presentes
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-blue" /> Ausentes
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} domain={[0, yMax]} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                boxShadow: "var(--shadow-soft)",
                fontSize: "12px",
              }}
            />
            <Bar dataKey="present" fill="hsl(var(--pastel-yellow))" radius={[8, 8, 0, 0]} />
            <Bar dataKey="absent" fill="hsl(var(--pastel-blue))" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {isEmpty && (
        <p className="text-center text-xs text-muted-foreground">Sem registos de frequência este mês.</p>
      )}
    </div>
  );
};
