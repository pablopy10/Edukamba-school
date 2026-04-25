import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { time: "08:00", grade: "Todas as séries", title: "Acolhida & Avisos", color: "bg-pastel-lilac text-pastel-lilac-foreground" },
  { time: "10:00", grade: "Séries 3-5", title: "Revisão & Prática de Matemática", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  { time: "10:30", grade: "Séries 6-8", title: "Experimento de Ciências & Discussão", color: "bg-pastel-blue text-pastel-blue-foreground" },
];

export const AgendaCard = () => {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Agenda</h3>
        <button className="rounded-full p-1 text-muted-foreground hover:bg-accent">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <div key={it.time} className={cn("flex items-center gap-4 rounded-xl p-3", it.color)}>
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