import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Filter,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  FileText,
  GraduationCap,
  Users,
  PencilLine,
  Clock,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EvalType = "teste" | "exame" | "trabalho" | "oral";

type Evaluation = {
  id: string;
  title: string;
  subject: string;
  type: EvalType;
  turma: string;
  teacher: string;
  date: string; // ISO yyyy-mm-dd
  startTime: string;
  endTime: string;
  room: string;
  weight: number; // %
};

const typeMeta: Record<EvalType, { label: string; color: string; icon: typeof FileText }> = {
  teste: { label: "Teste", color: "bg-pastel-blue text-pastel-blue-foreground", icon: PencilLine },
  exame: { label: "Exame", color: "bg-pastel-pink text-pastel-pink-foreground", icon: GraduationCap },
  trabalho: { label: "Trabalho de Grupo", color: "bg-pastel-green text-pastel-green-foreground", icon: Users },
  oral: { label: "Oral", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: FileText },
};

const evaluations: Evaluation[] = [
  { id: "1", title: "Teste de Funções", subject: "Matemática", type: "teste", turma: "10º A", teacher: "Carla Mendes", date: "2026-04-27", startTime: "08:00", endTime: "09:30", room: "Sala 12", weight: 30 },
  { id: "2", title: "Exame Final", subject: "Português", type: "exame", turma: "12º B", teacher: "Marta Dias", date: "2026-04-28", startTime: "09:00", endTime: "11:00", room: "Auditório", weight: 50 },
  { id: "3", title: "Trabalho — Sistema Solar", subject: "Física", type: "trabalho", turma: "9º C", teacher: "Rui Pereira", date: "2026-04-29", startTime: "10:00", endTime: "12:00", room: "Lab 02", weight: 20 },
  { id: "4", title: "Oral de Inglês", subject: "Inglês", type: "oral", turma: "10º A", teacher: "Sofia Almeida", date: "2026-04-30", startTime: "14:00", endTime: "15:00", room: "Sala 07", weight: 15 },
  { id: "5", title: "Teste de Química", subject: "Química", type: "teste", turma: "11º A", teacher: "Tiago Ferreira", date: "2026-05-04", startTime: "08:30", endTime: "10:00", room: "Lab 01", weight: 25 },
  { id: "6", title: "Trabalho — Renascimento", subject: "História", type: "trabalho", turma: "10º B", teacher: "Helena Costa", date: "2026-05-05", startTime: "11:00", endTime: "12:30", room: "Sala 04", weight: 20 },
  { id: "7", title: "Exame Nacional", subject: "Matemática", type: "exame", turma: "12º B", teacher: "Carla Mendes", date: "2026-05-06", startTime: "09:00", endTime: "12:00", room: "Auditório", weight: 60 },
  { id: "8", title: "Teste de Geografia", subject: "Geografia", type: "teste", turma: "9º B", teacher: "Pedro Lima", date: "2026-05-07", startTime: "10:00", endTime: "11:30", room: "Sala 09", weight: 25 },
  { id: "9", title: "Trabalho de Filosofia", subject: "Filosofia", type: "trabalho", turma: "11º A", teacher: "Bruno Santos", date: "2026-05-12", startTime: "14:00", endTime: "16:00", room: "Sala 15", weight: 20 },
  { id: "10", title: "Oral de Biologia", subject: "Biologia", type: "oral", turma: "10º A", teacher: "Rui Pereira", date: "2026-05-14", startTime: "08:00", endTime: "09:00", room: "Lab 02", weight: 15 },
  { id: "11", title: "Teste de Física", subject: "Física", type: "teste", turma: "11º A", teacher: "Rui Pereira", date: "2026-05-18", startTime: "10:00", endTime: "11:30", room: "Lab 02", weight: 30 },
  { id: "12", title: "Exame de Inglês", subject: "Inglês", type: "exame", turma: "12º B", teacher: "Sofia Almeida", date: "2026-05-21", startTime: "09:00", endTime: "11:00", room: "Sala 07", weight: 50 },
];

type View = "calendario" | "lista";
type TypeFilter = EvalType | "all";

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const formatDateLong = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")} ${monthNames[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};

