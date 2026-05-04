import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import { useIsRestoring, useQuery } from "@tanstack/react-query";
import { Search, Plus, Users, Presentation, Pencil, Trash2, Loader2, Upload, UserCog } from "lucide-react";
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
import { ExcelImportDialog } from "@/components/shared/ExcelImportDialog";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { isNativeMobileApp, showPageKpiCards, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { Button } from "@/components/ui/button";
import {
  fetchTeacherTurmasQuery,
  teacherTurmasQueryKey,
} from "@/lib/offline/teacherListQueries";
import { queryClient } from "@/lib/queryClient";

type ClassroomWithJoins = ClassroomRow & {
  courses?: { id: string; name: string } | null;
  academic_years?: { id: string; label: string } | null;
  homeroom_teacher?: { id: string; full_name: string } | null;
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
  const persistRestoring = useIsRestoring();
  const native = isNativeMobileApp();
  const { selectedYearId } = useAcademicYear();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const isTeacher = role === "TEACHER";
  const isParent = role === "PARENT";
  const { classroomIds: teacherClassroomIds, loading: teacherClassesLoading } = useTeacherClassrooms();

  const teacherTurmasQuery = useQuery({
    queryKey: teacherTurmasQueryKey(
      user?.id ?? "__pending__",
      selectedYearId ?? "__pending__",
      teacherClassroomIds,
    ),
    queryFn: () =>
      fetchTeacherTurmasQuery({
        academicYearId: selectedYearId!,
        classroomIds: teacherClassroomIds,
      }),
    enabled:
      isTeacher &&
      !!user?.id &&
      !!selectedYearId &&
      !teacherClassesLoading &&
      teacherClassroomIds.length > 0,
    networkMode: "offlineFirst",
  });

  const teacherAwaitingHydration =
    !persistRestoring &&
    isTeacher &&
    !!user?.id &&
    !!selectedYearId &&
    !teacherClassesLoading &&
    teacherClassroomIds.length > 0 &&
    teacherTurmasQuery.data === undefined &&
    teacherTurmasQuery.isPending;

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
  const [importOpen, setImportOpen] = useState(false);

  const listClassrooms = isTeacher ? (teacherTurmasQuery.data?.classrooms ?? []) : classrooms;
  const listCourses = isTeacher ? (teacherTurmasQuery.data?.courses ?? []) : courses;
  const listYears = isTeacher ? (teacherTurmasQuery.data?.years ?? []) : years;

  const adminTurmasFetching = !isTeacher && loading;

  useEffect(() => {
    if (isTeacher) setLoading(false);
  }, [isTeacher]);

  const load = useCallback(async () => {
    if (isTeacher) return;
    setLoading(true);
    try {
      const classroomSelect = `id, name, grade_level, period, course_id, academic_year_id, school_id, homeroom_teacher_id,
                 courses(id, name), academic_years(id, label),
                 homeroom_teacher:profiles!classrooms_homeroom_teacher_id_fkey(id, full_name)`;

      const [
        classroomsRes,
        { data: cs, error: coursesError },
        { data: ys, error: yearsError },
        { data: students, error: studentsError },
      ] = await Promise.all([
        (async () => {
          let q = supabase.from("classrooms").select(classroomSelect).order("name", { ascending: true });
          if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
          return q;
        })(),
        supabase.from("courses").select("id, name").order("name"),
        supabase.from("academic_years").select("id, label, is_active").order("start_date", { ascending: true }),
        supabase.from("students").select("id, classroom_id"),
      ]);

      const aggregateError = classroomsRes.error ?? coursesError ?? yearsError ?? studentsError;
      if (aggregateError) throw aggregateError;

      const list = classroomsRes.data ?? [];

      const studentCountByClass = new Map<string, number>();
      (students ?? []).forEach((s) => {
        if (s.classroom_id) {
          studentCountByClass.set(s.classroom_id, (studentCountByClass.get(s.classroom_id) ?? 0) + 1);
        }
      });

      setClassrooms(
        (list as Record<string, unknown>[]).map((c) => ({
          ...c,
          studentCount: studentCountByClass.get(c.id as string) ?? 0,
        })) as ClassroomWithJoins[],
      );

      setCourses(cs ?? []);
      setYears(ys ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro a carregar turmas", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [isTeacher, selectedYearId]);

  useEffect(() => {
    if (roleLoading || isTeacher) return;
    void load();
  }, [roleLoading, isTeacher, load, selectedYearId]);

  const refreshAfterMutation = async () => {
    if (isTeacher && user?.id) {
      await queryClient.invalidateQueries({
        queryKey: ["turmas", user.id],
        exact: false,
      });
      return;
    }
    await load();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return listClassrooms.filter((c) => {
      if (periodFilter !== "all" && (c.period ?? "") !== periodFilter) return false;
      if (courseFilter !== "all" && (c.course_id ?? "") !== courseFilter) return false;
      if (!q) return true;
      return [c.name, c.grade_level ?? "", c.courses?.name ?? "", c.period ?? "", c.homeroom_teacher?.full_name ?? ""].some((f) =>
        f.toLowerCase().includes(q),
      );
    });
  }, [listClassrooms, search, periodFilter, courseFilter]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("classrooms").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Erro a eliminar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Turma eliminada" });
      await refreshAfterMutation();
    }
    setDeleteId(null);
  };

  const colorFor = (id: string) => palette[id.charCodeAt(0) % palette.length];

  const stats = useMemo(
    () => ({
      total: listClassrooms.length,
      manha: listClassrooms.filter((c) => c.period === "Manhã").length,
      tarde: listClassrooms.filter((c) => c.period === "Tarde").length,
      noite: listClassrooms.filter((c) => c.period === "Noite").length,
    }),
    [listClassrooms],
  );

  if (roleLoading || teacherAwaitingHydration) {
    return <PageLoadingSkeleton />;
  }

  if (isParent) {
    return <Navigate to="/alunos" replace />;
  }

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && !isTeacher && "relative pb-28")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Turmas</h1>
            <p className="text-sm text-muted-foreground">
              {isTeacher
                ? "Turmas em que tem aulas no horário do ano letivo seleccionado."
                : "Faça a gestão de todas as turmas da escola."}
            </p>
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
            {!isTeacher && (
              <>
                {!native && (
                <>
                <button
                  onClick={() => { setEditing(null); setFormOpen(true); }}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.25} />
                  Nova Turma
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-green px-5 text-sm font-semibold text-pastel-green-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
                >
                  <Upload className="h-4 w-4" strokeWidth={2.25} />
                  Importar Excel
                </button>
                </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-card p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-foreground">Filtros</p>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="h-11 w-44 rounded-full border-border bg-background shadow-soft">
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
                <SelectTrigger className="h-11 w-52 rounded-full border-border bg-background shadow-soft">
                  <SelectValue placeholder="Curso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cursos</SelectItem>
                  {listCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {showPageKpiCards() && (
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
        )}

        {adminTurmasFetching ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-card p-10 text-center shadow-card">
            <p className="text-sm text-muted-foreground">
              {isTeacher
                ? "Sem turmas com horário atribuído neste ano letivo, ou nenhum resultado com os filtros."
                : "Nenhuma turma encontrada."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((c) => {
              const color = colorFor(c.id);
              return (
                <div
                  key={c.id}
                  className={cn(
                    "relative overflow-hidden rounded-2xl bg-card shadow-card",
                    native ? "" : "transition-transform hover:-translate-y-1",
                  )}
                >
                  {!isTeacher && (
                    <div className="absolute right-3 top-3 z-20 flex items-center gap-1">
                      <button
                        title="Editar"
                        type="button"
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setEditing(c);
                          setFormOpen(true);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-card/95 text-muted-foreground shadow-soft ring-1 ring-border backdrop-blur-sm transition-colors hover:bg-pastel-yellow/40 hover:text-pastel-yellow-foreground"
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button
                        title="Eliminar"
                        type="button"
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          setDeleteId(c.id);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-card/95 text-muted-foreground shadow-soft ring-1 ring-border backdrop-blur-sm transition-colors hover:bg-pastel-pink/40 hover:text-pastel-pink-foreground"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                  {/*
                   * Link cobre todo o cartão (inset); iOS/Android recebem taps de forma estável + touch-manipulation.
                   * Conteúdo só visual (pointer-events-none); botões admin ficam por cima com pointer-events-auto.
                   */}
                  <Link
                    to={`/turmas/${c.id}`}
                    aria-label={`Abrir turma ${c.name}`}
                    className={cn(
                      "touch-manipulation absolute inset-0 z-10 rounded-2xl ring-offset-background [-webkit-tap-highlight-color:transparent] transition-opacity active:opacity-90 motion-safe:transition-transform motion-safe:active:scale-[0.985] [&:focus-visible]:z-[15] [&:focus-visible]:outline-none [&:focus-visible]:ring-2 [&:focus-visible]:ring-primary [&:focus-visible]:ring-offset-2",
                    )}
                  />
                  <div
                    className={cn(
                      "group/turma pointer-events-none relative z-0 flex min-h-[8.75rem] flex-col gap-4 p-5",
                      !isTeacher && "pr-14",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", colorStyles[color])}>
                        <Presentation className="h-6 w-6" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-foreground">{c.name}</h3>
                        {c.courses?.name && <p className="mt-1 text-xs text-muted-foreground">{c.courses.name}</p>}
                        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                          <UserCog className="h-3.5 w-3.5 shrink-0 text-pastel-green-foreground/90" strokeWidth={1.75} aria-hidden />
                          <span className="font-medium text-foreground">Diretor de turma:</span>
                          <span className="text-foreground/90">{c.homeroom_teacher?.full_name ?? "—"}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {c.period && (
                        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", periodStyles[c.period] ?? "bg-muted text-foreground")}>
                          {c.period}
                        </span>
                      )}
                      {c.grade_level && (
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{c.grade_level}</span>
                      )}
                      {c.academic_years?.label && (
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{c.academic_years.label}</span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {c.studentCount} alunos
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {native && !isTeacher && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label="Nova turma"
            onClick={() => { setEditing(null); setFormOpen(true); }}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      <ClassroomFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        courses={listCourses}
        years={listYears}
        classroom={editing}
        onSaved={refreshAfterMutation}
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

      {!native && (
      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar Turmas"
        description="Importe várias turmas a partir de um ficheiro Excel ou CSV."
        templateSheetName="Turmas"
        fields={[
          { key: "name", label: "Nome da turma", required: true, aliases: ["turma", "classe", "name"], example: "5ª A" },
          { key: "grade_level", label: "Ano de escolaridade", required: true, aliases: ["ano", "ano de escolaridade", "grade", "nivel", "escolaridade"], example: "Ensino Básico" },
          { key: "period", label: "Período", required: true, aliases: ["periodo", "turno"], example: "Manhã" },
          { key: "course", label: "Curso", required: true, aliases: ["curso", "course"], example: "Informática" },
          { key: "academic_year", label: "Ano letivo", aliases: ["ano letivo", "ano lectivo", "academic year", "ano_letivo"], example: "2025/2026" },
        ]}
        onImportRow={async (row) => {
          if (!row.name) throw new Error("Nome da turma em falta");
          const { data: profile } = await supabase
            .from("profiles").select("school_id")
            .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
            .maybeSingle();
          const schoolId = profile?.school_id;
          if (!schoolId) throw new Error("Escola não encontrada");
          let academicYearId: string | undefined;
          if (row.academic_year) {
            const match = listYears.find((y) => y.label.toLowerCase() === row.academic_year.toLowerCase());
            if (!match) throw new Error(`Ano letivo "${row.academic_year}" não encontrado`);
            academicYearId = match.id;
          } else {
            academicYearId = selectedYearId || listYears.find((y) => y.is_active)?.id || listYears[0]?.id;
          }
          if (!academicYearId) throw new Error("Sem ano lectivo activo");
          let course_id: string | null = null;
          if (row.course) {
            const match = listCourses.find((c) => c.name.toLowerCase() === row.course.toLowerCase());
            course_id = match?.id ?? null;
          }
          let period: string | null = null;
          if (row.period) {
            const p = row.period.toLowerCase();
            period = p.startsWith("m") ? "Manhã" : p.startsWith("t") ? "Tarde" : p.startsWith("n") ? "Noite" : null;
          }
          const { error } = await supabase.from("classrooms").insert({
            name: row.name,
            grade_level: row.grade_level || null,
            period,
            course_id,
            academic_year_id: academicYearId,
            school_id: schoolId,
          });
          if (error) throw new Error(error.message);
        }}
        onCompleted={refreshAfterMutation}
      />
      )}
    </>
  );
};

export default Turmas;