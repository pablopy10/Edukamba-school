import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Plus, Users, Presentation, Pencil, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClassroomFormDialog, ClassroomRow } from "@/components/turmas/ClassroomFormDialog";
import { useAcademicYear } from "@/context/AcademicYearContext";

type ClassroomWithJoins = ClassroomRow & {
  courses?: { id: string; name: string } | null;
  academic_years?: { id: string; label: string } | null;
  studentCount: number;
};

const palette = ["blue", "lilac", "yellow", "green", "pink"] as const;
const colorStyles: Record<(typeof palette)[number], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};
const periodStyles: Record<string, string> = {
  "Manhã": "bg-pastel-yellow text-pastel-yellow-foreground",
  "Tarde": "bg-pastel-blue text-pastel-blue-foreground",
  "Noite": "bg-pastel-lilac text-pastel-lilac-foreground",
};

const Turmas = () => {
  const { selectedYearId } = useAcademicYear();
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<ClassroomWithJoins[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [years, setYears] = useState<{ id: string; label: string; is_active: boolean | null }[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassroomRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      let classroomsQuery = supabase
        .from("classrooms")
        .select(`id, name, grade_level, period, course_id, academic_year_id, school_id,
                 courses(id, name), academic_years(id, label)`)
        .order("name", { ascending: true });
      if (selectedYearId) classroomsQuery = classroomsQuery.eq("academic_year_id", selectedYearId);

      const [{ data: cls, error }, { data: cs }, { data: ys }, { data: students }] = await Promise.all([
        classroomsQuery,
        supabase.from("courses").select("id, name").order("name"),
        supabase.from("academic_years").select("id, label, is_active").order("start_date", { ascending: false }),
        supabase.from("students").select("id, classroom_id"),
      ]);
      if (error) throw error;

      const studentCountByClass = new Map<string, number>();
      (students ?? []).forEach((s) => {
        if (s.classroom_id) {
          studentCountByClass.set(s.classroom_id, (studentCountByClass.get(s.classroom_id) ?? 0) + 1);
        }
      });

      setClassrooms(
        (cls ?? []).map((c: any) => ({
          ...c,
          studentCount: studentCountByClass.get(c.id) ?? 0,
        })),
      );
      setCourses(cs ?? []);
      setYears(ys ?? []);
    } catch (e: any) {
      toast({ title: "Erro a carregar turmas", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [selectedYearId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return classrooms.filter((c) => {
      if (periodFilter !== "all" && (c.period ?? "") !== periodFilter) return false;
      if (courseFilter !== "all" && (c.course_id ?? "") !== courseFilter) return false;
      if (!q) return true;
      return [c.name, c.grade_level ?? "", c.courses?.name ?? "", c.period ?? ""].some((f) => f.toLowerCase().includes(q));
    });
  }, [classrooms, search, periodFilter, courseFilter]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("classrooms").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro a eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Turma eliminada" });
      load();
    }
    setDeleteId(null);
  };

  const colorFor = (id: string) => palette[id.charCodeAt(0) % palette.length];

  const stats = useMemo(() => ({
    total: classrooms.length,
    manha: classrooms.filter((c) => c.period === "Manhã").length,
    tarde: classrooms.filter((c) => c.period === "Tarde").length,
    noite: classrooms.filter((c) => c.period === "Noite").length,
  }), [classrooms]);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Turmas</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão de todas as turmas da escola.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar turma..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-11 w-40 rounded-full border-border bg-card shadow-soft">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os períodos</SelectItem>
                <SelectItem value="Manhã">Manhã</SelectItem>
                <SelectItem value="Tarde">Tarde</SelectItem>
                <SelectItem value="Noite">Noite</SelectItem>
              </SelectContent>
            </Select>
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="h-11 w-48 rounded-full border-border bg-card shadow-soft">
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cursos</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Nova Turma
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Turmas", value: stats.total, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Manhã", value: stats.manha, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Tarde", value: stats.tarde, color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Noite", value: stats.noite, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center shadow-card">
            <p className="text-sm text-muted-foreground">Nenhuma turma encontrada.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((c) => {
              const color = colorFor(c.id);
              return (
                <div key={c.id} className="group flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card transition-transform hover:-translate-y-1">
                  <div className="flex items-start justify-between">
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", colorStyles[color])}>
                      <Presentation className="h-6 w-6" strokeWidth={1.75} />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        title="Editar"
                        onClick={() => { setEditing(c); setFormOpen(true); }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button
                        title="Eliminar"
                        onClick={() => setDeleteId(c.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-foreground">{c.name}</h3>
                    {c.courses?.name && (
                      <p className="mt-1 text-xs text-muted-foreground">{c.courses.name}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {c.period && (
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", periodStyles[c.period] ?? "bg-muted text-foreground")}>
                        {c.period}
                      </span>
                    )}
                    {c.grade_level && (
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                        {c.grade_level}º ano
                      </span>
                    )}
                    {c.academic_years?.label && (
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                        {c.academic_years.label}
                      </span>
                    )}
                  </div>

                  <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {c.studentCount} alunos
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ClassroomFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        courses={courses}
        years={years}
        classroom={editing}
        onSaved={load}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar turma?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção não pode ser desfeita. Os alunos associados perderão a referência a esta turma.
            </AlertDialogDescription>
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

export default Turmas;