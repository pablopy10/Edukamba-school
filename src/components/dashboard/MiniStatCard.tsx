import { ArrowDown, ArrowUp, Award, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon: "award" | "trophy";
  value: string;
  label: string;
  delta: number;
}

export const MiniStatCard = ({ icon, value, label, delta }: Props) => {
  const Icon = icon === "award" ? Award : Trophy;
  const positive = delta >= 0;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-yellow text-pastel-yellow-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <span className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        positive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
      )}>
        {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(delta)}%
      </span>
    </div>
  );
};