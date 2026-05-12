import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Mail, Pencil, Trash2, Loader2, MessageCircle, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TeacherFormDialog, TeacherRow } from "@/components/professores/TeacherFormDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { isNativeMobileApp, showPageKpiCards, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { useParentChildren } from "@/hooks/useParentChildren";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";

type SubjectOpt = { id: string; name: string };

const avatarStyles: Record<string, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

async function fetchParentScopedTeachers(classroomIds: string[]): Promise<{
  rows: TeacherRow[];
  subjects: SubjectOpt[];
}> {
  const emptySubjects: SubjectOpt[] = [];
  if (classroomIds.length === 0) return { rows: [], subjects: emptySubjects };

  const { data: clsRows } = await supabase
    .from("classrooms")
    .select("homeroom_teacher_id")
    .in("id", classroomIds);

  const homeroomProfiles = new Set(
    ((clsRows ?? []) as { homeroom_teacher_id: string | null }[])
      .map((r) => r.homeroom_teacher_id)
      .filter((x): x is string => !!x),
  );

  const { data: schRows } = await supabase
    .from("schedules")
    .select("teacher_id")
    .in("classroom_id", classroomIds);

  let profileIds = [
    ...new Set(
      ((schRows ?? []) as { teacher_id: string | null }[])
        .map((s) => s.teacher_id)
        .filter((x): x is string => !!x),
    ),
  ];
  homeroomProfiles.forEach((pid) => {
    if (!profileIds.includes(pid)) profileIds.push(pid);
  });

  const { data: allSubjects } = await supabase.from("subjects").select("id, name").order("name");

  const byProfile = new Map<string, TeacherRow>();

  if (profileIds.length > 0) {
    const { data: tData, error: tErr } = await supabase
      .from("teachers")
      .select("id, profile_id, subject_id, hire_date, employee_id, avatar_color, education_institution, academic_degree, field_of_study, birth_date, profiles(full_name, phone, email)")
      .in("profile_id", profileIds)
      .order("created_at", { ascending: false });

    if (tErr) throw tErr;

    const raw = ((tData ?? []) as unknown as TeacherRow[]).filter((t) => t.profile_id);
    raw.forEach((row) => {
      const pid = row.profile_id as string;
      if (!byProfile.has(pid)) byProfile.set(pid, { ...row });
    });
  }

  /** Diretores só com perfil, sem fichas teachers */
  const synthetic: TeacherRow[] = [];
  for (const pid of homeroomProfiles) {
    if (byProfile.has(pid)) {
      const r = byProfile.get(pid)!;
      byProfile.set(pid, { ...r, isHomeroomDirector: true });
      continue;
    }
    const { data: prof } = await supabase.from("profiles").select("full_name, phone, email").eq("id", pid).maybeSingle();
    synthetic.push({
      id: `synthetic-${pid}`,
      profile_id: pid,
      subject_id: null,
      hire_date: null,
      employee_id: null,
      avatar_color: "lilac",
      education_institution: null,
      academic_degree: null,
      field_of_study: null,
      birth_date: null,
      profiles: prof ? { full_name: prof.full_name, phone: prof.phone, email: prof.email } : null,
      isHomeroomDirector: true,
      isSyntheticParentRow: true,
    });
  }

  let rows = [...byProfile.values(), ...synthetic];
  rows = rows.sort((a, b) =>
    (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? "", "pt"),
  );

  rows = rows.map((r) =>
    r.profile_id && homeroomProfiles.has(r.profile_id) ? { ...r, isHomeroomDirector: true } : r,
  );

  return { rows, subjects: allSubjects ?? [] };
}

