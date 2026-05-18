import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const WEEK_FALLBACK_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_LONG_FALLBACK_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface CalendarCardProps {
  selectedDate: Date;
  onSelect: (date: Date) => void;
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const CalendarCard = ({ selectedDate, onSelect }: CalendarCardProps) => {
  const { t, i18n } = useTranslation("common");
  const weekdaysShort = useMemo(() => {
    const arr = t("dashboard.calendar_weekdays_short", { returnObjects: true });
    return Array.isArray(arr) && arr.length === 7 ? (arr as string[]) : WEEK_FALLBACK_PT;
  }, [t, i18n.language]);
  const monthNamesLong = useMemo(() => {
    const arr = t("dashboard.calendar_months_long", { returnObjects: true });
    return Array.isArray(arr) && arr.length === 12 ? (arr as string[]) : MONTH_LONG_FALLBACK_PT;
  }, [t, i18n.language]);

  const today = new Date();
  const [cursor, setCursor] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          aria-label={t("dashboard.calendar.prev_month_aria")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="text-base font-bold text-foreground">{monthNamesLong[month]} {year}</h3>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          aria-label={t("dashboard.calendar.next_month_aria")}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdaysShort.map((d, idx) => (
          <p key={`cal-wd-${idx}`} className="py-1 text-[11px] font-medium text-muted-foreground">{d}</p>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="h-10" />;
          const cellDate = new Date(year, month, d);
          const isToday = isSameDay(cellDate, today);
          const isSelected = isSameDay(cellDate, selectedDate);
          return (
            <div key={i} className="flex h-10 items-center justify-center">
              <button
                type="button"
                onClick={() => onSelect(cellDate)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold transition-[var(--transition-smooth)]",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-foreground hover:bg-accent",
                )}
              >
                {d}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
