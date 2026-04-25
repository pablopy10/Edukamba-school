import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const dates = [19, 20, 21, 22, 23, 24, 25];
const today = 22;

export const CalendarCard = () => {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-base font-bold text-foreground">Setembro 2030</h3>
        <button className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((d) => (
          <p key={d} className="py-1 text-[11px] font-medium text-muted-foreground">{d}</p>
        ))}
        {dates.map((d) => (
          <button
            key={d}
            className={cn(
              "flex h-10 items-center justify-center rounded-xl text-sm font-semibold transition-[var(--transition-smooth)]",
              d === today
                ? "bg-pastel-blue text-pastel-blue-foreground"
                : "text-foreground hover:bg-accent",
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
};