const Avaliacoes = () => {
  const [view, setView] = useState<View>("calendario");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(() => new Date(2026, 3, 1)); // April 2026
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return evaluations.filter((e) => {
      const matchesType = typeFilter === "all" || e.type === typeFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q) ||
        e.turma.toLowerCase().includes(q) ||
        e.teacher.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [typeFilter, search]);

  const stats = useMemo(() => {
    return {
      total: filtered.length,
      testes: filtered.filter((e) => e.type === "teste").length,
      exames: filtered.filter((e) => e.type === "exame").length,
      trabalhos: filtered.filter((e) => e.type === "trabalho").length,
    };
  }, [filtered]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Avaliações</h1>
            <p className="text-sm text-muted-foreground">
              Gerir testes, exames, trabalhos de grupo e provas orais.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* View switcher */}
            <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
              <button
                onClick={() => setView("calendario")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "calendario"
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
                Calendário
              </button>
              <button
                onClick={() => setView("lista")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "lista"
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-4 w-4" strokeWidth={1.75} />
                Lista
              </button>
            </div>

            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Nova Avaliação
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: "Testes", value: stats.testes, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Exames", value: stats.exames, color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: "Trabalhos", value: stats.trabalhos, color: "bg-pastel-green text-pastel-green-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>
                {s.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search + type chips */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar avaliação, turma ou professor..."
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TypeChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} className="bg-muted text-foreground">
              Todas
            </TypeChip>
            {(Object.keys(typeMeta) as EvalType[]).map((t) => (
              <TypeChip
                key={t}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
                className={typeMeta[t].color}
              >
                {typeMeta[t].label}
              </TypeChip>
            ))}
          </div>
        </div>

        {view === "calendario" ? (
          <CalendarView
            cursor={cursor}
            setCursor={setCursor}
            evaluations={filtered}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
        ) : (
          <ListView evaluations={filtered} />
        )}
      </div>
    </DashboardLayout>
  );
};

const TypeChip = ({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
      active ? cn(className, "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card") : "bg-muted text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

/* ======================= Calendar View ======================= */
const CalendarView = ({
  cursor,
  setCursor,
  evaluations,
  selectedDate,
  setSelectedDate,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  evaluations: Evaluation[];
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
}) => {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { date: Date | null; iso: string | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, iso });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Evaluation[]>();
    evaluations.forEach((e) => {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    });
    return map;
  }, [evaluations]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <h2 className="text-base font-bold text-foreground">
              {monthNames[month]} {year}
            </h2>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <button
            onClick={() => {
              setCursor(new Date());
              setSelectedDate(todayIso);
            }}
            className="rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            Hoje
          </button>
        </div>

        <div className="p-4">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {weekdayLabels.map((d) => (
              <div
                key={d}
                className="rounded-xl bg-muted py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {cells.map((c, i) => {
              if (!c.date || !c.iso) {
                return <div key={i} className="min-h-[92px] rounded-xl bg-muted/20" />;
              }
              const events = eventsByDate.get(c.iso) ?? [];
              const isToday = c.iso === todayIso;
              const isSelected = c.iso === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(c.iso)}
                  className={cn(
                    "flex min-h-[92px] flex-col items-stretch gap-1 rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5",
                    isSelected
                      ? "border-pastel-blue-foreground bg-pastel-blue/30"
                      : "border-border bg-background",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                        isToday
                          ? "bg-pastel-blue text-pastel-blue-foreground"
                          : "text-foreground",
                      )}
                    >
                      {c.date.getDate()}
                    </span>
                    {events.length > 0 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {events.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {events.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className={cn(
                          "truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          typeMeta[e.type].color,
                        )}
                      >
                        {e.title}
                      </span>
                    ))}
                    {events.length > 2 && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        +{events.length - 2} mais
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day detail */}
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Detalhe do dia
            </p>
            <h3 className="mt-1 text-base font-bold text-foreground">
              {selectedDate ? formatDateLong(selectedDate) : "Selecione uma data"}
            </h3>
          </div>
        </div>

        {selectedDate && selectedEvents.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Sem avaliações neste dia.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {selectedEvents.map((e) => {
            const Icon = typeMeta[e.type].icon;
            return (
              <div key={e.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", typeMeta[e.type].color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{e.subject} · {e.turma}</p>
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", typeMeta[e.type].color)}>
                    {typeMeta[e.type].label}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" strokeWidth={1.75} />
                    {e.startTime} – {e.endTime}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" strokeWidth={1.75} />
                    {e.room}
                  </span>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">
                    {e.weight}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ======================= List View ======================= */
const ListView = ({ evaluations }: { evaluations: Evaluation[] }) => {
  const sorted = [...evaluations].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Lista de Avaliações</h2>
        <span className="text-xs text-muted-foreground">{sorted.length} resultado(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Data</th>
              <th className="px-6 py-3">Avaliação</th>
              <th className="px-6 py-3">Tipo</th>
              <th className="px-6 py-3">Turma</th>
              <th className="px-6 py-3">Professor</th>
              <th className="px-6 py-3">Local</th>
              <th className="px-6 py-3 text-right">Peso</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const Icon = typeMeta[e.type].icon;
              return (
                <tr key={e.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{formatDateLong(e.date)}</span>
                      <span className="text-xs text-muted-foreground">
                        {e.startTime} – {e.endTime}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", typeMeta[e.type].color)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{e.subject}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", typeMeta[e.type].color)}>
                      {typeMeta[e.type].label}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">{e.turma}</td>
                  <td className="px-6 py-4 text-muted-foreground">{e.teacher}</td>
                  <td className="px-6 py-4 text-muted-foreground">{e.room}</td>
                  <td className="px-6 py-4 text-right font-semibold text-foreground">{e.weight}%</td>
                  <td className="px-6 py-4 text-right">
                    <button className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  Sem avaliações para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Avaliacoes;