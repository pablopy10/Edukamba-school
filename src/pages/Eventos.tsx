import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  PartyPopper,
  Trophy,
  Users,
  Megaphone,
  GraduationCap,
  Clock,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EventFormDialog, type EventRow } from "@/components/eventos/EventFormDialog";
import { showPageKpiCards } from "@/lib/nativeApp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type EventType = "academico" | "cultural" | "desportivo" | "reuniao" | "comunicado";

const typeMeta: Record<string, { label: string; color: string; icon: typeof PartyPopper }> = {
  academico: { label: "Académico", color: "bg-pastel-blue text-pastel-blue-foreground", icon: GraduationCap },
  cultural: { label: "Cultural", color: "bg-pastel-pink text-pastel-pink-foreground", icon: PartyPopper },
  desportivo: { label: "Desportivo", color: "bg-pastel-green text-pastel-green-foreground", icon: Trophy },
  reuniao: { label: "Reunião", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Users },
  comunicado: { label: "Comunicado", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Megaphone },
};

type View = "calendario" | "lista";
type TypeFilter = EventType | "all";

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const formatDateLong = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")} ${monthNames[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};

const formatTime = (t: string | null) => (t ? t.slice(0, 5) : "");

const Eventos = () => {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [view, setView] = useState<View>("calendario");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canEdit = role === "ADMIN" || role === "TEACHER";
  const canDelete = role === "ADMIN";

  const loadEvents = async () => {
    if (!schoolId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("school_id", schoolId)
      .order("event_date", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar eventos: " + error.message);
      return;
    }
    setEvents((data ?? []) as EventRow[]);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      setSchoolId(profile?.school_id ?? null);
      setRole(profile?.role ?? null);
    })();
  }, []);

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const filtered = useMemo(() => {
    return events.filter((e) => {
      const matchesType = typeFilter === "all" || e.type === typeFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        (e.organizer ?? "").toLowerCase().includes(q) ||
        (e.audience ?? "").toLowerCase().includes(q) ||
        (e.location ?? "").toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [events, typeFilter, search]);

  const stats = useMemo(() => ({
    total: filtered.length,
    academicos: filtered.filter((e) => e.type === "academico").length,
    culturais: filtered.filter((e) => e.type === "cultural").length,
    desportivos: filtered.filter((e) => e.type === "desportivo").length,
  }), [filtered]);

  const handleNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleEdit = (ev: EventRow) => {
    setEditing(ev);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("events").delete().eq("id", deleteId);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
    } else {
      toast.success("Evento removido.");
      loadEvents();
    }
    setDeleteId(null);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Eventos</h1>
            <p className="text-sm text-muted-foreground">
              Acompanhe e organize todos os eventos da escola.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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

            {canEdit && (
              <button
                onClick={handleNew}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                Novo Evento
              </button>
            )}
          </div>
        </div>

        {showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: "Académicos", value: stats.academicos, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Culturais", value: stats.culturais, color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: "Desportivos", value: stats.desportivos, color: "bg-pastel-green text-pastel-green-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>
                {s.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar evento, local ou organizador..."
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TypeChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} className="bg-muted text-foreground">
              Todos
            </TypeChip>
            {(Object.keys(typeMeta) as EventType[]).map((t) => (
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

        {loading ? (
          <div className="rounded-2xl bg-card p-12 text-center text-sm text-muted-foreground shadow-card">
            A carregar eventos...
          </div>
        ) : view === "calendario" ? (
          <CalendarView
            cursor={cursor}
            setCursor={setCursor}
            events={filtered}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteId(id)}
          />
        ) : (
          <ListView
            events={filtered}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteId(id)}
          />
        )}
      </div>

      <EventFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolId={schoolId}
        event={editing}
        defaultDate={selectedDate}
        onSaved={loadEvents}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  events: items,
  selectedDate,
  setSelectedDate,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  events: EventRow[];
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (e: EventRow) => void;
  onDelete: (id: string) => void;
}) => {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
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
    const map = new Map<string, EventRow[]>();
    items.forEach((e) => {
      const arr = map.get(e.event_date) ?? [];
      arr.push(e);
      map.set(e.event_date, arr);
    });
    return map;
  }, [items]);

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
              const dayEvents = eventsByDate.get(c.iso) ?? [];
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
                        isToday ? "bg-pastel-blue text-pastel-blue-foreground" : "text-foreground",
                      )}
                    >
                      {c.date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayEvents.slice(0, 2).map((e) => (
                      <span
                        key={e.id}
                        className={cn(
                          "truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          (typeMeta[e.type] ?? typeMeta.academico).color,
                        )}
                      >
                        {e.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] font-medium text-muted-foreground">
                        +{dayEvents.length - 2} mais
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Detalhe do dia
          </p>
          <h3 className="mt-1 text-base font-bold text-foreground">
            {selectedDate ? formatDateLong(selectedDate) : "Selecione uma data"}
          </h3>
        </div>

        {selectedDate && selectedEvents.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Sem eventos neste dia.
          </div>
        )}

        <div className="flex flex-col gap-3">
          {selectedEvents.map((e) => {
            const meta = typeMeta[e.type] ?? typeMeta.academico;
            const Icon = meta.icon;
            return (
              <div key={e.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", meta.color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{e.title}</p>
                      {e.organizer && <p className="text-xs text-muted-foreground">{e.organizer}</p>}
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.color)}>
                    {meta.label}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {(e.start_time || e.end_time) && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" strokeWidth={1.75} />
                      {formatTime(e.start_time)}{e.end_time ? ` – ${formatTime(e.end_time)}` : ""}
                    </span>
                  )}
                  {e.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} />
                      {e.location}
                    </span>
                  )}
                </div>
                {e.audience && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Público: <span className="font-medium text-foreground">{e.audience}</span>
                  </p>
                )}
                {(canEdit || canDelete) && (
                  <div className="mt-3 flex gap-2">
                    {canEdit && (
                      <button
                        onClick={() => onEdit(e)}
                        className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-3 text-[11px] font-medium text-foreground hover:bg-accent"
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => onDelete(e.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-full bg-destructive/10 px-3 text-[11px] font-medium text-destructive hover:bg-destructive/20"
                      >
                        <Trash2 className="h-3 w-3" /> Remover
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ======================= List View ======================= */
const ListView = ({
  events: items,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  events: EventRow[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (e: EventRow) => void;
  onDelete: (id: string) => void;
}) => {
  const sorted = [...items].sort((a, b) => a.event_date.localeCompare(b.event_date));

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Lista de Eventos</h2>
        <span className="text-xs text-muted-foreground">{sorted.length} resultado(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Data</th>
              <th className="px-6 py-3">Evento</th>
              <th className="px-6 py-3">Tipo</th>
              <th className="px-6 py-3">Local</th>
              <th className="px-6 py-3">Organizador</th>
              <th className="px-6 py-3">Público</th>
              <th className="px-6 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const meta = typeMeta[e.type] ?? typeMeta.academico;
              const Icon = meta.icon;
              return (
                <tr key={e.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{formatDateLong(e.event_date)}</span>
                      {(e.start_time || e.end_time) && (
                        <span className="text-xs text-muted-foreground">
                          {formatTime(e.start_time)}{e.end_time ? ` – ${formatTime(e.end_time)}` : ""}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", meta.color)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <p className="font-semibold text-foreground">{e.title}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", meta.color)}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{e.location ?? "—"}</td>
                  <td className="px-6 py-4 text-muted-foreground">{e.organizer ?? "—"}</td>
                  <td className="px-6 py-4 text-muted-foreground">{e.audience ?? "—"}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => onEdit(e)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => onDelete(e.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  Sem eventos para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Eventos;