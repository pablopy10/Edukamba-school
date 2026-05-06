import { useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Settings2, User, MapPin, Pencil, Trash2, Sun, Sunset, Moon, Loader2, AlertCircle, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { useUserRole } from "@/hooks/useUserRole";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleFormDialog, type ScheduleRecord } from "@/components/horarios/ScheduleFormDialog";
import { TimeSlotsDialog } from "@/components/horarios/TimeSlotsDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { useHorariosDatasetQuery } from "@/hooks/queries/useHorariosDatasetQuery";
import type { HorariosFetchScope } from "@/lib/api/fetchHorariosDataset";
import type { ScheduleRow, TimeSlotRow } from "@/lib/api/fetchHorariosDataset";

type Option = { id: string; name: string; subjectId?: string | null; period?: string | null };

const DAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
] as const;

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAY_SHORT_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

/** Seg–Sex → 1–5 (mesmo esquema que `day_of_week` nas aulas). */
const calendarToSchoolDow = (d: Date): number | null => {
  const day = d.getDay();
  if (day >= 1 && day <= 5) return day;
  return null;
};

const SHIFT_META = {
  MORNING: { label: "Manhã", icon: Sun, classes: "bg-pastel-yellow text-pastel-yellow-foreground" },
  AFTERNOON: { label: "Tarde", icon: Sunset, classes: "bg-pastel-pink text-pastel-pink-foreground" },
  EVENING: { label: "Noite", icon: Moon, classes: "bg-pastel-lilac text-pastel-lilac-foreground" },
} as const;

/** Alinha período da turma (ex. «Manhã») com o turno dos blocos horários. */
const periodLabelToShift = (period: string | null | undefined): "MORNING" | "AFTERNOON" | "EVENING" | null => {
  if (!period) return null;
  const p = period.trim().toLowerCase();
  if (p.includes("manh")) return "MORNING";
  if (p.includes("tarde")) return "AFTERNOON";
  if (p.includes("noite")) return "EVENING";
  return null;
};

const PASTEL_PALETTE = [
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-lilac text-pastel-lilac-foreground",
  "bg-pastel-green text-pastel-green-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
  "bg-pastel-pink text-pastel-pink-foreground",
];

const ALL = "__ALL__";

