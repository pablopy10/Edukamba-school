import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ArrowLeft, Mail, Phone, Calendar, GraduationCap, BookOpen, Clock, FileText, Pencil, Award, Users, Briefcase, TrendingUp, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { AssessmentFormDialog, type AssessmentRecord } from "@/components/avaliacoes/AssessmentFormDialog";

type AvatarColor = "lilac" | "blue" | "yellow" | "green" | "pink";

const avatarStyles: Record<AvatarColor, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const palette: AvatarColor[] = ["blue", "pink", "yellow", "green", "lilac"];
const colorFor = (key: string): AvatarColor => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

const formatDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-PT");
};

const yearsSince = (s: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y--;
  return Math.max(0, y);
};

const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface TeacherRow {
  id: string;
  profile_id: string | null;
  subject_id: string | null;
  hire_date: string | null;
  employee_id: string | null;
  avatar_color: string | null;
  is_active: boolean | null;
  profiles: { full_name: string; phone: string | null; avatar_url: string | null } | null;
  subjects: { name: string } | null;
}

interface ScheduleRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  classrooms: { id: string; name: string } | null;
  subjects: { name: string } | null;
}

interface AssessmentRow {
  id: string;
  title: string;
  date: string;
  type: string | null;
  classrooms: { name: string } | null;
  subjects: { name: string } | null;
}

const StatPill = ({ label, value, color }: { label: string; value: string; color: AvatarColor }) => (
  <div className="rounded-2xl bg-card p-5 shadow-card">
    <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", avatarStyles[color])}>{label}</span>
    <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
  </div>
);

