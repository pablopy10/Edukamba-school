import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Plus, Pencil, Trash2, Loader2, CheckCircle2, GraduationCap } from "lucide-react";
import { cn, sortByName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { EnrollmentFormDialog, EnrollmentRow } from "@/components/matriculas/EnrollmentFormDialog";
import { PublishResultsDialog } from "@/components/matriculas/PublishResultsDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useParentChildren } from "@/hooks/useParentChildren";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";

type Opt = { id: string; name: string };
type YearOpt = { id: string; label: string; is_active: boolean | null };

const avatarStyles: Record<string, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-pastel-green text-pastel-green-foreground",
  PENDING: "bg-pastel-yellow text-pastel-yellow-foreground",
  CANCELLED: "bg-pastel-pink text-pastel-pink-foreground",
};

const statusLabel = (s: string | null) =>
  s === "ACTIVE" ? "Confirmada" : s === "PENDING" ? "Pendente" : s === "CANCELLED" ? "Cancelada" : (s ?? "—");

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

const Matriculas = () => {
  const { selectedYearId } = useAcademicYear();
  const { isParent, childIds, loading: parentLoading } = useParentChildren();
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [students, setStudents] = useState<Opt[]>([]);
  const [classrooms, setClassrooms] = useState<Opt[]>([]);
  const [years, setYears] = useState<YearOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClassroom, setFilterClassroom] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [selected, setSelected] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EnrollmentRow | null>(null);
  const [deleting, setDeleting] = useState<EnrollmentRow | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    let enrollmentsQuery = supabase
      .from("enrollments")
      .select("id, student_id, classroom_id, academic_year_id, status, enrolled_at, students(id, full_name, email, avatar_color), classrooms(id, name), academic_years(id, label)")
      .order("enrolled_at", { ascending: false });
    let classroomsQuery = supabase.from("classrooms").select("id, name").order("name");
    if (selectedYearId) {
      enrollmentsQuery = enrollmentsQuery.eq("academic_year_id", selectedYearId);
      classroomsQuery = classroomsQuery.eq("academic_year_id", selectedYearId);
    }
    if (isParent) {
      if (childIds.length === 0) {
        setEnrollments([]); setStudents([]); setClassrooms([]); setYears([]); setLoading(false);
        return;
      }
      enrollmentsQuery = enrollmentsQuery.in("student_id", childIds);
    }
    const [{ data: eData, error: eErr }, { data: sData }, { data: cData }, { data: yData }] = await Promise.all([
      enrollmentsQuery,
      supabase.from("students").select("id, full_name").order("full_name"),
      classroomsQuery,
      supabase.from("academic_years").select("id, label, is_active").order("start_date", { ascending: true }),
    ]);
    if (eErr) {
      toast({ title: "Erro a carregar matrículas", description: eErr.message, variant: "destructive" });
    }
    setEnrollments((eData ?? []) as unknown as EnrollmentRow[]);
    setStudents(((sData ?? []) as { id: string; full_name: string }[]).map((s) => ({ id: s.id, name: s.full_name })));
    setClassrooms((cData ?? []) as Opt[]);
    setYears((yData ?? []) as YearOpt[]);
    setLoading(false);
  };

  useEffect(() => {
    setFilterYear(selectedYearId ?? "all");
    if (parentLoading) return;
    load();
  }, [selectedYearId, parentLoading, isParent, childIds.join(",")]);

  const filtered = useMemo(() => {
    return enrollments.filter((e) => {
      const name = e.students?.full_name ?? "";
      const email = e.students?.email ?? "";
      const className = e.classrooms?.name ?? "";
      const matchSearch = !search || [name, email, className, e.id].some((f) => f.toLowerCase().includes(search.toLowerCase()));
      const matchClass = filterClassroom === "all" || e.classroom_id === filterClassroom;
      const matchStatus = filterStatus === "all" || (e.status ?? "") === filterStatus;
      const matchYear = filterYear === "all" || e.academic_year_id === filterYear;
      return matchSearch && matchClass && matchStatus && matchYear;
    });
  }, [enrollments, search, filterClassroom, filterStatus, filterYear]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map((e) => e.id));

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("enrollments").delete().eq("id", deleting.id);
    if (error) {
      toast({ title: "Erro a eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Matrícula removida" });
      setDeleting(null);
      load();
    }
  };

  const stats = useMemo(() => ({
    total: enrollments.length,
    confirmed: enrollments.filter((e) => e.status === "ACTIVE").length,
    pending: enrollments.filter((e) => e.status === "PENDING").length,
    cancelled: enrollments.filter((e) => e.status === "CANCELLED").length,
  }), [enrollments]);

  const filtersActive = filterClassroom !== "all" || filterStatus !== "all" || filterYear !== "all";

  if (parentLoading) return <PageLoadingSkeleton />;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Matrículas</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão das matrículas dos alunos da escola.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar matrícula..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              {isParent ? "Renovar Matrícula" : "Nova Matrícula"}
            </button>
            {!isParent && (
              <button
                onClick={() => setPublishOpen(true)}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-green px-5 text-sm font-semibold text-pastel-green-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <GraduationCap className="h-4 w-4" strokeWidth={2.25} />
                Publicar resultados
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        {!isParent && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Turma</label>
            <Select value={filterClassroom} onValueChange={setFilterClassroom}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as turmas</SelectItem>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ACTIVE">Confirmada</SelectItem>
                <SelectItem value="PENDING">Pendente</SelectItem>
                <SelectItem value="CANCELLED">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Ano lectivo</label>
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filtersActive && (
            <button
              onClick={() => { setFilterClassroom("all"); setFilterStatus("all"); setFilterYear("all"); }}
              className="h-10 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
            >Limpar filtros</button>
          )}
        </div>
        )}

        {!isParent && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Matrículas", value: String(stats.total), color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Confirmadas", value: String(stats.confirmed), color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Pendentes", value: String(stats.pending), color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Canceladas", value: String(stats.cancelled), color: "bg-pastel-pink text-pastel-pink-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
        )}

        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">{isParent ? "Histórico de Matrículas" : "Lista de Matrículas"}</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionadas</span>
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
                  <th className="py-4 pr-4 font-semibold">Aluno</th>
                  <th className="py-4 pr-4 font-semibold">Turma</th>
                  <th className="py-4 pr-4 font-semibold">Ano Lectivo</th>
                  <th className="py-4 pr-4 font-semibold">Data</th>
                  <th className="py-4 pr-4 font-semibold">Estado</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">
                    Nenhuma matrícula encontrada.
                  </td></tr>
                )}
                {!loading && filtered.map((e) => {
                  const isSelected = selected.includes(e.id);
                  const name = e.students?.full_name ?? "—";
                  const initials = initialsOf(name) || "??";
                  const color = (e.students?.avatar_color as string) || "blue";
                  const st = e.status ?? "ACTIVE";
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(e.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color] ?? avatarStyles.blue)}>
                            {initials}
                          </div>
                          <div>
                            {e.students?.id ? (
                              <Link
                                to={`/alunos/${e.students.id}`}
                                className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline"
                              >
                                {name}
                              </Link>
                            ) : (
                              <p className="font-semibold text-foreground">{name}</p>
                            )}
                            <p className="text-xs text-muted-foreground">{e.students?.email ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{e.classrooms?.name ?? "—"}</span>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{e.academic_years?.label ?? "—"}</td>
                      <td className="py-4 pr-4 text-muted-foreground">
                        {e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString("pt-PT") : "—"}
                      </td>
                      <td className="py-4 pr-4">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium", statusStyles[st] ?? "bg-muted text-foreground")}>
                          <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                          {statusLabel(st)}
                        </span>
                      </td>
                      <td className="py-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          {!isParent && (
                            <>
                              <button onClick={() => { setEditing(e); setFormOpen(true); }} title="Editar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground">
                                <Pencil className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                              <button onClick={() => setDeleting(e)} title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground">
                                <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                            </>
                          )}
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
              A mostrar {filtered.length} de {enrollments.length} matrículas
            </p>
          </div>
        </div>
      </div>

      <EnrollmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        students={students}
        classrooms={classrooms}
        years={years}
        enrollment={editing}
        onSaved={load}
      />

      <PublishResultsDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        classrooms={classrooms}
        years={years}
        defaultYearId={selectedYearId ?? null}
        defaultClassroomId={filterClassroom !== "all" ? filterClassroom : null}
        onSaved={load}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover matrícula?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer remover a matrícula de <strong>{deleting?.students?.full_name}</strong>?
              Esta acção não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Matriculas;