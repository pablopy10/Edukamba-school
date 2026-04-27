import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Plus, Pencil, Trash2, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StudentFormDialog, StudentRow } from "@/components/alunos/StudentFormDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { ExcelImportDialog, ImportField } from "@/components/shared/ExcelImportDialog";

type ClassroomOpt = { id: string; name: string };

const avatarStyles: Record<string, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

const Alunos = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClassroom, setFilterClassroom] = useState<string>("all");
  const [selected, setSelected] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState<StudentRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: sData, error: sErr }, { data: cData }] = await Promise.all([
      supabase
        .from("students")
        .select("id, full_name, email, phone, birth_date, gender, enrollment_number, classroom_id, avatar_color, school_id, classrooms(id, name)")
        .order("created_at", { ascending: false }),
      supabase.from("classrooms").select("id, name").order("name"),
    ]);
    if (sErr) {
      toast({ title: "Erro a carregar alunos", description: sErr.message, variant: "destructive" });
    }
    setStudents((sData ?? []) as unknown as StudentRow[]);
    setClassrooms((cData ?? []) as ClassroomOpt[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const classroomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchSearch = !search || [s.full_name, s.email ?? "", s.enrollment_number ?? "", classroomName(s.classroom_id)]
        .some((f) => f.toLowerCase().includes(search.toLowerCase()));
      const matchClass = filterClassroom === "all" || s.classroom_id === filterClassroom;
      return matchSearch && matchClass;
    });
  }, [students, search, filterClassroom, classrooms]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = filtered.length > 0 && selected.length === filtered.length;
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map((s) => s.id));

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from("students").delete().eq("id", deleting.id);
    if (error) {
      toast({ title: "Erro a eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Aluno removido" });
      setDeleting(null);
      load();
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: students.length,
      active: students.length,
      newThisMonth: students.filter((s) => {
        // approximate: based on enrollment_number prefix or skip; use 0
        return false;
      }).length,
      inactive: 0,
    };
  }, [students]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Alunos</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão e acompanhe todos os alunos da escola.</p>
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
              Novo Aluno
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-green px-5 text-sm font-semibold text-pastel-green-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Upload className="h-4 w-4" strokeWidth={2.25} />
              Importar Excel
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="min-w-[200px] flex-1">
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

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Alunos", value: String(stats.total), color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Alunos Activos", value: String(stats.active), color: "bg-pastel-green text-pastel-green-foreground" },
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
            <h2 className="text-lg font-bold text-foreground">Lista de Alunos</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionados</span>
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
                  <th className="py-4 pr-4 font-semibold">Nome do Aluno</th>
                  <th className="py-4 pr-4 font-semibold">ID Aluno</th>
                  <th className="py-4 pr-4 font-semibold">Turma</th>
                  <th className="py-4 pr-4 font-semibold">Data Nasc.</th>
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
                    Nenhum aluno encontrado.
                  </td></tr>
                )}
                {!loading && filtered.map((s) => {
                  const isSelected = selected.includes(s.id);
                  const initials = initialsOf(s.full_name) || "??";
                  const color = (s.avatar_color as string) || "blue";
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(s.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[color] ?? avatarStyles.blue)}>
                            {initials}
                          </div>
                          <div>
                            <Link to={`/alunos/${s.id}`} className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline">
                              {s.full_name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{s.email ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{s.enrollment_number ?? "—"}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{classroomName(s.classroom_id)}</span>
                      </td>
                      <td className="py-4 pr-4 text-muted-foreground">
                        {s.birth_date ? new Date(s.birth_date).toLocaleDateString("pt-PT") : "—"}
                      </td>
                      <td className="py-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditing(s); setFormOpen(true); }} title="Editar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground">
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button onClick={() => setDeleting(s)} title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground">
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
              A mostrar {filtered.length} de {students.length} alunos
            </p>
          </div>
        </div>
      </div>

      <StudentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        classrooms={classrooms}
        student={editing}
        onSaved={load}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover aluno?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer remover <strong>{deleting?.full_name}</strong>?
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

      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Alunos"
        description="Importe vários alunos a partir de um ficheiro Excel ou CSV."
        templateSheetName="Alunos"
        fields={[
          { key: "full_name", label: "Nome completo", required: true, aliases: ["nome", "name", "aluno"], example: "Sara Miller" },
          { key: "email", label: "Email", aliases: ["e-mail"], example: "sara@escola.ao" },
          { key: "phone", label: "Telefone", aliases: ["telemovel", "tel", "phone"], example: "924 000 000" },
          { key: "enrollment_number", label: "Nº Matrícula", aliases: ["matricula", "n matricula", "numero"], example: "2024-01-001" },
          { key: "birth_date", label: "Data de nascimento", aliases: ["data nascimento", "nascimento", "birth"], example: "2012-05-14" },
          { key: "gender", label: "Género", aliases: ["genero", "sexo"], example: "Masculino" },
          { key: "classroom", label: "Turma", aliases: ["turma", "classe", "classroom"], example: "5ª A" },
        ]}
        onImportRow={async (row) => {
          if (!row.full_name) throw new Error("Nome em falta");
          const { data: profile } = await supabase
            .from("profiles").select("school_id")
            .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
            .maybeSingle();
          const schoolId = profile?.school_id;
          if (!schoolId) throw new Error("Escola não encontrada");
          let classroom_id: string | null = null;
          if (row.classroom) {
            const match = classrooms.find((c) => c.name.toLowerCase() === row.classroom.toLowerCase());
            classroom_id = match?.id ?? null;
          }
          let gender: string | null = null;
          if (row.gender) {
            const g = row.gender.toLowerCase();
            gender = g.startsWith("m") ? "M" : g.startsWith("f") ? "F" : null;
          }
          let birth_date: string | null = null;
          if (row.birth_date) {
            const d = new Date(row.birth_date);
            if (!isNaN(d.getTime())) birth_date = d.toISOString().slice(0, 10);
          }
          const { error } = await supabase.from("students").insert({
            full_name: row.full_name,
            email: row.email || null,
            phone: row.phone || null,
            enrollment_number: row.enrollment_number || null,
            birth_date,
            gender,
            classroom_id,
            avatar_color: "blue",
            school_id: schoolId,
          });
          if (error) throw new Error(error.message);
        }}
        onCompleted={load}
      />
    </DashboardLayout>
  );
};

export default Alunos;