import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Filter, Plus, MoreHorizontal, Users, Pencil, Trash2, Presentation, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

type ClassShift = "Manhã" | "Tarde" | "Noite";

type SchoolClass = {
  id: string;
  name: string;
  code: string;
  course: string;
  teacher: string;
  room: string;
  shift: ClassShift;
  students: number;
  capacity: number;
  color: "lilac" | "blue" | "yellow" | "green" | "pink";
};

const classes: SchoolClass[] = [
  { id: "1", name: "10º A", code: "T-10A-25", course: "Ciências Naturais", teacher: "Carla Mendes", room: "Sala 12", shift: "Manhã", students: 32, capacity: 35, color: "blue" },
  { id: "2", name: "12º B", code: "T-12B-25", course: "Letras Modernas", teacher: "Helena Costa", room: "Sala 04", shift: "Manhã", students: 28, capacity: 30, color: "pink" },
  { id: "3", name: "9º B", code: "T-09B-25", course: "Económicas", teacher: "Tiago Ferreira", room: "Sala 18", shift: "Tarde", students: 30, capacity: 32, color: "yellow" },
  { id: "4", name: "11º A", code: "T-11A-25", course: "Ciências Naturais", teacher: "Rui Pereira", room: "Sala 22", shift: "Manhã", students: 26, capacity: 30, color: "green" },
  { id: "5", name: "8º B", code: "T-08B-25", course: "Artes Visuais", teacher: "Sofia Almeida", room: "Sala 07", shift: "Tarde", students: 24, capacity: 28, color: "lilac" },
  { id: "6", name: "9º C", code: "T-09C-25", course: "Letras Modernas", teacher: "Bruno Santos", room: "Sala 15", shift: "Noite", students: 22, capacity: 30, color: "pink" },
  { id: "7", name: "7º C", code: "T-07C-25", course: "Línguas Estrangeiras", teacher: "Marta Dias", room: "Sala 03", shift: "Manhã", students: 31, capacity: 32, color: "blue" },
  { id: "8", name: "10º B", code: "T-10B-25", course: "Económicas", teacher: "Pedro Lima", room: "Sala 09", shift: "Tarde", students: 29, capacity: 30, color: "yellow" },
];

const colorStyles: Record<SchoolClass["color"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const shiftStyles: Record<ClassShift, string> = {
  Manhã: "bg-pastel-yellow text-pastel-yellow-foreground",
  Tarde: "bg-pastel-blue text-pastel-blue-foreground",
  Noite: "bg-pastel-lilac text-pastel-lilac-foreground",
};

const Turmas = () => {
  const [search, setSearch] = useState("");

  const filtered = classes.filter((c) =>
    [c.name, c.code, c.course, c.teacher, c.room].some((f) => f.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Turmas</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão de todas as turmas da escola.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar turma..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Nova Turma
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Turmas", value: "78", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Manhã", value: "42", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Tarde", value: "26", color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Noite", value: "10", color: "bg-pastel-lilac text-pastel-lilac-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => {
            const occupancy = Math.round((c.students / c.capacity) * 100);
            return (
              <div key={c.id} className="group flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card transition-transform hover:-translate-y-1">
                <div className="flex items-start justify-between">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", colorStyles[c.color])}>
                    <Presentation className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">{c.code}</p>
                  <h3 className="mt-1 text-base font-bold text-foreground">{c.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{c.course}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-3 py-1 text-xs font-medium", shiftStyles[c.shift])}>{c.shift}</span>
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{c.room}</span>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5" strokeWidth={1.75} />
                  <span className="truncate">{c.teacher}</span>
                </div>

                <div className="mt-auto space-y-2 border-t border-border pt-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {c.students}/{c.capacity} alunos
                    </span>
                    <span className="font-semibold text-foreground">{occupancy}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", colorStyles[c.color])}
                      style={{ width: `${occupancy}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Turmas;
