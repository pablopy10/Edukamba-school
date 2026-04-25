import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  Music2,
  Trophy,
  Palette,
  Code2,
  BookOpen,
  Theater,
  Users,
  Clock,
  MapPin,
  UserPlus,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityCategory = "musica" | "desporto" | "arte" | "tecnologia" | "academico" | "teatro";

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 0;

type Activity = {
  id: string;
  name: string;
  category: ActivityCategory;
  responsible: string;
  location: string;
  weekdays: Weekday[]; // recurring days
  startTime: string;
  endTime: string;
  capacity: number;
  enrolled: string[]; // student names
  description?: string;
};

const categoryMeta: Record<ActivityCategory, { label: string; color: string; icon: typeof Music2 }> = {
  musica: { label: "Música", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Music2 },
  desporto: { label: "Desporto", color: "bg-pastel-green text-pastel-green-foreground", icon: Trophy },
  arte: { label: "Arte", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Palette },
  tecnologia: { label: "Tecnologia", color: "bg-pastel-blue text-pastel-blue-foreground", icon: Code2 },
  academico: { label: "Académico", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: BookOpen },
  teatro: { label: "Teatro", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Theater },
};

const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const weekdayFull = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const initialActivities: Activity[] = [
  {
    id: "a1",
    name: "Coro Escolar",
    category: "musica",
    responsible: "Prof. Mariana Costa",
    location: "Sala de Música",
    weekdays: [2, 4],
    startTime: "15:30",
    endTime: "17:00",
    capacity: 25,
    enrolled: ["Ana Silva", "João Pereira", "Beatriz Lopes", "Carlos Mendes"],
  },
  {
    id: "a2",
    name: "Clube de Futebol",
    category: "desporto",
    responsible: "Prof. Ricardo Alves",
    location: "Campo Desportivo",
    weekdays: [1, 3, 5],
    startTime: "16:00",
    endTime: "17:30",
    capacity: 30,
    enrolled: ["Pedro Santos", "Miguel Rocha", "Tiago Nunes", "Diogo Sousa", "Rui Martins"],
  },
  {
    id: "a3",
    name: "Atelier de Pintura",
    category: "arte",
    responsible: "Prof. Helena Rodrigues",
    location: "Sala de Artes",
    weekdays: [3],
    startTime: "14:00",
    endTime: "16:00",
    capacity: 20,
    enrolled: ["Sofia Almeida", "Inês Carvalho"],
  },
  {
    id: "a4",
    name: "Robótica & Programação",
    category: "tecnologia",
    responsible: "Prof. André Ferreira",
    location: "Laboratório TIC",
    weekdays: [2, 5],
    startTime: "15:00",
    endTime: "17:00",
    capacity: 18,
    enrolled: ["Lucas Oliveira", "Mateus Dias", "Rafael Gomes"],
  },
  {
    id: "a5",
    name: "Clube de Leitura",
    category: "academico",
    responsible: "Prof. Teresa Pinto",
    location: "Biblioteca",
    weekdays: [4],
    startTime: "13:30",
    endTime: "14:30",
    capacity: 15,
    enrolled: ["Mariana Reis", "Catarina Vieira"],
  },
  {
    id: "a6",
    name: "Grupo de Teatro",
    category: "teatro",
    responsible: "Prof. Vasco Lima",
    location: "Auditório",
    weekdays: [1, 4],
    startTime: "16:30",
    endTime: "18:30",
    capacity: 22,
    enrolled: ["Leonor Brito", "Francisco Tavares", "Margarida Sá"],
  },
  {
    id: "a7",
    name: "Basquetebol",
    category: "desporto",
    responsible: "Prof. Sandra Moreira",
    location: "Pavilhão",
    weekdays: [2, 5],
    startTime: "17:00",
    endTime: "18:30",
    capacity: 24,
    enrolled: ["Hugo Castro", "Bruno Faria"],
  },
];

