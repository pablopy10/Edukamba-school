import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsRestoring, useQuery } from "@tanstack/react-query";
import { Search, Table2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { useTeacherSessionScope } from "@/hooks/useTeacherSessionScope";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { useParentChildren } from "@/hooks/useParentChildren";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showPageKpiCards } from "@/lib/nativeApp";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { QUERY_DAY_MS } from "@/lib/queryClient";
import {
  academicTermsQueryKey,
  fetchAcademicTerms,
  fetchTeacherGradesPack,
  teacherGradesQueryKey,
  type AcademicTermRow,
  type TeacherGradeRowRaw,
} from "@/lib/offline/teacherNotasQueries";
import {
  fetchTeacherSubjectDetail,
  teacherSubjectDetailQueryKey,
} from "@/lib/offline/teacherAvaliacoesQueries";
import { fetchTeacherTurmasQuery, teacherTurmasQueryKey } from "@/lib/offline/teacherListQueries";

type AssessmentJoin = {
  id: string;
  title: string;
  date: string;
  classroom_id: string | null;
  subject_id: string | null;
  term_id: string | null;
  academic_year_id: string | null;
  subjects: { name: string | null } | null;
  classrooms: { name: string | null } | null;
};

type GradeRowRaw = {
  id: string;
  score: number;
  teacher_comment: string | null;
  student_id: string | null;
  assessments: AssessmentJoin | AssessmentJoin[];
  students: { full_name: string | null; classroom_id: string | null } | null;
};

type GradeDisplayRow = {
  id: string;
  score: number;
  teacher_comment: string | null;
  studentId: string | null;
  studentName: string;
  classroomName: string;
  subjectName: string;
  assessmentTitle: string;
  date: string;
};

const formatDatePt = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });

const todayIsoLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dIso = (s: string) => s.slice(0, 10);

/** Preferência ao trimestre calendário; fora desses períodos usa o seguinte não iniciado ou, se o ano já terminou, o último trimestre. */
function resolveDefaultTermId(terms: AcademicTermRow[]): string | null {
  if (!terms.length) return null;
  const sorted = [...terms].sort((a, b) => a.term_number - b.term_number);
  const today = todayIsoLocal();
  const current = sorted.find((t) => today >= dIso(t.start_date) && today <= dIso(t.end_date));
  if (current) return current.id;
  const upcoming = sorted.find((t) => today < dIso(t.start_date));
  if (upcoming) return upcoming.id;
  return sorted[sorted.length - 1].id;
}

/** Normaliza `assessments` quando vem objeto único ou array da API. */
const singleAssessment = (a: AssessmentJoin | AssessmentJoin[] | null | undefined): AssessmentJoin | null => {
  if (!a) return null;
  return Array.isArray(a) ? a[0] ?? null : a;
};

function assessmentFromTeacherGrade(g: TeacherGradeRowRaw) {
  const a = g.assessments;
  if (!a) return null;
  return Array.isArray(a) ? (a[0] ?? null) : a;
}

function mapTeacherRawToDisplay(raw: TeacherGradeRowRaw[]): GradeDisplayRow[] {
  const mapped: GradeDisplayRow[] = raw
    .map((g) => {
      const ass = assessmentFromTeacherGrade(g);
      if (!ass) return null;
      return {
        id: g.id,
        score: g.score,
        teacher_comment: g.teacher_comment,
        studentId: g.student_id,
        studentName: g.students?.full_name ?? "—",
        classroomName: ass.classrooms?.name ?? "—",
        subjectName: ass.subjects?.name ?? "—",
        assessmentTitle: ass.title,
        date: ass.date,
      };
    })
    .filter((g): g is GradeDisplayRow => g !== null);
  mapped.sort((a, b) => {
    const d = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (d !== 0) return d;
    return `${a.studentName}:${a.subjectName}`.localeCompare(`${b.studentName}:${b.subjectName}`);
  });
  return mapped;
}

