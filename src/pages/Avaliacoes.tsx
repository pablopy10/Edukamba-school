import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsRestoring, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  FileText,
  GraduationCap,
  Users,
  PencilLine,
  Clock,
  MapPin,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn, sortByName } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AssessmentFormDialog, type AssessmentRecord } from "@/components/avaliacoes/AssessmentFormDialog";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { useTeacherSessionScope } from "@/hooks/useTeacherSessionScope";
import { QUERY_DAY_MS } from "@/lib/queryClient";
import { teacherScheduleClassroomsFingerprint } from "@/lib/offline/teacherListQueries";
import {
  fetchTeacherAvaliacoesPack,
  teacherAvaliacoesPackQueryKey,
  type AvaliacoesHolidayPack,
  type AvaliacoesTeacherOption,
  type AvaliacoesTermPack,
  type TeacherAssessmentRow,
} from "@/lib/offline/teacherAvaliacoesQueries";
import { useUserRole } from "@/hooks/useUserRole";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { useAuth } from "@/hooks/useAuth";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { showPageKpiCards, isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

type EvalType = "teste" | "exame" | "trabalho" | "oral";

type Assessment = TeacherAssessmentRow;

type Holiday = AvaliacoesHolidayPack;

type Term = AvaliacoesTermPack;

type TeacherOption = AvaliacoesTeacherOption;

type Option = { id: string; name: string };

const TYPE_VISUAL: Record<
  EvalType,
  {
    color: string;
    icon: typeof FileText;
  }
> = {
  teste: { color: "bg-pastel-blue text-pastel-blue-foreground", icon: PencilLine },
  exame: { color: "bg-pastel-pink text-pastel-pink-foreground", icon: GraduationCap },
  trabalho: { color: "bg-pastel-green text-pastel-green-foreground", icon: Users },
  oral: { color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: FileText },
};

/** Monday → Sunday weekday headers matching calendar grid. */
const weekdayHeadersMonSun = (locale: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + i)),
  );

const formatAssessmentDateLong = (locale: string, iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(d);
};

const typeVisualFor = (type: string) => TYPE_VISUAL[type as EvalType] ?? TYPE_VISUAL.teste;

type View = "calendario" | "lista";
type TypeFilter = EvalType | "all";
const tt = (t?: string | null) => (t ? t.slice(0, 5) : "");

const todayIsoLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isoDateSlice = (s: string) => s.slice(0, 10);

/** Trimestre que contém hoje · senão o próximo não iniciado · senão o último (igual Preferências em Notas). */
function resolveCurrentTermIdFromList(terms: Term[]): string | null {
  if (!terms.length) return null;
  const sorted = [...terms].sort((a, b) => a.term_number - b.term_number);
  const today = todayIsoLocal();
  const current = sorted.find((t) => today >= isoDateSlice(t.start_date) && today <= isoDateSlice(t.end_date));
  if (current) return current.id;
  const upcoming = sorted.find((t) => today < isoDateSlice(t.start_date));
  if (upcoming) return upcoming.id;
  return sorted[sorted.length - 1].id;
}

