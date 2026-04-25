import { ArrowUp, ArrowDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  delta?: number;
  variant: "lilac" | "yellow" | "blue" | "pink";
}

const variantClass: Record<StatCardProps["variant"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

export const StatCard = ({ label, value, delta, variant }: StatCardProps) => {
  const hasDelta = typeof delta === "number" && delta !== 0;
  const positive = (delta ?? 0) >= 0;
  return (
    <div className={cn("group relative flex flex-col gap-6 rounded-2xl p-5 shadow-soft transition-[var(--transition-smooth)] hover:-translate-y-0.5", variantClass[variant])}>
      <div className="flex items-center justify-between">
        {hasDelta ? (
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full bg-white/50 px-2 py-1 text-xs font-semibold backdrop-blur",
            positive ? "text-success" : "text-destructive",
          )}>
            {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(delta!)}%
          </span>
        ) : (
          <span />
        )}
        <button className="rounded-full p-1 opacity-60 hover:bg-white/40 hover:opacity-100">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 text-sm font-medium opacity-80">{label}</p>
      </div>
    </div>
  );
};