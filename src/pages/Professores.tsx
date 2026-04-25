import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Plus, Mail, Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TeacherFormDialog, TeacherRow } from "@/components/professores/TeacherFormDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

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

const Professores = () => {
  const navigate = useNavigate();
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

  const load = async () => {
    setLoading(true);
    const [{ data: tData, error: tErr }, { data: sData }] = await Promise.all([
      supabase
        .from("teachers")
        .select("id, profile_id, subject_id, hire_date, employee_id, avatar_color, profiles(full_name, phone)")
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

  useEffect(() => { load(); }, []);

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
    const { error } = await supabase.from("teachers").delete().eq("id", deleting.id);
    if (error) {
      toast({ title: "Erro a eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Professor removido" });
      setDeleting(null);
      load();
    }
  };

  const openChat = (profileId: string | null) => {
    if (!profileId) return;
    navigate(`/chat?to=${profileId}`);
  };

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

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Professores</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão e acompanhe todos os professores da escola.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar por nome..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo Professor
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="min-w-[180px] flex-1">
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

        {/* Stats row */}
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

        {/* Table card */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">Lista de Professores</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionados</span>
                <button className="rounded-full bg-pastel-pink px-3 py-1.5 text-xs font-medium text-pastel-pink-foreground">
                  Eliminar
                </button>
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
                            <Link to={`/professores/${t.id}`} className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline">
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
          </div>

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              A mostrar {filtered.length} de {teachers.length} professores
            </p>
          </div>
        </div>
      </div>

      <TeacherFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        subjects={subjects}
        teacher={editing}
        onSaved={load}
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
    </DashboardLayout>
  );
};

export default Professores;
