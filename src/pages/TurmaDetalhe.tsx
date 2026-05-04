import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Clock,
  MapPin,
  Presentation,
  Users,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { isNativeMobileApp } from "@/lib/nativeApp";

type ClassroomRow = {
  id: string;
  name: string;
  grade_level: string | null;
  period: string | null;
  school_id: string;
  academic_year_id: string | null;
  homeroom_teacher?: { id: string; full_name: string | null } | null;
  courses?: { id: string; name: string } | null;
  academic_years?: { id: string; label: string } | null;
};

type StudentBrief = {
  id: string;
  full_name: string;
  email: string | null;
  enrollment_number: string | null;
  avatar_color: string | null;
};

type ScheduleJoinRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  shift: string | null;
  academic_year_id: string | null;
  subjects: { name: string; code: string | null } | null;
  profiles: { full_name: string } | null;
};

const palette = ["blue", "lilac", "yellow", "green", "pink"] as const;
const avatarStyles: Record<(typeof palette)[number], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const periodStyles: Record<string, string> = {
  Manhã: "bg-pastel-yellow text-pastel-yellow-foreground",
  Tarde: "bg-pastel-blue text-pastel-blue-foreground",
  Noite: "bg-pastel-lilac text-pastel-lilac-foreground",
};

const SHIFT_META: Record<string, { label: string; classes: string }> = {
  MORNING: { label: "Manhã", classes: "bg-pastel-yellow text-pastel-yellow-foreground" },
  AFTERNOON: { label: "Tarde", classes: "bg-pastel-pink text-pastel-pink-foreground" },
  EVENING: { label: "Noite", classes: "bg-pastel-lilac text-pastel-lilac-foreground" },
};

const DAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
] as const;

const trim5 = (t: string) => (t ? t.slice(0, 5) : "");

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

const colorFor = (id: string) => palette[id.charCodeAt(0) % palette.length];

const avatarKeyForStudent = (s: StudentBrief): (typeof palette)[number] => {
  const c = (s.avatar_color ?? "").toLowerCase();
  if (c === "blue" || c === "lilac" || c === "yellow" || c === "green" || c === "pink") return c;
  return colorFor(s.id);
};

const TurmaDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const native = isNativeMobileApp();
  const { role, loading: roleLoading } = useUserRole();
  const { isTeacher, classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();
  const { isParent, classroomIds: parentClassroomIds, loading: parentLoading } = useParentChildren();
  const { isStudent, classroomId: studentClassroomId, loading: studentLoading } = useStudentSelf();

  const [loading, setLoading] = useState(true);
  const [classroom, setClassroom] = useState<ClassroomRow | null>(null);
  const [students, setStudents] = useState<StudentBrief[]>([]);
  const [schedules, setSchedules] = useState<ScheduleJoinRow[]>([]);

  const hooksReady =
    !roleLoading && !teacherLoading && !parentLoading && !studentLoading;

  const exitRoute = useMemo(
    () => (isParent ? "/alunos" : isStudent ? "/dashboard" : "/turmas"),
    [isParent, isStudent],
  );

  const teacherIdsKey = useMemo(() => [...teacherClassroomIds].sort().join(","), [teacherClassroomIds]);
  const parentIdsKey = useMemo(() => [...parentClassroomIds].sort().join(","), [parentClassroomIds]);

  useEffect(() => {
    if (!hooksReady || !id) return;
    let cancelled = false;

    const canAccess = (classroomId: string): boolean => {
      if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
      if (isTeacher && teacherClassroomIds.includes(classroomId)) return true;
      if (isParent && parentClassroomIds.includes(classroomId)) return true;
      if (isStudent && studentClassroomId === classroomId) return true;
      return false;
    };

    const run = async () => {
      setClassroom(null);
      setStudents([]);
      setSchedules([]);
      setLoading(true);
      try {
        const { data: row, error: cErr } = await supabase
          .from("classrooms")
          .select(
            `id, name, grade_level, period, school_id, academic_year_id,
             homeroom_teacher:profiles!classrooms_homeroom_teacher_id_fkey(id, full_name),
             courses(id, name), academic_years(id, label)`,
          )
          .eq("id", id)
          .maybeSingle();

        if (cancelled) return;
        if (cErr) throw cErr;
        if (!row) {
          toast({ title: "Turma não encontrada", variant: "destructive" });
          navigate(exitRoute, { replace: true });
          return;
        }

        const cls = row as ClassroomRow;

        if (!canAccess(cls.id)) {
          toast({ title: "Sem permissão para ver esta turma", variant: "destructive" });
          navigate(exitRoute, { replace: true });
          return;
        }

        let schedulesQuery = supabase
          .from("schedules")
          .select(
            `id, day_of_week, start_time, end_time, room, shift, academic_year_id,
             subjects(name, code),
             profiles!schedules_teacher_id_fkey(full_name)`,
          )
          .eq("classroom_id", id)
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true });

        const yearId = cls.academic_year_id;
        if (yearId) {
          schedulesQuery = schedulesQuery.or(`academic_year_id.eq.${yearId},academic_year_id.is.null`);
        }

        const [{ data: studs, error: sErr }, { data: schRows, error: schErr }] = await Promise.all([
          supabase
            .from("students")
            .select("id, full_name, email, enrollment_number, avatar_color")
            .eq("classroom_id", id)
            .order("full_name", { ascending: true }),
          schedulesQuery,
        ]);

        if (cancelled) return;
        if (sErr) throw sErr;
        if (schErr) throw schErr;

        setClassroom(cls);
        setStudents((studs ?? []) as StudentBrief[]);
        setSchedules(
          (schRows ?? []).map((s: ScheduleJoinRow) => ({
            ...s,
            start_time: trim5(String(s.start_time ?? "")),
            end_time: trim5(String(s.end_time ?? "")),
          })),
        );
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Erro a carregar turma";
        toast({ title: "Erro", description: msg, variant: "destructive" });
        navigate(exitRoute, { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    hooksReady,
    id,
    navigate,
    exitRoute,
    role,
    isTeacher,
    isParent,
    isStudent,
    studentClassroomId,
    teacherIdsKey,
    parentIdsKey,
  ]);

  const subjectsFromSchedule = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string | null }>();
    schedules.forEach((s) => {
      const subj = s.subjects;
      if (!subj?.name) return;
      const key = subj.code ?? subj.name;
      if (!map.has(key)) map.set(key, { id: key, name: subj.name, code: subj.code ?? null });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [schedules]);

  const schedulesByDay = useMemo(() => {
    const m = new Map<number, ScheduleJoinRow[]>();
    DAYS.forEach((d) => m.set(d.value, []));
    schedules.forEach((s) => {
      const dow = s.day_of_week;
      if (!m.has(dow)) return;
      m.get(dow)!.push(s);
    });
    return m;
  }, [schedules]);

  if (!id || !hooksReady || loading) {
    return <PageLoadingSkeleton />;
  }

  if (!classroom) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
          <p className="text-muted-foreground">Turma não encontrada.</p>
          <Link
            to={exitRoute}
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </>
    );
  }

  const headerTint = colorFor(classroom.id);

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && "pb-4")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3">
            <Link
              to="/turmas"
              className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
              Turmas
            </Link>
            <div className="flex flex-wrap items-start gap-4">
              <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", avatarStyles[headerTint])}>
                <Presentation className="h-7 w-7" strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{classroom.name}</h1>
                {classroom.courses?.name && (
                  <p className="mt-1 text-sm text-muted-foreground">{classroom.courses.name}</p>
                )}
                {classroom.homeroom_teacher?.full_name && (
                  <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-green/25 px-2.5 py-1 text-xs font-semibold text-pastel-green-foreground">
                      <UserCog className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      Diretor de turma
                    </span>
                    <span className="font-medium text-foreground">{classroom.homeroom_teacher.full_name}</span>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {classroom.period && (
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        periodStyles[classroom.period] ?? "bg-muted text-foreground",
                      )}
                    >
                      {classroom.period}
                    </span>
                  )}
                  {classroom.grade_level && (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                      {classroom.grade_level}
                    </span>
                  )}
                  {classroom.academic_years?.label && (
                    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
                      {classroom.academic_years.label}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-pastel-blue/25 px-3 py-1 text-xs font-semibold text-pastel-blue-foreground">
                    <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {students.length} aluno(s)
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alunos */}
        <section className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-lg font-bold text-foreground">Alunos</h2>
          </div>
          <div className="p-5">
            {students.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">Nenhum aluno nesta turma.</p>
            ) : native ? (
              <div className="flex flex-col gap-3">
                {students.map((s) => {
                  const initials = initialsOf(s.full_name || "?");
                  const avKey = avatarKeyForStudent(s);
                  const av = avatarStyles[avKey];
                  return (
                    <Link
                      key={s.id}
                      to={`/alunos/${s.id}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold", av)}>
                        {initials || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">{s.full_name}</p>
                        {s.enrollment_number && (
                          <p className="text-xs text-muted-foreground">N.º {s.enrollment_number}</p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="py-3 pl-2 pr-4">Aluno</th>
                      <th className="py-3 pr-4">Matrícula</th>
                      <th className="py-3 pr-2 text-right">Perfil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => {
                      const initials = initialsOf(s.full_name || "?");
                      const avKey = avatarKeyForStudent(s);
                      const av = avatarStyles[avKey];
                      return (
                        <tr key={s.id} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pl-2 pr-4">
                            <div className="flex items-center gap-3">
                              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold", av)}>
                                {initials || "?"}
                              </div>
                              <span className="font-medium text-foreground">{s.full_name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{s.enrollment_number ?? "—"}</td>
                          <td className="py-3 pr-2 text-right">
                            <Link
                              to={`/alunos/${s.id}`}
                              className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
                            >
                              Ver perfil
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Disciplinas */}
        <section className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <BookOpen className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <h2 className="text-lg font-bold text-foreground">Disciplinas</h2>
          </div>
          <div className="p-5">
            {subjectsFromSchedule.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Sem disciplinas no horário desta turma. Configure o horário em Horário.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {subjectsFromSchedule.map((sub, i) => (
                  <span
                    key={sub.id}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold",
                      [
                        "bg-pastel-blue text-pastel-blue-foreground",
                        "bg-pastel-lilac text-pastel-lilac-foreground",
                        "bg-pastel-green text-pastel-green-foreground",
                        "bg-pastel-yellow text-pastel-yellow-foreground",
                        "bg-pastel-pink text-pastel-pink-foreground",
                      ][i % 5],
                    )}
                  >
                    {sub.name}
                    {sub.code ? ` (${sub.code})` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Horário */}
        <section className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Clock className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <h2 className="text-lg font-bold text-foreground">Horário</h2>
          </div>
          <div className="flex flex-col gap-5 p-5">
            {schedules.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground">
                Ainda não há aulas definidas para esta turma no horário.
              </p>
            ) : (
              DAYS.map(({ value, label }) => {
                const daySlots = schedulesByDay.get(value) ?? [];
                return (
                  <div key={value}>
                    <h3 className="mb-2 text-sm font-semibold text-foreground">{label}</h3>
                    {daySlots.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                        Sem aulas.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {daySlots.map((slot) => {
                          const shift = slot.shift ? SHIFT_META[slot.shift] : null;
                          const subjName = slot.subjects?.name ?? "—";
                          const teacher = slot.profiles?.full_name ?? "—";
                          return (
                            <div
                              key={slot.id}
                              className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3 shadow-soft sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                                  <Clock className="h-3 w-3" />
                                  {slot.start_time} – {slot.end_time}
                                </span>
                                {shift && (
                                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", shift.classes)}>
                                    {shift.label}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1 text-sm">
                                <p className="font-semibold text-foreground">{subjName}</p>
                                <p className="text-xs text-muted-foreground">{teacher}</p>
                              </div>
                              {(slot.room?.trim() ?? "") !== "" && (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                                  {slot.room}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </>
  );
};

export default TurmaDetalhe;
