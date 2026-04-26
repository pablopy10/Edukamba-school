import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
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
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { AssessmentFormDialog, type AssessmentRecord } from "@/components/avaliacoes/AssessmentFormDialog";

type EvalType = "teste" | "exame" | "trabalho" | "oral";

type Assessment = {
  id: string;
  title: string;
  type: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  room: string | null;
  weight: number | null;
  description: string | null;
  classroom_id: string | null;
  subject_id: string | null;
  teacher_id: string | null;
};

type Option = { id: string; name: string };

const typeMeta: Record<string, { label: string; color: string; icon: typeof FileText }> = {
  teste: { label: "Teste", color: "bg-pastel-blue text-pastel-blue-foreground", icon: PencilLine },
  exame: { label: "Exame", color: "bg-pastel-pink text-pastel-pink-foreground", icon: GraduationCap },
  trabalho: { label: "Trabalho", color: "bg-pastel-green text-pastel-green-foreground", icon: Users },
  oral: { label: "Oral", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: FileText },
};

const meta = (t: string) => typeMeta[t] ?? typeMeta.teste;

type View = "calendario" | "lista";
type TypeFilter = EvalType | "all";

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

const formatDateLong = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate().toString().padStart(2, "0")} ${monthNames[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
};
const tt = (t?: string | null) => (t ? t.slice(0, 5) : "");

const Avaliacoes = () => {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("calendario");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  const [classroomFilter, setClassroomFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [classrooms, setClassrooms] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [teachers, setTeachers] = useState<Option[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AssessmentRecord> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
    const sid = profile?.school_id ?? null;
    setSchoolId(sid);
    if (!sid) { setLoading(false); return; }

    const [aRes, cRes, sRes, tRes] = await Promise.all([
      supabase.from("assessments").select("id,title,type,date,start_time,end_time,room,weight,description,classroom_id,subject_id,teacher_id").eq("school_id", sid).order("date", { ascending: true }),
      supabase.from("classrooms").select("id, name").eq("school_id", sid).order("name"),
      supabase.from("subjects").select("id, name").eq("school_id", sid).order("name"),
      supabase.from("teachers").select("id, profile_id, profiles:profile_id(full_name)").eq("school_id", sid),
    ]);

    setAssessments((aRes.data ?? []) as Assessment[]);
    setClassrooms(cRes.data ?? []);
    setSubjects(sRes.data ?? []);
    setTeachers(
      (tRes.data ?? [])
        .filter((t: any) => !!t.profile_id)
        .map((t: any) => ({ id: t.profile_id, name: t.profiles?.full_name ?? "Sem nome" }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const classroomMap = useMemo(() => new Map(classrooms.map((c) => [c.id, c.name])), [classrooms]);
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);

  const filtered = useMemo(() => {
    return assessments.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (subjectFilter !== "all" && e.subject_id !== subjectFilter) return false;
      if (teacherFilter !== "all" && e.teacher_id !== teacherFilter) return false;
      if (classroomFilter !== "all" && e.classroom_id !== classroomFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const subjectName = e.subject_id ? subjectMap.get(e.subject_id) ?? "" : "";
      const turmaName = e.classroom_id ? classroomMap.get(e.classroom_id) ?? "" : "";
      const teacherName = e.teacher_id ? teacherMap.get(e.teacher_id) ?? "" : "";
      return (
        e.title.toLowerCase().includes(q) ||
        subjectName.toLowerCase().includes(q) ||
        turmaName.toLowerCase().includes(q) ||
        teacherName.toLowerCase().includes(q)
      );
    });
  }, [assessments, typeFilter, subjectFilter, teacherFilter, classroomFilter, search, subjectMap, classroomMap, teacherMap]);

  const stats = useMemo(() => ({
    total: filtered.length,
    testes: filtered.filter((e) => e.type === "teste").length,
    exames: filtered.filter((e) => e.type === "exame").length,
    trabalhos: filtered.filter((e) => e.type === "trabalho").length,
  }), [filtered]);

  // Detect conflicts among current filtered set (same date overlap + shared turma/disciplina/professor)
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    const byDate = new Map<string, Assessment[]>();
    for (const a of assessments) {
      const arr = byDate.get(a.date) ?? [];
      arr.push(a);
      byDate.set(a.date, arr);
    }
    for (const list of byDate.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const aS = tt(a.start_time), aE = tt(a.end_time);
          const bS = tt(b.start_time), bE = tt(b.end_time);
          if (!aS || !aE || !bS || !bE) continue;
          if (!(aS < bE && aE > bS)) continue;
          const shares =
            (a.classroom_id && a.classroom_id === b.classroom_id) ||
            (a.subject_id && a.subject_id === b.subject_id) ||
            (a.teacher_id && a.teacher_id === b.teacher_id);
          if (shares) { ids.add(a.id); ids.add(b.id); }
        }
      }
    }
    return ids;
  }, [assessments]);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (a: Assessment) => {
    setEditing({
      id: a.id,
      title: a.title,
      type: a.type,
      classroom_id: a.classroom_id,
      subject_id: a.subject_id,
      teacher_id: a.teacher_id,
      date: a.date,
      start_time: a.start_time ?? "08:00",
      end_time: a.end_time ?? "09:30",
      room: a.room,
      weight: Number(a.weight ?? 0),
      description: a.description,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const { error } = await supabase.from("assessments").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao eliminar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Avaliação eliminada" });
    setAssessments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Avaliações</h1>
            <p className="text-sm text-muted-foreground">Gerir testes, exames, trabalhos de grupo e provas orais.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
              <button
                onClick={() => setView("calendario")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "calendario" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
                Calendário
              </button>
              <button
                onClick={() => setView("lista")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "lista" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-4 w-4" strokeWidth={1.75} />
                Lista
              </button>
            </div>
            <button
              onClick={openCreate}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
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
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>{s.label}</span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <TypeChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} className="bg-muted text-foreground">Todas</TypeChip>
              {(Object.keys(typeMeta) as EvalType[]).map((t) => (
                <TypeChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} className={typeMeta[t].color}>
                  {typeMeta[t].label}
                </TypeChip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="h-10 rounded-full"><SelectValue placeholder="Disciplina" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as disciplinas</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="h-10 rounded-full"><SelectValue placeholder="Professor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os professores</SelectItem>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classroomFilter} onValueChange={setClassroomFilter}>
              <SelectTrigger className="h-10 rounded-full"><SelectValue placeholder="Turma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as turmas</SelectItem>
                {classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl bg-card py-16 shadow-card">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : view === "calendario" ? (
          <CalendarView
            cursor={cursor}
            setCursor={setCursor}
            evaluations={filtered}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            classroomMap={classroomMap}
            subjectMap={subjectMap}
            conflictIds={conflictIds}
            onEdit={openEdit}
            onDelete={(id) => setDeleteId(id)}
            onOpen={(id) => navigate(`/avaliacoes/${id}/notas`)}
          />
        ) : (
          <ListView
            evaluations={filtered}
            classroomMap={classroomMap}
            subjectMap={subjectMap}
            teacherMap={teacherMap}
            conflictIds={conflictIds}
            onEdit={openEdit}
            onDelete={(id) => setDeleteId(id)}
            onOpen={(id) => navigate(`/avaliacoes/${id}/notas`)}
          />
        )}
      </div>

      <AssessmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolId={schoolId}
        classrooms={classrooms}
        subjects={subjects}
        teachers={teachers}
        initial={editing}
        onSaved={loadAll}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar avaliação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

const TypeChip = ({
  active, onClick, className, children,
}: { active: boolean; onClick: () => void; className?: string; children: React.ReactNode }) => (
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
  cursor, setCursor, evaluations, selectedDate, setSelectedDate,
  classroomMap, subjectMap, conflictIds, onEdit, onDelete, onOpen,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  evaluations: Assessment[];
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  classroomMap: Map<string, string>;
  subjectMap: Map<string, string>;
  conflictIds: Set<string>;
  onEdit: (a: Assessment) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
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
    const map = new Map<string, Assessment[]>();
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
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent">
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <h2 className="text-base font-bold text-foreground">{monthNames[month]} {year}</h2>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent">
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <button
            onClick={() => { setCursor(new Date()); setSelectedDate(todayIso); }}
            className="rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >Hoje</button>
        </div>

        <div className="p-4">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {weekdayLabels.map((d) => (
              <div key={d} className="rounded-xl bg-muted py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {cells.map((c, i) => {
              if (!c.date || !c.iso) return <div key={i} className="min-h-[92px] rounded-xl bg-muted/20" />;
              const events = eventsByDate.get(c.iso) ?? [];
              const isToday = c.iso === todayIso;
              const isSelected = c.iso === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(c.iso)}
                  className={cn(
                    "flex min-h-[92px] flex-col items-stretch gap-1 rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5",
                    isSelected ? "border-pastel-blue-foreground bg-pastel-blue/30" : "border-border bg-background",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                      isToday ? "bg-pastel-blue text-pastel-blue-foreground" : "text-foreground",
                    )}>{c.date.getDate()}</span>
                    {events.length > 0 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">{events.length}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {events.slice(0, 2).map((e) => (
                      <span key={e.id} className={cn("truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold", meta(e.type).color, conflictIds.has(e.id) && "ring-1 ring-destructive")}>
                        {e.title}
                      </span>
                    ))}
                    {events.length > 2 && (
                      <span className="text-[10px] font-medium text-muted-foreground">+{events.length - 2} mais</span>
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
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalhe do dia</p>
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
            const Icon = meta(e.type).icon;
            const turma = e.classroom_id ? classroomMap.get(e.classroom_id) : "";
            const subj = e.subject_id ? subjectMap.get(e.subject_id) : "";
            return (
              <div
                key={e.id}
                onClick={() => onOpen(e.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(e.id); } }}
                className={cn(
                  "cursor-pointer rounded-xl border bg-background p-3 transition-all hover:-translate-y-0.5 hover:shadow-soft",
                  conflictIds.has(e.id) ? "border-destructive/50" : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", meta(e.type).color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{subj}{turma ? ` · ${turma}` : ""}</p>
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta(e.type).color)}>{meta(e.type).label}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.75} />{tt(e.start_time)} – {tt(e.end_time)}</span>
                  {e.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" strokeWidth={1.75} />{e.room}</span>}
                  {(e.weight ?? 0) > 0 && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{e.weight}%</span>}
                </div>
                {conflictIds.has(e.id) && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Conflito detetado
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button onClick={(ev) => { ev.stopPropagation(); onOpen(e.id); }} className="inline-flex items-center gap-1 rounded-full bg-pastel-blue px-3 py-1 text-xs font-medium text-pastel-blue-foreground hover:opacity-90">
                    <GraduationCap className="h-3 w-3" /> Notas
                  </button>
                  <button onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-accent">
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                  <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20">
                    <Trash2 className="h-3 w-3" /> Eliminar
                  </button>
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
const ListView = ({
  evaluations, classroomMap, subjectMap, teacherMap, conflictIds, onEdit, onDelete, onOpen,
}: {
  evaluations: Assessment[];
  classroomMap: Map<string, string>;
  subjectMap: Map<string, string>;
  teacherMap: Map<string, string>;
  conflictIds: Set<string>;
  onEdit: (a: Assessment) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) => {
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
              const Icon = meta(e.type).icon;
              const turma = e.classroom_id ? classroomMap.get(e.classroom_id) : "—";
              const subj = e.subject_id ? subjectMap.get(e.subject_id) : "";
              const teacher = e.teacher_id ? teacherMap.get(e.teacher_id) : "—";
              const isConflict = conflictIds.has(e.id);
              return (
                <tr
                  key={e.id}
                  onClick={() => onOpen(e.id)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 text-sm transition-colors hover:bg-muted/30",
                    isConflict && "bg-destructive/5"
                  )}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{formatDateLong(e.date)}</span>
                      <span className="text-xs text-muted-foreground">{tt(e.start_time)} – {tt(e.end_time)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", meta(e.type).color)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground flex items-center gap-2">
                          {e.title}
                          {isConflict && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                        </p>
                        <p className="text-xs text-muted-foreground">{subj}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", meta(e.type).color)}>{meta(e.type).label}</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">{turma}</td>
                  <td className="px-6 py-4 text-muted-foreground">{teacher}</td>
                  <td className="px-6 py-4 text-muted-foreground">{e.room ?? "—"}</td>
                  <td className="px-6 py-4 text-right font-semibold text-foreground">{(e.weight ?? 0)}%</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={(ev) => { ev.stopPropagation(); onOpen(e.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/30 hover:text-foreground" title="Atribuir notas">
                        <GraduationCap className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Editar">
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Eliminar">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
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