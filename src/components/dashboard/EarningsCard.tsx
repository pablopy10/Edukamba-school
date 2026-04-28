import { MoreHorizontal } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const EarningsCard = () => {
  const [data, setData] = useState(
    monthLabels.map((m) => ({ m, income: 0, expense: 0 })),
  );

  useEffect(() => {
    const load = async () => {
      const year = new Date().getFullYear();
      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;
      const [paidRes, dueRes] = await Promise.all([
        supabase
          .from("payments")
          .select("amount_paid, payment_date")
          .gte("payment_date", start)
          .lt("payment_date", end),
        supabase
          .from("student_fees")
          .select("amount_due, due_date")
          .gte("due_date", start)
          .lt("due_date", end),
      ]);

      const buckets = monthLabels.map((m) => ({ m, income: 0, expense: 0 }));
      (paidRes.data ?? []).forEach((p) => {
        if (!p.payment_date) return;
        const idx = new Date(p.payment_date).getMonth();
        buckets[idx].income += Number(p.amount_paid) || 0;
      });
      (dueRes.data ?? []).forEach((f) => {
        if (!f.due_date) return;
        const idx = new Date(f.due_date).getMonth();
        buckets[idx].expense += Number(f.amount_due) || 0;
      });
      setData(buckets);
    };
    load();
  }, []);

  const hasData = data.some((d) => d.income > 0 || d.expense > 0);
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">Receita</h3>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pastel-blue" /> Recebido
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pastel-lilac" /> Previsto
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
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`)} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                boxShadow: "var(--shadow-soft)",
                fontSize: "12px",
              }}
              formatter={(value: number) => value.toLocaleString("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 })}
            />
            <Area
              type="monotone"
              dataKey="income"
              name="Recebido"
              stroke="hsl(var(--pastel-blue-foreground))"
              strokeWidth={2.5}
              fill="url(#incomeFill)"
            />
            <Area
              type="monotone"
              dataKey="expense"
              name="Previsto"
              stroke="hsl(var(--pastel-lilac-foreground))"
              strokeWidth={2.5}
              fill="url(#expenseFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {!hasData && (
        <p className="text-center text-xs text-muted-foreground">Sem registos financeiros este ano.</p>
      )}
    </div>
  );
};