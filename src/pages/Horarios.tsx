import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Filter, Plus, Printer, Download, ChevronDown, Clock, MapPin, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Subject = {
  name: string;
  teacher: string;
  room: string;
  color: "lilac" | "blue" | "yellow" | "green" | "pink";
};

type ScheduleCell = Subject | "BREAK" | null;

const colorStyles: Record<Subject["color"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;

const slots = [
  { start: "07:30", end: "08:20" },
  { start: "08:20", end: "09:10" },
  { start: "09:10", end: "10:00" },
  { start: "10:00", end: "10:20", isBreak: true, label: "Intervalo" },
  { start: "10:20", end: "11:10" },
  { start: "11:10", end: "12:00" },
  { start: "12:00", end: "12:50" },
];

const turmas = ["7º C", "8º B", "9º B", "9º C", "10º A", "10º B", "11º A", "12º B"];

// Mock schedule per turma
const schedules: Record<string, ScheduleCell[][]> = {
  "10º A": [
    [
      { name: "Matemática", teacher: "Carla Mendes", room: "Sala 12", color: "blue" },
      { name: "Português", teacher: "Marta Dias", room: "Sala 03", color: "lilac" },
      { name: "Física", teacher: "Rui Pereira", room: "Lab 02", color: "green" },
      { name: "História", teacher: "Helena Costa", room: "Sala 04", color: "yellow" },
      { name: "Inglês", teacher: "Sofia Almeida", room: "Sala 07", color: "pink" },
    ],
    [
      { name: "Matemática", teacher: "Carla Mendes", room: "Sala 12", color: "blue" },
      { name: "Português", teacher: "Marta Dias", room: "Sala 03", color: "lilac" },
      { name: "Química", teacher: "Tiago Ferreira", room: "Lab 01", color: "green" },
      { name: "Geografia", teacher: "Pedro Lima", room: "Sala 09", color: "yellow" },
      { name: "Inglês", teacher: "Sofia Almeida", room: "Sala 07", color: "pink" },
    ],
    [
      { name: "Biologia", teacher: "Rui Pereira", room: "Lab 02", color: "green" },
      { name: "Filosofia", teacher: "Bruno Santos", room: "Sala 15", color: "lilac" },
      { name: "Química", teacher: "Tiago Ferreira", room: "Lab 01", color: "green" },
      { name: "Educação Física", teacher: "Pedro Lima", room: "Pavilhão", color: "blue" },
      { name: "Artes", teacher: "Sofia Almeida", room: "Sala 07", color: "pink" },
    ],
    ["BREAK", "BREAK", "BREAK", "BREAK", "BREAK"],
    [
      { name: "Português", teacher: "Marta Dias", room: "Sala 03", color: "lilac" },
      { name: "Matemática", teacher: "Carla Mendes", room: "Sala 12", color: "blue" },
      { name: "Inglês", teacher: "Sofia Almeida", room: "Sala 07", color: "pink" },
      { name: "Biologia", teacher: "Rui Pereira", room: "Lab 02", color: "green" },
      { name: "Matemática", teacher: "Carla Mendes", room: "Sala 12", color: "blue" },
    ],
    [
      { name: "História", teacher: "Helena Costa", room: "Sala 04", color: "yellow" },
      { name: "Física", teacher: "Rui Pereira", room: "Lab 02", color: "green" },
      { name: "Filosofia", teacher: "Bruno Santos", room: "Sala 15", color: "lilac" },
      { name: "Educação Física", teacher: "Pedro Lima", room: "Pavilhão", color: "blue" },
      { name: "Geografia", teacher: "Pedro Lima", room: "Sala 09", color: "yellow" },
    ],
    [
      null,
      { name: "Estudo", teacher: "—", room: "Biblioteca", color: "yellow" },
      null,
      { name: "Artes", teacher: "Sofia Almeida", room: "Sala 07", color: "pink" },
      null,
    ],
  ],
};

const buildDefault = (): ScheduleCell[][] => schedules["10º A"];

const Horarios = () => {
  const [turma, setTurma] = useState("10º A");
  const [openTurma, setOpenTurma] = useState(false);
  const schedule = schedules[turma] ?? buildDefault();

  const totalAulas = schedule.flat().filter((c) => c && c !== "BREAK").length;
  const disciplinasUnicas = new Set(
    schedule.flat().filter((c): c is Subject => !!c && c !== "BREAK").map((s) => s.name),
  ).size;
  const professoresUnicos = new Set(
    schedule.flat().filter((c): c is Subject => !!c && c !== "BREAK").map((s) => s.teacher),
  ).size;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Horários</h1>
            <p className="text-sm text-muted-foreground">Visualize o horário das aulas das turmas.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setOpenTurma((v) => !v)}
                className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent"
              >
                Turma: <span className="font-semibold">{turma}</span>
                <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
              </button>
              {openTurma && (
                <div className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-card">
                  {turmas.map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setTurma(t);
                        setOpenTurma(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        t === turma ? "bg-pastel-blue text-pastel-blue-foreground" : "text-foreground hover:bg-muted",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Printer className="h-4 w-4" strokeWidth={1.75} />
              Imprimir
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Exportar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Nova Aula
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Aulas", value: String(totalAulas), color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Disciplinas", value: String(disciplinasUnicas), color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: "Professores", value: String(professoresUnicos), color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Dias por Semana", value: "5", color: "bg-pastel-green text-pastel-green-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Schedule grid */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="text-base font-bold text-foreground">Horário Semanal — {turma}</h2>
              <p className="text-xs text-muted-foreground">Ano letivo 2025/2026</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
              {slots[0].start} – {slots[slots.length - 1].end}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px] p-4">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: "110px repeat(5, minmax(0, 1fr))" }}
              >
                {/* Header row */}
                <div />
                {days.map((d) => (
                  <div
                    key={d}
                    className="rounded-xl bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}

                {/* Slot rows */}
                {slots.map((slot, rowIdx) => (
                  <Row key={`${slot.start}-${rowIdx}`} slot={slot} cells={schedule[rowIdx] ?? []} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
          <span className="text-xs font-semibold text-muted-foreground">Áreas:</span>
          {[
            { label: "Exatas", color: "blue" as const },
            { label: "Línguas", color: "lilac" as const },
            { label: "Ciências", color: "green" as const },
            { label: "Humanidades", color: "yellow" as const },
            { label: "Artes & Ed. Física", color: "pink" as const },
          ].map((l) => (
            <span
              key={l.label}
              className={cn("rounded-full px-3 py-1 text-xs font-medium", colorStyles[l.color])}
            >
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

const Row = ({
  slot,
  cells,
}: {
  slot: { start: string; end: string; isBreak?: boolean; label?: string };
  cells: ScheduleCell[];
}) => {
  if (slot.isBreak) {
    return (
      <>
        <div className="flex flex-col items-end justify-center pr-2 text-xs">
          <span className="font-semibold text-foreground">{slot.start}</span>
          <span className="text-muted-foreground">{slot.end}</span>
        </div>
        <div className="col-span-5 flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {slot.label ?? "Intervalo"}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-end justify-center pr-2 text-xs">
        <span className="font-semibold text-foreground">{slot.start}</span>
        <span className="text-muted-foreground">{slot.end}</span>
      </div>
      {cells.map((cell, i) => (
        <Cell key={i} cell={cell} />
      ))}
      {Array.from({ length: Math.max(0, 5 - cells.length) }).map((_, i) => (
        <Cell key={`empty-${i}`} cell={null} />
      ))}
    </>
  );
};

const Cell = ({ cell }: { cell: ScheduleCell }) => {
  if (!cell || cell === "BREAK") {
    return <div className="min-h-[80px] rounded-xl border border-dashed border-border bg-muted/20" />;
  }
  return (
    <div
      className={cn(
        "group flex min-h-[80px] cursor-pointer flex-col justify-between rounded-xl p-3 transition-transform hover:-translate-y-0.5",
        colorStyles[cell.color],
      )}
    >
      <p className="text-sm font-bold leading-tight">{cell.name}</p>
      <div className="flex flex-col gap-0.5 text-[11px] opacity-80">
        <span className="inline-flex items-center gap-1 truncate">
          <User className="h-3 w-3" strokeWidth={2} />
          {cell.teacher}
        </span>
        <span className="inline-flex items-center gap-1 truncate">
          <MapPin className="h-3 w-3" strokeWidth={2} />
          {cell.room}
        </span>
      </div>
    </div>
  );
};

export default Horarios;