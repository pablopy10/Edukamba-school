import { ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";

interface AttendanceCardProps {
  data: { day: string; present: number; absent: number }[];
}

export const AttendanceCard = ({ data }: AttendanceCardProps) => {
  const maxValue = Math.max(10, ...data.flatMap((d) => [d.present, d.absent]));
  const yMax = Math.ceil(maxValue / 5) * 5 || 10;
  return (
    <div className="flex h-full flex-col gap-5 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">Frequência</h3>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
            Semanal <ChevronDown className="h-3 w-3" />
          </button>
        </div>
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
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
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
      {data.every((d) => d.present === 0 && d.absent === 0) && (
        <p className="text-center text-xs text-muted-foreground">Sem registos de frequência esta semana.</p>
      )}
    </div>
  );
};