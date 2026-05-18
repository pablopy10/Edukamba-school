import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsRestoring, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  X,
  Clock,
  Loader2,
  MinusCircle,
  FileText,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  Cloud,
} from "lucide-react";
import { cn, compareNatural } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { toast } from "sonner";
import { isSchoolManagementOrTeacher } from "@/lib/schoolStaffRoles";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useParentChildren } from "@/hooks/useParentChildren";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { QUERY_DAY_MS, QUERY_HOUR_MS } from "@/lib/queryClient";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { useTeacherSessionScope } from "@/hooks/useTeacherSessionScope";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { OFFLINE_SYNC_FLUSH_EVENT, useOfflineSync } from "@/hooks/useOfflineSync";
import {
  fetchPresencasAttendance,
  fetchPresencasStudents,
  presencasAttendanceQueryKey,
  presencasStudentsQueryKey,
  anchoredWideAttendancePrefetchRange,
  readPresencasWideRangeAnchorIso,
  attendancePackMonth,
  attendancePackRangeFromDates,
  type AttendanceStatus,
  type PresencasAttendanceMap,
  type PresencasAttendanceKeyInput,
  type PresencasStudentsKeyInput,
} from "@/lib/offline/presencasQueries";
import { supabaseRestTable } from "@/lib/supabaseRestUrls";
import { isNativeMobileApp, showPageKpiCards } from "@/lib/nativeApp";
import { useTranslation } from "react-i18next";

type Status = AttendanceStatus;

interface Student {
  id: string;
  full_name: string;
  classroom_id: string | null;
  enrollment_number?: string | null;
}

interface Classroom {
  id: string;
  name: string;
}

const EMPTY_CLASSROOM_LIST: Classroom[] = [];

interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
  status: Status;
  notes: string | null;
}

const STATUS_VISUAL: Record<Status, { bg: string; Icon: typeof Check }> = {
  PRESENT: { bg: "bg-pastel-blue text-pastel-blue-foreground", Icon: Check },
  ABSENT: { bg: "bg-destructive text-white", Icon: X },
  LATE: { bg: "bg-pastel-yellow text-pastel-yellow-foreground", Icon: Clock },
  JUSTIFIED: { bg: "bg-pastel-orange text-pastel-orange-foreground", Icon: Check },
  DISCIPLINARY: { bg: "bg-pastel-lilac text-pastel-lilac-foreground", Icon: AlertTriangle },
};

