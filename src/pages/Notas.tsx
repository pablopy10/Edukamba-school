import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsRestoring, useQuery } from "@tanstack/react-query";
import { Search, Table2, Loader2, AlertTriangle, GraduationCap } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { showPageKpiCards } from "@/lib/nativeApp";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { PublishResultsDialog } from "@/components/matriculas/PublishResultsDialog";
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

type YearOpt = { id: string; label: string; is_active: boolean | null };

type AtRiskStudent = {
  studentId: string;
  studentName: string;
  classroomName: string;
  overallAvg: number;
  negativeSubjects: string[];
  reasons: string[];
};

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

function mapTeacherRawToDisplay(raw: TeacherGradeRowRaw[], locale: string): GradeDisplayRow[] {
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
    return `${a.studentName}:${a.subjectName}`.localeCompare(`${b.studentName}:${b.subjectName}`, locale);
  });
  return mapped;
}

const Notas = () => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "notas" });
  const dateLocaleTag =
    i18n.language?.startsWith("fr") ? "fr-FR" : i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";
  const collatorLocale = i18n.resolvedLanguage || i18n.language || undefined;
  const formatGradeDate = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString(dateLocaleTag, { day: "2-digit", month: "short", year: "numeric" });

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

  const [publishOpen, setPublishOpen] = useState(false);
  const [years, setYears] = useState<YearOpt[]>([]);
  const [allYearRows, setAllYearRows] = useState<GradeDisplayRow[]>([]);
  const [atRiskLoading, setAtRiskLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"resultados" | "risco">("resultados");

  const resolvedSchoolId = useMemo(() => {
    if (isTeacher)
      return ctxSchoolId ?? persistedTeacherSession?.schoolId ?? profileSchoolId;
    return ctxSchoolId ?? profileSchoolId;
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
        .sort((a, b) => a.name.localeCompare(b.name, collatorLocale));
    }
    return privilegedClassrooms;
  }, [isTeacher, teacherTurmasPack, privilegedClassrooms, collatorLocale]);

  const canPickClassroom = isPrivileged || isTeacher;
  const lockedClassroomLabel = useMemo(() => {
    if (isStudent && studentClassroomName) return studentClassroomName;
    if (isParent && selectedChild?.classroom_name) return selectedChild.classroom_name;
    if (isParent && selectedChild?.classroom_id === null && selectedChild.full_name)
      return t("class_to_assign");
    return null;
  }, [isStudent, isParent, studentClassroomName, selectedChild, t]);

  const loadSchool = useCallback(async () => {
    if (!user?.id) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, support_context_school_id")
      .eq("id", user.id)
      .maybeSingle();
    const sid = effectiveSchoolIdFromProfile(profile);
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

  const loadYears = useCallback(async () => {
    if (!resolvedSchoolId) return;
    const { data } = await supabase
      .from("academic_years")
      .select("id, label, is_active")
      .eq("school_id", resolvedSchoolId)
      .order("start_date", { ascending: true });
    setYears((data ?? []) as YearOpt[]);
  }, [resolvedSchoolId]);

  const loadAllYearGrades = useCallback(async () => {
    if (!isPrivileged || !resolvedSchoolId || !resolvedYearId) {
      setAllYearRows([]);
      setAtRiskLoading(false);
      return;
    }
    setAtRiskLoading(true);
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
      .eq("assessments.academic_year_id", resolvedYearId)
      .eq("assessments.school_id", resolvedSchoolId);
    if (classroomFilter !== "all") {
      query = query.eq("assessments.classroom_id", classroomFilter);
    }
    const { data, error } = await query;
    if (error) { setAllYearRows([]); setAtRiskLoading(false); return; }
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
    setAllYearRows(mapped);
    setAtRiskLoading(false);
  }, [isPrivileged, resolvedSchoolId, resolvedYearId, classroomFilter]);

  const atRiskStudents = useMemo((): AtRiskStudent[] => {
    if (!isPrivileged || allYearRows.length === 0) return [];
    const byStudent = new Map<string, GradeDisplayRow[]>();
    allYearRows.forEach((r) => {
      if (!r.studentId) return;
      const list = byStudent.get(r.studentId) ?? [];
      list.push(r);
      byStudent.set(r.studentId, list);
    });
    const result: AtRiskStudent[] = [];
    byStudent.forEach((grades, studentId) => {
      const overallAvg = grades.reduce((s, g) => s + g.score, 0) / grades.length;
      const bySubject = new Map<string, number[]>();
      grades.forEach((g) => {
        const scores = bySubject.get(g.subjectName) ?? [];
        scores.push(g.score);
        bySubject.set(g.subjectName, scores);
      });
      const negativeSubjects = Array.from(bySubject.entries())
        .map(([name, scores]) => ({ name, avg: scores.reduce((s, v) => s + v, 0) / scores.length }))
        .filter((s) => s.avg < 10)
        .map((s) => s.name);
      const reasons: string[] = [];
      if (overallAvg < 10) reasons.push(t("risk_reason_avg", { avg: overallAvg.toFixed(1) }));
      if (negativeSubjects.length >= 2) reasons.push(t("risk_reason_subjects", { count: negativeSubjects.length }));
      if (reasons.length > 0) {
        result.push({
          studentId,
          studentName: grades[0].studentName,
          classroomName: grades[0].classroomName,
          overallAvg,
          negativeSubjects,
          reasons,
        });
      }
    });
    return result.sort((a, b) => a.studentName.localeCompare(b.studentName, collatorLocale));
  }, [isPrivileged, allYearRows, t, collatorLocale]);

  const termsKey = useMemo(() => terms.map((term) => term.id).join(","), [terms]);

  const effectiveTermId = useMemo((): string | null => {
    if (!terms.length) return null;
    if (selectedTermId !== null && terms.some((term) => term.id === selectedTermId)) return selectedTermId;
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
    teacherSubjectDetail?.name ?? (teacherSubjectId ? t("subject_not_set_loading") : t("subject_not_set"));

  const teacherRows = useMemo(() => mapTeacherRawToDisplay(teacherGradeRaw, collatorLocale), [teacherGradeRaw, collatorLocale]);

  /** Ao mudar a lista de trimestres, descarta seleção antiga só se já não existir. */
  useEffect(() => {
    if (terms.length === 0) {
      setSelectedTermId(null);
      return;
    }
    setSelectedTermId((prev) => (prev !== null && terms.some((term) => term.id === prev) ? prev : null));
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
      toast({ title: t("toast_load_error_title"), description: error.message, variant: "destructive" });
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
      return `${a.studentName}:${a.subjectName}`.localeCompare(`${b.studentName}:${b.subjectName}`, collatorLocale);
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
    collatorLocale,
    t,
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

  useEffect(() => {
    if (!isPrivileged) return;
    void loadYears();
  }, [isPrivileged, loadYears]);

  useEffect(() => {
    if (!isPrivileged) return;
    void loadAllYearGrades();
  }, [isPrivileged, loadAllYearGrades]);

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
    return Array.from(m.keys()).sort((a, b) => a.localeCompare(b, collatorLocale));
  }, [displayRows, collatorLocale]);

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
      {/* Page header */}
      {showPageKpiCards() && (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          {isPrivileged && (
            <button
              onClick={() => setPublishOpen(true)}
              className="flex h-11 w-fit shrink-0 items-center gap-2 rounded-full bg-pastel-green px-5 text-sm font-semibold text-pastel-green-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <GraduationCap className="h-4 w-4" strokeWidth={2.25} />
              {t("publish_results")}
            </button>
          )}
        </div>
      )}

      {!showPageKpiCards() && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <Table2 className="h-6 w-6 text-pastel-blue-foreground" strokeWidth={1.75} />
            <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>
          </div>
          {isPrivileged && (
            <button
              onClick={() => setPublishOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-pastel-green px-4 text-xs font-semibold text-pastel-green-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <GraduationCap className="h-3.5 w-3.5" strokeWidth={2.25} />
              {t("publish_results")}
            </button>
          )}
        </div>
      )}

      {!resolvedYearId && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-soft">
          {t("pick_year_warning")}
        </div>
      )}

      {resolvedYearId && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "resultados" | "risco")}>
          {/* Tab bar — only show "Alunos em risco" tab for privileged users */}
          {isPrivileged && (
            <TabsList className="mb-2">
              <TabsTrigger value="resultados">{t("tab_results")}</TabsTrigger>
              <TabsTrigger value="risco" className="gap-1.5">
                {t("tab_at_risk")}
                {!atRiskLoading && atRiskStudents.length > 0 && (
                  <span className="rounded-full bg-pastel-pink px-1.5 py-0.5 text-[10px] font-semibold text-pastel-pink-foreground">
                    {atRiskStudents.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          )}

          {/* ── Aba: Resultados ── */}
          <TabsContent value="resultados" className="flex flex-col gap-4 mt-0">
            {/* Filters */}
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("term_label")}</span>
                  {termsPending && terms.length === 0 ? (
                    <div className="h-11 animate-pulse rounded-xl bg-muted/60" />
                  ) : terms.length === 0 ? (
                    <div className={cn("flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-xs text-muted-foreground")}>
                      {t("no_terms_in_year")}
                    </div>
                  ) : (
                    <Select value={effectiveTermId ?? terms[0].id} onValueChange={(v) => setSelectedTermId(v)}>
                      <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                        <SelectValue placeholder={t("term_placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {terms.map((term) => (
                          <SelectItem key={term.id} value={term.id}>{term.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("class_label")}</span>
                  {canPickClassroom ? (
                    isTeacher && classroomOpts.length === 0 ? (
                      <div className={cn("flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm text-muted-foreground")}>
                        {t("no_teacher_classes")}
                      </div>
                    ) : (
                      <Select
                        value={isTeacher ? (teacherClassroomSelectValue ?? "") : classroomFilter}
                        onValueChange={setClassroomFilter}
                        disabled={isTeacher && classroomOpts.length === 0}
                      >
                        <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                          <SelectValue placeholder={t("class_placeholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {isPrivileged && <SelectItem value="all">{t("all_visible_classes")}</SelectItem>}
                          {classroomOpts.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )
                  ) : (
                    <div className={cn("flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-medium text-foreground")}>
                      {lockedClassroomLabel ?? t("em_dash")}
                    </div>
                  )}
                </div>

                <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("subject_label")}</span>
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
                      <div className={cn("flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-medium text-foreground")}>
                        {t("subject_not_set")}
                      </div>
                    )
                  ) : (
                    <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                      <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                        <SelectValue placeholder={t("subject_placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("all_subjects")}</SelectItem>
                        {subjectsInData.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
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
                    placeholder={t("search_placeholder")}
                    className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {isParent && selectedChild && (
                <p className="text-xs text-muted-foreground">
                  {t("parent_banner", { name: selectedChild.full_name })}
                </p>
              )}
            </div>

            {/* Grades table */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
              {tableLoading ? (
                <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">{t("loading")}</span>
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <div className="table-scroll overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="whitespace-nowrap px-4 py-3">{t("col_date")}</th>
                        {showStudentColumn && <th className="whitespace-nowrap px-4 py-3">{t("col_student")}</th>}
                        <th className="whitespace-nowrap px-4 py-3">{t("col_class")}</th>
                        <th className="whitespace-nowrap px-4 py-3">{t("col_subject")}</th>
                        <th className="min-w-[140px] px-4 py-3">{t("col_assessment")}</th>
                        <th className="whitespace-nowrap px-4 py-3 text-right">{t("col_grade")}</th>
                        <th className="hidden min-w-[120px] px-4 py-3 lg:table-cell">{t("col_comment")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((r) => (
                        <tr key={r.id} className="bg-card transition-colors hover:bg-muted/30">
                          <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatGradeDate(r.date)}</td>
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
                            <span className="text-xs font-normal text-muted-foreground">{t("grade_out_of_short")}</span>
                          </td>
                          <td className="hidden max-w-[220px] truncate px-4 py-3 text-muted-foreground lg:table-cell">
                            {r.teacher_comment ?? t("em_dash")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── Aba: Alunos em risco (privileged only) ── */}
          {isPrivileged && (
            <TabsContent value="risco" className="mt-0">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-pastel-pink-foreground" strokeWidth={2} />
                  <h2 className="text-sm font-semibold text-foreground">
                    {t("at_risk_title")}
                    {!atRiskLoading && (
                      <span className={cn(
                        "ml-2 rounded-full px-2 py-0.5 text-xs",
                        atRiskStudents.length > 0
                          ? "bg-pastel-pink text-pastel-pink-foreground"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {atRiskStudents.length}
                      </span>
                    )}
                  </h2>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {t("at_risk_explainer")}
                </p>
                {atRiskLoading ? (
                  <div className="flex items-center gap-2 py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">{t("at_risk_computing")}</span>
                  </div>
                ) : atRiskStudents.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    {t("at_risk_empty")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="py-2 pr-4">{t("at_risk_col_student")}</th>
                          <th className="py-2 pr-4">{t("at_risk_col_class")}</th>
                          <th className="py-2 pr-4 text-right">{t("at_risk_col_average")}</th>
                          <th className="py-2">{t("at_risk_col_reason")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {atRiskStudents.map((s) => (
                          <tr key={s.studentId}>
                            <td className="py-2 pr-4 font-medium text-foreground">{s.studentName}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{s.classroomName}</td>
                            <td className="py-2 pr-4 text-right font-semibold tabular-nums text-pastel-pink-foreground">
                              {s.overallAvg.toFixed(1)}
                              <span className="text-xs font-normal text-muted-foreground">{t("grade_out_of_short")}</span>
                            </td>
                            <td className="py-2">
                              <div className="flex flex-wrap gap-1">
                                {s.reasons.map((reason, idx) => (
                                  <span key={`${s.studentId}-${idx}`} className="rounded-full bg-pastel-pink/60 px-2 py-0.5 text-xs text-pastel-pink-foreground">
                                    {reason}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      {isPrivileged && (
        <PublishResultsDialog
          open={publishOpen}
          onOpenChange={setPublishOpen}
          classrooms={[]}
          years={years}
          defaultYearId={resolvedYearId ?? null}
          defaultClassroomId={classroomFilter !== "all" ? classroomFilter : null}
          onSaved={() => void loadAllYearGrades()}
        />
      )}
    </div>
  );
};

export default Notas;