const monthsPt = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const Extracurriculares = () => {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "todas">("todas");
  const [cursor, setCursor] = useState(new Date());
  const [enrollOpen, setEnrollOpen] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      const matchSearch =
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.responsible.toLowerCase().includes(search.toLowerCase()) ||
        a.location.toLowerCase().includes(search.toLowerCase());
      const matchCategory = categoryFilter === "todas" || a.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [activities, search, categoryFilter]);

  const totalEnrolled = activities.reduce((sum, a) => sum + a.enrolled.length, 0);
  const totalCapacity = activities.reduce((sum, a) => sum + a.capacity, 0);

  const enroll = (id: string) => {
    if (!studentName.trim()) return;
    setActivities((prev) =>
      prev.map((a) =>
        a.id === id && a.enrolled.length < a.capacity && !a.enrolled.includes(studentName.trim())
          ? { ...a, enrolled: [...a.enrolled, studentName.trim()] }
          : a,
      ),
    );
    setStudentName("");
    setEnrollOpen(null);
  };

  // Calendar grid
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const activitiesForDay = (date: Date) => {
    const wd = date.getDay() as Weekday;
    return filtered.filter((a) => a.weekdays.includes(wd));
  };

  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Extracurriculares</h1>
            <p className="text-sm text-muted-foreground">Gerir atividades recorrentes e inscrições de alunos</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90 transition-[var(--transition-smooth)]">
            <Plus className="h-4 w-4" />
            Nova Atividade
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Atividades</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{activities.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Alunos Inscritos</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{totalEnrolled}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Capacidade Total</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{totalCapacity}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Ocupação</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {totalCapacity ? Math.round((totalEnrolled / totalCapacity) * 100) : 0}%
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por nome, responsável ou local…"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-1">
            <button
              onClick={() => setView("lista")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-[var(--transition-smooth)]",
                view === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              onClick={() => setView("calendario")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-[var(--transition-smooth)]",
                view === "calendario" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendário
            </button>
          </div>
        </div>

        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <button
            onClick={() => setCategoryFilter("todas")}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-[var(--transition-smooth)]",
              categoryFilter === "todas" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-secondary",
            )}
          >
            Todas
          </button>
          {(Object.keys(categoryMeta) as ActivityCategory[]).map((cat) => {
            const meta = categoryMeta[cat];
            const Icon = meta.icon;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-[var(--transition-smooth)]",
                  active ? meta.color : "bg-muted text-muted-foreground hover:bg-secondary",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>

        {view === "lista" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((a) => {
              const meta = categoryMeta[a.category];
              const Icon = meta.icon;
              const occupancy = Math.round((a.enrolled.length / a.capacity) * 100);
              return (
                <div key={a.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", meta.color)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{a.name}</h3>
                        <span className={cn("inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.color)}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      <span>{a.responsible}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>{a.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {a.startTime} – {a.endTime}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {a.weekdays.map((wd) => (
                        <span key={wd} className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                          {weekdayNames[wd]}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">
                        {a.enrolled.length}/{a.capacity} inscritos
                      </span>
                      <span className="text-muted-foreground">{occupancy}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(occupancy, 100)}%` }}
                      />
                    </div>
                  </div>

                  {enrollOpen === a.id ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
                      <input
                        autoFocus
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="Nome do aluno"
                        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        onKeyDown={(e) => e.key === "Enter" && enroll(a.id)}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => enroll(a.id)}
                          className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => {
                            setEnrollOpen(null);
                            setStudentName("");
                          }}
                          className="flex-1 rounded-lg bg-secondary py-1.5 text-xs font-semibold text-foreground hover:opacity-90"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEnrollOpen(a.id)}
                      disabled={a.enrolled.length >= a.capacity}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-pastel-lilac px-3 py-2 text-xs font-semibold text-pastel-lilac-foreground hover:opacity-90 transition-[var(--transition-smooth)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {a.enrolled.length >= a.capacity ? "Lotada" : "Inscrever Aluno"}
                    </button>
                  )}

                  {a.enrolled.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Inscritos
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.enrolled.slice(0, 5).map((s) => (
                          <span key={s} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-foreground">
                            {s}
                          </span>
                        ))}
                        {a.enrolled.length > 5 && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            +{a.enrolled.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                Nenhuma atividade encontrada.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between pb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {monthsPt[month]} {year}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCursor(new Date())}
                  className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:opacity-90"
                >
                  Hoje
                </button>
                <button
                  onClick={() => setCursor(new Date(year, month - 1, 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground hover:opacity-90"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setCursor(new Date(year, month + 1, 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-foreground hover:opacity-90"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 pb-2">
              {weekdayFull.map((d) => (
                <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {d.slice(0, 3)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, i) => {
                if (!date) return <div key={i} className="h-28 rounded-lg bg-muted/30" />;
                const dayActs = activitiesForDay(date);
                const isToday = isSameDay(date, today);
                return (
                  <div
                    key={i}
                    className={cn(
                      "h-28 overflow-hidden rounded-lg border p-1.5 transition-[var(--transition-smooth)]",
                      isToday ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    <div className={cn("mb-1 text-xs font-semibold", isToday ? "text-primary" : "text-foreground")}>
                      {date.getDate()}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayActs.slice(0, 3).map((a) => {
                        const meta = categoryMeta[a.category];
                        return (
                          <div
                            key={a.id}
                            className={cn("truncate rounded px-1.5 py-0.5 text-[10px] font-semibold", meta.color)}
                            title={`${a.name} • ${a.startTime}-${a.endTime}`}
                          >
                            {a.startTime} {a.name}
                          </div>
                        );
                      })}
                      {dayActs.length > 3 && (
                        <div className="text-[10px] font-semibold text-muted-foreground">+{dayActs.length - 3} mais</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Extracurriculares;
