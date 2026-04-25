import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const CalendarCard = () => {
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const today = now.getDate();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-base font-bold text-foreground">{monthNames[month]} {year}</h3>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((d) => (
          <p key={d} className="py-1 text-[11px] font-medium text-muted-foreground">{d}</p>
        ))}
        {cells.map((d, i) => (
          <div key={i} className="flex h-10 items-center justify-center">
            {d !== null && (
              <button
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold transition-[var(--transition-smooth)]",
                  isCurrentMonth && d === today
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {d}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};