import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Filter, Plus, Printer, Download, ChevronDown, Clock, MapPin, User, GripVertical, Sun, Sunset, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Subject = {
  name: string;
  teacher: string;
  room: string;
  color: "lilac" | "blue" | "yellow" | "green" | "pink";
};

type ScheduleCell = Subject | null;
type Shift = "manha" | "tarde" | "noite";

const colorStyles: Record<Subject["color"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"] as const;

// Slots de 2h em 2h por turno
const shiftSlots: Record<Shift, { start: string; end: string }[]> = {
  manha: [
    { start: "07:00", end: "09:00" },
    { start: "09:00", end: "11:00" },
    { start: "11:00", end: "13:00" },
  ],
  tarde: [
    { start: "13:00", end: "15:00" },
    { start: "15:00", end: "17:00" },
    { start: "17:00", end: "19:00" },
  ],
  noite: [
    { start: "18:00", end: "20:00" },
    { start: "20:00", end: "22:00" },
    { start: "22:00", end: "23:59" },
  ],
};

const turmas: { name: string; shift: Shift }[] = [
  { name: "7º C", shift: "manha" },
  { name: "8º B", shift: "manha" },
  { name: "9º B", shift: "tarde" },
  { name: "9º C", shift: "tarde" },
  { name: "10º A", shift: "manha" },
  { name: "10º B", shift: "tarde" },
  { name: "11º A", shift: "noite" },
  { name: "12º B", shift: "noite" },
];

const subjectPool: Subject[] = [
  { name: "Matemática", teacher: "Carla Mendes", room: "Sala 12", color: "blue" },
  { name: "Português", teacher: "Marta Dias", room: "Sala 03", color: "lilac" },
  { name: "Física", teacher: "Rui Pereira", room: "Lab 02", color: "green" },
  { name: "História", teacher: "Helena Costa", room: "Sala 04", color: "yellow" },
  { name: "Inglês", teacher: "Sofia Almeida", room: "Sala 07", color: "pink" },
  { name: "Química", teacher: "Tiago Ferreira", room: "Lab 01", color: "green" },
  { name: "Geografia", teacher: "Pedro Lima", room: "Sala 09", color: "yellow" },
  { name: "Filosofia", teacher: "Bruno Santos", room: "Sala 15", color: "lilac" },
  { name: "Biologia", teacher: "Rui Pereira", room: "Lab 02", color: "green" },
  { name: "Educação Física", teacher: "Pedro Lima", room: "Pavilhão", color: "blue" },
  { name: "Artes", teacher: "Sofia Almeida", room: "Sala 07", color: "pink" },
];

const buildSchedule = (seed: number): ScheduleCell[][] => {
  const rows: ScheduleCell[][] = [];
  for (let r = 0; r < 3; r++) {
    const row: ScheduleCell[] = [];
    for (let c = 0; c < 5; c++) {
      const idx = (r * 5 + c + seed) % subjectPool.length;
      // Deixa algumas células vazias
      row.push((r + c + seed) % 7 === 0 ? null : subjectPool[idx]);
    }
    rows.push(row);
  }
  return rows;
};

const shiftMeta: Record<Shift, { label: string; icon: typeof Sun; color: string }> = {
  manha: { label: "Manhã", icon: Sun, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  tarde: { label: "Tarde", icon: Sunset, color: "bg-pastel-pink text-pastel-pink-foreground" },
  noite: { label: "Noite", icon: Moon, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
};

const Horarios = () => {
  const [turmaName, setTurmaName] = useState("10º A");
  const [openTurma, setOpenTurma] = useState(false);
  const [schedules, setSchedules] = useState<Record<string, ScheduleCell[][]>>(() => {
    const map: Record<string, ScheduleCell[][]> = {};
    turmas.forEach((t, i) => (map[t.name] = buildSchedule(i)));
    return map;
  });
  const [dragFrom, setDragFrom] = useState<{ row: number; col: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ row: number; col: number } | null>(null);

  const turma = turmas.find((t) => t.name === turmaName) ?? turmas[0];
  const slots = shiftSlots[turma.shift];
  const schedule = schedules[turmaName];

  const stats = useMemo(() => {
    const flat = schedule.flat().filter((c): c is Subject => !!c);
    return {
      totalAulas: flat.length,
      disciplinas: new Set(flat.map((s) => s.name)).size,
      professores: new Set(flat.map((s) => s.teacher)).size,
    };
  }, [schedule]);

  const handleDrop = (toRow: number, toCol: number) => {
    if (!dragFrom) return;
    if (dragFrom.row === toRow && dragFrom.col === toCol) {
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    setSchedules((prev) => {
      const current = prev[turmaName].map((r) => [...r]);
      const tmp = current[dragFrom.row][dragFrom.col];
      current[dragFrom.row][dragFrom.col] = current[toRow][toCol];
      current[toRow][toCol] = tmp;
      return { ...prev, [turmaName]: current };
    });
    toast({ title: "Horário atualizado", description: "Aula movida com sucesso." });
    setDragFrom(null);
    setDragOver(null);
  };

  const ShiftIcon = shiftMeta[turma.shift].icon;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Horários</h1>
            <p className="text-sm text-muted-foreground">
              Arraste e solte as aulas para reorganizar o horário.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setOpenTurma((v) => !v)}
                className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent"
              >
                Turma: <span className="font-semibold">{turmaName}</span>
                <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
              </button>
              {openTurma && (
                <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-card">
                  {turmas.map((t) => {
                    const Icon = shiftMeta[t.shift].icon;
                    return (
                      <button
                        key={t.name}
                        onClick={() => {
                          setTurmaName(t.name);
                          setOpenTurma(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          t.name === turmaName
                            ? "bg-pastel-blue text-pastel-blue-foreground"
                            : "text-foreground hover:bg-muted",
                        )}
                      >
                        <span>{t.name}</span>
                        <span className="inline-flex items-center gap-1 text-xs opacity-70">
                          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {shiftMeta[t.shift].label}
                        </span>
                      </button>
                    );
                  })}
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
            { label: "Total de Aulas", value: String(stats.totalAulas), color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Disciplinas", value: String(stats.disciplinas), color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: "Professores", value: String(stats.professores), color: "bg-pastel-yellow text-pastel-yellow-foreground" },
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-base font-bold text-foreground">Horário Semanal — {turmaName}</h2>
                <p className="text-xs text-muted-foreground">Ano letivo 2025/2026 · Blocos de 2h</p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  shiftMeta[turma.shift].color,
                )}
              >
                <ShiftIcon className="h-3.5 w-3.5" strokeWidth={2} />
                Turno: {shiftMeta[turma.shift].label}
              </span>
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
                  <Row
                    key={`${slot.start}-${rowIdx}`}
                    slot={slot}
                    rowIdx={rowIdx}
                    cells={schedule[rowIdx] ?? []}
                    dragFrom={dragFrom}
                    dragOver={dragOver}
                    onDragStart={(col) => setDragFrom({ row: rowIdx, col })}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDragOverCell={(col) => setDragOver({ row: rowIdx, col })}
                    onDrop={(col) => handleDrop(rowIdx, col)}
                  />
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
  rowIdx,
  cells,
  dragFrom,
  dragOver,
  onDragStart,
  onDragEnd,
  onDragOverCell,
  onDrop,
}: {
  slot: { start: string; end: string };
  rowIdx: number;
  cells: ScheduleCell[];
  dragFrom: { row: number; col: number } | null;
  dragOver: { row: number; col: number } | null;
  onDragStart: (col: number) => void;
  onDragEnd: () => void;
  onDragOverCell: (col: number) => void;
  onDrop: (col: number) => void;
}) => {
  return (
    <>
      <div className="flex flex-col items-end justify-center pr-2 text-xs">
        <span className="font-semibold text-foreground">{slot.start}</span>
        <span className="text-muted-foreground">{slot.end}</span>
      </div>
      {Array.from({ length: 5 }).map((_, col) => {
        const cell = cells[col] ?? null;
        const isDragging = dragFrom?.row === rowIdx && dragFrom?.col === col;
        const isOver = dragOver?.row === rowIdx && dragOver?.col === col && !isDragging;
        return (
          <Cell
            key={col}
            cell={cell}
            isDragging={isDragging}
            isOver={isOver}
            onDragStart={() => onDragStart(col)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOverCell(col);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(col);
            }}
          />
        );
      })}
    </>
  );
};

const Cell = ({
  cell,
  isDragging,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  cell: ScheduleCell;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) => {
  const baseDrop = "min-h-[100px] rounded-xl transition-all";

  if (!cell) {
    return (
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          baseDrop,
          "border border-dashed",
          isOver ? "border-pastel-blue-foreground bg-pastel-blue/40" : "border-border bg-muted/20",
        )}
      />
    );
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", cell.name);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        baseDrop,
        "group flex cursor-grab flex-col justify-between p-3 active:cursor-grabbing",
        colorStyles[cell.color],
        isDragging && "opacity-40 scale-95",
        isOver && "ring-2 ring-foreground/30 ring-offset-2 ring-offset-card",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-bold leading-tight">{cell.name}</p>
        <GripVertical className="h-3.5 w-3.5 opacity-40 group-hover:opacity-80" strokeWidth={2} />
      </div>
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