const Avaliacoes = () => {
  const navigate = useNavigate();
  const native = isNativeMobileApp();
  const { selectedYearId: ctxYearId, schoolId: ctxSchoolId } = useAcademicYear();
  const { data: persistedTeacherSession } = useTeacherSessionScope();
  const persistRestoring = useIsRestoring();
  const queryClient = useQueryClient();
  const { isParent, classroomIds: parentClassroomIds, selectedChild, loading: parentLoading } = useParentChildren();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();
  const { isTeacher, classroomIds: teacherClassroomIds, subjectId: teacherSubjectId, loading: teacherLoading } = useTeacherClassrooms();
  const {
    isStudent,
    classroomId: studentClassroomId,
    classroomName: studentClassroomName,
    subjectIds: studentSubjectIds,
    teacherIds: studentTeacherIds,
    loading: studentLoading,
  } = useStudentSelf();
  const studentReadOnly = isParent || isStudent;
  const { t, i18n } = useTranslation("pages", { keyPrefix: "avaliacoes" });
  const [view, setView] = useState<View>("calendario");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  const [classroomFilter, setClassroomFilter] = useState<string>("all");
  const [termFilter, setTermFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [profileSchoolId, setProfileSchoolId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [classrooms, setClassrooms] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<AssessmentRecord> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resolvedSchoolId = useMemo(() => {
    if (isTeacher)
      return ctxSchoolId ?? persistedTeacherSession?.schoolId ?? profileSchoolId;
    return ctxSchoolId ?? profileSchoolId;
  }, [isTeacher, ctxSchoolId, persistedTeacherSession?.schoolId, profileSchoolId]);

  const resolvedYearId = useMemo(() => {
    if (!isTeacher) return ctxYearId ?? null;
    return ctxYearId ?? persistedTeacherSession?.academicYearId ?? null;
  }, [isTeacher, ctxYearId, persistedTeacherSession?.academicYearId]);

  const teacherClassroomFingerprint = useMemo(
    () => teacherScheduleClassroomsFingerprint(teacherClassroomIds),
    [teacherClassroomIds],
  );

  const teacherAvaliacoesQuery = useQuery({
    queryKey: teacherAvaliacoesPackQueryKey(
      user?.id ?? "__none__",
      resolvedSchoolId ?? "__none__",
      resolvedYearId ?? "__none__",
      teacherClassroomFingerprint || "__empty__",
    ),
    queryFn: () =>
      fetchTeacherAvaliacoesPack({
        schoolId: resolvedSchoolId!,
        academicYearId: resolvedYearId!,
        classroomIds: teacherClassroomIds,
      }),
    enabled: Boolean(
      isTeacher &&
        user?.id &&
        resolvedSchoolId &&
        resolvedYearId &&
        teacherClassroomIds.length > 0 &&
        !teacherLoading,
    ),
    staleTime: 0,
    networkMode: "offlineFirst",
  });

  const teacherAssessments = teacherAvaliacoesQuery.data?.assessments ?? [];
  const teacherClassroomsOpts = teacherAvaliacoesQuery.data?.classrooms ?? [];
  const teacherSubjectsOpts = teacherAvaliacoesQuery.data?.subjects ?? [];
  const teacherTeachersOpts = teacherAvaliacoesQuery.data?.teachers ?? [];
  const teacherTermsPack = teacherAvaliacoesQuery.data?.terms ?? [];
  const teacherHolidaysPack = teacherAvaliacoesQuery.data?.holidays ?? [];

  const displayAssessments = isTeacher ? teacherAssessments : assessments;
  const displayClassrooms = isTeacher ? teacherClassroomsOpts : classrooms;
  const displaySubjects = isTeacher ? teacherSubjectsOpts : subjects;
  const displayTeachers = isTeacher ? teacherTeachersOpts : teachers;
  const displayTerms = isTeacher ? teacherTermsPack : terms;
  const displayHolidays = isTeacher ? teacherHolidaysPack : holidays;

  /** Aluno ou educador: uma única turma fixa, sem alterar o filtro. */
  const lockedClassroomId = useMemo(() => {
    if (isStudent && studentClassroomId) return studentClassroomId;
    if (isParent && selectedChild?.classroom_id) return selectedChild.classroom_id;
    return null;
  }, [isStudent, studentClassroomId, isParent, selectedChild?.classroom_id]);

  const classroomFilterLocked = lockedClassroomId !== null;

  const classroomsForSelect = useMemo(() => {
    if (classroomFilterLocked && lockedClassroomId) {
      const fromList = displayClassrooms.find((c) => c.id === lockedClassroomId);
      if (fromList) return [fromList];
      const label =
        (isStudent ? studentClassroomName : null) ||
        (isParent ? selectedChild?.classroom_name : null) ||
        t("class_fallback");
      return [{ id: lockedClassroomId, name: label }];
    }
    return sortByName(displayClassrooms);
  }, [
    classroomFilterLocked,
    lockedClassroomId,
    displayClassrooms,
    isStudent,
    studentClassroomName,
    isParent,
    selectedChild?.classroom_name,
    t,
  ]);

  const teachersInSubjectFilter = useMemo(() => {
    if (subjectFilter === "all") return displayTeachers;
    return displayTeachers.filter((t) => (t.subject_id ?? null) === subjectFilter);
  }, [displayTeachers, subjectFilter]);

  useEffect(() => {
    if (teacherFilter === "all") return;
    if (!teachersInSubjectFilter.some((t) => t.id === teacherFilter)) setTeacherFilter("all");
  }, [teacherFilter, teachersInSubjectFilter]);

  const invalidateTeacherAvalPack = useCallback(() => {
    if (!isTeacher || !user?.id || !resolvedSchoolId || !resolvedYearId) return;
    void queryClient.invalidateQueries({
      queryKey: teacherAvaliacoesPackQueryKey(
        user.id,
        resolvedSchoolId,
        resolvedYearId,
        teacherClassroomFingerprint || "__empty__",
      ),
    });
  }, [
    isTeacher,
    user?.id,
    resolvedSchoolId,
    resolvedYearId,
    teacherClassroomFingerprint,
    queryClient,
  ]);

  const loadAll = async () => {
    if (isTeacher) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, support_context_school_id")
      .eq("id", user.id)
      .maybeSingle();
    const sid = effectiveSchoolIdFromProfile(profile);
    setProfileSchoolId(sid);
    if (!sid) {
      setLoading(false);
      return;
    }

    const yearId = resolvedYearId;

    const termsBase = supabase
      .from("academic_terms")
      .select("id, term_number, name, start_date, end_date")
      .eq("school_id", sid)
      .order("term_number");
    const holidaysBase = supabase
      .from("school_holidays")
      .select("id, name, start_date, end_date")
      .eq("school_id", sid)
      .order("start_date");
    let assessmentsQuery = supabase
      .from("assessments")
      .select(
        "id,title,type,date,start_time,end_time,room,weight,description,classroom_id,subject_id,teacher_id,term_id,academic_year_id,created_by",
      )
      .eq("school_id", sid)
      .order("date", { ascending: false });
    if (yearId) {
      assessmentsQuery = assessmentsQuery.eq("academic_year_id", yearId);
    }
    if (isParent) {
      if (parentClassroomIds.length === 0) {
        setAssessments([]);
        setClassrooms([]);
        setSubjects([]);
        setTeachers([]);
        setTerms([]);
        setHolidays([]);
        setLoading(false);
        return;
      }
      assessmentsQuery = assessmentsQuery.in("classroom_id", parentClassroomIds);
    }
    if (isStudent) {
      if (!studentClassroomId) {
        setAssessments([]);
        setClassrooms([]);
        setSubjects([]);
        setTeachers([]);
        setTerms([]);
        setHolidays([]);
        setLoading(false);
        return;
      }
      assessmentsQuery = assessmentsQuery.eq("classroom_id", studentClassroomId);
    }

    const [aRes, cRes, sRes, tRes, termRes, holRes] = await Promise.all([
      assessmentsQuery,
      yearId
        ? supabase.from("classrooms").select("id, name").eq("school_id", sid).eq("academic_year_id", yearId).order("name")
        : supabase.from("classrooms").select("id, name").eq("school_id", sid).order("name"),
      supabase.from("subjects").select("id, name").eq("school_id", sid).order("name"),
      supabase
        .from("teachers")
        .select("id, profile_id, subject_id, profiles:profile_id(full_name)")
        .eq("school_id", sid),
      yearId ? termsBase.eq("academic_year_id", yearId) : termsBase,
      yearId ? holidaysBase.eq("academic_year_id", yearId) : holidaysBase,
    ]);

    setAssessments((aRes.data ?? []) as Assessment[]);
    {
      let classroomList = cRes.data ?? [];
      if (isStudent && studentClassroomId) {
        classroomList = classroomList.filter((c) => c.id === studentClassroomId);
      }
      setClassrooms(classroomList);
    }
    {
      let subjectList = sRes.data ?? [];
      let teacherList = (tRes.data ?? [])
        .filter((row: { profile_id?: string | null }) => !!row.profile_id)
        .map((row: { profile_id: string; subject_id?: string | null; profiles?: { full_name?: string | null } | null }) => ({
          id: row.profile_id,
          name: row.profiles?.full_name?.trim() || t("no_name"),
          subject_id: row.subject_id ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
      if (isStudent) {
        const subjSet = new Set(studentSubjectIds);
        const teachSet = new Set(studentTeacherIds);
        subjectList = subjectList.filter((s) => subjSet.has(s.id));
        teacherList = teacherList.filter((t) => teachSet.has(t.id));
      }
      setSubjects(subjectList);
      setTeachers(teacherList);
    }
    setTerms((termRes.data ?? []) as Term[]);
    setHolidays((holRes.data ?? []) as Holiday[]);
    setLoading(false);
  };

  useEffect(() => {
    if (parentLoading) return;
    if (isTeacher) return;
    if (isStudent && studentLoading) return;
    loadAll();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [
    resolvedYearId,
    parentLoading,
    isParent,
    parentClassroomIds.join(","),
    isStudent,
    studentLoading,
    studentClassroomId,
    studentSubjectIds.join(","),
    studentTeacherIds.join(","),
    isTeacher,
  ]);

  useEffect(() => {
    if (!isTeacher || !teacherSubjectId) return;
    setSubjectFilter(teacherSubjectId);
  }, [isTeacher, teacherSubjectId]);

  useEffect(() => {
    if (!lockedClassroomId) return;
    setClassroomFilter(lockedClassroomId);
  }, [lockedClassroomId]);

  const displayTermsKey = useMemo(() => displayTerms.map((t) => t.id).join(","), [displayTerms]);

  useEffect(() => {
    if (displayTerms.length === 0) return;
    const currentId = resolveCurrentTermIdFromList(displayTerms);
    if (!currentId) return;
    setTermFilter((prev) => {
      const prevStillValid = prev !== "all" && displayTerms.some((t) => t.id === prev);
      if (!prevStillValid || prev === "all") return currentId;
      return prev;
    });
  }, [displayTermsKey, displayTerms]);

  const effectiveTermFilterValue = useMemo(() => {
    if (!displayTerms.length) return termFilter;
    if (termFilter === "all") return "all";
    if (displayTerms.some((t) => t.id === termFilter)) return termFilter;
    return resolveCurrentTermIdFromList(displayTerms) ?? "all";
  }, [termFilter, displayTerms]);

  const classroomMap = useMemo(() => new Map(displayClassrooms.map((c) => [c.id, c.name])), [displayClassrooms]);
  const subjectMap = useMemo(() => new Map(displaySubjects.map((s) => [s.id, s.name])), [displaySubjects]);
  const teacherMap = useMemo(() => new Map(displayTeachers.map((t) => [t.id, t.name])), [displayTeachers]);

  const filtered = useMemo(() => {
    return displayAssessments.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (subjectFilter !== "all" && e.subject_id !== subjectFilter) return false;
      if (teacherFilter !== "all" && e.teacher_id !== teacherFilter) return false;
      if (classroomFilter !== "all" && e.classroom_id !== classroomFilter) return false;
      if (termFilter !== "all") {
        let effectiveTerm = e.term_id;
        if (!effectiveTerm) {
          const matched = displayTerms.find((t) => e.date >= t.start_date && e.date <= t.end_date);
          effectiveTerm = matched?.id ?? null;
        }
        if (effectiveTerm !== termFilter) return false;
      }
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const subjectName = e.subject_id ? subjectMap.get(e.subject_id) ?? "" : "";
      const turmaName = e.classroom_id ? classroomMap.get(e.classroom_id) ?? "" : "";
      const teacherName = e.teacher_id ? teacherMap.get(e.teacher_id) ?? "" : "";
      return (
        e.title.toLowerCase().includes(q) ||
        subjectName.toLowerCase().includes(q) ||
        turmaName.toLowerCase().includes(q) ||
        teacherName.toLowerCase().includes(q)
      );
    });
  }, [
    displayAssessments,
    typeFilter,
    subjectFilter,
    teacherFilter,
    classroomFilter,
    termFilter,
    displayTerms,
    search,
    subjectMap,
    classroomMap,
    teacherMap,
  ]);

  const stats = useMemo(() => ({
    total: filtered.length,
    testes: filtered.filter((e) => e.type === "teste").length,
    exames: filtered.filter((e) => e.type === "exame").length,
    trabalhos: filtered.filter((e) => e.type === "trabalho").length,
  }), [filtered]);

  // Detect conflicts among current filtered set (same date overlap + same turma or same sala)
  const conflictIds = useMemo(() => {
    const ids = new Set<string>();
    const byDate = new Map<string, Assessment[]>();
    for (const a of displayAssessments) {
      const arr = byDate.get(a.date) ?? [];
      arr.push(a);
      byDate.set(a.date, arr);
    }
    for (const list of byDate.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const aS = tt(a.start_time), aE = tt(a.end_time);
          const bS = tt(b.start_time), bE = tt(b.end_time);
          if (!aS || !aE || !bS || !bE) continue;
          if (!(aS < bE && aE > bS)) continue;
          const aRoom = (a.room ?? "").trim().toLowerCase();
          const bRoom = (b.room ?? "").trim().toLowerCase();
          const shares =
            (a.classroom_id && a.classroom_id === b.classroom_id) ||
            (aRoom && bRoom && aRoom === bRoom);
          if (shares) { ids.add(a.id); ids.add(b.id); }
        }
      }
    }
    return ids;
  }, [displayAssessments]);

  // Map of assessmentId -> holiday name for assessments scheduled during a holiday period
  const holidayConflicts = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of displayAssessments) {
      const h = displayHolidays.find((hol) => a.date >= hol.start_date && a.date <= hol.end_date);
      if (h) map.set(a.id, h.name);
    }
    return map;
  }, [displayAssessments, displayHolidays]);

  const canMutateAssessment = useCallback(
    (a: Assessment) => {
      if (studentReadOnly) return false;
      if (roleLoading || !user?.id) return false;
      if (isSchoolManagementRole(role)) return true;
      if (role === "TEACHER") return (a.created_by ?? null) === user.id;
      return false;
    },
    [studentReadOnly, roleLoading, user?.id, role],
  );

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (a: Assessment) => {
    setEditing({
      id: a.id,
      title: a.title,
      type: a.type,
      classroom_id: a.classroom_id,
      subject_id: a.subject_id,
      teacher_id: a.teacher_id,
      date: a.date,
      start_time: a.start_time ?? "08:00",
      end_time: a.end_time ?? "09:30",
      room: a.room,
      weight: Number(a.weight ?? 0),
      description: a.description,
      term_id: a.term_id,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    const { error } = await supabase.from("assessments").delete().eq("id", id);
    if (error) {
      toast({ title: t("toast_delete_fail"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("toast_deleted_ok") });
    if (isTeacher) {
      invalidateTeacherAvalPack();
    } else {
      setAssessments((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const teacherPackLoading =
    isTeacher &&
    (teacherLoading ||
      (teacherClassroomIds.length > 0 &&
        !teacherAvaliacoesQuery.data &&
        teacherAvaliacoesQuery.isPending &&
        !persistRestoring));

  const pageLoading = teacherPackLoading || (!isTeacher && loading);

  if (parentLoading || (isStudent && studentLoading)) return <PageLoadingSkeleton />;

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && !studentReadOnly && "relative pb-28")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("header_title")}</h1>
            <p className="text-sm text-muted-foreground">{t("header_subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!native && (
            <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
              <button
                onClick={() => setView("calendario")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "calendario" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
                {t("view_calendar")}
              </button>
              <button
                onClick={() => setView("lista")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  view === "lista" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="h-4 w-4" strokeWidth={1.75} />
                {t("view_list")}
              </button>
            </div>
            )}
            {!studentReadOnly && !native && (
              <button
                onClick={openCreate}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} />
                {t("new_btn")}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!studentReadOnly && showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: t("kpi_total"), value: stats.total, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: t("kpi_tests"), value: stats.testes, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: t("kpi_exams"), value: stats.exames, color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: t("kpi_work"), value: stats.trabalhos, color: "bg-pastel-green text-pastel-green-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>{s.label}</span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
        )}

        {/* Filtros: visíveis para todos (web e nativa), com turma fixa para aluno/educador. */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className={cn("flex flex-col gap-3", !native && "sm:flex-row sm:items-center sm:justify-between")}>
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("search_placeholder")}
                className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TypeChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} className="bg-muted text-foreground">
                {t("type_all")}
              </TypeChip>
              {(Object.keys(TYPE_VISUAL) as EvalType[]).map((ty) => (
                <TypeChip
                  key={ty}
                  active={typeFilter === ty}
                  onClick={() => setTypeFilter(ty)}
                  className={typeVisualFor(ty).color}
                >
                  {t(`types.${ty}`)}
                </TypeChip>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={subjectFilter} onValueChange={setSubjectFilter} disabled={isStudent}>
              <SelectTrigger className="h-10 rounded-full">
                <SelectValue placeholder={t("filter_subject_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_subjects")}</SelectItem>
                {displaySubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teacherFilter} onValueChange={setTeacherFilter} disabled={isStudent}>
              <SelectTrigger className="h-10 rounded-full"><SelectValue placeholder="Professor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os professores</SelectItem>
                {teachersInSubjectFilter.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={
                classroomFilterLocked && lockedClassroomId
                  ? lockedClassroomId
                  : classroomsForSelect.some((c) => c.id === classroomFilter)
                    ? classroomFilter
                    : "all"
              }
              onValueChange={setClassroomFilter}
              disabled={classroomFilterLocked || isStudent}
            >
              <SelectTrigger className="h-10 rounded-full">
                <SelectValue placeholder={t("filter_class_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {!classroomFilterLocked && <SelectItem value="all">{t("all_classes")}</SelectItem>}
                {classroomsForSelect.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={effectiveTermFilterValue} onValueChange={setTermFilter}>
              <SelectTrigger className="h-10 rounded-full">
                <SelectValue placeholder={t("filter_term_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_terms")}</SelectItem>
                {displayTerms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {pageLoading ? (
          <div className="flex items-center justify-center rounded-2xl bg-card py-16 shadow-card">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : native ? (
          <AssessmentsCardsView
            evaluations={filtered}
            classroomMap={classroomMap}
            subjectMap={subjectMap}
            teacherMap={teacherMap}
            conflictIds={conflictIds}
            holidayConflicts={holidayConflicts}
            onEdit={openEdit}
            onDelete={(id) => setDeleteId(id)}
            onOpen={(id) => navigate(`/avaliacoes/${id}/notas`)}
            canMutateAssessment={canMutateAssessment}
          />
        ) : view === "calendario" ? (
          <CalendarView
            cursor={cursor}
            setCursor={setCursor}
            evaluations={filtered}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            classroomMap={classroomMap}
            subjectMap={subjectMap}
            conflictIds={conflictIds}
            holidays={displayHolidays}
            holidayConflicts={holidayConflicts}
            onEdit={openEdit}
            onDelete={(id) => setDeleteId(id)}
            onOpen={(id) => navigate(`/avaliacoes/${id}/notas`)}
            canMutateAssessment={canMutateAssessment}
          />
        ) : (
          <ListView
            evaluations={filtered}
            classroomMap={classroomMap}
            subjectMap={subjectMap}
            teacherMap={teacherMap}
            conflictIds={conflictIds}
            holidayConflicts={holidayConflicts}
            onEdit={openEdit}
            onDelete={(id) => setDeleteId(id)}
            onOpen={(id) => navigate(`/avaliacoes/${id}/notas`)}
            canMutateAssessment={canMutateAssessment}
          />
        )}
      </div>

      {native && !studentReadOnly && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label={t("fab_aria_new")}
            onClick={openCreate}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      <AssessmentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schoolId={resolvedSchoolId ?? profileSchoolId}
        classrooms={displayClassrooms}
        subjects={displaySubjects}
        teachers={displayTeachers}
        initial={editing}
        onSaved={() => {
          invalidateTeacherAvalPack();
          void loadAll();
        }}
        lockTeacherId={isTeacher ? user?.id ?? null : null}
        lockSubjectId={isTeacher ? teacherSubjectId : null}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialog_delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("dialog_delete_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("btn_cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const TypeChip = ({
  active, onClick, className, children,
}: { active: boolean; onClick: () => void; className?: string; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
      active ? cn(className, "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card") : "bg-muted text-muted-foreground hover:text-foreground",
    )}
  >
    {children}
  </button>
);

/* ======================= Native cards (lista única) ======================= */
const AssessmentsCardsView = ({
  evaluations,
  classroomMap,
  subjectMap,
  teacherMap,
  conflictIds,
  holidayConflicts,
  onEdit,
  onDelete,
  onOpen,
  canMutateAssessment,
}: {
  evaluations: Assessment[];
  classroomMap: Map<string, string>;
  subjectMap: Map<string, string>;
  teacherMap: Map<string, string>;
  conflictIds: Set<string>;
  holidayConflicts: Map<string, string>;
  onEdit: (a: Assessment) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  canMutateAssessment: (a: Assessment) => boolean;
}) => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "avaliacoes" });
  const sorted = [...evaluations].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return (b.start_time ?? "").localeCompare(a.start_time ?? "");
  });

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6">
        <h2 className="text-base font-bold text-foreground">{t("list_heading")}</h2>
        <span className="text-xs text-muted-foreground">{t("results_count", { count: sorted.length })}</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("empty_filtered")}</p>
        ) : (
          sorted.map((e) => {
            const Icon = typeVisualFor(e.type).icon;
            const turma = e.classroom_id ? classroomMap.get(e.classroom_id) : "";
            const subj = e.subject_id ? subjectMap.get(e.subject_id) : "";
            const teacher = e.teacher_id ? teacherMap.get(e.teacher_id) : "";
            return (
              <div
                key={e.id}
                onClick={() => onOpen(e.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(e.id); } }}
                className={cn(
                  "cursor-pointer rounded-xl border bg-background p-3 transition-all hover:-translate-y-0.5 hover:shadow-soft",
                  conflictIds.has(e.id) ? "border-destructive/50" : "border-border",
                )}
              >
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatAssessmentDateLong(i18n.language, e.date)}
                  {teacher ? ` · ${teacher}` : ""}
                </p>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", typeVisualFor(e.type).color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{subj}{turma ? ` · ${turma}` : ""}</p>
                    </div>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", typeVisualFor(e.type).color)}>{t(`types.${e.type}`)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.75} />{tt(e.start_time)} – {tt(e.end_time)}</span>
                  {e.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" strokeWidth={1.75} />{e.room}</span>}
                  {(e.weight ?? 0) > 0 && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{e.weight}%</span>}
                </div>
                {conflictIds.has(e.id) && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {t("conflict_detected")}
                  </div>
                )}
                {holidayConflicts.has(e.id) && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-pastel-yellow-foreground">
                    <AlertTriangle className="h-3 w-3" /> {t("on_holiday_named", { name: holidayConflicts.get(e.id) })}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={(ev) => { ev.stopPropagation(); onOpen(e.id); }} className="inline-flex items-center gap-1 rounded-full bg-pastel-blue px-3 py-1 text-xs font-medium text-pastel-blue-foreground hover:opacity-90">
                    <GraduationCap className="h-3 w-3" /> {t("grades")}
                  </button>
                  {canMutateAssessment(e) && (
                    <>
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-accent">
                        <Pencil className="h-3 w-3" /> {t("edit")}
                      </button>
                      <button type="button" onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20">
                        <Trash2 className="h-3 w-3" /> {t("delete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/* ======================= Calendar View ======================= */
const CalendarView = ({
  cursor, setCursor, evaluations, selectedDate, setSelectedDate,
  classroomMap, subjectMap, conflictIds, holidays, holidayConflicts, onEdit, onDelete, onOpen, canMutateAssessment,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  evaluations: Assessment[];
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  classroomMap: Map<string, string>;
  subjectMap: Map<string, string>;
  conflictIds: Set<string>;
  holidays: Holiday[];
  holidayConflicts: Map<string, string>;
  onEdit: (a: Assessment) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  canMutateAssessment: (a: Assessment) => boolean;
}) => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "avaliacoes" });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { date: Date | null; iso: string | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ date: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date, iso });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Assessment[]>();
    evaluations.forEach((e) => {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    });
    return map;
  }, [evaluations]);

  const weekdays = useMemo(() => weekdayHeadersMonSun(i18n.language), [i18n.language]);
  const monthYearTitle = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(new Date(year, month, 1)),
    [i18n.language, year, month],
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];

  const holidayForDate = (iso: string) =>
    holidays.find((h) => iso >= h.start_date && iso <= h.end_date);
  const selectedHoliday = selectedDate ? holidayForDate(selectedDate) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent">
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <h2 className="text-base font-bold text-foreground">{monthYearTitle}</h2>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent">
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <button
            onClick={() => { setCursor(new Date()); setSelectedDate(todayIso); }}
            className="rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >{t("calendar_today")}</button>
        </div>

        <div className="p-4">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {weekdays.map((d) => (
              <div key={d} className="rounded-xl bg-muted py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {cells.map((c, i) => {
              if (!c.date || !c.iso) return <div key={i} className="min-h-[92px] rounded-xl bg-muted/20" />;
              const events = eventsByDate.get(c.iso) ?? [];
              const isToday = c.iso === todayIso;
              const isSelected = c.iso === selectedDate;
              const holiday = holidayForDate(c.iso);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(c.iso)}
                  className={cn(
                    "flex min-h-[92px] flex-col items-stretch gap-1 rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5",
                    isSelected ? "border-pastel-blue-foreground bg-pastel-blue/30" : "border-border bg-background",
                    holiday && !isSelected && "border-pastel-yellow-foreground/30 bg-pastel-yellow/20",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                      isToday ? "bg-pastel-blue text-pastel-blue-foreground" : "text-foreground",
                    )}>{c.date.getDate()}</span>
                    {events.length > 0 && (
                      <span className="text-[10px] font-semibold text-muted-foreground">{events.length}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {holiday && (
                      <span className="truncate rounded-md bg-pastel-yellow px-1.5 py-0.5 text-[10px] font-semibold text-pastel-yellow-foreground">
                        🌴 {holiday.name}
                      </span>
                    )}
                    {events.slice(0, 2).map((e) => (
                      <span key={e.id} className={cn("truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold", typeVisualFor(e.type).color, conflictIds.has(e.id) && "ring-1 ring-destructive")}>
                        {e.title}
                      </span>
                    ))}
                    {events.length > 2 && (
                      <span className="text-[10px] font-medium text-muted-foreground">{t("more_count", { count: events.length - 2 })}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day detail */}
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("day_detail")}</p>
            <h3 className="mt-1 text-base font-bold text-foreground">
              {selectedDate ? formatAssessmentDateLong(i18n.language, selectedDate) : t("pick_date")}
            </h3>
          </div>
        </div>

        {selectedDate && selectedEvents.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {t("none_this_day")}
          </div>
        )}

        {selectedHoliday && (
          <div className="mb-3 rounded-xl border border-pastel-yellow-foreground/30 bg-pastel-yellow/30 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-pastel-yellow-foreground">
              <span>🌴</span> {selectedHoliday.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("holiday_student_period")}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {selectedEvents.map((e) => {
            const Icon = typeVisualFor(e.type).icon;
            const turma = e.classroom_id ? classroomMap.get(e.classroom_id) : "";
            const subj = e.subject_id ? subjectMap.get(e.subject_id) : "";
            return (
              <div
                key={e.id}
                onClick={() => onOpen(e.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(e.id); } }}
                className={cn(
                  "cursor-pointer rounded-xl border bg-background p-3 transition-all hover:-translate-y-0.5 hover:shadow-soft",
                  conflictIds.has(e.id) ? "border-destructive/50" : "border-border"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", typeVisualFor(e.type).color)}>
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{subj}{turma ? ` · ${turma}` : ""}</p>
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", typeVisualFor(e.type).color)}>{t(`types.${e.type}`)}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" strokeWidth={1.75} />{tt(e.start_time)} – {tt(e.end_time)}</span>
                  {e.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" strokeWidth={1.75} />{e.room}</span>}
                  {(e.weight ?? 0) > 0 && <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{e.weight}%</span>}
                </div>
                {conflictIds.has(e.id) && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {t("conflict_detected")}
                  </div>
                )}
                {holidayConflicts.has(e.id) && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-pastel-yellow-foreground">
                    <AlertTriangle className="h-3 w-3" /> {t("on_holiday_named", { name: holidayConflicts.get(e.id) })}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <button onClick={(ev) => { ev.stopPropagation(); onOpen(e.id); }} className="inline-flex items-center gap-1 rounded-full bg-pastel-blue px-3 py-1 text-xs font-medium text-pastel-blue-foreground hover:opacity-90">
                    <GraduationCap className="h-3 w-3" /> {t("grades")}
                  </button>
                  {canMutateAssessment(e) && (
                    <>
                      <button onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground hover:bg-accent">
                        <Pencil className="h-3 w-3" /> {t("edit")}
                      </button>
                      <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20">
                        <Trash2 className="h-3 w-3" /> {t("delete")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ======================= List View ======================= */
const ListView = ({
  evaluations, classroomMap, subjectMap, teacherMap, conflictIds, holidayConflicts, onEdit, onDelete, onOpen, canMutateAssessment,
}: {
  evaluations: Assessment[];
  classroomMap: Map<string, string>;
  subjectMap: Map<string, string>;
  teacherMap: Map<string, string>;
  conflictIds: Set<string>;
  holidayConflicts: Map<string, string>;
  onEdit: (a: Assessment) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
  canMutateAssessment: (a: Assessment) => boolean;
}) => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "avaliacoes" });
  const sorted = [...evaluations].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">{t("table_title")}</h2>
        <span className="text-xs text-muted-foreground">{t("results_count", { count: sorted.length })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">{t("col_date")}</th>
              <th className="px-6 py-3">{t("col_title")}</th>
              <th className="px-6 py-3">{t("col_type")}</th>
              <th className="px-6 py-3">{t("col_class")}</th>
              <th className="px-6 py-3">{t("col_teacher")}</th>
              <th className="px-6 py-3">{t("col_place")}</th>
              <th className="px-6 py-3 text-right">{t("col_weight")}</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const Icon = typeVisualFor(e.type).icon;
              const turma = e.classroom_id ? classroomMap.get(e.classroom_id) : "—";
              const subj = e.subject_id ? subjectMap.get(e.subject_id) : "";
              const teacher = e.teacher_id ? teacherMap.get(e.teacher_id) : "—";
              const isConflict = conflictIds.has(e.id);
              return (
                <tr
                  key={e.id}
                  onClick={() => onOpen(e.id)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 text-sm transition-colors hover:bg-muted/30",
                    isConflict && "bg-destructive/5"
                  )}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{formatAssessmentDateLong(i18n.language, e.date)}</span>
                      <span className="text-xs text-muted-foreground">{tt(e.start_time)} – {tt(e.end_time)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", typeVisualFor(e.type).color)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground flex items-center gap-2">
                          {e.title}
                          {isConflict && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                          {holidayConflicts.has(e.id) && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-pastel-yellow/40 px-2 py-0.5 text-[10px] font-semibold text-pastel-yellow-foreground"
                              title={t("on_holiday_named", { name: holidayConflicts.get(e.id) })}
                            >
                              🌴 {t("holiday_chip")}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{subj}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", typeVisualFor(e.type).color)}>{t(`types.${e.type}`)}</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">{turma}</td>
                  <td className="px-6 py-4 text-muted-foreground">{teacher}</td>
                  <td className="px-6 py-4 text-muted-foreground">{e.room ?? "—"}</td>
                  <td className="px-6 py-4 text-right font-semibold text-foreground">{(e.weight ?? 0)}%</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={(ev) => { ev.stopPropagation(); onOpen(e.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/30 hover:text-foreground" title={t("title_grades")}>
                        <GraduationCap className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      {canMutateAssessment(e) && (
                        <>
                          <button onClick={(ev) => { ev.stopPropagation(); onEdit(e); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title={t("title_edit_row")}>
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title={t("title_delete_row")}>
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  {t("empty_filtered")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Avaliacoes;
