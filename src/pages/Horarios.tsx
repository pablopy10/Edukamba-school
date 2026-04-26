import { useEffect, useMemo, useState, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Plus, Settings2, User, MapPin, Pencil, Trash2, Sun, Sunset, Moon, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScheduleFormDialog, type ScheduleRecord } from "@/components/horarios/ScheduleFormDialog";
import { TimeSlotsDialog } from "@/components/horarios/TimeSlotsDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Option = { id: string; name: string };
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

const DAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
] as const;

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
const ALL = "__ALL__";

const Horarios = () => {
  const { user } = useAuth();
  const [schoolId, setSchoolId] = useState<string | null>(null);

  const [classrooms, setClassrooms] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [teachers, setTeachers] = useState<Option[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlotRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);

  const [classroomFilter, setClassroomFilter] = useState<string>(ALL);
  const [subjectFilter, setSubjectFilter] = useState<string>(ALL);
  const [teacherFilter, setTeacherFilter] = useState<string>(ALL);
  const [shiftView, setShiftView] = useState<"MORNING" | "AFTERNOON" | "EVENING">("MORNING");

  const [loading, setLoading] = useState(true);
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

  const loadAll = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const [classroomsRes, subjectsRes, teachersRes, slotsRes, schedulesRes] = await Promise.all([
      supabase.from("classrooms").select("id, name").eq("school_id", schoolId).order("name"),
      supabase.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
      supabase
        .from("teachers")
        .select("id, profile_id, profiles:profile_id ( full_name )")
        .eq("school_id", schoolId),
      supabase.from("school_time_slots").select("*").eq("school_id", schoolId).order("shift").order("position"),
      supabase.from("schedules").select("*").eq("school_id", schoolId),
    ]);

    setClassrooms((classroomsRes.data ?? []).map((c) => ({ id: c.id, name: c.name })));
    setSubjects((subjectsRes.data ?? []).map((s) => ({ id: s.id, name: s.name })));
    setTeachers(
      (teachersRes.data ?? []).map((t: any) => ({
        id: t.id,
        name: t.profiles?.full_name ?? "Sem nome",
      })),
    );
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
  }, [schoolId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

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
      if (classroomFilter !== ALL && s.classroom_id !== classroomFilter) return false;
      if (subjectFilter !== ALL && s.subject_id !== subjectFilter) return false;
      if (teacherFilter !== ALL && s.teacher_id !== teacherFilter) return false;
      return true;
    });
  }, [schedules, classroomFilter, subjectFilter, teacherFilter]);

  const slotsForShift = useMemo(
    () => timeSlots.filter((s) => s.shift === shiftView).sort((a, b) => a.position - b.position),
    [timeSlots, shiftView],
  );

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
      classroom_id: classroomFilter !== ALL ? classroomFilter : null,
      subject_id: subjectFilter !== ALL ? subjectFilter : null,
      teacher_id: teacherFilter !== ALL ? teacherFilter : null,
      day_of_week: 1,
      start_time: "08:00",
      end_time: "09:00",
      room: "",
      shift: shiftView,
      notes: "",
    });
    setOpenForm(true);
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
    void loadAll();
  };

  const ShiftIcon = SHIFT_META[shiftView].icon;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Horários</h1>
            <p className="text-sm text-muted-foreground">
              Gerir horário semanal por turma, professor ou disciplina, com deteção de conflitos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setOpenSlots(true)}>
              <Settings2 className="mr-2 h-4 w-4" /> Blocos da escola
            </Button>
            <Button onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" /> Nova aula
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Turma</label>
            <Select value={classroomFilter} onValueChange={setClassroomFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as turmas</SelectItem>
                {classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Disciplina</label>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as disciplinas</SelectItem>
                {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Professor</label>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os professores</SelectItem>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">Turno</label>
            <Select value={shiftView} onValueChange={(v) => setShiftView(v as typeof shiftView)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">Manhã</SelectItem>
                <SelectItem value="AFTERNOON">Tarde</SelectItem>
                <SelectItem value="EVENING">Noite</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {conflicts.size > 0 && (
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
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ScheduleFormDialog
        open={openForm}
        onOpenChange={(o) => { setOpenForm(o); if (!o) setEditing(null); }}
        schoolId={schoolId}
        classrooms={classrooms}
        subjects={subjects}
        teachers={teachers}
        timeSlots={timeSlots}
        initial={editing}
        onSaved={loadAll}
      />

      <TimeSlotsDialog
        open={openSlots}
        onOpenChange={setOpenSlots}
        schoolId={schoolId}
        onSaved={loadAll}
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
    </DashboardLayout>
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
}) => {
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
        if (cells.length === 0) {
          return <div key={d.value} className="min-h-[100px] rounded-xl border border-dashed border-border bg-muted/20" />;
        }
        return (
          <div key={d.value} className="flex min-h-[100px] flex-col gap-1">
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
}: {
  schedule: ScheduleRow;
  subjectName: string;
  teacherName: string;
  classroomName: string;
  colorClass: string;
  hasConflict: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    <div
      className={cn(
        "group relative flex flex-1 flex-col justify-between rounded-xl p-3 text-left",
        colorClass,
        hasConflict && "ring-2 ring-destructive ring-offset-2 ring-offset-card",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">{subjectName}</p>
          <p className="truncate text-[11px] opacity-80">{classroomName} · {schedule.start_time}–{schedule.end_time}</p>
        </div>
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={onEdit} className="rounded-md bg-background/40 p-1 hover:bg-background/70" aria-label="Editar">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="rounded-md bg-background/40 p-1 hover:bg-background/70" aria-label="Remover">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
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