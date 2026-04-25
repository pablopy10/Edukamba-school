import { ChevronDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";

const data = [
  { day: "Seg", present: 65, absent: 60 },
  { day: "Ter", present: 75, absent: 55 },
  { day: "Qua", present: 92, absent: 70 },
  { day: "Qui", present: 78, absent: 72 },
  { day: "Sex", present: 75, absent: 65 },
];

export const AttendanceCard = () => {
  return (
    <div className="flex h-full flex-col gap-5 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">Frequência</h3>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
            Semanal <ChevronDown className="h-3 w-3" />
          </button>
          <button className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
            Série 3 <ChevronDown className="h-3 w-3" />
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
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
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
    </div>
  );
};