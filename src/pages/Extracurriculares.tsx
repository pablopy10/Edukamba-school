import { useEffect, useMemo, useState } from "react";
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
  Filter,
  Pencil,
  Trash2,
  Repeat,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ActivityFormDialog, type ActivityRow } from "@/components/extracurriculares/ActivityFormDialog";
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

type ActivityCategory = "musica" | "desporto" | "arte" | "tecnologia" | "academico" | "teatro";

const categoryMeta: Record<string, { label: string; color: string; icon: typeof Music2 }> = {
  musica: { label: "Música", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Music2 },
  desporto: { label: "Desporto", color: "bg-pastel-green text-pastel-green-foreground", icon: Trophy },
  arte: { label: "Arte", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Palette },
  tecnologia: { label: "Tecnologia", color: "bg-pastel-blue text-pastel-blue-foreground", icon: Code2 },
  academico: { label: "Académico", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: BookOpen },
  teatro: { label: "Teatro", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Theater },
};

const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const weekdayFull = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const monthsPt = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const formatTime = (t: string | null) => (t ? t.slice(0, 5) : "");
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const Extracurriculares = () => {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [academicYear, setAcademicYear] = useState<{ id: string; start_date: string; end_date: string } | null>(null);

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "todas">("todas");
  const [cursor, setCursor] = useState(new Date());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canEdit = role === "ADMIN" || role === "TEACHER";
  const canDelete = role === "ADMIN";

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      const sid = profile?.school_id ?? null;
      setSchoolId(sid);
      setRole(profile?.role ?? null);
      if (sid) {
        const { data: yr } = await supabase
          .from("academic_years")
          .select("id, start_date, end_date")
          .eq("school_id", sid)
          .eq("is_active", true)
          .maybeSingle();
        if (yr) setAcademicYear(yr);
      }
    })();
  }, []);

  const loadActivities = async () => {
    if (!schoolId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("extracurricular_activities")
      .select("*")
      .eq("school_id", schoolId)
      .order("name");
    setLoading(false);
    if (error) {
      toast.error("Erro ao carregar: " + error.message);
      return;
    }
    setActivities((data ?? []) as ActivityRow[]);
  };

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        (a.responsible ?? "").toLowerCase().includes(q) ||
        (a.location ?? "").toLowerCase().includes(q);
      const matchCategory = categoryFilter === "todas" || a.category === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [activities, search, categoryFilter]);

  const totalCapacity = activities.reduce((sum, a) => sum + (a.capacity || 0), 0);
  const recurringCount = activities.filter((a) => a.is_recurring).length;

  // Calendar
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
    const wd = date.getDay();
    const iso = isoDay(date);
    return filtered.filter((a) => {
      if (a.is_recurring) {
        if (!a.weekdays?.includes(wd)) return false;
        if (a.start_date && iso < a.start_date) return false;
        if (a.end_date && iso > a.end_date) return false;
        return true;
      }
      return a.single_date === iso;
    });
  };

  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const handleNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const handleEdit = (a: ActivityRow) => {
    setEditing(a);
    setDialogOpen(true);
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("extracurricular_activities").delete().eq("id", deleteId);
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Atividade removida.");
      loadActivities();
    }
    setDeleteId(null);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Extracurriculares</h1>
            <p className="text-sm text-muted-foreground">Gerir atividades recorrentes e pontuais</p>
          </div>
          {canEdit && (
            <button
              onClick={handleNew}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90 transition-[var(--transition-smooth)]"
            >
              <Plus className="h-4 w-4" />
              Nova Atividade
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Atividades</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{activities.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Recorrentes</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{recurringCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Pontuais</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{activities.length - recurringCount}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-xs font-medium text-muted-foreground">Capacidade total</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{totalCapacity}</p>
          </div>
        </div>

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

        {loading ? (
          <div className="rounded-2xl bg-card p-12 text-center text-sm text-muted-foreground shadow-card">
            A carregar...
          </div>
        ) : view === "lista" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((a) => {
              const meta = categoryMeta[a.category] ?? categoryMeta.academico;
              const Icon = meta.icon;
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
                    {(canEdit || canDelete) && (
                      <div className="flex gap-1">
                        {canEdit && (
                          <button
                            onClick={() => handleEdit(a)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteId(a.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    {a.responsible && (
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        <span>{a.responsible}</span>
                      </div>
                    )}
                    {a.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{a.location}</span>
                      </div>
                    )}
                    {(a.start_time || a.end_time) && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{formatTime(a.start_time)}{a.end_time ? ` – ${formatTime(a.end_time)}` : ""}</span>
                      </div>
                    )}
                    {a.is_recurring ? (
                      <div className="flex items-center gap-2">
                        <Repeat className="h-3.5 w-3.5" />
                        <span>
                          Recorrente
                          {a.end_date && ` até ${a.end_date.split("-").reverse().join("/")}`}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-3.5 w-3.5" />
                        <span>{a.single_date?.split("-").reverse().join("/") ?? "Sem data"}</span>
                      </div>
                    )}
                    {a.is_recurring && a.weekdays && a.weekdays.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        {a.weekdays.map((wd) => (
                          <span key={wd} className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                            {weekdayNames[wd]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-xs">
                    <span className="font-semibold text-foreground">Capacidade: {a.capacity}</span>
                  </div>
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
                        const meta = categoryMeta[a.category] ?? categoryMeta.academico;
                        return (
                          <div
                            key={a.id}
                            className={cn("truncate rounded px-1.5 py-0.5 text-[10px] font-semibold", meta.color)}
                            title={`${a.name}${a.start_time ? ` • ${formatTime(a.start_time)}` : ""}`}
                          >
                            {a.start_time ? `${formatTime(a.start_time)} ` : ""}{a.name}
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

      <ActivityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolId={schoolId}
        academicYear={academicYear}
        activity={editing}
        onSaved={loadActivities}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover atividade?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
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

export default Extracurriculares;