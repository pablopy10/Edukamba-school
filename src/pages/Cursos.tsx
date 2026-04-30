import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Plus, Pencil, Trash2, BookOpen, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CourseFormDialog, CourseRow } from "@/components/cursos/CourseFormDialog";
import { showPageKpiCards, isNativeMobileApp } from "@/lib/nativeApp";
import { Button } from "@/components/ui/button";

type CourseWithStats = CourseRow & {
  classroomCount: number;
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
const levelStyles: Record<string, string> = {
  Básico: "bg-pastel-green text-pastel-green-foreground",
  Médio: "bg-pastel-blue text-pastel-blue-foreground",
  Avançado: "bg-pastel-lilac text-pastel-lilac-foreground",
};

const Cursos = () => {
  const native = isNativeMobileApp();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseWithStats[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CourseRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: cs, error } = await supabase
        .from("courses")
        .select("id, name, type, description, school_id")
        .order("name", { ascending: true });
      if (error) throw error;

      const { data: classes } = await supabase
        .from("classrooms")
        .select("id, course_id");
      const { data: students } = await supabase
        .from("students")
        .select("id, classroom_id");

      const classroomToCourse = new Map<string, string>();
      (classes ?? []).forEach((cl) => {
        if (cl.course_id) classroomToCourse.set(cl.id, cl.course_id);
      });
      const classroomCountByCourse = new Map<string, number>();
      (classes ?? []).forEach((cl) => {
        if (cl.course_id) {
          classroomCountByCourse.set(cl.course_id, (classroomCountByCourse.get(cl.course_id) ?? 0) + 1);
        }
      });
      const studentCountByCourse = new Map<string, number>();
      (students ?? []).forEach((s) => {
        const courseId = s.classroom_id ? classroomToCourse.get(s.classroom_id) : undefined;
        if (courseId) {
          studentCountByCourse.set(courseId, (studentCountByCourse.get(courseId) ?? 0) + 1);
        }
      });

      setCourses(
        (cs ?? []).map((c) => ({
          ...c,
          classroomCount: classroomCountByCourse.get(c.id) ?? 0,
          studentCount: studentCountByCourse.get(c.id) ?? 0,
        })),
      );
    } catch (e: any) {
      toast({ title: "Erro a carregar cursos", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return courses.filter((c) => {
      if (levelFilter !== "all" && (c.type ?? "") !== levelFilter) return false;
      if (!q) return true;
      return [c.name, c.type ?? "", c.description ?? ""].some((f) => f.toLowerCase().includes(q));
    });
  }, [courses, search, levelFilter]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("courses").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro a eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Curso eliminado" });
      load();
    }
    setDeleteId(null);
  };

  const colorFor = (id: string) => palette[id.charCodeAt(0) % palette.length];

  const stats = useMemo(() => ({
    total: courses.length,
    basico: courses.filter((c) => c.type === "Básico").length,
    medio: courses.filter((c) => c.type === "Médio").length,
    avancado: courses.filter((c) => c.type === "Avançado").length,
  }), [courses]);

  return (
    <DashboardLayout>
      <div className={cn("flex flex-col gap-6", native && "relative pb-28")}>
        <div className={cn("flex flex-col gap-4", native ? "" : "sm:flex-row sm:items-center sm:justify-between")}>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Cursos</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão de todos os cursos oferecidos pela escola.</p>
          </div>
          <div className={cn("flex flex-wrap items-center gap-3", native && "w-full")}>
            <div className={cn("relative", native ? "min-w-0 flex-1" : "")}>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar curso..."
                className={cn(
                  "h-11 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20",
                  native ? "w-full min-w-0" : "w-72",
                )}
              />
            </div>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className={cn("h-11 rounded-full border-border bg-card shadow-soft", native ? "w-full" : "w-44")}>
                <SelectValue placeholder="Filtrar nível" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os níveis</SelectItem>
                <SelectItem value="Básico">Básico</SelectItem>
                <SelectItem value="Médio">Médio</SelectItem>
                <SelectItem value="Avançado">Avançado</SelectItem>
              </SelectContent>
            </Select>
            {!native && (
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo Curso
            </button>
            )}
          </div>
        </div>

        {showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Cursos", value: stats.total, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Básico", value: stats.basico, color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Médio", value: stats.medio, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Avançado", value: stats.avancado, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
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

        <div className={cn("flex items-center justify-between gap-3", native && "flex-col items-stretch")}>
          <h2 className="text-lg font-bold text-foreground">Catálogo de Cursos</h2>
          {!native && (
          <div className="flex rounded-full border border-border bg-card p-1 shadow-soft">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                view === "grid" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground",
              )}
            >
              Grelha
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                view === "list" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground",
              )}
            >
              Lista
            </button>
          </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center shadow-card">
            <p className="text-sm text-muted-foreground">Nenhum curso encontrado.</p>
          </div>
        ) : native || view === "grid" ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((c) => {
              const color = colorFor(c.id);
              return (
                <div key={c.id} className="group flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-card transition-transform hover:-translate-y-1">
                  <div className="flex items-start justify-between">
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", colorStyles[color])}>
                      <BookOpen className="h-6 w-6" strokeWidth={1.75} />
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
                    {c.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                    )}
                  </div>

                  {c.type && (
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", levelStyles[c.type] ?? "bg-muted text-foreground")}>
                        {c.type}
                      </span>
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                    <span>{c.studentCount} alunos</span>
                    <span>{c.classroomCount} turmas</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-card shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                    <th className="py-4 pl-5 pr-4 font-semibold">Curso</th>
                    <th className="py-4 pr-4 font-semibold">Nível</th>
                    <th className="py-4 pr-4 font-semibold">Alunos</th>
                    <th className="py-4 pr-4 font-semibold">Turmas</th>
                    <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const color = colorFor(c.id);
                    return (
                      <tr key={c.id} className="border-b border-border last:border-0 transition-colors hover:bg-muted/40">
                        <td className="py-4 pl-5 pr-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", colorStyles[color])}>
                              <BookOpen className="h-5 w-5" strokeWidth={1.75} />
                            </div>
                            <p className="font-semibold text-foreground">{c.name}</p>
                          </div>
                        </td>
                        <td className="py-4 pr-4">
                          {c.type ? (
                            <span className={cn("rounded-full px-3 py-1 text-xs font-medium", levelStyles[c.type] ?? "bg-muted text-foreground")}>
                              {c.type}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-foreground">{c.studentCount}</td>
                        <td className="py-4 pr-4 text-foreground">{c.classroomCount}</td>
                        <td className="py-4 pr-5">
                          <div className="flex items-center justify-end gap-1">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {native && (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-24 right-5 z-40 h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg"
          aria-label="Novo curso"
          onClick={() => { setEditing(null); setFormOpen(true); }}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      <CourseFormDialog open={formOpen} onOpenChange={setFormOpen} course={editing} onSaved={load} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar curso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção não pode ser desfeita. As turmas associadas continuarão existir, mas perderão a referência ao curso.
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

export default Cursos;