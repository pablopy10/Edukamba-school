import { MoreHorizontal } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const data = [
  { name: "Meninos", value: 47 },
  { name: "Meninas", value: 53 },
];
const COLORS = ["hsl(var(--pastel-blue))", "hsl(var(--pastel-yellow))"];

export const StudentsCard = () => {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Alunos</h3>
        <button className="rounded-full p-1 text-muted-foreground hover:bg-accent">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="relative mx-auto h-48 w-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={60}
              outerRadius={88}
              paddingAngle={4}
              startAngle={90}
              endAngle={-270}
              cornerRadius={8}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} stroke="none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">85.7K</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pastel-blue" />
            <p className="text-2xl font-bold text-foreground">45.414</p>
          </div>
          <p className="ml-4.5 mt-0.5 pl-2 text-xs text-muted-foreground">Meninos (47%)</p>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-pastel-yellow" />
            <p className="text-2xl font-bold text-foreground">40.270</p>
          </div>
          <p className="mt-0.5 pl-4 text-xs text-muted-foreground">Meninas (53%)</p>
        </div>
      </div>
    </div>
  );
};