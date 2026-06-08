import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  Contact,
  FileText,
  MapPin,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LessonLogFormDialog, type LessonLogRow } from "@/components/disciplinas/LessonLogFormDialog";

type SubjectRow = { id: string; name: string; code: string | null; school_id: string };

type TeacherBrief = { id: string; full_name: string };

type ClassroomBrief = {
  id: string;
  name: string;
  period: string | null;
  courses?: { name: string } | null;
};

type ScheduleRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  shift: string | null;
  classroom_id: string;
  teacher_id: string;
  classrooms: { name: string } | null;
  profiles: { full_name: string } | null;
};

const DAYS = [
  { value: 1, labelKey: "day_mon" },
  { value: 2, labelKey: "day_tue" },
  { value: 3, labelKey: "day_wed" },
  { value: 4, labelKey: "day_thu" },
  { value: 5, labelKey: "day_fri" },
] as const;

const trim5 = (t: string) => (t ? t.slice(0, 5) : "");

const DisciplinaDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const native = isNativeMobileApp();
  const { t, i18n } = useTranslation("pages", { keyPrefix: "disciplina_detalhe" });
  const dateLocale = i18n.language?.startsWith("fr") ? "fr-FR" : i18n.language?.startsWith("en") ? "en-GB" : "pt-PT";

  const { role, loading: roleLoading } = useUserRole();
  const { isTeacher, classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();
  const { isParent, classroomIds: parentClassroomIds, loading: parentLoading } = useParentChildren();
  const { isStudent, subjectIds: studentSubjectIds, classroomId: studentClassroomId, loading: studentLoading } =
    useStudentSelf();
  const { selectedYearId, selectedYear } = useAcademicYear();

  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState<SubjectRow | null>(null);
  const [teachers, setTeachers] = useState<TeacherBrief[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomBrief[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [lessonLogs, setLessonLogs] = useState<LessonLogRow[]>([]);
  const [teacherSubjectClassroomIds, setTeacherSubjectClassroomIds] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [logsClassroomFilter, setLogsClassroomFilter] = useState<string>("all");
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<LessonLogRow | null>(null);
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);

  const hooksReady =
    !roleLoading &&
    !teacherLoading &&
    (!isParent || !parentLoading) &&
    (!isStudent || !studentLoading);

  const parentIdsKey = useMemo(() => [...parentClassroomIds].sort().join(","), [parentClassroomIds]);
  const studentSubjectIdsKey = useMemo(() => [...studentSubjectIds].sort().join(","), [studentSubjectIds]);

  const exitRoute = useMemo(() => {
    if (isParent || isStudent) return "/dashboard";
    return "/disciplinas";
  }, [isParent, isStudent]);

  const canManageLogs = useMemo(
    () => isTeacher && teacherSubjectClassroomIds.length > 0,
    [isTeacher, teacherSubjectClassroomIds],
  );

  const manageableClassrooms = useMemo(() => {
    if (!isTeacher) return [];
    return classrooms.filter((c) => teacherSubjectClassroomIds.includes(c.id));
  }, [isTeacher, classrooms, teacherSubjectClassroomIds]);

  const visibleClassroomsForLogs = useMemo(() => {
    if (isSchoolManagementRole(role) || isTeacher) return classrooms;
    if (isParent) return classrooms.filter((c) => parentClassroomIds.includes(c.id));
    if (isStudent && studentClassroomId) return classrooms.filter((c) => c.id === studentClassroomId);
    return classrooms;
  }, [role, isTeacher, isParent, isStudent, classrooms, parentClassroomIds, studentClassroomId]);

  const loadLessonLogs = useCallback(async () => {
    if (!id) return;
    let q = supabase
      .from("subject_lesson_logs")
      .select(
        `*, subject_lesson_materials(id, title, link_url, content_text, sort_order),
         classrooms(name)`,
      )
      .eq("subject_id", id)
      .order("lesson_date", { ascending: false })
      .limit(80);
    if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
    const { data, error } = await q;
    if (error) {
      toast({ title: t("toast_logs_error"), description: error.message, variant: "destructive" });
      return;
    }
    setLessonLogs((data ?? []) as LessonLogRow[]);
  }, [id, selectedYearId, t]);

  useEffect(() => {
    if (!hooksReady || !id) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const { data: sub, error: subErr } = await supabase
          .from("subjects")
          .select("id, name, code, school_id")
          .eq("id", id)
          .maybeSingle();
        if (subErr) throw subErr;
        if (!sub) {
          toast({ title: t("not_found"), variant: "destructive" });
          navigate(exitRoute, { replace: true });
          return;
        }
        if (cancelled) return;

        let schedQuery = supabase
          .from("schedules")
          .select(
            `id, day_of_week, start_time, end_time, room, shift, classroom_id, teacher_id,
             classrooms(name, period, courses(name)),
             profiles!schedules_teacher_id_fkey(id, full_name)`,
          )
          .eq("subject_id", id)
          .order("day_of_week")
          .order("start_time");
        if (selectedYearId) {
          schedQuery = schedQuery.or(`academic_year_id.eq.${selectedYearId},academic_year_id.is.null`);
        }

        const { data: schedRows, error: schedErr } = await schedQuery;
        if (schedErr) throw schedErr;
        if (cancelled) return;

        const rows = (schedRows ?? []) as Array<ScheduleRow & { classrooms: ClassroomBrief | null; profiles: TeacherBrief | null }>;

        const teacherMap = new Map<string, TeacherBrief>();
        const classroomMap = new Map<string, ClassroomBrief>();
        const myTeacherClassrooms = new Set<string>();

        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!cancelled) setCurrentUserId(uid ?? null);

        rows.forEach((r) => {
          if (r.teacher_id && r.profiles?.full_name) {
            teacherMap.set(r.teacher_id, { id: r.teacher_id, full_name: r.profiles.full_name });
          }
          if (r.classrooms?.name && r.classroom_id) {
            classroomMap.set(r.classroom_id, {
              id: r.classroom_id,
              name: r.classrooms.name,
              period: (r.classrooms as ClassroomBrief).period ?? null,
              courses: (r.classrooms as ClassroomBrief).courses ?? null,
            });
          }
          if (uid && r.teacher_id === uid) myTeacherClassrooms.add(r.classroom_id);
        });

        const classroomList = [...classroomMap.values()].sort((a, b) => a.name.localeCompare(b.name, "pt"));
        const teacherList = [...teacherMap.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "pt"));

        const canAccess = (() => {
          if (isSchoolManagementRole(role)) return true;
          if (isTeacher && myTeacherClassrooms.size > 0) return true;
          if (isParent && classroomList.some((c) => parentClassroomIds.includes(c.id))) return true;
          if (isStudent && studentSubjectIds.includes(id)) return true;
          return false;
        })();

        if (!canAccess) {
          toast({ title: t("no_access"), variant: "destructive" });
          navigate(exitRoute, { replace: true });
          return;
        }

        setSubject(sub as SubjectRow);
        setTeachers(teacherList);
        setClassrooms(classroomList);
        setTeacherSubjectClassroomIds([...myTeacherClassrooms]);
        setSchedules(
          rows.map((r) => ({
            ...r,
            start_time: trim5(String(r.start_time ?? "")),
            end_time: trim5(String(r.end_time ?? "")),
          })),
        );

      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : t("load_error");
        toast({ title: t("load_error"), description: msg, variant: "destructive" });
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
    parentIdsKey,
    studentSubjectIdsKey,
    selectedYearId,
  ]);

  useEffect(() => {
    if (!subject?.id) return;
    void loadLessonLogs();
  }, [subject?.id, selectedYearId, loadLessonLogs]);

  useEffect(() => {
    if (visibleClassroomsForLogs.length === 1) {
      setLogsClassroomFilter(visibleClassroomsForLogs[0].id);
    }
  }, [visibleClassroomsForLogs]);

  const filteredLogs = useMemo(() => {
    let list = lessonLogs;
    if (isParent) list = list.filter((l) => parentClassroomIds.includes(l.classroom_id));
    if (isStudent && studentClassroomId) list = list.filter((l) => l.classroom_id === studentClassroomId);
    if (logsClassroomFilter !== "all") list = list.filter((l) => l.classroom_id === logsClassroomFilter);
    return list;
  }, [lessonLogs, logsClassroomFilter, isParent, isStudent, parentClassroomIds, studentClassroomId]);

  const schedulesByDay = useMemo(() => {
    const m = new Map<number, ScheduleRow[]>();
    DAYS.forEach((d) => m.set(d.value, []));
    schedules.forEach((s) => {
      if (!m.has(s.day_of_week)) return;
      m.get(s.day_of_week)!.push(s);
    });
    return m;
  }, [schedules]);

  const classroomName = (cid: string) => classrooms.find((c) => c.id === cid)?.name ?? "—";

  const handleDeleteLog = async () => {
    if (!deleteLogId) return;
    const { error } = await supabase.from("subject_lesson_logs").delete().eq("id", deleteLogId);
    if (error) toast({ title: t("toast_delete_error"), description: error.message, variant: "destructive" });
    else {
      toast({ title: t("toast_deleted") });
      await loadLessonLogs();
    }
    setDeleteLogId(null);
  };

  if (!hooksReady || loading) return <PageLoadingSkeleton />;

  if (!subject) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center shadow-soft">
        <p className="text-sm text-muted-foreground">{t("not_found")}</p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link to={exitRoute}>{t("back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", native && "pb-4")}>
      <div className="flex flex-wrap items-start gap-4">
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <Link to={exitRoute}>
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
              <BookOpen className="h-5 w-5" />
            </span>
            {subject.name}
            {subject.code ? (
              <Badge variant="secondary" className="font-mono text-xs">
                {subject.code}
              </Badge>
            ) : null}
          </h1>
          {selectedYear?.label ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("year_label", { year: selectedYear.label })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">{t("stat_teachers")}</p>
          <p className="mt-1 text-2xl font-bold">{teachers.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">{t("stat_classrooms")}</p>
          <p className="mt-1 text-2xl font-bold">{classrooms.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs text-muted-foreground">{t("stat_lessons")}</p>
          <p className="mt-1 text-2xl font-bold">{filteredLogs.length}</p>
        </div>
      </div>

      <Tabs defaultValue="sumarios" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap gap-1">
          <TabsTrigger value="professores">{t("tab_teachers")}</TabsTrigger>
          <TabsTrigger value="turmas">{t("tab_classrooms")}</TabsTrigger>
          <TabsTrigger value="horario">{t("tab_schedule")}</TabsTrigger>
          <TabsTrigger value="sumarios">{t("tab_lessons")}</TabsTrigger>
        </TabsList>

        <TabsContent value="professores" className="mt-4">
          {teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty_teachers")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.map((te) => (
                <Link
                  key={te.id}
                  to={`/professores/perfil/${te.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-soft transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pastel-lilac text-pastel-lilac-foreground">
                    <Contact className="h-5 w-5" />
                  </div>
                  <span className="font-medium">{te.full_name}</span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="turmas" className="mt-4">
          {classrooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty_classrooms")}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classrooms.map((c) => (
                <Link
                  key={c.id}
                  to={`/turmas/${c.id}`}
                  className="rounded-xl border border-border bg-card p-4 shadow-soft transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Presentation className="h-4 w-4 text-primary" />
                    {c.name}
                  </div>
                  {c.courses?.name ? (
                    <p className="mt-1 text-xs text-muted-foreground">{c.courses.name}</p>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="horario" className="mt-4">
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty_schedule")}</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {DAYS.map((d) => {
                const items = schedulesByDay.get(d.value) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={d.value} className="rounded-xl border border-border bg-card p-4 shadow-soft">
                    <h3 className="mb-3 font-semibold">{t(d.labelKey)}</h3>
                    <ul className="space-y-2 text-sm">
                      {items.map((s) => (
                        <li key={s.id} className="rounded-lg bg-muted/40 px-3 py-2">
                          <div className="flex items-center gap-2 font-medium">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {s.start_time} – {s.end_time}
                          </div>
                          <p className="mt-1 text-muted-foreground">{s.classrooms?.name ?? classroomName(s.classroom_id)}</p>
                          <p className="text-xs text-muted-foreground">{s.profiles?.full_name ?? "—"}</p>
                          {s.room ? (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {s.room}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sumarios" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("lessons_hint")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {visibleClassroomsForLogs.length > 1 && (
                <Select value={logsClassroomFilter} onValueChange={setLogsClassroomFilter}>
                  <SelectTrigger className="w-[200px] bg-card">
                    <SelectValue placeholder={t("filter_classroom")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(isSchoolManagementRole(role) || isTeacher) && (
                      <SelectItem value="all">{t("all_classrooms")}</SelectItem>
                    )}
                    {visibleClassroomsForLogs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {canManageLogs && (
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    setEditingLog(null);
                    setLogDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {t("add_lesson")}
                </Button>
              )}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              {t("empty_lessons")}
            </p>
          ) : (
            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <article key={log.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(`${log.lesson_date}T12:00:00`).toLocaleDateString(dateLocale)}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <Users className="h-3 w-3" />
                          {classroomName(log.classroom_id)}
                        </Badge>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{log.summary}</p>
                      {log.homework ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{t("homework_label")}: </span>
                          {log.homework}
                        </p>
                      ) : null}
                    </div>
                    {canManageLogs &&
                      manageableClassrooms.some((c) => c.id === log.classroom_id) &&
                      log.teacher_id === currentUserId && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingLog(log);
                            setLogDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setDeleteLogId(log.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {(log.subject_lesson_materials ?? []).length > 0 && (
                    <ul className="mt-4 space-y-2 border-t border-border pt-3">
                      {(log.subject_lesson_materials ?? [])
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((m) => (
                          <li key={m.id} className="text-sm">
                            <div className="flex items-start gap-2">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                              <div>
                                <p className="font-medium">{m.title}</p>
                                {m.link_url ? (
                                  <a
                                    href={m.link_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary underline-offset-2 hover:underline"
                                  >
                                    {m.link_url}
                                  </a>
                                ) : null}
                                {m.content_text ? (
                                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{m.content_text}</p>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {canManageLogs && subject && (
        <LessonLogFormDialog
          open={logDialogOpen}
          onOpenChange={setLogDialogOpen}
          subjectId={subject.id}
          schoolId={subject.school_id}
          academicYearId={selectedYearId}
          classrooms={manageableClassrooms}
          editing={editingLog}
          defaultClassroomId={logsClassroomFilter !== "all" ? logsClassroomFilter : undefined}
          onSaved={() => void loadLessonLogs()}
        />
      )}

      <AlertDialog open={!!deleteLogId} onOpenChange={(o) => !o && setDeleteLogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_title")}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteLog()}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DisciplinaDetalhe;
