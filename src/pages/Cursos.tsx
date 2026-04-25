import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Filter, Plus, MoreHorizontal, Users, Clock, Pencil, Trash2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type CourseLevel = "Básico" | "Médio" | "Avançado";

type Course = {
  id: string;
  name: string;
  code: string;
  coordinator: string;
  level: CourseLevel;
  duration: string;
  students: number;
  classes: number;
  color: "lilac" | "blue" | "yellow" | "green" | "pink";
};

const courses: Course[] = [
  { id: "1", name: "Ciências Naturais", code: "CN-2025", coordinator: "Carla Mendes", level: "Médio", duration: "3 anos", students: 184, classes: 6, color: "blue" },
  { id: "2", name: "Letras Modernas", code: "LM-2025", coordinator: "Helena Costa", level: "Médio", duration: "3 anos", students: 142, classes: 5, color: "pink" },
  { id: "3", name: "Económicas", code: "EC-2025", coordinator: "Tiago Ferreira", level: "Avançado", duration: "4 anos", students: 98, classes: 4, color: "yellow" },
  { id: "4", name: "Artes Visuais", code: "AV-2025", coordinator: "Sofia Almeida", level: "Básico", duration: "2 anos", students: 76, classes: 3, color: "lilac" },
  { id: "5", name: "Informática", code: "IN-2025", coordinator: "André Nunes", level: "Avançado", duration: "4 anos", students: 124, classes: 4, color: "green" },
  { id: "6", name: "História e Geografia", code: "HG-2025", coordinator: "Bruno Santos", level: "Médio", duration: "3 anos", students: 88, classes: 3, color: "pink" },
  { id: "7", name: "Línguas Estrangeiras", code: "LE-2025", coordinator: "Marta Dias", level: "Básico", duration: "2 anos", students: 156, classes: 5, color: "blue" },
  { id: "8", name: "Educação Física", code: "EF-2025", coordinator: "Pedro Lima", level: "Básico", duration: "2 anos", students: 210, classes: 7, color: "yellow" },
];

const colorStyles: Record<Course["color"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const levelStyles: Record<CourseLevel, string> = {
  Básico: "bg-pastel-green text-pastel-green-foreground",
  Médio: "bg-pastel-blue text-pastel-blue-foreground",
  Avançado: "bg-pastel-lilac text-pastel-lilac-foreground",
};

const Cursos = () => {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filtered = courses.filter((c) =>
    [c.name, c.code, c.coordinator].some((f) => f.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Cursos</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão de todos os cursos oferecidos pela escola.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar curso..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo Curso
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Cursos", value: "24", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Cursos Activos", value: "21", color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Em Planeamento", value: "3", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Total de Turmas", value: "78", color: "bg-pastel-lilac text-pastel-lilac-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Catálogo de Cursos</h2>
          <div className="flex rounded-full border border-border bg-card p-1 shadow-soft">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                view === "grid" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground",
              )}
            >
              Grelha
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                view === "list" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground",
              )}
            >
              Lista
            </button>
          </div>
        </div>

        {view === "grid" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((c) => (
              <div key={c.id} className="group flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card transition-transform hover:-translate-y-1">
                <div className="flex items-start justify-between">
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", colorStyles[c.color])}>
                    <BookOpen className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <button className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground">{c.code}</p>
                  <h3 className="mt-1 text-base font-bold text-foreground">{c.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Coord. {c.coordinator}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-3 py-1 text-xs font-medium", levelStyles[c.level])}>{c.level}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                    <Clock className="h-3 w-3" strokeWidth={2} />
                    {c.duration}
                  </span>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {c.students} alunos
                  </span>
                  <span>{c.classes} turmas</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-card shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                    <th className="py-4 pl-5 pr-4 font-semibold">Curso</th>
                    <th className="py-4 pr-4 font-semibold">Código</th>
                    <th className="py-4 pr-4 font-semibold">Coordenador</th>
                    <th className="py-4 pr-4 font-semibold">Nível</th>
                    <th className="py-4 pr-4 font-semibold">Duração</th>
                    <th className="py-4 pr-4 font-semibold">Alunos</th>
                    <th className="py-4 pr-4 font-semibold">Turmas</th>
                    <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                      <td className="py-4 pl-5 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", colorStyles[c.color])}>
                            <BookOpen className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <p className="font-semibold text-foreground">{c.name}</p>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{c.code}</td>
                      <td className="py-4 pr-4 text-muted-foreground">{c.coordinator}</td>
                      <td className="py-4 pr-4">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", levelStyles[c.level])}>{c.level}</span>
                      </td>
                      <td className="py-4 pr-4 text-muted-foreground">{c.duration}</td>
                      <td className="py-4 pr-4 text-foreground">{c.students}</td>
                      <td className="py-4 pr-4 text-foreground">{c.classes}</td>
                      <td className="py-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button title="Editar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground">
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground">
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button title="Mais" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted">
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Cursos;
