import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { showPageKpiCards, isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ActivityFormDialog, type ActivityRow } from "@/components/extracurriculares/ActivityFormDialog";
import { EnrollmentManagerDialog } from "@/components/extracurriculares/EnrollmentManagerDialog";
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
import { Button } from "@/components/ui/button";
import { UserPlus, Wallet, FileSignature } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { isSchoolManagementOrTeacher, isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { useParentChildren } from "@/hooks/useParentChildren";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PagamentosFinanceHub } from "@/pages/Pagamentos";
import { DomainChargeRulesPanel } from "@/components/finance/DomainChargeRulesPanel";
import { useHomeroomStudentIds } from "@/hooks/useHomeroomStudentIds";
import { ModuleAuthorizationsPanel } from "@/components/authorizations/ModuleAuthorizationsPanel";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
type ActivityCategory = "musica" | "desporto" | "arte" | "tecnologia" | "academico" | "teatro";

type EnrollmentListRow = {
  id: string;
  student_id: string;
  status: string;
  activity_id: string;
  student?: { full_name: string; classroom?: { name: string | null } | null } | null;
  activity?: { name: string; category: string } | null;
};

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

/** Compara apenas a parte da data (evita timestamptz tipo 2026-06-01T00:00:00+00 a quebrar < / > lexicográfico). */
function toCalendarDateKey(s: string | null | undefined): string | null {
  if (s == null || typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}

function weekdayNumbers(raw: ActivityRow["weekdays"]): number[] {
  if (raw == null || !Array.isArray(raw)) return [];
  const out = raw.map((x) => {
    const n = typeof x === "string" ? Number.parseInt(x, 10) : Number(x);
    return Number.isFinite(n) ? n : NaN;
  }).filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
  return [...new Set(out)].sort((a, b) => a - b);
}

const Extracurriculares = () => {
  const [searchParams] = useSearchParams();
  const native = isNativeMobileApp();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [academicYear, setAcademicYear] = useState<{ id: string; start_date: string; end_date: string } | null>(null);
  const [hubTab, setHubTab] = useState<
    "regras" | "atividades" | "inscricoes" | "pagamentos" | "autorizacoes"
  >("atividades");

  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [allEnrollmentRows, setAllEnrollmentRows] = useState<EnrollmentListRow[]>([]);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [billingStatus, setBillingStatus] = useState<Record<string, { enrolled: number; billed: number }>>({});

  const [view, setView] = useState<"lista" | "calendario">("lista");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "todas">("todas");
  const [cursor, setCursor] = useState(new Date());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollActivity, setEnrollActivity] = useState<ActivityRow | null>(null);

  const canEdit = isSchoolManagementOrTeacher(role);
  const canDelete = isSchoolManagementRole(role);
  const canManageAuthorizations = isSchoolManagementRole(role);
  const isParent = role === "PARENT";
  const canEnroll = canEdit || isParent;
  const { childIds } = useParentChildren();
  const { ids: homeroomStudentIds } = useHomeroomStudentIds(schoolId, role, userId);

  const loadEnrollmentList = async () => {
    if (!schoolId) return;
    setEnrollmentLoading(true);
    const { data, error } = await supabase
      .from("extracurricular_enrollments")
      .select("id, student_id, activity_id, status, student:students(full_name, classroom:classrooms(name)), activity:extracurricular_activities(name, category)")
      .eq("school_id", schoolId)
      .order("enrolled_at", { ascending: false });
    setEnrollmentLoading(false);
    if (error) toast.error(error.message);
    else setAllEnrollmentRows((data ?? []) as EnrollmentListRow[]);
  };

  useEffect(() => {
    if (!schoolId || hubTab !== "inscricoes") return;
    void loadEnrollmentList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, hubTab]);
  const visibleEnrollmentRows = useMemo(() => {
    let rows = allEnrollmentRows;
    if (isParent) rows = rows.filter((r) => childIds.includes(r.student_id));
    if (role === "TEACHER") {
      if (homeroomStudentIds.length === 0) return [];
      rows = rows.filter((r) => homeroomStudentIds.includes(r.student_id));
    }
    return rows;
  }, [allEnrollmentRows, isParent, childIds, role, homeroomStudentIds]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      const sid = effectiveSchoolIdFromProfile(profile);
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

  useEffect(() => {
    if (searchParams.get("tab") === "autorizacoes") {
      setHubTab("autorizacoes");
    }
  }, [searchParams]);

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
    await loadBillingStatus((data ?? []) as ActivityRow[]);
  };

  const loadBillingStatus = async (acts: ActivityRow[]) => {
    if (!schoolId || acts.length === 0) {
      setBillingStatus({});
      return;
    }
    const ids = acts.map((a) => a.id);
    const [{ data: enrolls }, { data: fees }] = await Promise.all([
      supabase
        .from("extracurricular_enrollments")
        .select("activity_id, student_id")
        .in("activity_id", ids)
        .eq("status", "ativa"),
      supabase
        .from("activity_fees")
        .select("activity_id, student_id")
        .in("activity_id", ids),
    ]);
    const enrolledMap = new Map<string, Set<string>>();
    (enrolls ?? []).forEach((e: any) => {
      if (!enrolledMap.has(e.activity_id)) enrolledMap.set(e.activity_id, new Set());
      enrolledMap.get(e.activity_id)!.add(e.student_id);
    });
    const billedMap = new Map<string, Set<string>>();
    (fees ?? []).forEach((f: any) => {
      if (!billedMap.has(f.activity_id)) billedMap.set(f.activity_id, new Set());
      billedMap.get(f.activity_id)!.add(f.student_id);
    });
    const status: Record<string, { enrolled: number; billed: number }> = {};
    ids.forEach((id) => {
      const enrolled = enrolledMap.get(id) ?? new Set();
      const billed = billedMap.get(id) ?? new Set();
      let billedEnrolled = 0;
      enrolled.forEach((sid) => {
        if (billed.has(sid)) billedEnrolled++;
      });
      status[id] = { enrolled: enrolled.size, billed: billedEnrolled };
    });
    setBillingStatus(status);
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
        const wdays = weekdayNumbers(a.weekdays);
        if (wdays.length > 0 && !wdays.includes(wd)) return false;
        const sd = toCalendarDateKey(a.start_date);
        const ed = toCalendarDateKey(a.end_date);
        if (sd && iso < sd) return false;
        if (ed && iso > ed) return false;
        return true;
      }
      return toCalendarDateKey(a.single_date) === iso;
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
    <>
      <div className={cn("flex flex-col gap-6", native && hubTab === "atividades" && canEdit && "relative pb-28")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Extracurriculares</h1>
            <p className="text-sm text-muted-foreground">
              Igual ao ecrã de Propinas: regras de cobrança por atividade, actividades com lista e calendário, todas as inscrições e lista de cobranças / pagamentos.
            </p>
          </div>
          {canEdit && !native && hubTab === "atividades" && (
            <button
              type="button"
              onClick={handleNew}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90 transition-[var(--transition-smooth)]"
            >
              <Plus className="h-4 w-4" />
              Nova Atividade
            </button>
          )}
        </div>

        <Tabs value={hubTab} onValueChange={(v) => setHubTab(v as typeof hubTab)} className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap gap-1 py-2">
            {!isParent && <TabsTrigger value="regras">Regras de cobranças</TabsTrigger>}
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="inscricoes">Inscrições</TabsTrigger>
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
            <TabsTrigger value="autorizacoes">
              <FileSignature className="mr-2 h-4 w-4" />
              Autorizações
            </TabsTrigger>
          </TabsList>

          {!isParent && (
            <TabsContent value="regras" className="mt-4">
              <DomainChargeRulesPanel variant="activity" schoolId={schoolId} role={role} />
            </TabsContent>
          )}

          <TabsContent value="atividades" className="mt-4 space-y-6">
        {showPageKpiCards() && (
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
        )}

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
          {!native && (
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
          )}
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
        ) : native || view === "lista" ? (
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
                    {a.enrollment_fee && a.enrollment_fee > 0 ? (
                      <span className="ml-3 inline-flex items-center gap-1 font-semibold text-foreground">
                        <Wallet className="h-3.5 w-3.5" />
                        {Number(a.enrollment_fee).toLocaleString("pt-PT")} Kz
                        {a.billing_frequency === "mensal" && <span className="text-muted-foreground font-normal">/mês</span>}
                      </span>
                    ) : null}
                  </div>

                  {!isParent && a.enrollment_fee && a.enrollment_fee > 0 && billingStatus[a.id] && billingStatus[a.id].enrolled > 0 && (
                    billingStatus[a.id].billed >= billingStatus[a.id].enrolled ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-pastel-green px-2.5 py-1.5 text-[11px] font-semibold text-pastel-green-foreground w-fit">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Cobrança gerada para todos os inscritos
                      </div>
                    ) : billingStatus[a.id].billed > 0 ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-pastel-yellow px-2.5 py-1.5 text-[11px] font-semibold text-pastel-yellow-foreground w-fit">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Cobrança gerada para {billingStatus[a.id].billed} de {billingStatus[a.id].enrolled} inscritos
                      </div>
                    ) : null
                  )}

                  {canEnroll && (
                    <button
                      onClick={() => { setEnrollActivity(a); setEnrollOpen(true); }}
                      className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {isParent ? "Inscrever" : "Gerir inscrições"}
                    </button>
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
          </TabsContent>

          <TabsContent value="inscricoes" className="mt-4 space-y-3">
            {role === "TEACHER" && homeroomStudentIds.length === 0 && (
              <p className="text-sm text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2">
                Só são listados alunos das turmas em que está como diretor de turma.
              </p>
            )}
            {native ? (
              <div className="grid gap-4 md:grid-cols-2">
                {enrollmentLoading ? (
                  <p className="text-muted-foreground">A carregar…</p>
                ) : visibleEnrollmentRows.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground col-span-full">Sem inscrições.</Card>
                ) : (
                  visibleEnrollmentRows.map((row) => {
                    const meta = categoryMeta[row.activity?.category ?? "academico"] ?? categoryMeta.academico;
                    const Icon = meta.icon;
                    return (
                      <Card key={row.id} className="flex flex-col gap-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-lg font-semibold">{row.student?.full_name ?? "—"}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", meta.color)}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="text-sm text-muted-foreground">{row.activity?.name ?? "—"}</span>
                            </div>
                          </div>
                          <Badge variant={row.status === "ativa" ? "default" : "secondary"}>
                            {row.status === "ativa" ? "Ativa" : row.status ?? "—"}
                          </Badge>
                        </div>
                        {row.student?.classroom?.name && (
                          <p className="text-xs text-muted-foreground">Turma: {row.student.classroom.name}</p>
                        )}
                      </Card>
                    );
                  })
                )}
              </div>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Atividade</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollmentLoading ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">A carregar…</TableCell></TableRow>
                    ) : visibleEnrollmentRows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem inscrições.</TableCell></TableRow>
                    ) : (
                      visibleEnrollmentRows.map((row) => {
                        const meta = categoryMeta[row.activity?.category ?? "academico"] ?? categoryMeta.academico;
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.student?.full_name ?? "—"}</TableCell>
                            <TableCell>{row.student?.classroom?.name ?? "—"}</TableCell>
                            <TableCell>{row.activity?.name ?? "—"}</TableCell>
                            <TableCell><Badge variant="outline" className={meta.color}>{meta.label}</Badge></TableCell>
                            <TableCell>
                              <Badge variant={row.status === "ativa" ? "default" : "secondary"}>
                                {row.status === "ativa" ? "Ativa" : row.status ?? "—"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pagamentos" className="mt-4">
            <PagamentosFinanceHub financePage="activityCharges" />
          </TabsContent>

          <TabsContent value="autorizacoes" className="mt-4">
            <ModuleAuthorizationsPanel
              module="extracurricular"
              schoolId={schoolId}
              userId={userId}
              role={role}
              isParent={isParent}
              childIds={childIds}
              canManageTemplates={canManageAuthorizations}
            />
          </TabsContent>
        </Tabs>
      </div>

      {native && canEdit && hubTab === "atividades" && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label="Nova atividade"
            onClick={handleNew}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      <ActivityFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolId={schoolId}
        academicYear={academicYear}
        activity={editing}
        onSaved={loadActivities}
      />

      <EnrollmentManagerDialog
        open={enrollOpen}
        onOpenChange={(o) => {
          setEnrollOpen(o);
          if (!o) {
            loadBillingStatus(activities);
            void loadEnrollmentList();
          }
        }}
        activity={enrollActivity}
        schoolId={schoolId}
        canEdit={canEdit}
        isParent={isParent}
        childIds={childIds}
        restrictStudentIds={role === "TEACHER" ? homeroomStudentIds : undefined}
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
    </>
  );
};

export default Extracurriculares;