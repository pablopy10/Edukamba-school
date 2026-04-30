import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Clock,
  Loader2,
  MapPin,
  Moon,
  Sun,
  Sunset,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { isNativeMobileApp } from "@/lib/nativeApp";

type TimeSlotRow = {
  id: string;
  shift: "MORNING" | "AFTERNOON" | "EVENING";
  start_time: string;
  end_time: string;
  position: number;
  is_break: boolean;
  label: string | null;
};

type ScheduleRow = {
  id: string;
  classroom_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  shift: "MORNING" | "AFTERNOON" | "EVENING" | null;
  notes: string | null;
};

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAY_LONG_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

const SHIFT_META = {
  MORNING: { label: "Manhã", icon: Sun, classes: "bg-pastel-yellow text-pastel-yellow-foreground" },
  AFTERNOON: { label: "Tarde", icon: Sunset, classes: "bg-pastel-pink text-pastel-pink-foreground" },
  EVENING: { label: "Noite", icon: Moon, classes: "bg-pastel-lilac text-pastel-lilac-foreground" },
} as const;

const PASTEL_PALETTE = [
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-lilac text-pastel-lilac-foreground",
  "bg-pastel-green text-pastel-green-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
  "bg-pastel-pink text-pastel-pink-foreground",
];

const trim5 = (t: string) => t?.slice(0, 5) ?? "";

/** Seg–Sex → 1–5 (igual a Horários). */
const calendarToSchoolDow = (d: Date): number | null => {
  const day = d.getDay();
  if (day >= 1 && day <= 5) return day;
  return null;
};

const periodLabelToShift = (period: string | null | undefined): "MORNING" | "AFTERNOON" | "EVENING" | null => {
  if (!period) return null;
  const p = period.trim().toLowerCase();
  if (p.includes("manh")) return "MORNING";
  if (p.includes("tarde")) return "AFTERNOON";
  if (p.includes("noite")) return "EVENING";
  return null;
};

type NativeTimelineRow =
  | { kind: "lesson"; schedule: ScheduleRow }
  | { kind: "break"; slot: TimeSlotRow };