const Professores = () => {
  const native = isNativeMobileApp();
  const navigate = useNavigate();
  const { role, loading: roleLoading } = useUserRole();
  const isParent = role === "PARENT";
  const { classroomIds, loading: parentLoading } = useParentChildren();
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [hireFrom, setHireFrom] = useState("");
  const [hireTo, setHireTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherRow | null>(null);
  const [deleting, setDeleting] = useState<TeacherRow | null>(null);

  const loadAdminTeachers = async () => {
    setLoading(true);
    const [{ data: tData, error: tErr }, { data: sData }] = await Promise.all([
      supabase
        .from("teachers")
        .select("id, profile_id, subject_id, hire_date, employee_id, avatar_color, education_institution, academic_degree, field_of_study, birth_date, profiles(full_name, phone, email)")
        .order("created_at", { ascending: false }),
      supabase.from("subjects").select("id, name").order("name"),
    ]);
    if (tErr) {
      toast({ title: "Erro a carregar professores", description: tErr.message, variant: "destructive" });
    }
    setTeachers((tData ?? []) as unknown as TeacherRow[]);
    setSubjects((sData ?? []) as SubjectOpt[]);
    setLoading(false);
  };

  const loadParentTeachers = async () => {
    setLoading(true);
    try {
      if (classroomIds.length === 0) {
        setTeachers([]);
        setSubjects([]);
      } else {
        const { rows, subjects: subj } = await fetchParentScopedTeachers(classroomIds);
        setTeachers(rows);
        setSubjects(subj);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro a carregar professores", description: msg, variant: "destructive" });
      setTeachers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (roleLoading || role === null) return;
    if (role === "PARENT") {
      if (!parentLoading) void loadParentTeachers();
    } else {
      void loadAdminTeachers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, roleLoading, parentLoading, classroomIds.join(",")]);

  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    return teachers.filter((t) => {
      const name = t.profiles?.full_name ?? "";
      const matchSearch = !search || [name, t.employee_id ?? "", subjectName(t.subject_id)]
        .some((f) => f.toLowerCase().includes(search.toLowerCase()));
      const matchSubject = filterSubject === "all" || t.subject_id === filterSubject;
      const matchFrom = !hireFrom || (t.hire_date && t.hire_date >= hireFrom);
      const matchTo = !hireTo || (t.hire_date && t.hire_date <= hireTo);
      return matchSearch && matchSubject && matchFrom && matchTo;
    });
  }, [teachers, search, filterSubject, hireFrom, hireTo, subjects]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map((t) => t.id));

  const handleDelete = async () => {
    if (!deleting) return;
    const { data, error } = await supabase.functions.invoke("delete-teacher", {
      body: { teacher_id: deleting.id },
    });
    if (error || (data as any)?.error) {
      toast({
        title: "Erro a eliminar",
        description: (data as any)?.error ?? error?.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Professor removido", description: "Conta de acesso também foi eliminada." });
      setDeleting(null);
      void loadAdminTeachers();
    }
  };

  const openChat = (profileId: string | null) => {
    if (!profileId) return;
    navigate(`/chat?to=${profileId}`);
  };

  const professorHref = (t: TeacherRow) =>
    t.isSyntheticParentRow && t.profile_id ? `/professores/perfil/${t.profile_id}` : `/professores/${t.id}`;

  const stats = useMemo(() => ({
    total: teachers.length,
    active: teachers.length, // is_active default true; placeholder
    newThisMonth: teachers.filter((t) => {
      if (!t.hire_date) return false;
      const d = new Date(t.hire_date);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length,
    inactive: 0,
  }), [teachers]);

  const renderTeacherCard = (t: TeacherRow) => {
    const name = t.profiles?.full_name ?? "—";
    const initials = initialsOf(name) || "??";
    const color = (t.avatar_color as string) || "blue";
    const href = professorHref(t);

    if (isParent) {
      return (
        <div
          key={t.id}
          className="rounded-2xl border border-border bg-background p-4 shadow-soft"
        >
          <div className="flex gap-3">
            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color] ?? avatarStyles.blue)}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <Link to={href} className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline">
                {name}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.isHomeroomDirector && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-pastel-green/35 px-2.5 py-1 text-[11px] font-semibold text-pastel-green-foreground">
                    <UserCog className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Diretor de turma
                  </span>
                )}
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", "bg-pastel-blue/30 text-pastel-blue-foreground")}>
                  {subjectName(t.subject_id)}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Button
                type="button"
                size="sm"
                className="rounded-full bg-pastel-blue text-pastel-blue-foreground shadow-soft hover:opacity-90"
                onClick={() => openChat(t.profile_id)}
              >
                <MessageCircle className="mr-1.5 h-4 w-4" strokeWidth={1.75} />
                Mensagem
              </Button>
              <Link to={href} className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Ver perfil
              </Link>
            </div>
          </div>
        </div>
      );
    }

    const isSelected = selected.includes(t.id);
    return (
      <div
        key={t.id}
        className={cn(
          "rounded-2xl border border-border bg-background p-4 shadow-soft transition-colors",
          isSelected ? "border-pastel-blue/60 bg-pastel-blue/10" : "hover:bg-muted/30",
        )}
      >
        <div className="flex gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggle(t.id)}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-pastel-blue-foreground"
            aria-label={`Seleccionar ${name}`}
          />
          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color] ?? avatarStyles.blue)}>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <Link to={href} className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline">
              {name}
            </Link>
            <p className="mt-0.5 text-sm text-muted-foreground">{t.profiles?.phone ?? "—"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                ID: {t.employee_id ?? "—"}
              </span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", "bg-pastel-blue/30 text-pastel-blue-foreground")}>
                {subjectName(t.subject_id)}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                Admissão: {t.hire_date ? new Date(t.hire_date).toLocaleDateString("pt-PT") : "—"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => openChat(t.profile_id)}
              title="Conversar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/40 hover:text-pastel-blue-foreground"
            >
              <Mail className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(t);
                setFormOpen(true);
              }}
              title="Editar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground"
            >
              <Pencil className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setDeleting(t)}
              title="Eliminar"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (roleLoading || (isParent && parentLoading)) {
    return <PageLoadingSkeleton />;
  }

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && !isParent && "relative pb-28")}>
        {/* Page header */}
        <div className={cn("flex flex-col gap-4", native ? "" : "sm:flex-row sm:items-center sm:justify-between")}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Professores</h1>
            <p className="text-sm text-muted-foreground">
              {isParent
                ? "Professores que dão aula à turma do educando seleccionado (e o diretor de turma, quando definido)."
                : "Faça a gestão e acompanhe todos os professores da escola."}
            </p>
          </div>
          <div className={cn("flex flex-wrap items-center gap-3", native && "w-full")}>
            <div className={cn("relative", native ? "min-w-0 flex-1" : "")}>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar por nome..."
                className={cn(
                  "h-11 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20",
                  native ? "w-full min-w-0" : "w-72",
                )}
              />
            </div>
            {!native && !isParent && (
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo Professor
            </button>
            )}
          </div>
        </div>

        {/* Filters row */}
        {!isParent && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className={cn("min-w-[180px] flex-1", native && "min-w-0 w-full")}>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Disciplina</label>
            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as disciplinas</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Admissão de</label>
            <Input type="date" value={hireFrom} onChange={(e) => setHireFrom(e.target.value)} className="h-10" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">até</label>
            <Input type="date" value={hireTo} onChange={(e) => setHireTo(e.target.value)} className="h-10" />
          </div>
          {(filterSubject !== "all" || hireFrom || hireTo) && (
            <button
              onClick={() => { setFilterSubject("all"); setHireFrom(""); setHireTo(""); }}
              className="h-10 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
            >Limpar filtros</button>
          )}
        </div>
        )}

        {/* Stats row */}
        {showPageKpiCards() && !isParent && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Professores", value: String(stats.total), color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Professores Activos", value: String(stats.active), color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Novos este mês", value: String(stats.newThisMonth), color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Inactivos", value: String(stats.inactive), color: "bg-pastel-pink text-pastel-pink-foreground" },
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

        {/* Table card */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">Lista de Professores</h2>
            {selected.length > 0 && !isParent && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionados</span>
                <button className="rounded-full bg-pastel-pink px-3 py-1.5 text-xs font-medium text-pastel-pink-foreground">
                  Eliminar
                </button>
              </div>
            )}
          </div>

          {native ? (
            <div className="flex flex-col gap-3 p-4">
              {filtered.length > 0 && !isParent && (
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
                <p className="py-10 text-center text-sm text-muted-foreground">Nenhum professor encontrado.</p>
              )}
              {!loading && filtered.map(renderTeacherCard)}
            </div>
          ) : (
          <div className="overflow-x-auto">
            {isParent ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                  <th className="py-4 pl-5 pr-4 font-semibold">Professor</th>
                  <th className="py-4 pr-4 font-semibold">Disciplina</th>
                  <th className="py-4 pr-4 font-semibold">Diretor de turma</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">
                    {classroomIds.length === 0
                      ? "Seleccione ou associe um educando a uma turma para ver os professores."
                      : "Nenhum professor encontrado para a turma do educando seleccionado."}
                  </td></tr>
                )}
                {!loading &&
                  filtered.map((t) => {
                    const name = t.profiles?.full_name ?? "—";
                    const initials = initialsOf(name) || "??";
                    const color = (t.avatar_color as string) || "blue";
                    const href = professorHref(t);
                    return (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="py-4 pl-5 pr-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color] ?? avatarStyles.blue)}>
                              {initials}
                            </div>
                            <Link to={href} className="font-semibold text-foreground hover:text-pastel-blue-foreground hover:underline">
                              {name}
                            </Link>
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{subjectName(t.subject_id)}</span>
                        </td>
                        <td className="py-4 pr-4">
                          {t.isHomeroomDirector ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pastel-green/35 px-2 py-1 text-[11px] font-semibold text-pastel-green-foreground">
                              <UserCog className="h-3 w-3" strokeWidth={1.75} /> Sim
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-4 pr-5">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-full border-pastel-blue/40 text-pastel-blue-foreground hover:bg-pastel-blue/15"
                              onClick={() => openChat(t.profile_id)}
                            >
                              <MessageCircle className="mr-1.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
                              Mensagem
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            ) : (
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
                  <th className="py-4 pr-4 font-semibold">Nome do Professor</th>
                  <th className="py-4 pr-4 font-semibold">ID Professor</th>
                  <th className="py-4 pr-4 font-semibold">Disciplina</th>
                  <th className="py-4 pr-4 font-semibold">Data Admissão</th>
                  <th className="py-4 pr-4 font-semibold">Telefone</th>
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
                    Nenhum professor encontrado.
                  </td></tr>
                )}
                {!loading && filtered.map((t) => {
                  const isSelected = selected.includes(t.id);
                  const name = t.profiles?.full_name ?? "—";
                  const initials = initialsOf(name) || "??";
                  const color = (t.avatar_color as string) || "blue";
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(t.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color] ?? avatarStyles.blue)}>
                            {initials}
                          </div>
                          <div>
                            <Link to={professorHref(t)} className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline">
                              {name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{t.profiles?.phone ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{t.employee_id ?? "—"}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{subjectName(t.subject_id)}</span>
                      </td>
                      <td className="py-4 pr-4 text-muted-foreground">
                        {t.hire_date ? new Date(t.hire_date).toLocaleDateString("pt-PT") : "—"}
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{t.profiles?.phone ?? "—"}</span>
                      </td>
                      <td className="py-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openChat(t.profile_id)} title="Conversar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/40 hover:text-pastel-blue-foreground">
                            <Mail className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button onClick={() => { setEditing(t); setFormOpen(true); }} title="Editar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground">
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button onClick={() => setDeleting(t)} title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground">
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
          )}

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              A mostrar {filtered.length} de {teachers.length} professores
            </p>
          </div>
        </div>
      </div>

      {native && !isParent && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label="Novo professor"
            onClick={() => { setEditing(null); setFormOpen(true); }}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      {!isParent && (
        <>
      <TeacherFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        subjects={subjects}
        teacher={editing}
        onSaved={loadAdminTeachers}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover professor?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer remover <strong>{deleting?.profiles?.full_name}</strong>?
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
        </>
      )}
    </>
  );
};

export default Professores;
