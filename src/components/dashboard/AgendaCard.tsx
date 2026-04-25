import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const palette = [
  "bg-pastel-lilac text-pastel-lilac-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-pink text-pastel-pink-foreground",
  "bg-pastel-green text-pastel-green-foreground",
];

interface AgendaCardProps {
  items: { id: string; time: string; grade: string; title: string }[];
}

export const AgendaCard = ({ items }: AgendaCardProps) => {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Agenda</h3>
        <button className="rounded-full p-1 text-muted-foreground hover:bg-accent">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
            Sem aulas agendadas para hoje.
          </p>
        )}
        {items.map((it, i) => (
          <div key={it.id} className={cn("flex items-center gap-4 rounded-xl p-3", palette[i % palette.length])}>
            <span className="shrink-0 text-sm font-semibold opacity-80">{it.time}</span>
            <div className="min-w-0">
              <p className="text-xs font-medium opacity-70">{it.grade}</p>
              <p className="truncate text-sm font-bold">{it.title}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};