export function StudentTodayScheduleCard() {
  const native = isNativeMobileApp();
  const { user } = useAuth();
  const {
    isStudent,
    classroomId,
    classroomName,
    subjectIds,
    teacherIds,
    shift: studentShift,
    loading: studentLoading,
  } = useStudentSelf();

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [classroomPeriod, setClassroomPeriod] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const todayDow = calendarToSchoolDow(today);

  const loadAll = useCallback(async () => {
    if (!user || !isStudent || !classroomId) return;
    setLoading(true);
    const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
    const sid = profile?.school_id ?? null;
    setSchoolId(sid);
    if (!sid) {
      setLoading(false);
      return;
    }
    await supabase.rpc("seed_default_time_slots", { _school_id: sid });

    const [classroomRes, subjectsRes, teachersRes, slotsRes, schedulesRes] = await Promise.all([
      supabase.from("classrooms").select("period").eq("id", classroomId).eq("school_id", sid).maybeSingle(),
      supabase.from("subjects").select("id, name").eq("school_id", sid).order("name"),
      supabase
        .from("teachers")
        .select("id, profile_id, profiles:profile_id ( full_name )")
        .eq("school_id", sid),
      supabase.from("school_time_slots").select("*").eq("school_id", sid).order("shift").order("position"),
      supabase.from("schedules").select("*").eq("school_id", sid).eq("classroom_id", classroomId),
    ]);

    setClassroomPeriod((classroomRes.data as { period?: string | null } | null)?.period ?? null);

    const subjSet = new Set(subjectIds);
    const teachSet = new Set(teacherIds);
    const subjectList = ((subjectsRes.data ?? []) as { id: string; name: string }[]).filter((s) => subjSet.has(s.id));
    const teacherList = ((teachersRes.data ?? []) as any[])
      .filter((t) => t.profile_id && teachSet.has(t.profile_id))
      .map((t) => ({
        id: t.profile_id as string,
        name: (t.profiles?.full_name as string) ?? "Sem nome",
      }));

    setSubjects(subjectList);
    setTeachers(teacherList);
    setTimeSlots(
      (slotsRes.data ?? []).map((s: any) => ({
        id: s.id,
        shift: s.shift,
        start_time: trim5(s.start_time),
        end_time: trim5(s.end_time),
        position: s.position,
        is_break: s.is_break,
        label: s.label,
      })),
    );
    setSchedules(
      (schedulesRes.data ?? []).map((s: any) => ({
        id: s.id,
        classroom_id: s.classroom_id,
        subject_id: s.subject_id,
        teacher_id: s.teacher_id,
        day_of_week: s.day_of_week,
        start_time: trim5(s.start_time),
        end_time: trim5(s.end_time),
        room: s.room,
        shift: s.shift,
        notes: s.notes,
      })),
    );
    setLoading(false);
  }, [user, isStudent, classroomId, subjectIds, teacherIds]);

  useEffect(() => {
    if (studentLoading || !isStudent) return;
    void loadAll();
  }, [studentLoading, isStudent, loadAll]);

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t.name])), [teachers]);

  const subjectColor = useMemo(() => {
    const map = new Map<string, string>();
    subjects.forEach((s, i) => map.set(s.id, PASTEL_PALETTE[i % PASTEL_PALETTE.length]));
    return map;
  }, [subjects]);

  const derivedShift = useMemo((): "MORNING" | "AFTERNOON" | "EVENING" => {
    if (studentShift) return studentShift;
    const fromPeriod = periodLabelToShift(classroomPeriod);
    if (fromPeriod) return fromPeriod;
    const counts: Record<string, number> = {};
    schedules.forEach((s) => {
      if (s.shift) counts[s.shift] = (counts[s.shift] ?? 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    return (top as "MORNING" | "AFTERNOON" | "EVENING") ?? "MORNING";
  }, [studentShift, classroomPeriod, schedules]);

  const slotsForShift = useMemo(
    () => timeSlots.filter((s) => s.shift === derivedShift).sort((a, b) => a.position - b.position),
    [timeSlots, derivedShift],
  );

  const conflicts = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const a = schedules[i];
        const b = schedules[j];
        if (a.day_of_week !== b.day_of_week) continue;
        if (!(a.start_time < b.end_time && a.end_time > b.start_time)) continue;
        const sameTeacher = a.teacher_id && a.teacher_id === b.teacher_id;
        const sameRoom = a.room && b.room && a.room === b.room;
        const sameClassroom = a.classroom_id === b.classroom_id;
        if (sameTeacher || sameRoom || sameClassroom) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [schedules]);

  const nativeTimeline = useMemo((): NativeTimelineRow[] => {
    if (todayDow === null) return [];
    const lessons: NativeTimelineRow[] = schedules
      .filter((row) => {
        if (row.day_of_week !== todayDow) return false;
        return !row.shift || row.shift === derivedShift;
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
  }, [todayDow, schedules, slotsForShift, derivedShift]);

  const cellsForSlotAndToday = (slot: TimeSlotRow) =>
    schedules.filter(
      (s) =>
        todayDow !== null &&
        s.day_of_week === todayDow &&
        s.start_time < slot.end_time &&
        s.end_time > slot.start_time &&
        (!s.shift || s.shift === derivedShift),
    );

  if (!isStudent) return null;

  const ShiftIcon = SHIFT_META[derivedShift].icon;
  const headerDate = `${WEEKDAY_LONG_PT[today.getDay()]}, ${today.getDate()} ${MONTHS_PT[today.getMonth()]}`;

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Horário de hoje
          </span>
          <h2 className="text-lg font-bold tracking-tight text-foreground">{headerDate}</h2>
          {classroomName ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{classroomName}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-card ring-2 ring-primary/10",
              SHIFT_META[derivedShift].classes,
            )}
          >
            <ShiftIcon className="h-3.5 w-3.5" aria-hidden />
            {SHIFT_META[derivedShift].label}
          </span>
          <Link
            to="/horarios"
            className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
          >
            Horário completo
          </Link>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        {studentLoading || loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : !schoolId || !classroomId ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Não foi possível carregar o horário. Confirme que está associado a uma turma.
          </p>
        ) : slotsForShift.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum bloco horário configurado para o teu turno. Consulta a página Horários ou fala com a escola.
          </p>
        ) : todayDow === null ? (
          <div className="rounded-xl bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground">
            Fim de semana — não há horário lectivo neste modelo.
          </div>
        ) : native ? (
          <div className="space-y-0 pt-1">
            {nativeTimeline.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground shadow-inner rounded-xl bg-muted/20">
                Sem aulas nem intervalos registados para hoje ({SHIFT_META[derivedShift].label.toLowerCase()}).
              </p>
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
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[280px]">
              <div className="grid gap-2" style={{ gridTemplateColumns: "100px minmax(0, 1fr)" }}>
                <div />
                <div className="rounded-xl bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hoje
                </div>

                {slotsForShift.map((slot) => {
                  if (slot.is_break) {
                    return (
                      <div key={slot.id} className="contents">
                        <div className="flex flex-col items-end justify-center pr-2 text-xs">
                          <span className="font-semibold text-muted-foreground">{slot.start_time}</span>
                          <span className="text-muted-foreground">{slot.end_time}</span>
                        </div>
                        <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-2 text-xs font-medium text-muted-foreground">
                          {slot.label ?? "Intervalo"}
                        </div>
                      </div>
                    );
                  }
                  const cells = cellsForSlotAndToday(slot);
                  return (
                    <div key={slot.id} className="contents">
                      <div className="flex flex-col items-end justify-center pr-2 text-xs">
                        <span className="font-semibold text-foreground">{slot.start_time}</span>
                        <span className="text-muted-foreground">{slot.end_time}</span>
                      </div>
                      <div className="flex min-h-[92px] flex-col gap-1 rounded-xl">
                        {cells.length === 0 ? (
                          <div className="flex min-h-[92px] flex-1 items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 text-xs text-muted-foreground/60" />
                        ) : (
                          cells.map((s) => {
                            const subjectName = s.subject_id ? subjectMap.get(s.subject_id) ?? "—" : "—";
                            const teacherName = s.teacher_id ? teacherMap.get(s.teacher_id) ?? "—" : "—";
                            const colorClass = s.subject_id ? subjectColor.get(s.subject_id) ?? PASTEL_PALETTE[0] : PASTEL_PALETTE[0];
                            const hasConflict = conflicts.has(s.id);
                            return (
                              <div
                                key={s.id}
                                className={cn(
                                  "group relative flex flex-1 flex-col justify-between rounded-xl p-3 text-left cursor-default",
                                  colorClass,
                                  hasConflict && "ring-2 ring-destructive ring-offset-2 ring-offset-card",
                                )}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold leading-tight">{subjectName}</p>
                                    <p className="truncate text-[11px] opacity-80">
                                      {s.start_time}–{s.end_time}
                                      {classroomName ? ` · ${classroomName}` : ""}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-1 flex flex-col gap-0.5 text-[11px] opacity-80">
                                  <span className="inline-flex items-center gap-1 truncate">
                                    <User className="h-3 w-3" /> {teacherName}
                                  </span>
                                  {s.room ? (
                                    <span className="inline-flex items-center gap-1 truncate">
                                      <MapPin className="h-3 w-3" /> {s.room}
                                    </span>
                                  ) : null}
                                </div>
                                {hasConflict ? (
                                  <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                                    <AlertCircle className="h-2.5 w-2.5" /> Conflito
                                  </span>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
