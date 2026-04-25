import { MoreHorizontal } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";

const data = [
  { m: "Jan", income: 480, expense: 320 },
  { m: "Fev", income: 720, expense: 410 },
  { m: "Mar", income: 600, expense: 380 },
  { m: "Abr", income: 820, expense: 460 },
  { m: "Mai", income: 680, expense: 420 },
  { m: "Jun", income: 580, expense: 380 },
  { m: "Jul", income: 760, expense: 500 },
  { m: "Ago", income: 700, expense: 470 },
  { m: "Set", income: 837, expense: 500 },
  { m: "Out", income: 720, expense: 480 },
  { m: "Nov", income: 880, expense: 540 },
  { m: "Dez", income: 920, expense: 580 },
];

export const EarningsCard = () => {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">Receita</h3>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pastel-blue" /> Receita
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pastel-lilac" /> Despesa
          </div>
          <button className="rounded-full p-1 text-muted-foreground hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--pastel-blue))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--pastel-blue))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--pastel-lilac))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--pastel-lilac))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="m" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => `${v}K`} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                boxShadow: "var(--shadow-soft)",
                fontSize: "12px",
              }}
              formatter={(value: number) => `R$ ${value}.000`}
            />
            <Area type="monotone" dataKey="income" stroke="hsl(var(--pastel-blue-foreground))" strokeWidth={2.5} fill="url(#incomeFill)" />
            <Area type="monotone" dataKey="expense" stroke="hsl(var(--pastel-lilac-foreground))" strokeWidth={2.5} fill="url(#expenseFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};