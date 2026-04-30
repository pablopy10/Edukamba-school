import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Mail, Pencil, Trash2, Loader2, Eye, Phone } from "lucide-react";
import { cn, sortByName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { GuardianFormDialog, GuardianRow } from "@/components/educadores/GuardianFormDialog";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { isNativeMobileApp, showPageKpiCards } from "@/lib/nativeApp";
import { Button } from "@/components/ui/button";

type ClassroomOpt = { id: string; name: string };
type StudentOpt = { id: string; full_name: string; classroom_id: string | null; parent_id: string | null };

const avatarStyles: Record<string, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const palette = ["blue", "pink", "yellow", "green", "lilac"] as const;
const colorFor = (id: string) => palette[(id.charCodeAt(0) + id.charCodeAt(id.length - 1)) % palette.length];
const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

const Educadores = () => {
  const native = isNativeMobileApp();
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();
  const { isTeacher, classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();
  const [guardians, setGuardians] = useState<GuardianRow[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOpt[]>([]);
  const [students, setStudents] = useState<StudentOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClassroom, setFilterClassroom] = useState<string>("all");
  const [selected, setSelected] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GuardianRow | null>(null);
  const [deleting, setDeleting] = useState<GuardianRow | null>(null);
  const [viewing, setViewing] = useState<GuardianRow | null>(null);

  const load = async () => {
    setLoading(true);
    let classroomsQuery = supabase.from("classrooms").select("id, name, academic_year_id").order("name");
    if (selectedYearId) classroomsQuery = classroomsQuery.eq("academic_year_id", selectedYearId);
    if (isTeacher) {
      if (teacherClassroomIds.length === 0) {
        setGuardians([]);
        setStudents([]);
        setClassrooms([]);
        setLoading(false);
        return;
      }
      classroomsQuery = classroomsQuery.in("id", teacherClassroomIds);
    }
    const [{ data: profs, error: pErr }, { data: stus }, { data: clas }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("role", "PARENT")
        .order("full_name", { ascending: true }),
      supabase.from("students").select("id, full_name, classroom_id, parent_id"),
      classroomsQuery,
    ]);
    if (pErr) {
      toast({ title: "Erro a carregar educadores", description: pErr.message, variant: "destructive" });
    }
    let studentsArr = (stus ?? []) as StudentOpt[];
    const classroomsArr = (clas ?? []) as ClassroomOpt[];
    if (isTeacher) {
      const allowed = new Set(teacherClassroomIds);
      studentsArr = studentsArr.filter((s) => s.classroom_id && allowed.has(s.classroom_id));
    }
    let rows: GuardianRow[] = (profs ?? []).map((p: any) => {
      const linked = studentsArr.filter((st) => st.parent_id === p.id);
      return {
        profile_id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        student_ids: linked.map((s) => s.id),
        student_names: linked.map((s) => s.full_name),
        classroom_ids: linked.map((s) => s.classroom_id).filter((x): x is string => !!x),
      };
    });
    if (isTeacher) {
      rows = rows.filter((r) => r.student_ids.length > 0);
    }
    setGuardians(rows);
    setStudents(studentsArr);
    setClassrooms(classroomsArr);
    setLoading(false);
  };

  useEffect(() => {
    if (teacherLoading) return;
    load();
  }, [selectedYearId, teacherLoading, isTeacher, teacherClassroomIds.join(",")]);

  // Reset classroom filter if no longer in current year list
  useEffect(() => {
    if (filterClassroom !== "all" && !classrooms.some((c) => c.id === filterClassroom)) {
      setFilterClassroom("all");
    }
  }, [classrooms, filterClassroom]);

  const classroomName = (id: string | null) =>
    classrooms.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    return guardians.filter((g) => {
      const classNames = g.classroom_ids.map((id) => classroomName(id)).join(" ");
      const studentNames = g.student_names.join(" ");
      const matchSearch = !search || [g.full_name, g.phone ?? "", studentNames, classNames]
        .some((f) => f.toLowerCase().includes(search.toLowerCase()));
      const matchClass = filterClassroom === "all" || g.classroom_ids.includes(filterClassroom);
      return matchSearch && matchClass;
    });
  }, [guardians, search, filterClassroom, classrooms]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map((g) => g.profile_id));

  const handleDelete = async () => {
    if (!deleting) return;
    // Unlink any student first
    if (deleting.student_ids.length > 0) {
      await supabase.from("students").update({ parent_id: null }).eq("parent_id", deleting.profile_id);
    }
    // We can't delete auth users from client; demote profile so it stops appearing as guardian.
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", deleting.profile_id);
    if (error) {
      toast({ title: "Erro a remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Educador removido", description: "A conta foi desactivada." });
      setDeleting(null);
      load();
    }
  };

  const openChat = (profileId: string) => {
    navigate(`/chat?to=${profileId}`);
  };

  const stats = useMemo(() => ({
    total: guardians.length,
    withStudent: guardians.filter((g) => g.student_ids.length > 0).length,
    withoutStudent: guardians.filter((g) => g.student_ids.length === 0).length,
    classes: new Set(guardians.flatMap((g) => g.classroom_ids)).size,
  }), [guardians]);

  const studentLine = (g: GuardianRow) => {
    if (g.student_names.length === 0) return "—";
    if (g.student_names.length === 1) return g.student_names[0];
    return `${g.student_names[0]} +${g.student_names.length - 1}`;
  };

  const renderGuardianCard = (g: GuardianRow) => {
    const isSelected = selected.includes(g.profile_id);
    const initials = initialsOf(g.full_name) || "??";
    const color = colorFor(g.profile_id);
    return (
      <div
        key={g.profile_id}
        className={cn(
          "rounded-2xl border border-border bg-background p-4 shadow-soft transition-colors",
          isSelected ? "border-pastel-blue/60 bg-pastel-blue/10" : "hover:bg-muted/30",
        )}
      >
        <div className="flex gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggle(g.profile_id)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-pastel-blue-foreground"
            aria-label={`Seleccionar ${g.full_name}`}
          />
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color])}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{g.full_name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{g.phone ?? "—"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground" title={g.student_names.join(", ")}>
                Aluno(s): {studentLine(g)}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                {g.classroom_ids.length === 0
                  ? "Turma: —"
                  : g.classroom_ids.length <= 2
                    ? g.classroom_ids.map((cid) => classroomName(cid)).join(" · ")
                    : `${classroomName(g.classroom_ids[0])} +${g.classroom_ids.length - 1}`}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => setViewing(g)}
              title="Ver detalhes"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-lilac/50 hover:text-pastel-lilac-foreground"
            >
              <Eye className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => openChat(g.profile_id)}
              title="Conversar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/40 hover:text-pastel-blue-foreground"
            >
              <Mail className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {!isTeacher && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(g);
                    setFormOpen(true);
                  }}
                  title="Editar"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground"
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(g)}
                  title="Eliminar"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && !isTeacher && "relative pb-28")}>
        <div className={cn("flex flex-col gap-4", native ? "" : "sm:flex-row sm:items-center sm:justify-between")}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Educadores</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão dos encarregados de educação dos alunos.</p>
          </div>
          <div className={cn("flex flex-wrap items-center gap-3", native && "w-full")}>
            <div className={cn("relative", native ? "min-w-0 flex-1" : "")}>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar educador..."
                className={cn(
                  "h-11 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20",
                  native ? "w-full min-w-0" : "w-72",
                )}
              />
            </div>
            {!isTeacher && !native && (
              <button
                onClick={() => { setEditing(null); setFormOpen(true); }}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                Novo Educador
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className={cn("min-w-[220px] flex-1", native && "min-w-0 w-full")}>
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
          {filterClassroom !== "all" && (
            <button
              onClick={() => setFilterClassroom("all")}
              className="h-10 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
            >Limpar filtros</button>
          )}
        </div>

        {showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Educadores", value: String(stats.total), color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Com aluno associado", value: String(stats.withStudent), color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Sem aluno", value: String(stats.withoutStudent), color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Turmas representadas", value: String(stats.classes), color: "bg-pastel-lilac text-pastel-lilac-foreground" },
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
            <h2 className="text-lg font-bold text-foreground">Lista de Educadores</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionados</span>
              </div>
            )}
          </div>

          {native ? (
            <div className="flex flex-col gap-3 p-4">
              {filtered.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                  />
                  Seleccionar todos ({filtered.length})
                </label>
              )}
              {loading && (
                <div className="flex justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum educador encontrado.</p>
              )}
              {!loading && filtered.map(renderGuardianCard)}
            </div>
          ) : (
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
                  <th className="py-4 pr-4 font-semibold">Nome do Educador</th>
                  <th className="py-4 pr-4 font-semibold">Aluno</th>
                  <th className="py-4 pr-4 font-semibold">Turma</th>
                  <th className="py-4 pr-4 font-semibold">Telefone</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">
                    Nenhum educador encontrado.
                  </td></tr>
                )}
                {!loading && filtered.map((g) => {
                  const isSelected = selected.includes(g.profile_id);
                  const initials = initialsOf(g.full_name) || "??";
                  const color = colorFor(g.profile_id);
                  return (
                    <tr
                      key={g.profile_id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(g.profile_id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color])}>
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{g.full_name}</p>
                            <p className="text-xs text-muted-foreground">{g.phone ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">
                        {g.student_names.length === 0 ? (
                          "—"
                        ) : g.student_names.length === 1 ? (
                          g.student_names[0]
                        ) : (
                          <span title={g.student_names.join(", ")}>
                            {g.student_names[0]}{" "}
                            <span className="ml-1 inline-flex items-center rounded-full bg-pastel-blue/40 px-2 py-0.5 text-[10px] font-semibold text-pastel-blue-foreground">
                              +{g.student_names.length - 1}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        {g.classroom_ids.length === 0 ? (
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {g.classroom_ids.slice(0, 2).map((cid) => (
                              <span key={cid} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                                {classroomName(cid)}
                              </span>
                            ))}
                            {g.classroom_ids.length > 2 && (
                              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                                +{g.classroom_ids.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{g.phone ?? "—"}</span>
                      </td>
                      <td className="py-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewing(g)} title="Ver detalhes" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-lilac/50 hover:text-pastel-lilac-foreground">
                            <Eye className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button onClick={() => openChat(g.profile_id)} title="Conversar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/40 hover:text-pastel-blue-foreground">
                            <Mail className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          {!isTeacher && (
                            <>
                              <button onClick={() => { setEditing(g); setFormOpen(true); }} title="Editar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground">
                                <Pencil className="h-4 w-4" strokeWidth={1.75} />
                              </button>
                              <button onClick={() => setDeleting(g)} title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground">
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
          )}

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              A mostrar {filtered.length} de {guardians.length} educadores
            </p>
          </div>
        </div>
      </div>

      {native && !isTeacher && (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-24 right-5 z-40 h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg"
          aria-label="Novo educador"
          onClick={() => { setEditing(null); setFormOpen(true); }}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      <GuardianFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        students={students.map((s) => ({ id: s.id, full_name: s.full_name }))}
        guardian={editing}
        onSaved={load}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover educador?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer remover <strong>{deleting?.full_name}</strong>?
              A conta será desactivada e desassociada do aluno.
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

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Educador</DialogTitle>
            <DialogDescription>Informações de contacto e alunos associados.</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <div className={cn("flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold", avatarStyles[colorFor(viewing.profile_id)])}>
                  {initialsOf(viewing.full_name) || "??"}
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{viewing.full_name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {viewing.phone ?? "—"}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alunos</p>
                {viewing.student_names.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem alunos associados.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {viewing.student_names.map((name, idx) => {
                      const cid = viewing.student_ids[idx]
                        ? students.find((s) => s.id === viewing.student_ids[idx])?.classroom_id ?? null
                        : null;
                      return (
                        <li key={idx} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                          <span className="text-sm font-medium text-foreground">{name}</span>
                          <span className="rounded-full bg-pastel-blue/40 px-2.5 py-0.5 text-xs font-semibold text-pastel-blue-foreground">
                            {classroomName(cid)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Educadores;