const Notas = () => {
  const persistRestoring = useIsRestoring();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { selectedYearId: ctxYearId, schoolId: ctxSchoolId } = useAcademicYear();
  const isPrivileged = isSchoolManagementRole(role);

  const {
    isTeacher,
    classroomIds: teacherClassroomIds,
    subjectId: teacherSubjectId,
    loading: teacherLoading,
  } = useTeacherClassrooms();
  const {
    isStudent,
    studentId,
    classroomId: studentClassroomId,
    classroomName: studentClassroomName,
    loading: studentLoading,
  } = useStudentSelf();
  const { isParent, childIds, classroomIds: parentClassroomIds, selectedChild, loading: parentLoading } =
    useParentChildren();
  const { data: persistedTeacherSession } = useTeacherSessionScope();

  /** `school_id` do perfil (fetch); professores combinam contexto + sessão persistida no login. */
  const [profileSchoolId, setProfileSchoolId] = useState<string | null>(null);
  /** Carregamento da tabela de notas para perfis que não são professor (usa `loadGrades`). */
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<GradeDisplayRow[]>([]);
  const [privilegedClassrooms, setPrivilegedClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);

  const [classroomFilter, setClassroomFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const resolvedSchoolId = useMemo(() => {
    if (isTeacher)
      return ctxSchoolId ?? persistedTeacherSession?.schoolId ?? profileSchoolId;
    return profileSchoolId ?? ctxSchoolId;
  }, [isTeacher, ctxSchoolId, persistedTeacherSession?.schoolId, profileSchoolId]);

  const resolvedYearId = useMemo(() => {
    if (!isTeacher) return ctxYearId ?? null;
    return ctxYearId ?? persistedTeacherSession?.academicYearId ?? null;
  }, [isTeacher, ctxYearId, persistedTeacherSession?.academicYearId]);

  const { data: terms = [], isPending: termsPending } = useQuery({
    queryKey: academicTermsQueryKey(resolvedSchoolId ?? "__none__", resolvedYearId ?? "__none__"),
    queryFn: () => fetchAcademicTerms(resolvedSchoolId!, resolvedYearId!),
    enabled: Boolean(resolvedSchoolId && resolvedYearId),
    staleTime: 0,
    networkMode: "offlineFirst",
  });

  const { data: teacherTurmasPack, isPending: teacherTurmasPending } = useQuery({
    queryKey: teacherTurmasQueryKey(user?.id ?? "__", resolvedYearId ?? "__", teacherClassroomIds),
    queryFn: () =>
      fetchTeacherTurmasQuery({
        academicYearId: resolvedYearId!,
        classroomIds: [...teacherClassroomIds],
      }),
    enabled: Boolean(
      isTeacher &&
        user?.id &&
        resolvedYearId &&
        teacherClassroomIds.length > 0 &&
        !teacherLoading,
    ),
    staleTime: 0,
    networkMode: "offlineFirst",
  });

  const classroomOpts = useMemo(() => {
    if (isTeacher) {
      return (teacherTurmasPack?.classrooms ?? [])
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt"));
    }
    return privilegedClassrooms;
  }, [isTeacher, teacherTurmasPack, privilegedClassrooms]);

  const canPickClassroom = isPrivileged || isTeacher;
  const lockedClassroomLabel = useMemo(() => {
    if (isStudent && studentClassroomName) return studentClassroomName;
    if (isParent && selectedChild?.classroom_name) return selectedChild.classroom_name;
    if (isParent && selectedChild?.classroom_id === null && selectedChild.full_name)
      return "Turma por atribuir";
    return null;
  }, [isStudent, isParent, studentClassroomName, selectedChild]);

  const loadSchool = useCallback(async () => {
    if (!user?.id) return null;
    const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
    const sid = profile?.school_id ?? null;
    setProfileSchoolId(sid);
    return sid;
  }, [user?.id]);

  const loadClassroomOptions = useCallback(
    async (sid: string, yearId: string | null) => {
      if (isTeacher) return;
      if (!yearId) {
        setPrivilegedClassrooms([]);
        return;
      }
      const { data } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("school_id", sid)
        .eq("academic_year_id", yearId)
        .order("name");
      setPrivilegedClassrooms((data ?? []) as { id: string; name: string }[]);
    },
    [isTeacher],
  );

  const termsKey = useMemo(() => terms.map((t) => t.id).join(","), [terms]);

  const effectiveTermId = useMemo((): string | null => {
    if (!terms.length) return null;
    if (selectedTermId !== null && terms.some((t) => t.id === selectedTermId)) return selectedTermId;
    return resolveDefaultTermId(terms);
  }, [terms, selectedTermId, termsKey]);

  const resolvedTeacherClassroomId = useMemo(() => {
    if (!isTeacher || classroomOpts.length === 0) return null;
    if (classroomFilter !== "all" && teacherClassroomIds.includes(classroomFilter)) return classroomFilter;
    return classroomOpts[0]?.id ?? null;
  }, [isTeacher, classroomOpts, classroomFilter, teacherClassroomIds]);

  const teacherGradesQueryEnabled = Boolean(
    isTeacher &&
      resolvedSchoolId &&
      resolvedYearId &&
      effectiveTermId &&
      resolvedTeacherClassroomId &&
      teacherSubjectId &&
      teacherClassroomIds.length > 0 &&
      !teacherLoading,
  );

  const { data: teacherGradeRaw = [], isPending: teacherGradesPending } = useQuery({
    queryKey: teacherGradesQueryKey(
      resolvedSchoolId!,
      resolvedYearId!,
      effectiveTermId!,
      resolvedTeacherClassroomId!,
      teacherSubjectId!,
    ),
    queryFn: () =>
      fetchTeacherGradesPack({
        schoolId: resolvedSchoolId!,
        academicYearId: resolvedYearId!,
        termId: effectiveTermId!,
        classroomId: resolvedTeacherClassroomId!,
        subjectId: teacherSubjectId!,
      }),
    enabled: teacherGradesQueryEnabled,
    staleTime: 0,
    networkMode: "offlineFirst",
  });

  const { data: teacherSubjectDetail } = useQuery({
    queryKey: teacherSubjectDetailQueryKey(resolvedSchoolId ?? "__none__", teacherSubjectId ?? "__none__"),
    queryFn: () => fetchTeacherSubjectDetail(resolvedSchoolId!, teacherSubjectId!),
    enabled: Boolean(isTeacher && resolvedSchoolId && teacherSubjectId),
    staleTime: 0,
    networkMode: "offlineFirst",
  });

  const teacherDisciplineLabel =
    teacherSubjectDetail?.name ?? (teacherSubjectId ? "…" : "Disciplina não definida");

  const teacherRows = useMemo(() => mapTeacherRawToDisplay(teacherGradeRaw), [teacherGradeRaw]);

  /** Ao mudar a lista de trimestres, descarta seleção antiga só se já não existir. */
  useEffect(() => {
    if (terms.length === 0) {
      setSelectedTermId(null);
      return;
    }
    setSelectedTermId((prev) => (prev !== null && terms.some((t) => t.id === prev) ? prev : null));
  }, [termsKey]);

  const classroomOptsKey = useMemo(() => classroomOpts.map((c) => c.id).join(","), [classroomOpts]);

  /** Professor: sempre uma turma concreta (primeira ao carregar turmas disponíveis). */
  useEffect(() => {
    if (!isTeacher || teacherLoading) return;
    if (classroomOpts.length === 0) return;
    setClassroomFilter((prev) => (prev !== "all" && classroomOpts.some((c) => c.id === prev) ? prev : classroomOpts[0].id));
  }, [isTeacher, teacherLoading, classroomOptsKey]);

  const loadGrades = useCallback(async () => {
    if (isTeacher) return;
    setLoading(true);
    const sid = resolvedSchoolId ?? (await loadSchool());
    if (!sid || !resolvedYearId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const yearId = resolvedYearId;

    if (isStudent && (!studentId || !studentClassroomId)) {
      setRows([]);
      setLoading(false);
      return;
    }

    if (isParent) {
      if (!childIds.length || !parentClassroomIds.length) {
        setRows([]);
        setLoading(false);
        return;
      }
    }

    if (termsPending) {
      setLoading(true);
      return;
    }

    if (!terms.length || !effectiveTermId) {
      setRows([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("grades")
      .select(`
        id,
        score,
        teacher_comment,
        student_id,
        assessments!inner (
          id,
          title,
          date,
          classroom_id,
          subject_id,
          term_id,
          academic_year_id,
          subjects (name),
          classrooms (name)
        ),
        students (full_name, classroom_id)
      `)
      .eq("assessments.academic_year_id", yearId)
      .eq("assessments.school_id", sid)
      .eq("assessments.term_id", effectiveTermId);

    if (isStudent && studentId) {
      query = query.eq("student_id", studentId);
    } else if (isParent) {
      query = query.in("student_id", childIds);
      if (parentClassroomIds.length === 1) {
        query = query.eq("assessments.classroom_id", parentClassroomIds[0]);
      } else {
        query = query.in("assessments.classroom_id", parentClassroomIds);
      }
    } else if (isPrivileged) {
      if (classroomFilter !== "all") {
        query = query.eq("assessments.classroom_id", classroomFilter);
      }
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: "Erro a carregar notas", description: error.message, variant: "destructive" });
      setRows([]);
      setLoading(false);
      return;
    }

    const raw = (data ?? []) as GradeRowRaw[];
    const mapped: GradeDisplayRow[] = raw
      .map((g) => {
        const ass = singleAssessment(g.assessments);
        if (!ass) return null;
        return {
          id: g.id,
          score: g.score,
          teacher_comment: g.teacher_comment,
          studentId: g.student_id,
          studentName: g.students?.full_name ?? "—",
          classroomName: ass.classrooms?.name ?? "—",
          subjectName: ass.subjects?.name ?? "—",
          assessmentTitle: ass.title,
          date: ass.date,
        };
      })
      .filter(Boolean) as GradeDisplayRow[];

    mapped.sort((a, b) => {
      const d = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (d !== 0) return d;
      return `${a.studentName}:${a.subjectName}`.localeCompare(`${b.studentName}:${b.subjectName}`);
    });

    setRows(mapped);
    setLoading(false);
  }, [
    isTeacher,
    resolvedSchoolId,
    loadSchool,
    resolvedYearId,
    isStudent,
    studentId,
    studentClassroomId,
    isParent,
    childIds.join(","),
    parentClassroomIds.join(","),
    isPrivileged,
    classroomFilter,
    termsPending,
    terms.length,
    termsKey,
    effectiveTermId,
  ]);

  useEffect(() => {
    loadSchool();
  }, [loadSchool]);

  useEffect(() => {
    if (!resolvedSchoolId || !resolvedYearId) return;
    void loadClassroomOptions(resolvedSchoolId, resolvedYearId);
  }, [resolvedSchoolId, resolvedYearId, loadClassroomOptions]);

  useEffect(() => {
    if (roleLoading) return;
    if (isTeacher) return;
    if (isStudent && studentLoading) return;
    if (isParent && parentLoading) return;
    void loadGrades();
  }, [roleLoading, isTeacher, isStudent, studentLoading, isParent, parentLoading, loadGrades]);

  useEffect(() => {
    if (isPrivileged) return;
    if (isTeacher) return;
    setClassroomFilter("all");
  }, [isPrivileged, isTeacher]);

  const displayRows = isTeacher ? teacherRows : rows;

  const teacherNotasShowsBlockingSpinner =
    teacherLoading ||
    !resolvedSchoolId ||
    (termsPending && terms.length === 0) ||
    (teacherClassroomIds.length > 0 &&
      teacherTurmasPending &&
      teacherTurmasPack === undefined) ||
    (teacherGradesQueryEnabled && teacherGradesPending);

  const tableLoading =
    resolvedYearId && isTeacher
      ? !persistRestoring && teacherNotasShowsBlockingSpinner
      : loading;

  const subjectsInData = useMemo(() => {
    const m = new Map<string, string>();
    displayRows.forEach((r) => {
      if (!m.has(r.subjectName)) m.set(r.subjectName, r.subjectName);
    });
    return Array.from(m.keys()).sort((a, b) => a.localeCompare(b, "pt"));
  }, [displayRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayRows.filter((r) => {
      if (!isTeacher && subjectFilter !== "all" && r.subjectName !== subjectFilter) return false;
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.subjectName.toLowerCase().includes(q) ||
        r.assessmentTitle.toLowerCase().includes(q) ||
        r.classroomName.toLowerCase().includes(q) ||
        (r.teacher_comment ?? "").toLowerCase().includes(q)
      );
    });
  }, [displayRows, subjectFilter, search, isTeacher]);

  const teacherClassroomSelectValue = useMemo(() => {
    if (!isTeacher || classroomOpts.length === 0) return null;
    return classroomOpts.some((c) => c.id === classroomFilter) ? classroomFilter : classroomOpts[0].id;
  }, [isTeacher, classroomOpts, classroomFilter]);

  const showStudentColumn = !(isStudent || isParent);

  return (
    <div className="flex flex-col gap-6 pb-24 lg:pb-8">
      {showPageKpiCards() && (
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Notas</h1>
          <p className="text-sm text-muted-foreground">
            Consulte as notas por trimestre, turma e disciplina, no ano letivo seleccionado.
          </p>
        </div>
      )}

      {!showPageKpiCards() && (
        <div className="flex items-center gap-2 pt-2">
          <Table2 className="h-6 w-6 text-pastel-blue-foreground" strokeWidth={1.75} />
          <h1 className="text-xl font-bold text-foreground">Notas</h1>
        </div>
      )}

      {!resolvedYearId && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-soft">
          Seleccione um ano letivo no topo da página para ver as notas.
        </div>
      )}

      {resolvedYearId && (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trimestre</span>
              {termsPending && terms.length === 0 ? (
                <div className="h-11 animate-pulse rounded-xl bg-muted/60" />
              ) : terms.length === 0 ? (
                <div
                  className={cn(
                    "flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-xs text-muted-foreground",
                  )}
                >
                  Sem trimestres definidos neste ano letivo
                </div>
              ) : (
                <Select
                  value={effectiveTermId ?? terms[0].id}
                  onValueChange={(v) => setSelectedTermId(v)}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                    <SelectValue placeholder="Trimestre" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Turma</span>
              {canPickClassroom ? (
                isTeacher && classroomOpts.length === 0 ? (
                  <div
                    className={cn(
                      "flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm text-muted-foreground",
                    )}
                  >
                    Sem turmas com horário neste ano letivo
                  </div>
                ) : (
                  <Select
                    value={isTeacher ? (teacherClassroomSelectValue ?? "") : classroomFilter}
                    onValueChange={setClassroomFilter}
                    disabled={isTeacher && classroomOpts.length === 0}
                  >
                    <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                      <SelectValue placeholder="Turma" />
                    </SelectTrigger>
                    <SelectContent>
                      {isPrivileged && <SelectItem value="all">Todas as turmas visíveis</SelectItem>}
                      {classroomOpts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <div
                  className={cn(
                    "flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-medium text-foreground",
                  )}
                >
                  {lockedClassroomLabel ?? "—"}
                </div>
              )}
            </div>

            <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Disciplina</span>
              {isTeacher ? (
                teacherSubjectId ? (
                  <Select value={teacherSubjectId} disabled>
                    <SelectTrigger className="h-11 rounded-xl border-border bg-background opacity-100">
                      <SelectValue>{teacherDisciplineLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={teacherSubjectId}>{teacherDisciplineLabel}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div
                    className={cn(
                      "flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-medium text-foreground",
                    )}
                  >
                    Disciplina não definida
                  </div>
                )
              ) : (
                <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                  <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                    <SelectValue placeholder="Disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {subjectsInData.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="relative min-w-[200px] flex-[2]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar aluno, disciplina, avaliação…"
                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {isParent && selectedChild && (
            <p className="text-xs text-muted-foreground">
              A mostrar notas de <span className="font-medium text-foreground">{selectedChild.full_name}</span>. Para
              alterar o educando, use o selector no topo da página.
            </p>
          )}
        </div>
      )}

      {resolvedYearId && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          {tableLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">A carregar…</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Sem notas para mostrar com estes filtros.</p>
          ) : (
            <div className="table-scroll overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="whitespace-nowrap px-4 py-3">Data</th>
                    {showStudentColumn && <th className="whitespace-nowrap px-4 py-3">Aluno</th>}
                    <th className="whitespace-nowrap px-4 py-3">Turma</th>
                    <th className="whitespace-nowrap px-4 py-3">Disciplina</th>
                    <th className="min-w-[140px] px-4 py-3">Avaliação</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right">Nota</th>
                    <th className="hidden min-w-[120px] px-4 py-3 lg:table-cell">Comentário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.id} className="bg-card transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDatePt(r.date)}</td>
                      {showStudentColumn && <td className="px-4 py-3 font-medium text-foreground">{r.studentName}</td>}
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.classroomName}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-pastel-blue/40 px-2.5 py-0.5 text-xs font-medium text-pastel-blue-foreground">
                          {r.subjectName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{r.assessmentTitle}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        {Number(r.score).toFixed(1)}
                        <span className="text-xs font-normal text-muted-foreground"> / 20</span>
                      </td>
                      <td className="hidden max-w-[220px] truncate px-4 py-3 text-muted-foreground lg:table-cell">
                        {r.teacher_comment ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Notas;
