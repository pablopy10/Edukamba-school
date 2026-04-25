import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Filter, Plus, MoreHorizontal, Pencil, Trash2, Contact, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type SubjectArea = "Exactas" | "Humanas" | "Linguagens" | "Artes" | "Tecnologia";

type Subject = {
  id: string;
  name: string;
  code: string;
  area: SubjectArea;
  teacher: string;
  weeklyHours: number;
  classes: number;
  color: "lilac" | "blue" | "yellow" | "green" | "pink";
};

const subjects: Subject[] = [
  { id: "1", name: "Matemática", code: "MAT-101", area: "Exactas", teacher: "Carla Mendes", weeklyHours: 6, classes: 12, color: "blue" },
  { id: "2", name: "Física", code: "FIS-102", area: "Exactas", teacher: "Tiago Ferreira", weeklyHours: 4, classes: 8, color: "yellow" },
  { id: "3", name: "Química", code: "QUI-103", area: "Exactas", teacher: "Rui Pereira", weeklyHours: 4, classes: 8, color: "green" },
  { id: "4", name: "Biologia", code: "BIO-104", area: "Exactas", teacher: "Sofia Almeida", weeklyHours: 4, classes: 9, color: "pink" },
  { id: "5", name: "Português", code: "POR-201", area: "Linguagens", teacher: "Helena Costa", weeklyHours: 6, classes: 14, color: "lilac" },
  { id: "6", name: "Inglês", code: "ING-202", area: "Linguagens", teacher: "Marta Dias", weeklyHours: 3, classes: 10, color: "blue" },
  { id: "7", name: "História", code: "HIS-301", area: "Humanas", teacher: "Bruno Santos", weeklyHours: 3, classes: 8, color: "yellow" },
  { id: "8", name: "Geografia", code: "GEO-302", area: "Humanas", teacher: "Inês Rocha", weeklyHours: 3, classes: 8, color: "green" },
  { id: "9", name: "Educação Física", code: "EDF-401", area: "Artes", teacher: "Pedro Lima", weeklyHours: 2, classes: 16, color: "pink" },
  { id: "10", name: "Informática", code: "INF-501", area: "Tecnologia", teacher: "André Nunes", weeklyHours: 4, classes: 6, color: "lilac" },
];

const colorStyles: Record<Subject["color"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const areaStyles: Record<SubjectArea, string> = {
  Exactas: "bg-pastel-blue text-pastel-blue-foreground",
  Humanas: "bg-pastel-yellow text-pastel-yellow-foreground",
  Linguagens: "bg-pastel-pink text-pastel-pink-foreground",
  Artes: "bg-pastel-green text-pastel-green-foreground",
  Tecnologia: "bg-pastel-lilac text-pastel-lilac-foreground",
};

const Disciplinas = () => {
  const [selected, setSelected] = useState<string[]>(["2"]);
  const [search, setSearch] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = selected.length === subjects.length;
  const toggleAll = () => setSelected(allSelected ? [] : subjects.map((s) => s.id));

  const filtered = subjects.filter((s) =>
    [s.name, s.code, s.teacher, s.area].some((f) => f.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Disciplinas</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão das disciplinas e cargas horárias.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar disciplina..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Nova Disciplina
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[
            { label: "Total", value: "42", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Exactas", value: "12", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Humanas", value: "10", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Linguagens", value: "8", color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: "Tecnologia", value: "6", color: "bg-pastel-lilac text-pastel-lilac-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">Lista de Disciplinas</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionadas</span>
                <button className="rounded-full bg-pastel-pink px-3 py-1.5 text-xs font-medium text-pastel-pink-foreground">
                  Eliminar
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                  <th className="w-12 py-4 pl-5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                    />
                  </th>
                  <th className="py-4 pr-4 font-semibold">Disciplina</th>
                  <th className="py-4 pr-4 font-semibold">Código</th>
                  <th className="py-4 pr-4 font-semibold">Área</th>
                  <th className="py-4 pr-4 font-semibold">Professor</th>
                  <th className="py-4 pr-4 font-semibold">Carga Semanal</th>
                  <th className="py-4 pr-4 font-semibold">Turmas</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const isSelected = selected.includes(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(s.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", colorStyles[s.color])}>
                            <Contact className="h-5 w-5" strokeWidth={1.75} />
                          </div>
                          <p className="font-semibold text-foreground">{s.name}</p>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{s.code}</td>
                      <td className="py-4 pr-4">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", areaStyles[s.area])}>{s.area}</span>
                      </td>
                      <td className="py-4 pr-4 text-muted-foreground">{s.teacher}</td>
                      <td className="py-4 pr-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                          <Clock className="h-3 w-3" strokeWidth={2} />
                          {s.weeklyHours}h
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                          <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {s.classes}
                        </span>
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              A mostrar 1–{filtered.length} de {subjects.length} disciplinas
            </p>
            <div className="flex items-center gap-2">
              <button className="h-9 rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent">Anterior</button>
              {[1, 2, 3].map((p) => (
                <button
                  key={p}
                  className={cn(
                    "h-9 w-9 rounded-full text-xs font-semibold transition-colors",
                    p === 1
                      ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p}
                </button>
              ))}
              <button className="h-9 rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent">Seguinte</button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Disciplinas;