/** Monday–Sunday week range formatted for UI (locale-aware). */
const formatWeekRangeLocale = (locale: string, weekDays: Date[]) => {
  const a = weekDays[0];
  const b = weekDays[6];
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${new Intl.DateTimeFormat(locale, opts).format(a)} – ${new Intl.DateTimeFormat(locale, opts).format(b)}`;
};

/** Long month label for selectors (January, …). */
const monthLabelLocale = (locale: string, monthIndex0: number) =>
  new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2020, monthIndex0, 1));

const MONTH_INDEX_LIST = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const getMonthDays = (year: number, month0: number) => {
  const totalDays = new Date(year, month0 + 1, 0).getDate();
  return Array.from({ length: totalDays }, (_, i) => new Date(year, month0, i + 1));
};

const fmtISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Segunda a domingo da semana que contém `d`. */
const getWeekDaysMonSun = (d: Date) => {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(copy.getFullYear(), copy.getMonth(), copy.getDate());
    x.setDate(copy.getDate() + i);
    return x;
  });
};

const sameCalendarDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

/** Presença criada offline (ID temporário) — pendente na fila REST até sincronizar. */
const attendanceRowQueuedOffline = (row: AttendanceRow | null | undefined) =>
  !!(row?.id?.startsWith("offline-"));

const avatarPalette = ["blue", "lilac", "yellow", "green", "pink"] as const;
const avatarBg: Record<(typeof avatarPalette)[number], string> = {
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};
const avatarForId = (id: string) => avatarPalette[(id.charCodeAt(0) + id.length) % avatarPalette.length];

const nativeCardAccent = (status: Status | null) => {
  switch (status) {
    case "PRESENT":
      return "border-l-4 border-pastel-blue";
case "JUSTIFIED":
    return "border-l-4 border-pastel-orange";
    case "LATE":
      return "border-l-4 border-pastel-yellow";
    case "ABSENT":
      return "border-l-4 border-destructive";
    case "DISCIPLINARY":
      return "border-l-4 border-pastel-lilac";
    default:
      return "";
  }
};

const StatusCell = ({ status, isWeekend }: { status: Status | null; isWeekend: boolean }) => {
  if (!status) {
    return (
      <span className={cn("text-xs", isWeekend ? "text-muted-foreground/40" : "text-muted-foreground/60")}>
        —
      </span>
    );
  }
  const { Icon, bg } = STATUS_VISUAL[status];
  return (
    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full shadow-soft", bg)}>
      <Icon className="h-3 w-3" strokeWidth={3} />
    </span>
  );
};

const AttendancePopover = ({
  student,
  date,
  status,
  hasNotes,
  cellInner,
  onSelect,
  onJustify,
}: {
  student: Student;
  date: Date;
  status: Status | null;
  hasNotes: boolean;
  cellInner: React.ReactNode;
  onSelect: (next: Status | null) => void | Promise<void>;
  onJustify: () => void;
}) => {
  const { t } = useTranslation("pages", { keyPrefix: "presencas" });
  const [open, setOpen] = useState(false);
  const handle = (next: Status | null) => {
    setOpen(false);
    void onSelect(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full justify-center rounded-md py-1 transition-colors hover:bg-accent"
          aria-label={t("popover_change_aria")}
        >
          {cellInner}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="center">
        <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
          {student.full_name.split(" ")[0]} · {String(date.getDate()).padStart(2, "0")}/{String(date.getMonth() + 1).padStart(2, "0")}
        </p>
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handle("PRESENT")}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground"><Check className="h-3 w-3" strokeWidth={3} /></span>
            {t("status.PRESENT")}
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handle("LATE")}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pastel-yellow text-pastel-yellow-foreground"><Clock className="h-3 w-3" strokeWidth={3} /></span>
            {t("status.LATE")}
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handle("ABSENT")}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white"><X className="h-3 w-3" strokeWidth={3} /></span>
            {t("status.ABSENT")}
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handle("DISCIPLINARY")}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pastel-lilac text-pastel-lilac-foreground"><AlertTriangle className="h-3 w-3" strokeWidth={3} /></span>
            {t("status.DISCIPLINARY")}
          </Button>
          {(status === "ABSENT" || status === "LATE" || status === "JUSTIFIED" || status === "DISCIPLINARY") && (
            <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => { setOpen(false); onJustify(); }}>
              <FileText className="h-4 w-4" />
              {hasNotes ? t("view_justification") : t("justify")}
            </Button>
          )}
          {status && (
            <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" onClick={() => handle(null)}>
              <MinusCircle className="h-4 w-4" />
              {t("popover_remove_short")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const NATIVE_QUICK_STATUSES = ["PRESENT", "LATE", "ABSENT", "DISCIPLINARY"] as const;

const NativeQuickStatusButton = ({
  statusKey,
  active,
  disabled,
  onClick,
}: {
  statusKey: (typeof NATIVE_QUICK_STATUSES)[number];
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation("pages", { keyPrefix: "presencas" });
  const { Icon, bg } = STATUS_VISUAL[statusKey];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={t(`status.${statusKey}`)}
      aria-pressed={active}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent transition-all active:scale-[0.97]",
        active ? cn(bg, "shadow-md ring-2 ring-primary/15") : "bg-muted/45 text-muted-foreground hover:bg-muted",
        disabled && "pointer-events-none opacity-35",
      )}
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} />
    </button>
  );
};

const Presencas = () => {
  const native = isNativeMobileApp();
  const { user } = useAuth();
  const { selectedYearId: ctxYearId, schoolId: ctxSchoolId } = useAcademicYear();
  const { isParent, childIds, classroomIds: parentClassroomIds, loading: parentLoading } = useParentChildren();
  const { isTeacher, classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();
  const { data: persistedTeacherSession } = useTeacherSessionScope();
  const { isStudent, studentId, classroomId: studentClassroomId, loading: studentLoading } = useStudentSelf();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const [classroomId, setClassroomId] = useState<string>("all");

  const [profileSchoolId, setProfileSchoolId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  /** Lista de turmas para perfis não-professor (consulta direta). Professores usam cache persistida `teacherPrefetch`. */
  const [generalClassrooms, setGeneralClassrooms] = useState<Classroom[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [justifyTarget, setJustifyTarget] = useState<{ student: Student; date: Date; row: AttendanceRow | null } | null>(null);
  const [justifyText, setJustifyText] = useState("");
  const [justifySaving, setJustifySaving] = useState(false);
  const [nativeSelectedDay, setNativeSelectedDay] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const [studentFilterNative, setStudentFilterNative] = useState("");

  const { t, i18n } = useTranslation("pages", { keyPrefix: "presencas" });
  const { t: navT } = useTranslation("common", { keyPrefix: "nav" });

  const formatWeekdayShort = useCallback(
    (d: Date) => new Intl.DateTimeFormat(i18n.language, { weekday: "short" }).format(d),
    [i18n.language],
  );

  const resolvedSchoolId = useMemo(() => {
    if (isTeacher) {
      return ctxSchoolId ?? persistedTeacherSession?.schoolId ?? profileSchoolId;
    }
    return ctxSchoolId ?? profileSchoolId;
  }, [isTeacher, ctxSchoolId, persistedTeacherSession?.schoolId, profileSchoolId]);

  const resolvedYearId = useMemo(() => {
    if (!isTeacher) return ctxYearId ?? null;
    return ctxYearId ?? persistedTeacherSession?.academicYearId ?? null;
  }, [isTeacher, ctxYearId, persistedTeacherSession?.academicYearId]);

  const roleForAcl = useMemo(
    () => userRole ?? (isTeacher ? (persistedTeacherSession?.role ?? null) : null),
    [userRole, isTeacher, persistedTeacherSession?.role],
  );

  const { isOnline, enqueuePendingSync } = useOfflineSync();

  const canEdit = isSchoolManagementOrTeacher(roleForAcl) && !isParent && !isStudent;

  useEffect(() => {
    if (!native) return;
    setNativeSelectedDay((prev) => {
      const first = new Date(year, month0, 1);
      const last = new Date(year, month0 + 1, 0);
      const t = prev.getTime();
      if (t < first.getTime() || t > last.getTime()) {
        first.setHours(0, 0, 0, 0);
        return first;
      }
      return prev;
    });
  }, [native, year, month0]);

  // Load profile (school + role)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setProfileSchoolId(effectiveSchoolIdFromProfile(data));
        setUserRole(data.role);
      }
    })();
  }, [user]);

  /** Mesma queryKey que `prefetchTeacherData` — nomes das turmas do professor ficam disponíveis offline. */
  const teacherPrefetchClassroomsQueryKey = useMemo(
    () =>
      [
        "teacherPrefetch",
        "classrooms",
        resolvedSchoolId ?? "__",
        resolvedYearId ?? "__",
        user?.id ?? "__",
      ] as const,
    [resolvedSchoolId, resolvedYearId, user?.id],
  );

  const { data: teacherPersistedClassrooms } = useQuery({
    queryKey: teacherPrefetchClassroomsQueryKey,
    queryFn: async (): Promise<Classroom[]> => {
      if (!resolvedSchoolId || !resolvedYearId || !user?.id) return [];
      if (teacherClassroomIds.length === 0) return [];
      const { data, error } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("school_id", resolvedSchoolId)
        .eq("academic_year_id", resolvedYearId)
        .in("id", teacherClassroomIds)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Classroom[];
    },
    enabled: Boolean(
      isTeacher &&
        resolvedSchoolId &&
        resolvedYearId &&
        user?.id &&
        !teacherLoading &&
        teacherClassroomIds.length > 0,
    ),
    staleTime: 0,
    networkMode: "offlineFirst",
  });

  const classrooms = useMemo(
    () =>
      isTeacher ? (teacherPersistedClassrooms ?? EMPTY_CLASSROOM_LIST) : generalClassrooms,
    [isTeacher, teacherPersistedClassrooms, generalClassrooms],
  );

  // Load classrooms (não-professor: consulta Supabase)
  useEffect(() => {
    if (isTeacher) return;
    if (!resolvedSchoolId) return;
    if (isParent && parentLoading) return;
    if (isStudent && studentLoading) return;
    if (!ctxYearId) {
      setGeneralClassrooms([]);
      setClassroomId("all");
      return;
    }
    (async () => {
      let q = supabase
        .from("classrooms")
        .select("id, name")
        .eq("school_id", resolvedSchoolId)
        .eq("academic_year_id", ctxYearId)
        .order("name");
      if (isParent) {
        if (parentClassroomIds.length === 0) {
          setGeneralClassrooms([]);
          setClassroomId("all");
          return;
        }
        q = q.in("id", parentClassroomIds);
      }
      if (isStudent) {
        if (!studentClassroomId) {
          setGeneralClassrooms([]);
          setClassroomId("all");
          return;
        }
        q = q.eq("id", studentClassroomId);
      }
      const { data } = await q;
      const list = data ?? [];
      setGeneralClassrooms(list);
      setClassroomId(list[0]?.id ?? "all");
    })();
  }, [
    resolvedSchoolId,
    ctxYearId,
    isParent,
    parentLoading,
    parentClassroomIds.join(","),
    isTeacher,
    isStudent,
    studentLoading,
    studentClassroomId,
  ]);

  const teacherPrefetchClassroomsFingerprint = useMemo(
    () =>
      (teacherPersistedClassrooms ?? EMPTY_CLASSROOM_LIST)
        .map((c) => `${c.id}:${c.name}`)
        .sort()
        .join("|"),
    [teacherPersistedClassrooms],
  );

  useEffect(() => {
    if (!isTeacher) return;
    const list = teacherPersistedClassrooms ?? EMPTY_CLASSROOM_LIST;
    if (!resolvedYearId || !resolvedSchoolId) {
      setClassroomId("all");
      return;
    }
    if (list.length === 0) {
      setClassroomId("all");
      return;
    }
    setClassroomId((prev) =>
      prev !== "all" && list.some((c) => c.id === prev) ? prev : list[0]!.id,
    );
  }, [isTeacher, resolvedSchoolId, resolvedYearId, teacherPrefetchClassroomsFingerprint]);

  /** Na app nativa, professores não devem ficar em «todas as turmas». */
  useEffect(() => {
    if (!native || roleForAcl !== "TEACHER") return;
    if (classroomId !== "all") return;
    if (classrooms.length === 0) return;
    setClassroomId(classrooms[0].id);
  }, [native, roleForAcl, classroomId, classrooms]);

  // Compute month days
  const monthDays = useMemo(() => getMonthDays(year, month0), [year, month0]);
  const visibleDays = monthDays;

  const nativeWeekDays = useMemo(() => getWeekDaysMonSun(nativeSelectedDay), [nativeSelectedDay]);

  const pickNativeDay = useCallback((day: Date) => {
    const normalized = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    normalized.setHours(0, 0, 0, 0);
    setNativeSelectedDay(normalized);
    setYear(normalized.getFullYear());
    setMonth0(normalized.getMonth());
  }, []);

  const shiftNativeWeek = useCallback((deltaWeeks: number) => {
    setNativeSelectedDay((prev) => {
      const base = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
      base.setDate(base.getDate() + deltaWeeks * 7);
      base.setHours(0, 0, 0, 0);
      setYear(base.getFullYear());
      setMonth0(base.getMonth());
      return base;
    });
  }, []);

  /** Professor: mesma janela alargada e âncora que `prefetchTeacherData` — cache hit offline ao mudar de página. */
  const presencasAnchorPrint = readPresencasWideRangeAnchorIso();
  const attendanceFetchRange = useMemo(() => {
    if (isTeacher) return anchoredWideAttendancePrefetchRange();
    /** Web: mês corrente. Nativa não-professor: semana visível. */
    if (native) return attendancePackRangeFromDates(nativeWeekDays);
    return attendancePackMonth(new Date(year, month0, 1));
  }, [isTeacher, native, nativeWeekDays, year, month0, presencasAnchorPrint]);

  /** Na app nativa, professor: espera primeira turma concreta antes de carregar dados. */
  const nativeTeacherAwaitingScopedRoom =
    native && isTeacher && !teacherLoading && classroomId === "all" && teacherClassroomIds.length > 0;

  const queryClient = useQueryClient();
  const persistRestoring = useIsRestoring();

  const studentsKeyInput: PresencasStudentsKeyInput | null = useMemo(() => {
    if (!resolvedSchoolId) return null;
    return {
      schoolId: resolvedSchoolId,
      classroomId,
      isTeacher,
      teacherClassroomIds,
      isParent,
      parentLoading,
      childIds,
      isStudent,
      studentLoading,
      studentId,
    };
  }, [
    resolvedSchoolId,
    classroomId,
    isTeacher,
    teacherClassroomIds.join(","),
    isParent,
    parentLoading,
    childIds.join(","),
    isStudent,
    studentLoading,
    studentId,
  ]);

  const attendanceKeyInput: PresencasAttendanceKeyInput | null = useMemo(() => {
    if (!resolvedSchoolId) return null;
    return {
      schoolId: resolvedSchoolId,
      classroomId,
      isTeacher,
      teacherClassroomIds,
      startDate: attendanceFetchRange.startDate,
      endDate: attendanceFetchRange.endDate,
    };
  }, [
    resolvedSchoolId,
    classroomId,
    isTeacher,
    teacherClassroomIds.join(","),
    attendanceFetchRange.startDate,
    attendanceFetchRange.endDate,
  ]);

  const attendanceQueryKeyResolved = attendanceKeyInput
    ? presencasAttendanceQueryKey(attendanceKeyInput)
    : (["presencas", "attendance", "__disabled__"] as const);

  const studentsBlockedLoading =
    !resolvedSchoolId ||
    !resolvedYearId ||
    nativeTeacherAwaitingScopedRoom ||
    (isParent && parentLoading) ||
    (isStudent && studentLoading) ||
    (isTeacher && teacherLoading);

  const teacherNoClassroomsReady = isTeacher && !teacherLoading && teacherClassroomIds.length === 0;

  const parentNoChildrenReady = isParent && !parentLoading && childIds.length === 0;

  const studentMissingReady = isStudent && !studentLoading && !studentId;

  const studentsFetchEnabled =
    !!studentsKeyInput &&
    !!resolvedYearId &&
    !nativeTeacherAwaitingScopedRoom &&
    !teacherNoClassroomsReady &&
    !parentNoChildrenReady &&
    !studentMissingReady &&
    !(isTeacher && teacherLoading) &&
    !(isParent && parentLoading) &&
    !(isStudent && studentLoading);

  const attendanceFetchEnabled = !!attendanceKeyInput && !nativeTeacherAwaitingScopedRoom;

  const { data: students = [], isPending: studentsQueryPending } = useQuery({
    queryKey: studentsKeyInput
      ? presencasStudentsQueryKey(studentsKeyInput)
      : (["presencas", "students", "__disabled__"] as const),
    queryFn: () => fetchPresencasStudents(studentsKeyInput!),
    enabled: studentsFetchEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: true,
  });

  const { data: attendance = {} } = useQuery({
    queryKey: attendanceQueryKeyResolved,
    queryFn: () => fetchPresencasAttendance(attendanceKeyInput!),
    enabled: attendanceFetchEnabled,
    staleTime: 0, // Always fetch in background to stay in sync with DB
    refetchOnMount: true,
  });

  const studentsLoading =
    studentsBlockedLoading ||
    (studentsFetchEnabled && studentsQueryPending && !persistRestoring);

  useEffect(() => {
    const onSynced = () => {
      void queryClient.invalidateQueries({ queryKey: ["presencas", "attendance"] });
    };
    window.addEventListener(OFFLINE_SYNC_FLUSH_EVENT, onSynced);
    return () => window.removeEventListener(OFFLINE_SYNC_FLUSH_EVENT, onSynced);
  }, [queryClient]);

  const patchAttendanceMap = useCallback(
    (mapper: (prev: PresencasAttendanceMap) => PresencasAttendanceMap) => {
      queryClient.setQueryData<PresencasAttendanceMap>(attendanceQueryKeyResolved, (old) =>
        mapper({ ...(old ?? {}) }),
      );
    },
    [queryClient, attendanceQueryKeyResolved],
  );

  const filteredStudentsNative = useMemo(() => {
    const q = studentFilterNative.trim().toLowerCase();
    const list = [...students].sort((a, b) => compareNatural(a.full_name, b.full_name));
    if (!q) return list;
    const qq = q.replace(/^#/, "");
    return list.filter((s) => {
      const name = s.full_name.toLowerCase();
      const num = (s.enrollment_number ?? "").toLowerCase().replace(/^#/, "");
      return name.includes(q) || num.includes(qq);
    });
  }, [students, studentFilterNative]);

  const nativeSelectedIso = fmtISO(nativeSelectedDay);
  const isNativeDayWeekend = nativeSelectedDay.getDay() === 0 || nativeSelectedDay.getDay() === 6;

  type ApplyAttendanceVars = {
    student: Student;
    date: Date;
    next: Status | null;
    cellKey: string;
    existingBefore?: AttendanceRow;
    optimisticTempId?: string;
  };

  const applyStatusMutation = useMutation({
    networkMode: "always",
    gcTime: QUERY_DAY_MS * 14,
    mutationFn: async (vars: ApplyAttendanceVars) => {
      const { student, date, next, cellKey } = vars;
      const attendanceBase = supabaseRestTable("attendance");
      const existing = vars.existingBefore;

      const offlineToast = () => {
        toast.message(t("toast_pending_send_title"), {
          description: t("toast_pending_send_desc"),
        });
      };

      if (!isOnline) {
        if (next === null) {
          if (!existing) return "offline";
          enqueuePendingSync({
            url: `${attendanceBase}?id=eq.${encodeURIComponent(existing.id)}`,
            method: "DELETE",
            body: null,
          });
          offlineToast();
          return "offline";
        }
        if (existing) {
          enqueuePendingSync({
            url: `${attendanceBase}?id=eq.${encodeURIComponent(existing.id)}`,
            method: "PATCH",
            body: JSON.stringify({ status: next }),
          });
          offlineToast();
          return "offline";
        }
        enqueuePendingSync({
          url: attendanceBase,
          method: "POST",
          body: JSON.stringify({
            student_id: student.id,
            date: fmtISO(date),
            status: next,
            school_id: resolvedSchoolId!,
            classroom_id: student.classroom_id,
            teacher_id: user?.id ?? null,
          }),
        });
        offlineToast();
        return "offline";
      }

      if (next === null) {
        if (!existing) return "online";
        const { error } = await supabase.from("attendance").delete().eq("id", existing.id);
        if (error) throw error;
        toast.success(t("toast_success_removed"));
        return "online";
      }

      if (existing) {
        const { error } = await supabase.from("attendance").update({ status: next }).eq("id", existing.id);
        if (error) throw error;
        return "online";
      }

      const { data, error } = await supabase
        .from("attendance")
        .insert({
          student_id: student.id,
          date: fmtISO(date),
          status: next,
          school_id: resolvedSchoolId!,
          classroom_id: student.classroom_id,
          teacher_id: user?.id ?? null,
        })
        .select("id, student_id, date, status, notes")
        .single();
      if (error) throw error;
      queryClient.setQueryData<PresencasAttendanceMap>(attendanceQueryKeyResolved, (old) => ({
        ...(old ?? {}),
        [cellKey]: data as AttendanceRow,
      }));
      return "online";
    },
    onMutate: async (vars) => {
      setSavingKey(vars.cellKey);
      await queryClient.cancelQueries({ queryKey: attendanceQueryKeyResolved });
      const previousSnapshot =
        queryClient.getQueryData<PresencasAttendanceMap>(attendanceQueryKeyResolved) ?? {};

      queryClient.setQueryData<PresencasAttendanceMap>(attendanceQueryKeyResolved, (old) => {
        const copy = { ...(old ?? {}) } as Record<string, AttendanceRow>;
        const { cellKey, next, student, date, existingBefore, optimisticTempId } = vars;
        if (next === null) {
          const rowPresent = !!(existingBefore ?? copy[cellKey]);
          if (!rowPresent) return copy as PresencasAttendanceMap;
          delete copy[cellKey];
          return copy as PresencasAttendanceMap;
        }
        const baseRow = existingBefore ?? copy[cellKey];
        if (baseRow) {
          copy[cellKey] = { ...baseRow, status: next };
          return copy as PresencasAttendanceMap;
        }
        copy[cellKey] = {
          id: optimisticTempId!,
          student_id: student.id,
          date: fmtISO(date),
          status: next,
          notes: null,
        };
        return copy as PresencasAttendanceMap;
      });

      return { previousSnapshot };
    },
    onSuccess: (_data, vars) => {
      const { student, date, next } = vars;
      if (next && ["ABSENT", "LATE", "DISCIPLINARY"].includes(next)) {
        void supabase.functions.invoke("notify-attendance", {
          body: {
            student_id: student.id,
            status: next,
            date: fmtISO(date),
          },
        });
      }
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previousSnapshot !== undefined) {
        queryClient.setQueryData(attendanceQueryKeyResolved, ctx.previousSnapshot);
      }
      toast.error(t("toast_save_failed"), {
        description: e instanceof Error ? e.message : String(e),
      });
    },
    onSettled: () => {
      setSavingKey(null);
    },
  });

  const applyStatus = (student: Student, date: Date, next: Status | null) => {
    if (!resolvedSchoolId) return;
    const cellKey = `${student.id}__${fmtISO(date)}`;
    const snapshot = queryClient.getQueryData<PresencasAttendanceMap>(attendanceQueryKeyResolved) ?? {};
    const existingBefore = snapshot[cellKey];

    if (next === null && !existingBefore) return;

    let optimisticTempId: string | undefined;
    if (next !== null && !existingBefore) {
      optimisticTempId = !isOnline ? `offline-${crypto.randomUUID()}` : `pending-${crypto.randomUUID()}`;
    }

    applyStatusMutation.mutate({
      student,
      date,
      next,
      cellKey,
      existingBefore,
      optimisticTempId,
    });
  };
  const stats = useMemo(() => {
    let present = 0, absent = 0, late = 0, disciplinary = 0, total = 0;
    students.forEach((s) => {
      visibleDays.forEach((d) => {
        const isWk = d.getDay() === 0 || d.getDay() === 6;
        if (isWk) return;
        total++;
        const row = attendance[`${s.id}__${fmtISO(d)}`];
        if (row?.status === "PRESENT") present++;
        else if (row?.status === "ABSENT") absent++;
        else if (row?.status === "LATE") late++;
        else if (row?.status === "DISCIPLINARY") disciplinary++;
      });
    });
    return {
      present,
      absent,
      late,
      disciplinary,
      rate: total ? Math.round((present / total) * 100) : 0,
    };
  }, [students, visibleDays, attendance]);

  if (parentLoading || (isStudent && studentLoading)) return <PageLoadingSkeleton />;

  const openJustify = (student: Student, date: Date) => {
    const key = `${student.id}__${fmtISO(date)}`;
    const row = attendance[key] ?? null;
    setJustifyTarget({ student, date, row });
    setJustifyText(row?.notes ?? "");
  };

  const justifyReadOnly = !!justifyTarget && (() => {
    const row = justifyTarget.row;
    // Parents/students can only justify their own absences/lates
    if (canEdit) return false;
    if (!row) return false;
    return !(row.status === "ABSENT" || row.status === "LATE" || row.status === "JUSTIFIED" || row.status === "DISCIPLINARY");
  })();

  const submitJustification = async () => {
    if (!justifyTarget || !resolvedSchoolId) return;
    const { student, date, row } = justifyTarget;
    const text = justifyText.trim();
    if (!text) {
      toast.error(t("toast_justify_required_text"));
      return;
    }
    setJustifySaving(true);
    try {
      const attendanceBase = supabaseRestTable("attendance");
      const mapKey = `${student.id}__${fmtISO(date)}`;

      if (!isOnline) {
        if (row) {
          const newStatus: Status = canEdit ? row.status : "JUSTIFIED";
          enqueuePendingSync({
            url: `${attendanceBase}?id=eq.${encodeURIComponent(row.id)}`,
            method: "PATCH",
            body: JSON.stringify({ notes: text, status: newStatus }),
          });
          patchAttendanceMap((prev) => ({
            ...prev,
            [mapKey]: { ...row, notes: text, status: newStatus },
          }));
        } else {
          if (!canEdit) {
            toast.error(t("toast_justify_no_record"));
            return;
          }
          enqueuePendingSync({
            url: attendanceBase,
            method: "POST",
            body: JSON.stringify({
              student_id: student.id,
              date: fmtISO(date),
              status: "ABSENT" as Status,
              notes: text,
              school_id: resolvedSchoolId,
              classroom_id: student.classroom_id,
              teacher_id: user?.id ?? null,
            }),
          });
          const tempId = `offline-${crypto.randomUUID()}`;
          patchAttendanceMap((prev) => ({
            ...prev,
            [mapKey]: {
              id: tempId,
              student_id: student.id,
              date: fmtISO(date),
              status: "ABSENT",
              notes: text,
            },
          }));
        }
        toast.message(t("toast_pending_send_title"), {
          description: t("toast_offline_justify_pending_desc"),
        });
        setJustifyTarget(null);
        setJustifyText("");
        return;
      }

      if (row) {
        // Parents/students: only allowed transition is ABSENT/LATE -> JUSTIFIED
        const newStatus: Status = canEdit ? row.status : "JUSTIFIED";
        const { error } = await supabase
          .from("attendance")
          .update({ notes: text, status: newStatus })
          .eq("id", row.id);
        if (error) throw error;
        patchAttendanceMap((prev) => ({
          ...prev,
          [mapKey]: { ...row, notes: text, status: newStatus },
        }));
      } else {
        // Only staff can create rows from scratch
        if (!canEdit) {
          toast.error(t("toast_justify_no_record"));
          return;
        }
        const { data, error } = await supabase
          .from("attendance")
          .insert({
            student_id: student.id,
            date: fmtISO(date),
            status: "ABSENT" as Status,
            notes: text,
            school_id: resolvedSchoolId,
            classroom_id: student.classroom_id,
            teacher_id: user?.id ?? null,
          })
          .select("id, student_id, date, status, notes")
          .single();
        if (error) throw error;
        patchAttendanceMap((prev) => ({ ...prev, [mapKey]: data as AttendanceRow }));
      }
      toast.success(t("toast_justify_saved"));
      setJustifyTarget(null);
      setJustifyText("");
    } catch (e: any) {
      toast.error(t("toast_justify_save_error"), { description: e.message });
    } finally {
      setJustifySaving(false);
    }
  };

  return (
    <>
      <>
        {native ? (
          <div className="flex flex-col gap-5 pb-4">
            <section className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 pr-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {navT("attendance")}
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">
                    {formatWeekRangeLocale(i18n.language, nativeWeekDays)}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {canEdit ? t("subtitle_native_editor") : t("subtitle_native_viewer")}
                  </p>
                </div>
                {!isParent && !isStudent ? (
                  <Select value={classroomId} onValueChange={setClassroomId} disabled={classrooms.length === 0}>
                    <SelectTrigger className="h-10 w-[min(46vw,11.5rem)] shrink-0 rounded-full border-border/80 bg-card px-3 text-left text-sm shadow-card">
                      <SelectValue placeholder={t("pick_class_placeholder")} />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {roleForAcl !== "TEACHER" && <SelectItem value="all">{t("all_classes")}</SelectItem>}
                      {classrooms.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              <div className="flex w-full max-w-full items-stretch gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-auto min-h-[5.25rem] w-10 shrink-0 rounded-2xl border-border/80 shadow-card"
                  aria-label={t("week_prev_aria")}
                  onClick={() => shiftNativeWeek(-1)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="flex min-w-0 flex-1 gap-1">
                  {nativeWeekDays.map((d) => {
                    const isWk = d.getDay() === 0 || d.getDay() === 6;
                    const selected = sameCalendarDay(d, nativeSelectedDay);
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        onClick={() => pickNativeDay(d)}
                        className={cn(
                          "flex min-h-[5.25rem] min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border px-0.5 py-1 transition-all active:scale-[0.98]",
                          selected
                            ? "border-primary bg-primary text-primary-foreground shadow-md ring-2 ring-primary/15"
                            : "border-border/80 bg-card text-foreground shadow-card",
                          isWk && !selected && "opacity-70",
                        )}
                      >
                        <span className={cn("truncate text-[10px] font-semibold uppercase leading-tight sm:text-[11px]", selected ? "text-primary-foreground/85" : "text-muted-foreground")}>
                          {formatWeekdayShort(d)}
                        </span>
                        <span className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{d.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-auto min-h-[5.25rem] w-10 shrink-0 rounded-2xl border-border/80 shadow-card"
                  aria-label={t("week_next_aria")}
                  onClick={() => shiftNativeWeek(1)}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </section>

            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={studentFilterNative}
                onChange={(e) => setStudentFilterNative(e.target.value)}
                placeholder={t("student_search_placeholder")}
                className="h-12 rounded-full border-0 bg-card pl-11 shadow-card placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/25"
                autoComplete="off"
                autoCorrect="off"
              />
            </div>

            {isNativeDayWeekend && (
              <p className="rounded-xl bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground">
                Fim de semana — não é possível editar presenças neste dia.
              </p>
            )}

            <div className="space-y-3">
              {studentsLoading ? (
                <div className="flex h-48 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-card">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("loading")}
                </div>
              ) : filteredStudentsNative.length === 0 ? (
                <div className="flex h-48 items-center justify-center rounded-2xl bg-card text-muted-foreground shadow-card">
                  {t("no_students")}
                </div>
              ) : (
                filteredStudentsNative.map((s) => {
                  const rowKey = `${s.id}__${nativeSelectedIso}`;
                  const row = attendance[rowKey] ?? null;
                  const status = row?.status ?? null;
                  const isSaving = savingKey === rowKey;
                  const hasNotes = !!row?.notes && row.notes.trim().length > 0;
                  const avatarTone = avatarForId(s.id);
                  const showJustifyTrigger =
                    !isNativeDayWeekend &&
                    row &&
                    (status === "ABSENT" || status === "LATE" || status === "JUSTIFIED" || status === "DISCIPLINARY");

                  return (
                    <div
                      key={s.id}
                      className={cn(
                        "flex gap-3 rounded-2xl bg-card p-4 shadow-card transition-transform active:scale-[0.99]",
                        nativeCardAccent(status),
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                          avatarBg[avatarTone],
                        )}
                      >
                        {initialsOf(s.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-foreground">{s.full_name}</h3>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t("enrollment_prefix")} {s.enrollment_number?.trim() ? s.enrollment_number : "—"}
                        </p>

                        {canEdit ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {isSaving ? (
                              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                {NATIVE_QUICK_STATUSES.map((st) => (
                                  <NativeQuickStatusButton
                                    key={st}
                                    statusKey={st}
                                    active={status === st}
                                    disabled={isNativeDayWeekend}
                                    onClick={() => void applyStatus(s, nativeSelectedDay, st)}
                                  />
                                ))}
                                {status && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-11 w-11 shrink-0 rounded-xl text-muted-foreground"
                                    disabled={isNativeDayWeekend}
                                    onClick={() => void applyStatus(s, nativeSelectedDay, null)}
                                    aria-label={t("aria_remove_record")}
                                  >
                                    <MinusCircle className="h-5 w-5" />
                                  </Button>
                                )}
                                {showJustifyTrigger && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="ml-auto h-9 shrink-0 gap-1 rounded-full border-dashed text-xs"
                                    disabled={isNativeDayWeekend}
                                    onClick={() => openJustify(s, nativeSelectedDay)}
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    {hasNotes ? t("view_justification") : t("justify")}
                                  </Button>
                                )}
                              </>
                            )}
                            {!isSaving && row && attendanceRowQueuedOffline(row) && (
                              <p className="mt-2 flex w-full shrink-0 basis-full items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <Cloud className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                {t("pending_send_label")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <div className="relative flex items-center gap-2">
                              {isSaving ? (
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                              ) : (
                                <StatusCell status={status} isWeekend={isNativeDayWeekend} />
                              )}
                              {hasNotes && (
                                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-pastel-orange" title={t("tooltip_has_justification")} />
                              )}
                            </div>
                            {!isNativeDayWeekend && showJustifyTrigger ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 gap-1 rounded-full text-xs"
                                onClick={() => openJustify(s, nativeSelectedDay)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {hasNotes ? t("view_justification") : t("justify")}
                              </Button>
                            ) : null}
                            {!isNativeDayWeekend && row && hasNotes && !showJustifyTrigger ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 gap-1 rounded-full text-xs"
                                onClick={() => openJustify(s, nativeSelectedDay)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {t("view_note")}
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                {t("native_legend_present")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pastel-yellow text-pastel-yellow-foreground">
                  <Clock className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                {t("native_legend_late_compact")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white">
                  <X className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                {t("native_legend_absent_short")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pastel-lilac text-pastel-lilac-foreground">
                  <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                {t("native_legend_disciplinary_short")}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{navT("attendance")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {canEdit ? t("header_subtitle_can_edit") : t("header_subtitle_read_only")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Month */}
                <Select value={String(month0)} onValueChange={(v) => setMonth0(Number(v))}>
                  <SelectTrigger className="w-[140px] rounded-full bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_INDEX_LIST.map((i) => (
                      <SelectItem key={i} value={String(i)}>
                        {monthLabelLocale(i18n.language, i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Year */}
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="w-[110px] rounded-full bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[year - 1, year, year + 1].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Classroom */}
                <Select value={classroomId} onValueChange={setClassroomId} disabled={isParent || isStudent}>
                  <SelectTrigger className="w-[180px] rounded-full bg-card">
                    <SelectValue placeholder={t("pick_class_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {!isParent && !isStudent && <SelectItem value="all">{t("all_classes")}</SelectItem>}
                    {classrooms.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stats */}
            {!isParent && showPageKpiCards() && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              <div className="rounded-2xl bg-pastel-blue p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-pastel-blue-foreground/80">{t("kpi_total_students")}</p>
                <p className="mt-2 text-3xl font-bold text-pastel-blue-foreground">{students.length}</p>
              </div>
              <div className="rounded-2xl bg-pastel-green p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-pastel-green-foreground/80">{t("kpi_present")}</p>
                <p className="mt-2 text-3xl font-bold text-pastel-green-foreground">{stats.present}</p>
              </div>
              <div className="rounded-2xl bg-pastel-yellow p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-pastel-yellow-foreground/80">{t("kpi_late")}</p>
                <p className="mt-2 text-3xl font-bold text-pastel-yellow-foreground">{stats.late}</p>
              </div>
              <div className="rounded-2xl bg-pastel-pink p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-pastel-pink-foreground/80">{t("kpi_absent")}</p>
                <p className="mt-2 text-3xl font-bold text-pastel-pink-foreground">{stats.absent}</p>
              </div>
              <div className="rounded-2xl bg-pastel-lilac p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-pastel-lilac-foreground/80">{t("kpi_disciplinary")}</p>
                <p className="mt-2 text-3xl font-bold text-pastel-lilac-foreground">{stats.disciplinary}</p>
              </div>
              <div className="rounded-2xl bg-pastel-lilac p-5 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-pastel-lilac-foreground/80">{t("kpi_rate")}</p>
                <p className="mt-2 text-3xl font-bold text-pastel-lilac-foreground">{stats.rate}%</p>
              </div>
            </div>
            )}

            {/* Attendance table */}
            <div className="overflow-hidden rounded-2xl bg-card shadow-card">
              {studentsLoading ? (
                <div className="flex h-60 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("loading")}
                </div>
              ) : students.length === 0 ? (
                <div className="flex h-60 items-center justify-center text-muted-foreground">
                  {t("no_students")}
                </div>
              ) : (
                <div className="table-scroll overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-pastel-blue/30">
                        <th className="sticky left-0 z-10 min-w-[200px] bg-pastel-blue/30 px-6 py-4 text-left text-sm font-semibold text-foreground">
                          {t("col_student_name")}
                        </th>
                        {visibleDays.map((d) => {
                          const isWk = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <th
                              key={d.toISOString()}
                              className={cn(
                                "px-3 py-4 text-center text-sm font-semibold",
                                isWk ? "text-muted-foreground/60" : "text-foreground",
                              )}
                            >
                              <span className="block text-[10px] font-medium uppercase tracking-wide opacity-90">
                                {formatWeekdayShort(d)}
                              </span>
                              <span className="tabular-nums">{String(d.getDate()).padStart(2, "0")}</span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id} className="border-t border-border transition-colors hover:bg-accent/40">
                          <td className="sticky left-0 z-10 bg-card px-6 py-4 text-sm font-medium text-foreground">
                            {s.full_name}
                          </td>
                          {visibleDays.map((d) => {
                            const isWk = d.getDay() === 0 || d.getDay() === 6;
                            const key = `${s.id}__${fmtISO(d)}`;
                            const row = attendance[key];
                            const status = row?.status ?? null;
                            const isSaving = savingKey === key;
                            const hasNotes = !!row?.notes && row.notes.trim().length > 0;
                            const queuedOffline = attendanceRowQueuedOffline(row);

                            const cellInner = (
                              <div className="relative flex justify-center">
                                {isSaving ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                  <StatusCell status={status} isWeekend={isWk} />
                                )}
                                {queuedOffline && !isSaving && (
                                  <Cloud
                                    className="pointer-events-none absolute -right-0.5 -top-1 h-3 w-3 text-amber-500"
                                    aria-hidden
                                    strokeWidth={2}
                                  />
                                )}
                                {hasNotes && (
                                  <span
                                    className={cn(
                                      "absolute -top-1 h-2 w-2 rounded-full bg-primary",
                                      queuedOffline ? "left-5" : "-right-1",
                                    )}
                                    title={t("tooltip_has_justification")}
                                  />
                                )}
                              </div>
                            );

                            return (
                              <td
                                key={key}
                                className={cn(
                                  "px-3 py-4 text-center",
                                  isWk && "bg-muted/40",
                                )}
                              >
                                {canEdit && !isWk ? (
                                  <AttendancePopover
                                    student={s}
                                    date={d}
                                    status={status}
                                    hasNotes={hasNotes}
                                    cellInner={cellInner}
                                    onSelect={(next) => applyStatus(s, d, next)}
                                    onJustify={() => openJustify(s, d)}
                                  />
                                ) : !isWk && row && (status === "ABSENT" || status === "LATE" || status === "JUSTIFIED" || status === "DISCIPLINARY") ? (
                                  <button
                                    type="button"
                                    onClick={() => openJustify(s, d)}
                                    className="flex w-full justify-center rounded-md py-1 transition-colors hover:bg-accent"
                                    aria-label={hasNotes ? t("view_justification") : t("justify")}
                                    title={hasNotes ? t("view_justification") : t("justify")}
                                  >
                                    {cellInner}
                                  </button>
                                ) : !isWk && row && hasNotes ? (
                                  <button
                                    type="button"
                                    onClick={() => openJustify(s, d)}
                                    className="flex w-full justify-center rounded-md py-1 transition-colors hover:bg-accent"
                                    title={t("view_justification")}
                                  >
                                    {cellInner}
                                  </button>
                                ) : (
                                  cellInner
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {t("legend_present")}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pastel-yellow text-pastel-yellow-foreground">
                  <Clock className="h-3 w-3" strokeWidth={3} />
                </span>
                {t("legend_late")}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white">
                  <X className="h-3 w-3" strokeWidth={3} />
                </span>
                {t("legend_absent")}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pastel-lilac text-pastel-lilac-foreground">
                  <AlertTriangle className="h-3 w-3" strokeWidth={3} />
                </span>
                {t("legend_disciplinary")}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">—</span>
                {t("legend_no_weekend")}
              </div>
            </div>
          </div>
        )}

        {/* Justification dialog */}
        <Dialog open={!!justifyTarget} onOpenChange={(o) => { if (!o) { setJustifyTarget(null); setJustifyText(""); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("dialog_justify_title")}</DialogTitle>
              <DialogDescription>
                {justifyTarget && (
                  <>
                    {justifyTarget.student.full_name} ·{" "}
                    {String(justifyTarget.date.getDate()).padStart(2, "0")}/
                    {String(justifyTarget.date.getMonth() + 1).padStart(2, "0")}/
                    {justifyTarget.date.getFullYear()}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={justifyText}
              onChange={(e) => setJustifyText(e.target.value)}
              placeholder={t("dialog_justify_placeholder")}
              rows={5}
              readOnly={justifyReadOnly}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setJustifyTarget(null); setJustifyText(""); }}>
                {t("dialog_close")}
              </Button>
              {!justifyReadOnly && (
                <Button onClick={submitJustification} disabled={justifySaving}>
                  {justifySaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("dialog_save")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    </>
  );
};

export default Presencas;