const Horarios = () => {
  const native = isNativeMobileApp();
  const { user } = useAuth();
  const { isParent, classroomIds: parentClassroomIds, loading: parentLoading } = useParentChildren();
  const { role } = useUserRole();
  const { isTeacher, classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();
  const isAdmin = role === "SUPER_ADMIN" || isSchoolManagementRole(role);
  const { subjectId: teacherSubjectId } = useTeacherClassrooms();
  const {
    isStudent,
    classroomId: studentClassroomId,
    subjectIds: studentSubjectIds,
    teacherIds: studentTeacherIds,
    shift: studentShift,
    loading: studentLoading,
  } = useStudentSelf();
  const { selectedYearId } = useAcademicYear();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const academicYearId = selectedYearId;

  const [classrooms, setClassrooms] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [teachers, setTeachers] = useState<Option[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);

  const [classroomFilter, setClassroomFilter] = useState<string>("");
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL);
  const [teacherFilter, setTeacherFilter] = useState<string>(ALL);
  const [shiftView, setShiftView] = useState<"MORNING" | "AFTERNOON" | "EVENING">("MORNING");

  const [nativeSelectedDate, setNativeSelectedDate] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });

  const [openForm, setOpenForm] = useState(false);
  const [openSlots, setOpenSlots] = useState(false);
  const [editing, setEditing] = useState<ScheduleRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bootstrap school id
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
      const sid = data?.school_id ?? null;
      setSchoolId(sid);
      if (sid) {
        // Seed default time slots if none exist
        await supabase.rpc("seed_default_time_slots", { _school_id: sid });
      }
    })();
  }, [user]);

  const horariosScope = useMemo(
    (): HorariosFetchScope => ({
      isParent,
      parentClassroomIds,
      isTeacher,
      teacherClassroomIds,
      isStudent,
      studentClassroomId,
      studentSubjectIds,
      studentTeacherIds,
    }),
    [
      isParent,
      parentClassroomIds,
      isTeacher,
      teacherClassroomIds,
      isStudent,
      studentClassroomId,
      studentSubjectIds,
      studentTeacherIds,
    ],
  );

  const {
    data: horariosDataset,
    isPending: horariosPending,
    refetch: refetchHorarios,
  } = useHorariosDatasetQuery({
    schoolId,
    academicYearId,
    scope: horariosScope,
    parentLoading,
    teacherLoading,
    studentLoading,
  });

  useEffect(() => {
    const d = horariosDataset;
    if (!d) return;
    const classroomList = d.classrooms as Option[];
    setClassrooms(classroomList);
    setClassroomFilter((prev) => {
      if (prev && classroomList.some((c) => c.id === prev)) return prev;
      return classroomList[0]?.id ?? "";
    });
    setSubjects(d.subjects as Option[]);
    setTeachers(d.teachers as Option[]);
    setTimeSlots(d.timeSlots);
    setSchedules(d.schedules);
  }, [horariosDataset]);

  const loading =
    !schoolId ||
    parentLoading ||
    (isTeacher && teacherLoading) ||
    (isStudent && studentLoading) ||
    (!!schoolId && horariosPending);

  // For teachers, lock filters to themselves and their subject
  useEffect(() => {
    if (!isTeacher || !user) return;
    setTeacherFilter(user.id);
    if (teacherSubjectId) setSubjectFilter(teacherSubjectId);
  }, [isTeacher, user?.id, teacherSubjectId]);

  // For students, lock the shift to the dominant shift of their classroom.
  useEffect(() => {
    if (!isStudent) return;
    if (studentShift) setShiftView(studentShift);
  }, [isStudent, studentShift]);

  // Sync turno filter with the selected classroom's period (Manhã/Tarde/Noite).
  useEffect(() => {
    if (isStudent) return;
    const cls = classrooms.find((c) => c.id === classroomFilter);
    const shift = periodLabelToShift(cls?.period ?? null);
    if (shift) setShiftView(shift);
  }, [classroomFilter, classrooms, isStudent]);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);
  const classroomMap = useMemo(() => new Map(classrooms.map((c) => [c.id, c.name])), [classrooms]);

  const subjectColor = useMemo(() => {
    const map = new Map<string, string>();
    subjects.forEach((s, i) => map.set(s.id, PASTEL_PALETTE[i % PASTEL_PALETTE.length]));
    return map;
  }, [subjects]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (!classroomFilter) return false;
      if (s.classroom_id !== classroomFilter) return false;
      if (subjectFilter !== ALL && s.subject_id !== subjectFilter) return false;
      if (teacherFilter !== ALL && s.teacher_id !== teacherFilter) return false;
      return true;
    });
  }, [schedules, classroomFilter, subjectFilter, teacherFilter]);

  const derivedShiftForClassroom = useMemo((): "MORNING" | "AFTERNOON" | "EVENING" => {
    if (isStudent && studentShift) return studentShift;
    const cls = classrooms.find((c) => c.id === classroomFilter);
    const fromPeriod = periodLabelToShift(cls?.period ?? null);
    if (fromPeriod) return fromPeriod;
    if (!classroomFilter) return "MORNING";
    const counts: Record<string, number> = {};
    schedules
      .filter((s) => s.classroom_id === classroomFilter && s.shift)
      .forEach((s) => {
        counts[s.shift!] = (counts[s.shift!] ?? 0) + 1;
      });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return (top as "MORNING" | "AFTERNOON" | "EVENING") ?? "MORNING";
  }, [isStudent, studentShift, classroomFilter, classrooms, schedules]);

  const effectiveShift = native ? derivedShiftForClassroom : shiftView;

  const slotsForShift = useMemo(
    () => timeSlots.filter((s) => s.shift === effectiveShift).sort((a, b) => a.position - b.position),
    [timeSlots, effectiveShift],
  );

  const nativeWeekDays = useMemo(() => getWeekDaysMonSun(nativeSelectedDate), [nativeSelectedDate]);

  const pickNativeDay = useCallback((day: Date) => {
    const normalized = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    normalized.setHours(0, 0, 0, 0);
    setNativeSelectedDate(normalized);
  }, []);

  const shiftNativeWeek = useCallback((deltaWeeks: number) => {
    setNativeSelectedDate((prev) => {
      const base = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
      base.setDate(base.getDate() + deltaWeeks * 7);
      base.setHours(0, 0, 0, 0);
      return base;
    });
  }, []);

  const goNativeToday = useCallback(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setNativeSelectedDate(t);
  }, []);

  type NativeTimelineRow =
    | { kind: "lesson"; schedule: ScheduleRow }
    | { kind: "break"; slot: TimeSlotRow };

  const nativeTimeline = useMemo((): NativeTimelineRow[] => {
    const dow = calendarToSchoolDow(nativeSelectedDate);
    if (dow === null) return [];
    const lessons: NativeTimelineRow[] = filteredSchedules
      .filter((row) => {
        if (row.day_of_week !== dow) return false;
        if (!native) return true;
        return !row.shift || row.shift === effectiveShift;
      })
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((schedule) => ({ kind: "lesson", schedule }));
    const breaks: NativeTimelineRow[] = slotsForShift
      .filter((slot) => slot.is_break)
      .map((slot) => ({ kind: "break", slot }));
    return [...lessons, ...breaks].sort((a, b) => {
      const ta = a.kind === "lesson" ? a.schedule.start_time : a.slot.start_time;
      const tb = b.kind === "lesson" ? b.schedule.start_time : b.slot.start_time;
      return ta.localeCompare(tb);
    });
  }, [nativeSelectedDate, filteredSchedules, slotsForShift, native, effectiveShift]);

  // Detect cross-classroom conflicts (teacher or room) within filtered set
  const conflicts = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const a = schedules[i], b = schedules[j];
        if (a.day_of_week !== b.day_of_week) continue;
        if (!(a.start_time < b.end_time && a.end_time > b.start_time)) continue;
        const sameTeacher = a.teacher_id && a.teacher_id === b.teacher_id;
        const sameRoom = a.room && b.room && a.room === b.room;
        const sameClassroom = a.classroom_id === b.classroom_id;
        if (sameTeacher || sameRoom || sameClassroom) {
          ids.add(a.id); ids.add(b.id);
        }
      }
    }
    return ids;
  }, [schedules]);

  const handleEdit = (s: ScheduleRow) => {
    setEditing({
      id: s.id,
      classroom_id: s.classroom_id,
      subject_id: s.subject_id,
      teacher_id: s.teacher_id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      room: s.room,
      shift: s.shift,
      notes: s.notes,
    });
    setOpenForm(true);
  };

  const handleNew = () => {
    setEditing({
      classroom_id: classroomFilter || null,
      subject_id: subjectFilter !== ALL ? subjectFilter : null,
      teacher_id: teacherFilter !== ALL ? teacherFilter : null,
      day_of_week: 1,
      start_time: "08:00",
      end_time: "09:00",
      room: "",
      shift: effectiveShift,
      notes: "",
    });
    setOpenForm(true);
  };

  const handleNewAt = (day: number, slot: TimeSlotRow) => {
    setEditing({
      classroom_id: classroomFilter || null,
      subject_id: subjectFilter !== ALL ? subjectFilter : null,
      teacher_id: teacherFilter !== ALL ? teacherFilter : null,
      day_of_week: day,
      start_time: slot.start_time,
      end_time: slot.end_time,
      room: "",
      shift: shiftView,
      notes: "",
    });
    setOpenForm(true);
  };

  const handleDropMove = async (scheduleId: string, day: number, slot: TimeSlotRow) => {
    const current = schedules.find((s) => s.id === scheduleId);
    if (!current) return;
    if (
      current.day_of_week === day &&
      current.start_time === slot.start_time &&
      current.end_time === slot.end_time &&
      current.shift === shiftView
    ) {
      return;
    }
    // Optimistic update
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === scheduleId
          ? { ...s, day_of_week: day, start_time: slot.start_time, end_time: slot.end_time, shift: shiftView }
          : s,
      ),
    );
    const { error } = await supabase
      .from("schedules")
      .update({
        day_of_week: day,
        start_time: slot.start_time,
        end_time: slot.end_time,
        shift: shiftView,
        ...(academicYearId ? { academic_year_id: academicYearId } : {}),
      })
      .eq("id", scheduleId);
    if (error) {
      toast({ title: "Erro ao mover aula", description: error.message, variant: "destructive" });
      void refetchHorarios();
      return;
    }
    toast({ title: "Aula movida" });
    void refetchHorarios();
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("schedules").delete().eq("id", deletingId);
    setDeletingId(null);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Aula removida" });
    void refetchHorarios();
  };

  const ShiftIcon = SHIFT_META[shiftView].icon;

  const nativeReadOnly = isParent || isStudent || !isAdmin;

  if (parentLoading) return <PageLoadingSkeleton />;

  const showTurmaPickerNative = !isParent && !isStudent && classrooms.length > 0;

  return (
    <>
      <>
        {native ? (
          <div className="relative flex flex-col gap-5 pb-28">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Horário
                </span>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {MONTHS_PT[nativeSelectedDate.getMonth()]} {nativeSelectedDate.getFullYear()}
                </h2>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {isAdmin && !isParent && !isStudent && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full shadow-card"
                    aria-label="Blocos da escola"
                    onClick={() => setOpenSlots(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                )}
                <Button type="button" variant="ghost" size="sm" className="shrink-0 text-primary" onClick={goNativeToday}>
                  Hoje
                </Button>
                {showTurmaPickerNative ? (
                  <Select value={classroomFilter} onValueChange={setClassroomFilter}>
                    <SelectTrigger className="h-10 w-[min(42vw,11rem)] shrink-0 rounded-full bg-card shadow-card">
                      <SelectValue placeholder="Turma" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {classrooms.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
            </div>

            <div className="flex items-stretch gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-auto min-h-[5rem] w-10 shrink-0 rounded-full border-border/80 shadow-card"
                aria-label="Semana anterior"
                onClick={() => shiftNativeWeek(-1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="grid min-w-0 flex-1 grid-cols-7 gap-1 py-1">
                {nativeWeekDays.map((d) => {
                  const selected = sameCalendarDay(d, nativeSelectedDate);
                  const isWk = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => pickNativeDay(d)}
                      className={cn(
                        "flex min-h-[5rem] min-w-0 flex-col items-center justify-center rounded-full px-0.5 transition-all active:scale-95",
                        selected
                          ? "bg-pastel-lilac text-pastel-lilac-foreground shadow-card"
                          : "bg-muted text-muted-foreground",
                        isWk && !selected && "opacity-65",
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase">{WEEKDAY_SHORT_PT[d.getDay()]}</span>
                      <span className="text-lg font-semibold tabular-nums">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-auto min-h-[5rem] w-10 shrink-0 rounded-full border-border/80 shadow-card"
                aria-label="Semana seguinte"
                onClick={() => shiftNativeWeek(1)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const Meta = SHIFT_META[effectiveShift];
                const Icon = Meta.icon;
                return (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold shadow-card ring-2 ring-primary/10",
                      Meta.classes,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {Meta.label}
                  </span>
                );
              })()}
            </div>

            {!isParent && isAdmin && !isStudent && (
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="min-w-[9.5rem] flex-1">
                  <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                    <SelectTrigger className="rounded-full bg-card shadow-card">
                      <SelectValue placeholder="Disciplina" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas as disciplinas</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[9.5rem] flex-1">
                  <Select value={teacherFilter} onValueChange={setTeacherFilter}>
                    <SelectTrigger className="rounded-full bg-card shadow-card">
                      <SelectValue placeholder="Professor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos os professores</SelectItem>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {!isParent && conflicts.size > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{conflicts.size} conflito(s) nas aulas desta vista.</span>
              </div>
            )}

            <div className="space-y-0 pt-2">
              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                </div>
              ) : slotsForShift.length === 0 ? (
                <div className="rounded-2xl bg-card px-4 py-12 text-center text-sm text-muted-foreground shadow-card">
                  Nenhum bloco horário configurado para este turno.
                  {isAdmin && !isStudent ? (
                    <Button variant="link" className="block w-full" onClick={() => setOpenSlots(true)}>
                      Configurar agora
                    </Button>
                  ) : null}
                </div>
              ) : calendarToSchoolDow(nativeSelectedDate) === null ? (
                <div className="rounded-2xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
                  Fim de semana — não há horário lectivo neste modelo.
                </div>
              ) : nativeTimeline.length === 0 ? (
                <div className="rounded-2xl bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-card">
                  Sem aulas nem intervalos registados neste dia ({SHIFT_META[effectiveShift].label.toLowerCase()}).
                </div>
              ) : (
                nativeTimeline.map((row) => {
                  if (row.kind === "break") {
                    const slot = row.slot;
                    return (
                      <div key={`break-${slot.id}`} className="flex gap-3">
                        <div className="w-11 shrink-0 pt-2 text-right">
                          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{slot.start_time}</span>
                        </div>
                        <div className="min-w-0 flex-1 pb-5">
                          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-card">
                            <div className="flex items-center gap-3">
                              <div className="rounded-full bg-muted p-2">
                                <Moon className="h-4 w-4 text-muted-foreground" aria-hidden />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground">{slot.label ?? "Intervalo"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {slot.start_time} – {slot.end_time}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const s = row.schedule;
                  const subjectName = s.subject_id ? subjectMap.get(s.subject_id) ?? "—" : "—";
                  const teacherName = s.teacher_id ? teacherMap.get(s.teacher_id) ?? "—" : "—";
                  const colorClass = s.subject_id ? subjectColor.get(s.subject_id) ?? PASTEL_PALETTE[0] : PASTEL_PALETTE[0];
                  const conflict = conflicts.has(s.id);
                  return (
                    <div key={s.id} className="flex gap-3">
                      <div className="w-11 shrink-0 pt-2 text-right">
                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{s.start_time}</span>
                      </div>
                      <div className="min-w-0 flex-1 pb-5">
                        <div
                          className={cn(
                            "rounded-xl p-4 shadow-card transition-transform active:scale-[0.99]",
                            colorClass,
                            conflict && "ring-2 ring-destructive ring-offset-2 ring-offset-background",
                          )}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <h3 className="text-base font-semibold leading-tight text-inherit">{subjectName}</h3>
                            {!nativeReadOnly && (
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  className="rounded-lg bg-background/35 p-1.5 hover:bg-background/55"
                                  aria-label="Editar"
                                  onClick={() => handleEdit(s)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg bg-background/35 p-1.5 hover:bg-background/55"
                                  aria-label="Remover"
                                  onClick={() => setDeletingId(s.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-90">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" />
                              {s.start_time} – {s.end_time}
                            </span>
                            {s.room ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                {s.room}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 inline-flex items-center gap-1 text-[11px] opacity-85">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{teacherName}</span>
                          </p>
                          {conflict ? (
                            <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-destructive">
                              <AlertCircle className="h-3 w-3" /> Conflito
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {isAdmin && !isParent && !isStudent ? (
              <NativeMobileFabPortal>
                <Button
                  type="button"
                  size="icon"
                  className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
                  aria-label="Nova aula"
                  onClick={handleNew}
                >
                  <Plus className="h-6 w-6" />
                </Button>
              </NativeMobileFabPortal>
            ) : null}
          </div>
        ) : (
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Horários</h1>
            <p className="text-sm text-muted-foreground">
              {isParent
                ? "Consulte o horário semanal do seu educando."
                : "Gerir horário semanal por turma, professor ou disciplina, com deteção de conflitos."}
            </p>
          </div>
          {!isParent && !isStudent && isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setOpenSlots(true)}>
              <Settings2 className="mr-2 h-4 w-4" /> Blocos da escola
            </Button>
            <Button onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova aula
            </Button>
          </div>
          )}
        </div>

        {/* Filters */}
        {!isParent && (
        <div className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Turma</label>
            <Select value={classroomFilter} onValueChange={setClassroomFilter} disabled={classrooms.length === 0 || isStudent}>
              <SelectTrigger><SelectValue placeholder="Selecionar turma" /></SelectTrigger>
              <SelectContent>
                {classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Disciplina</label>
            <Select value={subjectFilter} onValueChange={setSubjectFilter} disabled={isTeacher || isStudent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as disciplinas</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Professor</label>
            <Select value={teacherFilter} onValueChange={setTeacherFilter} disabled={isTeacher || isStudent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os professores</SelectItem>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Turno</label>
            <Select value={shiftView} onValueChange={(v) => setShiftView(v as typeof shiftView)} disabled={isStudent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">Manhã</SelectItem>
                <SelectItem value="AFTERNOON">Tarde</SelectItem>
                <SelectItem value="EVENING">Noite</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        )}

        {!isParent && conflicts.size > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>{conflicts.size} aula(s) com conflitos de turma, professor ou sala — assinaladas a vermelho.</span>
          </div>
        )}

        {/* Schedule grid */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-foreground">Horário Semanal</h2>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", SHIFT_META[shiftView].classes)}>
                <ShiftIcon className="h-3.5 w-3.5" />
                {SHIFT_META[shiftView].label}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredSchedules.length} aula(s) · {slotsForShift.filter((s) => !s.is_break).length} blocos
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : slotsForShift.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Nenhum bloco horário configurado para este turno.
              <Button variant="link" onClick={() => setOpenSlots(true)}>Configurar agora</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[900px] p-4">
                <div className="grid gap-2" style={{ gridTemplateColumns: "120px repeat(5, minmax(0, 1fr))" }}>
                  <div />
                  {DAYS.map((d) => (
                    <div key={d.value} className="rounded-xl bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {d.label}
                    </div>
                  ))}

                  {slotsForShift.map((slot) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      schedules={filteredSchedules}
                      subjectMap={subjectMap}
                      teacherMap={teacherMap}
                      classroomMap={classroomMap}
                      subjectColor={subjectColor}
                      conflicts={conflicts}
                      onEdit={handleEdit}
                      onDelete={(id) => setDeletingId(id)}
                      onCreate={handleNewAt}
                      onDropMove={handleDropMove}
                       readOnly={isParent || isStudent || !isAdmin}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
        )}

      <ScheduleFormDialog
        open={openForm}
        onOpenChange={(o) => { setOpenForm(o); if (!o) setEditing(null); }}
        schoolId={schoolId}
        academicYearId={academicYearId}
        classrooms={classrooms}
        subjects={subjects}
        teachers={teachers}
        timeSlots={timeSlots}
        initial={editing}
        onSaved={refetchHorarios}
      />

      <TimeSlotsDialog
        open={openSlots}
        onOpenChange={setOpenSlots}
        schoolId={schoolId}
        onSaved={refetchHorarios}
        fullScreen={native && isAdmin}
      />

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover aula?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    </>
  );
};

const SlotRow = ({
  slot,
  schedules,
  subjectMap,
  teacherMap,
  classroomMap,
  subjectColor,
  conflicts,
  onEdit,
  onDelete,
  onCreate,
  onDropMove,
  readOnly,
}: {
  slot: TimeSlotRow;
  schedules: ScheduleRow[];
  subjectMap: Map<string, string>;
  teacherMap: Map<string, string>;
  classroomMap: Map<string, string>;
  subjectColor: Map<string, string>;
  conflicts: Set<string>;
  onEdit: (s: ScheduleRow) => void;
  onDelete: (id: string) => void;
  onCreate: (day: number, slot: TimeSlotRow) => void;
  onDropMove: (scheduleId: string, day: number, slot: TimeSlotRow) => void;
  readOnly?: boolean;
}) => {
  const [dragOver, setDragOver] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent, day: number) => {
    if (e.dataTransfer.types.includes("application/x-schedule-id")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(day);
    }
  };
  const handleDrop = (e: React.DragEvent, day: number) => {
    const id = e.dataTransfer.getData("application/x-schedule-id");
    setDragOver(null);
    if (id) onDropMove(id, day, slot);
  };

  const cellsByDay = (day: number) =>
    schedules.filter(
      (s) => s.day_of_week === day && s.start_time < slot.end_time && s.end_time > slot.start_time,
    );

  if (slot.is_break) {
    return (
      <>
        <div className="flex flex-col items-end justify-center pr-2 text-xs">
          <span className="font-semibold text-muted-foreground">{slot.start_time}</span>
          <span className="text-muted-foreground">{slot.end_time}</span>
        </div>
        <div className="col-span-5 flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-2 text-xs font-medium text-muted-foreground">
          {slot.label ?? "Intervalo"}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col items-end justify-center pr-2 text-xs">
        <span className="font-semibold text-foreground">{slot.start_time}</span>
        <span className="text-muted-foreground">{slot.end_time}</span>
      </div>
      {DAYS.map((d) => {
        const cells = cellsByDay(d.value);
        const isOver = dragOver === d.value;
        if (cells.length === 0) {
          if (readOnly) {
            return (
              <div
                key={d.value}
                className="flex min-h-[100px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 text-xs text-muted-foreground/60"
              />
            );
          }
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => onCreate(d.value, slot)}
              onDragOver={(e) => handleDragOver(e, d.value)}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, d.value)}
              className={cn(
                "group flex min-h-[100px] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
                isOver && "border-primary bg-primary/10 text-primary",
              )}
              aria-label="Adicionar aula"
            >
              <Plus className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          );
        }
        return (
          <div
            key={d.value}
            onDragOver={readOnly ? undefined : (e) => handleDragOver(e, d.value)}
            onDragLeave={readOnly ? undefined : () => setDragOver(null)}
            onDrop={readOnly ? undefined : (e) => handleDrop(e, d.value)}
            className={cn(
              "flex min-h-[100px] flex-col gap-1 rounded-xl transition-colors",
              !readOnly && isOver && "bg-primary/10 ring-2 ring-primary/40",
            )}
          >
            {cells.map((s) => (
              <ScheduleCell
                key={s.id}
                schedule={s}
                subjectName={s.subject_id ? subjectMap.get(s.subject_id) ?? "—" : "—"}
                teacherName={s.teacher_id ? teacherMap.get(s.teacher_id) ?? "—" : "—"}
                classroomName={classroomMap.get(s.classroom_id) ?? "—"}
                colorClass={s.subject_id ? subjectColor.get(s.subject_id) ?? PASTEL_PALETTE[0] : PASTEL_PALETTE[0]}
                hasConflict={conflicts.has(s.id)}
                onEdit={() => onEdit(s)}
                onDelete={() => onDelete(s.id)}
                readOnly={readOnly}
              />
            ))}
          </div>
        );
      })}
    </>
  );
};

const ScheduleCell = ({
  schedule,
  subjectName,
  teacherName,
  classroomName,
  colorClass,
  hasConflict,
  onEdit,
  onDelete,
  readOnly,
}: {
  schedule: ScheduleRow;
  subjectName: string;
  teacherName: string;
  classroomName: string;
  colorClass: string;
  hasConflict: boolean;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
}) => {
  return (
    <div
      draggable={!readOnly}
      onDragStart={readOnly ? undefined : (e) => {
        e.dataTransfer.setData("application/x-schedule-id", schedule.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group relative flex flex-1 flex-col justify-between rounded-xl p-3 text-left",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        colorClass,
        hasConflict && "ring-2 ring-destructive ring-offset-2 ring-offset-card",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{subjectName}</p>
          <p className="truncate text-[11px] opacity-80">{classroomName} · {schedule.start_time}–{schedule.end_time}</p>
        </div>
        {!readOnly && (
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={onEdit} className="rounded-md bg-background/40 p-1 hover:bg-background/70" aria-label="Editar">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="rounded-md bg-background/40 p-1 hover:bg-background/70" aria-label="Remover">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        )}
      </div>
      <div className="mt-1 flex flex-col gap-0.5 text-[11px] opacity-80">
        <span className="inline-flex items-center gap-1 truncate">
          <User className="h-3 w-3" /> {teacherName}
        </span>
        {schedule.room && (
          <span className="inline-flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3" /> {schedule.room}
          </span>
        )}
      </div>
      {hasConflict && (
        <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
          <AlertCircle className="h-2.5 w-2.5" /> Conflito
        </span>
      )}
    </div>
  );
};

export default Horarios;