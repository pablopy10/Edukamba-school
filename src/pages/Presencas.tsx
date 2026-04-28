import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Check, X, Clock, Loader2, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { toast } from "sonner";
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
import { useParentChildren } from "@/hooks/useParentChildren";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";

type Status = "PRESENT" | "ABSENT" | "LATE" | "JUSTIFIED";

interface Student {
  id: string;
  full_name: string;
  classroom_id: string | null;
}

interface Classroom {
  id: string;
  name: string;
}

interface AttendanceRow {
  id: string;
  student_id: string;
  date: string;
  status: Status;
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const STATUS_CONFIG: Record<Status, { bg: string; Icon: typeof Check; label: string }> = {
  PRESENT: { bg: "bg-pastel-blue text-pastel-blue-foreground", Icon: Check, label: "Presente" },
  ABSENT: { bg: "bg-destructive text-white", Icon: X, label: "Falta" },
  LATE: { bg: "bg-pastel-yellow text-pastel-yellow-foreground", Icon: Clock, label: "Atrasado" },
  JUSTIFIED: { bg: "bg-pastel-green text-pastel-green-foreground", Icon: Check, label: "Justificado" },
};

// Build days range for a given month/year and a chosen "week" (1..n)
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

const StatusCell = ({ status, isWeekend }: { status: Status | null; isWeekend: boolean }) => {
  if (!status) {
    return (
      <span className={cn("text-xs", isWeekend ? "text-muted-foreground/40" : "text-muted-foreground/60")}>
        —
      </span>
    );
  }
  const { Icon, bg } = STATUS_CONFIG[status];
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
  cellInner,
  onSelect,
}: {
  student: Student;
  date: Date;
  status: Status | null;
  cellInner: React.ReactNode;
  onSelect: (next: Status | null) => void | Promise<void>;
}) => {
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
          aria-label="Alterar presença"
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
            Presente
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handle("LATE")}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pastel-yellow text-pastel-yellow-foreground"><Clock className="h-3 w-3" strokeWidth={3} /></span>
            Atrasado
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handle("ABSENT")}>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white"><X className="h-3 w-3" strokeWidth={3} /></span>
            Falta
          </Button>
          {status && (
            <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" onClick={() => handle(null)}>
              <MinusCircle className="h-4 w-4" />
              Remover
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const Presencas = () => {
  const { user } = useAuth();
  const { selectedYearId } = useAcademicYear();
  const { isParent, childIds, loading: parentLoading } = useParentChildren();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month0, setMonth0] = useState(today.getMonth());
  const [classroomId, setClassroomId] = useState<string>("all");

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRow>>({});
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const canEdit = (userRole === "ADMIN" || userRole === "TEACHER") && !isParent;

  // Load profile (school + role)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setSchoolId(data.school_id);
        setUserRole(data.role);
      }
    })();
  }, [user]);

  // Load classrooms
  useEffect(() => {
    if (!schoolId) return;
    if (!selectedYearId) {
      setClassrooms([]);
      setClassroomId("all");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("school_id", schoolId)
        .eq("academic_year_id", selectedYearId)
        .order("name");
      const list = data ?? [];
      setClassrooms(list);
      // Pre-select first classroom by ascending name; fall back to "all" if none.
      setClassroomId(list[0]?.id ?? "all");
    })();
  }, [schoolId, selectedYearId]);

  // Compute month days
  const monthDays = useMemo(() => getMonthDays(year, month0), [year, month0]);
  const visibleDays = monthDays;

  // Load students only when school or classroom filter changes (not on month change)
  useEffect(() => {
    if (!schoolId) return;
    if (isParent && parentLoading) return;
    let cancelled = false;
    setStudentsLoading(true);
    (async () => {
      let studentsQuery = supabase
        .from("students")
        .select("id, full_name, classroom_id")
        .eq("school_id", schoolId)
        .order("full_name");
      if (classroomId !== "all") {
        studentsQuery = studentsQuery.eq("classroom_id", classroomId);
      }
      if (isParent) {
        if (childIds.length === 0) {
          setStudents([]);
          setStudentsLoading(false);
          return;
        }
        studentsQuery = studentsQuery.in("id", childIds);
      }
      const { data } = await studentsQuery;
      if (cancelled) return;
      setStudents(data ?? []);
      setStudentsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [schoolId, classroomId, isParent, parentLoading, childIds]);

  // Load attendance separately when month/year/school/classroom changes
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    setAttendanceLoading(true);

    const startDate = fmtISO(new Date(year, month0, 1));
    const endDate = fmtISO(new Date(year, month0 + 1, 0));

    (async () => {
      let q = supabase
        .from("attendance")
        .select("id, student_id, date, status")
        .eq("school_id", schoolId)
        .gte("date", startDate)
        .lte("date", endDate);
      if (classroomId !== "all") {
        q = q.eq("classroom_id", classroomId);
      }
      const { data } = await q;
      if (cancelled) return;
      const map: Record<string, AttendanceRow> = {};
      (data ?? []).forEach((row: any) => {
        map[`${row.student_id}__${row.date}`] = row as AttendanceRow;
      });
      setAttendance(map);
      setAttendanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [schoolId, classroomId, year, month0]);

  const applyStatus = async (student: Student, date: Date, next: Status | null) => {
    if (!schoolId) return;
    const key = `${student.id}__${fmtISO(date)}`;
    const existing = attendance[key];

    try {
      if (next === null) {
        if (!existing) return;
        const { error } = await supabase.from("attendance").delete().eq("id", existing.id);
        if (error) throw error;
        const copy = { ...attendance };
        delete copy[key];
        setAttendance(copy);
        toast.success("Presença removida");
      } else if (existing) {
        const { error } = await supabase
          .from("attendance")
          .update({ status: next })
          .eq("id", existing.id);
        if (error) throw error;
        setAttendance({
          ...attendance,
          [key]: { ...existing, status: next },
        });
      } else {
        const { data, error } = await supabase
          .from("attendance")
          .insert({
            student_id: student.id,
            date: fmtISO(date),
            status: next,
            school_id: schoolId,
            classroom_id: student.classroom_id,
            teacher_id: user?.id ?? null,
          })
          .select("id, student_id, date, status")
          .single();
        if (error) throw error;
        setAttendance({ ...attendance, [key]: data as AttendanceRow });
      }
    } catch (e: any) {
      toast.error("Erro ao guardar presença", { description: e.message });
    }
  };

  const stats = useMemo(() => {
    let present = 0, absent = 0, late = 0, total = 0;
    students.forEach((s) => {
      visibleDays.forEach((d) => {
        const isWk = d.getDay() === 0 || d.getDay() === 6;
        if (isWk) return;
        total++;
        const row = attendance[`${s.id}__${fmtISO(d)}`];
        if (row?.status === "PRESENT") present++;
        else if (row?.status === "ABSENT") absent++;
        else if (row?.status === "LATE") late++;
      });
    });
    return {
      present,
      absent,
      late,
      rate: total ? Math.round((present / total) * 100) : 0,
    };
  }, [students, visibleDays, attendance]);

  if (parentLoading) return <PageLoadingSkeleton />;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Presenças</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {canEdit
                ? "Clique numa célula para marcar Presente, Atrasado ou Falta."
                : "Acompanhe a frequência diária dos alunos."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!isParent && (<>
            {/* Month */}
            <Select value={String(month0)} onValueChange={(v) => setMonth0(Number(v))}>
              <SelectTrigger className="w-[140px] rounded-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_PT.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
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
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger className="w-[180px] rounded-full bg-card">
                <SelectValue placeholder="Turma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as turmas</SelectItem>
                {classrooms.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            </>)}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-2xl bg-pastel-blue p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-blue-foreground/80">Total de Alunos</p>
            <p className="mt-2 text-3xl font-bold text-pastel-blue-foreground">{students.length}</p>
          </div>
          <div className="rounded-2xl bg-pastel-green p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-green-foreground/80">Presenças</p>
            <p className="mt-2 text-3xl font-bold text-pastel-green-foreground">{stats.present}</p>
          </div>
          <div className="rounded-2xl bg-pastel-yellow p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-yellow-foreground/80">Atrasos</p>
            <p className="mt-2 text-3xl font-bold text-pastel-yellow-foreground">{stats.late}</p>
          </div>
          <div className="rounded-2xl bg-pastel-pink p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-pink-foreground/80">Faltas</p>
            <p className="mt-2 text-3xl font-bold text-pastel-pink-foreground">{stats.absent}</p>
          </div>
          <div className="rounded-2xl bg-pastel-lilac p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-lilac-foreground/80">Taxa Presença</p>
            <p className="mt-2 text-3xl font-bold text-pastel-lilac-foreground">{stats.rate}%</p>
          </div>
        </div>

        {/* Attendance table */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          {studentsLoading ? (
            <div className="flex h-60 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…
            </div>
          ) : students.length === 0 ? (
            <div className="flex h-60 items-center justify-center text-muted-foreground">
              Sem alunos para mostrar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-pastel-blue/30">
                    <th className="sticky left-0 z-10 min-w-[200px] bg-pastel-blue/30 px-6 py-4 text-left text-sm font-semibold text-foreground">
                      Nome do Aluno
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
                          {String(d.getDate()).padStart(2, "0")}
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

                        const cellInner = (
                          <div className="flex justify-center">
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : (
                              <StatusCell status={status} isWeekend={isWk} />
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
                                cellInner={cellInner}
                                onSelect={(next) => applyStatus(s, d, next)}
                              />
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
            Presente
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pastel-yellow text-pastel-yellow-foreground">
              <Clock className="h-3 w-3" strokeWidth={3} />
            </span>
            Atrasado
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white">
              <X className="h-3 w-3" strokeWidth={3} />
            </span>
            Falta
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base">—</span>
            Sem registo / Fim de semana
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Presencas;