const ProfessorPerfil = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [teacher, setTeacher] = useState<TeacherRow | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [classroomsCount, setClassroomsCount] = useState(0);
  const [studentsCount, setStudentsCount] = useState(0);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [classroomOpts, setClassroomOpts] = useState<{ id: string; name: string }[]>([]);
  const [subjectOpts, setSubjectOpts] = useState<{ id: string; name: string }[]>([]);
  const [teacherOpts, setTeacherOpts] = useState<{ id: string; name: string }[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: t } = await supabase
        .from("teachers")
        .select("id, profile_id, subject_id, hire_date, employee_id, avatar_color, is_active, profiles(full_name, phone, avatar_url), subjects(name)")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      const teacherRow = t as unknown as TeacherRow | null;
      setTeacher(teacherRow);

      if (teacherRow?.profile_id) {
        const [schRes, asRes] = await Promise.all([
          supabase
            .from("schedules")
            .select("day_of_week, start_time, end_time, room, classrooms(id, name), subjects(name)")
            .eq("teacher_id", teacherRow.profile_id)
            .order("day_of_week")
            .order("start_time"),
          supabase
            .from("assessments")
            .select("id, title, date, type, classrooms(name), subjects(name)")
            .eq("teacher_id", teacherRow.profile_id)
            .order("date", { ascending: false })
            .limit(10),
        ]);
        if (cancelled) return;
        const schRows = (schRes.data ?? []) as unknown as ScheduleRow[];
        setSchedule(schRows);
        setAssessments((asRes.data ?? []) as unknown as AssessmentRow[]);

        const classroomIds = Array.from(new Set(schRows.map((s) => s.classrooms?.id).filter(Boolean) as string[]));
        setClassroomsCount(classroomIds.length);
        if (classroomIds.length > 0) {
          const { count } = await supabase
            .from("students")
            .select("id", { count: "exact", head: true })
            .in("classroom_id", classroomIds);
          if (!cancelled) setStudentsCount(count ?? 0);
        } else {
          setStudentsCount(0);
        }

        // Load school_id + options for the assessment dialog
        const { data: prof } = await supabase
          .from("profiles")
          .select("school_id")
          .eq("id", teacherRow.profile_id)
          .maybeSingle();
        if (cancelled) return;
        const sId = (prof?.school_id as string | null) ?? null;
        setSchoolId(sId);
        if (sId) {
          const [crRes, subRes, tcRes] = await Promise.all([
            supabase.from("classrooms").select("id, name").eq("school_id", sId).order("name"),
            supabase.from("subjects").select("id, name").eq("school_id", sId).order("name"),
            supabase
              .from("teachers")
              .select("profile_id, profiles(full_name)")
              .eq("school_id", sId)
              .not("profile_id", "is", null),
          ]);
          if (cancelled) return;
          setClassroomOpts((crRes.data ?? []) as { id: string; name: string }[]);
          setSubjectOpts((subRes.data ?? []) as { id: string; name: string }[]);
          const tOpts = ((tcRes.data ?? []) as Array<{ profile_id: string; profiles: { full_name: string } | null }>)
            .filter((r) => r.profile_id && r.profiles?.full_name)
            .map((r) => ({ id: r.profile_id, name: r.profiles!.full_name }));
          setTeacherOpts(tOpts);
        }
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const scheduleByDay = useMemo(() => {
    const days: Record<number, ScheduleRow[]> = {};
    [1, 2, 3, 4, 5].forEach((d) => (days[d] = []));
    schedule.forEach((s) => {
      if (s.day_of_week >= 1 && s.day_of_week <= 5) days[s.day_of_week].push(s);
    });
    return days;
  }, [schedule]);

  const classes = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    schedule.forEach((s) => {
      if (s.classrooms?.id) map.set(s.classrooms.id, { id: s.classrooms.id, name: s.classrooms.name });
    });
    return Array.from(map.values());
  }, [schedule]);

  const subjectsList = useMemo(() => {
    const set = new Set<string>();
    schedule.forEach((s) => {
      if (s.subjects?.name) set.add(s.subjects.name);
    });
    if (teacher?.subjects?.name) set.add(teacher.subjects.name);
    return Array.from(set);
  }, [schedule, teacher]);

  const weeklyHours = useMemo(() => {
    let mins = 0;
    schedule.forEach((s) => {
      const [sh, sm] = (s.start_time ?? "0:0").split(":").map(Number);
      const [eh, em] = (s.end_time ?? "0:0").split(":").map(Number);
      mins += eh * 60 + em - (sh * 60 + sm);
    });
    return Math.round(mins / 60);
  }, [schedule]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!teacher) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl bg-card p-8 text-center shadow-card">
          <p className="text-muted-foreground">Professor não encontrado.</p>
          <Link to="/professores" className="mt-4 inline-block text-sm font-medium text-pastel-blue-foreground hover:underline">Voltar a Professores</Link>
        </div>
      </DashboardLayout>
    );
  }

  const fullName = teacher.profiles?.full_name ?? "Professor";
  const avatarColor = (teacher.avatar_color as AvatarColor) || "blue";
  const yearsExp = yearsSince(teacher.hire_date);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <Link to="/professores" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Voltar a Professores
        </Link>

        {/* Header */}
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className={cn("flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl text-3xl font-bold shadow-soft", avatarStyles[avatarColor])}>
                {initialsOf(fullName)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{fullName}</h1>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", teacher.is_active === false ? "bg-pastel-pink text-pastel-pink-foreground" : "bg-pastel-green text-pastel-green-foreground")}>
                    {teacher.is_active === false ? "Inactivo" : "Activo"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {teacher.employee_id ? `Nº ${teacher.employee_id}` : `ID ${teacher.id.slice(0, 8)}`}
                  {yearsExp !== null ? ` · ${yearsExp} ${yearsExp === 1 ? "ano" : "anos"} na escola` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {teacher.subjects?.name && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-blue/40 px-3 py-1 text-xs font-medium text-pastel-blue-foreground">
                      <BookOpen className="h-3.5 w-3.5" strokeWidth={2} /> {teacher.subjects.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-lilac/50 px-3 py-1 text-xs font-medium text-pastel-lilac-foreground">
                    <Briefcase className="h-3.5 w-3.5" strokeWidth={2} /> Professor
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-yellow/50 px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">
                    <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} /> {classroomsCount} {classroomsCount === 1 ? "turma" : "turmas"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/professores" className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Pencil className="h-4 w-4" strokeWidth={2} /> Editar
              </Link>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-blue/40 text-pastel-blue-foreground">
                <Mail className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="truncate text-sm font-medium text-foreground">—</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-green/40 text-pastel-green-foreground">
                <Phone className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm font-medium text-foreground">{teacher.profiles?.phone || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-yellow/50 text-pastel-yellow-foreground">
                <Calendar className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Admitido em</p>
                <p className="text-sm font-medium text-foreground">{formatDate(teacher.hire_date)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-pink/50 text-pastel-pink-foreground">
                <Clock className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Carga horária</p>
                <p className="text-sm font-medium text-foreground">{weeklyHours}h / semana</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatPill label="Alunos" value={String(studentsCount)} color="blue" />
          <StatPill label="Turmas" value={String(classroomsCount)} color="lilac" />
          <StatPill label="Avaliações" value={String(assessments.length)} color="yellow" />
          <StatPill label="Disciplinas" value={String(subjectsList.length)} color="green" />
        </div>

        {/* Schedule + sidebar */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-2xl bg-card p-5 shadow-card xl:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Horário Semanal</h2>
              </div>
              <Link to="/horarios" className="text-xs font-medium text-pastel-blue-foreground hover:underline">Ver completo</Link>
            </div>
            {schedule.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem horário definido.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                {[1, 2, 3, 4, 5].map((d) => (
                  <div key={d} className="rounded-xl bg-muted/40 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{dayNames[d]}</p>
                    <div className="flex flex-col gap-2">
                      {scheduleByDay[d].length === 0 && <p className="text-xs italic text-muted-foreground">Sem aulas</p>}
                      {scheduleByDay[d].map((s, i) => {
                        const subj = s.subjects?.name ?? "—";
                        return (
                          <div key={i} className={cn("rounded-lg p-2.5 text-xs", avatarStyles[colorFor(subj)])}>
                            <p className="font-semibold">{subj}</p>
                            <p className="opacity-80">{s.start_time?.slice(0, 5)} — {s.end_time?.slice(0, 5)}</p>
                            <p className="opacity-70">{s.classrooms?.name ?? ""}{s.room ? ` · ${s.room}` : ""}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-pastel-yellow-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Detalhes</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Nº Funcionário</p>
                  <p className="font-medium text-foreground">{teacher.employee_id || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Experiência</p>
                  <p className="font-medium text-foreground">{yearsExp !== null ? `${yearsExp} anos` : "—"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Disciplinas</h2>
              </div>
              {subjectsList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem disciplinas atribuídas.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {subjectsList.map((name) => (
                    <div key={name} className={cn("rounded-xl p-3 text-sm font-semibold", avatarStyles[colorFor(name)])}>
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Classes */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-pastel-pink-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Turmas</h2>
            </div>
            <Link to="/turmas" className="text-xs font-medium text-pastel-pink-foreground hover:underline">Ver todas</Link>
          </div>
          {classes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Sem turmas atribuídas.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              {classes.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
                  <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold", avatarStyles[colorFor(c.id)])}>
                    {c.name.slice(0, 3)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">Turma {c.name}</p>
                    <p className="text-xs text-muted-foreground">Professor</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assessments created */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-pastel-lilac-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Avaliações Criadas</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDialogOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-pastel-lilac px-4 text-xs font-semibold text-pastel-lilac-foreground shadow-soft transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" strokeWidth={2} /> Nova avaliação
              </button>
              <Link to="/avaliacoes" className="text-xs font-medium text-pastel-lilac-foreground hover:underline">Ver todas</Link>
            </div>
          </div>
          {assessments.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">Sem avaliações criadas.</p>
              <button
                onClick={() => setDialogOpen(true)}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-pastel-lilac px-4 text-xs font-semibold text-pastel-lilac-foreground shadow-soft transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" strokeWidth={2} /> Criar primeira avaliação
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pastel-lilac/30 text-left text-xs uppercase tracking-wider text-pastel-lilac-foreground">
                    <th className="py-4 pl-5 pr-4 font-semibold">Título</th>
                    <th className="py-4 pr-4 font-semibold">Tipo</th>
                    <th className="py-4 pr-4 font-semibold">Disciplina</th>
                    <th className="py-4 pr-4 font-semibold">Turma</th>
                    <th className="py-4 pr-5 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a) => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="py-3.5 pl-5 pr-4 font-medium text-foreground">{a.title}</td>
                      <td className="py-3.5 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{a.type ?? "Avaliação"}</span>
                      </td>
                      <td className="py-3.5 pr-4 text-foreground">{a.subjects?.name ?? "—"}</td>
                      <td className="py-3.5 pr-4 text-foreground">{a.classrooms?.name ?? "—"}</td>
                      <td className="py-3.5 pr-5 text-muted-foreground">{formatDate(a.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-pastel-green-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Resumo</h2>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Alunos no total</span>
                <span className="font-bold text-foreground">{studentsCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Turmas</span>
                <span className="font-bold text-foreground">{classroomsCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Carga horária</span>
                <span className="font-bold text-foreground">{weeklyHours}h / semana</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avaliações criadas</span>
                <span className="font-bold text-foreground">{assessments.length}</span>
              </div>
            </div>
          </div>
        </div>

        <AssessmentFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          schoolId={schoolId}
          classrooms={classroomOpts}
          subjects={subjectOpts}
          teachers={teacherOpts}
          initial={
            teacher?.profile_id
              ? ({
                  teacher_id: teacher.profile_id,
                  subject_id: teacher.subject_id ?? null,
                } as Partial<AssessmentRecord>)
              : null
          }
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      </div>
    </DashboardLayout>
  );
};

export default ProfessorPerfil;
