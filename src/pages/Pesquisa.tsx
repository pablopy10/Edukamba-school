import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  Users,
  GraduationCap,
  Receipt,
  BookOpen,
  Presentation,
  CalendarCheck,
  BookMarked,
  FileText,
  MessageSquare,
  Bell,
  ArrowRight,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";

type ResultType = "aluno" | "professor" | "matricula" | "curso" | "turma" | "evento" | "avaliacao" | "documento" | "mensagem" | "notificacao";

type Result = {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  context: string;
  to: string;
};

type FilterType = "all" | ResultType;

const Pesquisa = () => {
  const { t, i18n } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(initial);
  const [filter, setFilter] = useState<FilterType>("all");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  const updateQuery = (q: string) => {
    setQuery(q);
    const next = new URLSearchParams(params);
    if (q) next.set("q", q);
    else next.delete("q");
    setParams(next, { replace: true });
  };

  const typeMeta: Record<ResultType, { label: string; icon: typeof Search; bg: string; text: string }> = useMemo(
    () => ({
      aluno: { label: tc("nav.students"), icon: Users, bg: "bg-pastel-blue", text: "text-pastel-blue-foreground" },
      professor: { label: tc("nav.teachers"), icon: GraduationCap, bg: "bg-pastel-green", text: "text-pastel-green-foreground" },
      matricula: { label: tc("nav.enrollments"), icon: Receipt, bg: "bg-pastel-yellow", text: "text-pastel-yellow-foreground" },
      curso: { label: tc("nav.courses"), icon: BookOpen, bg: "bg-pastel-lilac", text: "text-pastel-lilac-foreground" },
      turma: { label: tc("nav.classes"), icon: Presentation, bg: "bg-pastel-pink", text: "text-pastel-pink-foreground" },
      evento: { label: tc("nav.events"), icon: CalendarCheck, bg: "bg-pastel-green", text: "text-pastel-green-foreground" },
      avaliacao: { label: tc("nav.assessments"), icon: BookMarked, bg: "bg-pastel-blue", text: "text-pastel-blue-foreground" },
      documento: { label: tc("nav.materials"), icon: FileText, bg: "bg-pastel-yellow", text: "text-pastel-yellow-foreground" },
      mensagem: { label: t("pesquisa.type_mensagens"), icon: MessageSquare, bg: "bg-pastel-lilac", text: "text-pastel-lilac-foreground" },
      notificacao: { label: t("pesquisa.type_notificacoes"), icon: Bell, bg: "bg-pastel-pink", text: "text-pastel-pink-foreground" },
    }),
    [t, tc],
  );

  // Live search against Supabase, debounced
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const localeTag = intlLocaleTagFromLng(i18n.language);
        const formatRel = (iso?: string | null) => {
          if (!iso) return "";
          const d = new Date(iso);
          const diff = Date.now() - d.getTime();
          const min = Math.floor(diff / 60000);
          if (min < 1) return t("shared.relative_now");
          if (min < 60) return t("shared.relative_minutes", { count: min });
          const h = Math.floor(min / 60);
          if (h < 24) return t("shared.relative_hours", { count: h });
          const days = Math.floor(h / 24);
          if (days < 30) return t("shared.relative_days_short", { count: days });
          return d.toLocaleDateString(localeTag);
        };
        const like = `%${q}%`;
        const [
          studentsRes,
          teachersRes,
          coursesRes,
          classroomsRes,
          eventsRes,
          assessmentsRes,
          materialsRes,
          notificationsRes,
          messagesRes,
          enrollmentsRes,
        ] = await Promise.all([
          supabase
            .from("students")
            .select("id, full_name, enrollment_number, email, classrooms(name, grade_level)")
            .or(`full_name.ilike.${like},enrollment_number.ilike.${like},email.ilike.${like}`)
            .limit(20),
          supabase
            .from("teachers")
            .select("id, employee_id, profile:profiles!teachers_profile_id_fkey(full_name, phone), subject:subjects(name)")
            .limit(50),
          supabase
            .from("courses")
            .select("id, name, type, description")
            .or(`name.ilike.${like},description.ilike.${like},type.ilike.${like}`)
            .limit(20),
          supabase
            .from("classrooms")
            .select("id, name, grade_level, period, courses(name)")
            .or(`name.ilike.${like},grade_level.ilike.${like},period.ilike.${like}`)
            .limit(20),
          supabase
            .from("events")
            .select("id, title, type, event_date, location, organizer")
            .or(`title.ilike.${like},location.ilike.${like},organizer.ilike.${like},type.ilike.${like}`)
            .limit(20),
          supabase
            .from("assessments")
            .select("id, title, date, type, classrooms(name), subjects(name)")
            .or(`title.ilike.${like},description.ilike.${like},type.ilike.${like}`)
            .limit(20),
          supabase
            .from("materials")
            .select("id, name, sku, category, location, quantity, unit")
            .or(`name.ilike.${like},sku.ilike.${like},category.ilike.${like},location.ilike.${like}`)
            .limit(20),
          supabase
            .from("notifications")
            .select("id, title, description, category, created_at, link")
            .or(`title.ilike.${like},description.ilike.${like},category.ilike.${like}`)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("messages")
            .select("id, content, created_at, sender:profiles!messages_sender_id_fkey(full_name)")
            .ilike("content", like)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("enrollments")
            .select("id, status, enrolled_at, students(full_name, enrollment_number), classrooms(name)")
            .limit(50),
        ]);

        if (cancelled) return;

        const lower = q.toLowerCase();
        const out: Result[] = [];

        studentsRes.data?.forEach((s: any) => {
          const cls = s.classrooms?.name ?? t("pesquisa.ctx_no_class");
          out.push({
            id: `student-${s.id}`,
            type: "aluno",
            title: s.full_name,
            subtitle: `${cls}${s.enrollment_number ? ` · ${t("pesquisa.ctx_student_number", { num: s.enrollment_number })}` : ""}`,
            context: s.email ?? t("pesquisa.ctx_student"),
            to: "/alunos",
          });
        });

        teachersRes.data?.forEach((teacher: any) => {
          const name: string = teacher.profile?.full_name ?? t("pesquisa.ctx_teacher");
          if (!name.toLowerCase().includes(lower) && !(teacher.employee_id ?? "").toLowerCase().includes(lower) && !(teacher.subject?.name ?? "").toLowerCase().includes(lower)) return;
          out.push({
            id: `teacher-${teacher.id}`,
            type: "professor",
            title: name,
            subtitle: teacher.subject?.name ?? t("pesquisa.ctx_no_subject"),
            context: teacher.employee_id ? t("pesquisa.ctx_teacher_id", { id: teacher.employee_id }) : t("pesquisa.ctx_teacher"),
            to: "/professores",
          });
        });

        coursesRes.data?.forEach((c: any) => {
          out.push({
            id: `course-${c.id}`,
            type: "curso",
            title: c.name,
            subtitle: c.type ?? t("pesquisa.ctx_course_default"),
            context: c.description ?? t("pesquisa.ctx_course_default"),
            to: "/cursos",
          });
        });

        classroomsRes.data?.forEach((c: any) => {
          out.push({
            id: `classroom-${c.id}`,
            type: "turma",
            title: c.name,
            subtitle: [c.grade_level, c.period].filter(Boolean).join(" · ") || t("pesquisa.ctx_class_default"),
            context: c.courses?.name ?? t("pesquisa.ctx_class_default"),
            to: "/turmas",
          });
        });

        eventsRes.data?.forEach((e: any) => {
          out.push({
            id: `event-${e.id}`,
            type: "evento",
            title: e.title,
            subtitle: `${new Date(e.event_date).toLocaleDateString(localeTag)}${e.location ? ` · ${e.location}` : ""}`,
            context: e.organizer ? t("pesquisa.ctx_event_org", { name: e.organizer }) : t("pesquisa.ctx_event_type", { type: e.type }),
            to: "/eventos",
          });
        });

        assessmentsRes.data?.forEach((a: any) => {
          out.push({
            id: `assessment-${a.id}`,
            type: "avaliacao",
            title: a.title,
            subtitle: [a.classrooms?.name, a.subjects?.name].filter(Boolean).join(" · ") || t("pesquisa.ctx_assessment_default"),
            context: `${a.type ?? t("pesquisa.ctx_assessment_default")} · ${new Date(a.date).toLocaleDateString(localeTag)}`,
            to: "/avaliacoes",
          });
        });

        materialsRes.data?.forEach((m: any) => {
          out.push({
            id: `material-${m.id}`,
            type: "documento",
            title: m.name,
            subtitle: `${m.category}${m.sku ? ` · ${m.sku}` : ""}`,
            context: `${m.quantity} ${m.unit}${m.location ? ` · ${m.location}` : ""}`,
            to: "/material",
          });
        });

        notificationsRes.data?.forEach((n: any) => {
          out.push({
            id: `notification-${n.id}`,
            type: "notificacao",
            title: n.title,
            subtitle: n.description ?? n.category,
            context: `${t("pesquisa.ctx_notification")} · ${formatRel(n.created_at)}`,
            to: n.link ?? "/notificacoes",
          });
        });

        messagesRes.data?.forEach((m: any) => {
          out.push({
            id: `message-${m.id}`,
            type: "mensagem",
            title: m.sender?.full_name ?? t("pesquisa.ctx_message"),
            subtitle: `"${(m.content ?? "").slice(0, 80)}"`,
            context: `${t("pesquisa.ctx_message")} · ${formatRel(m.created_at)}`,
            to: "/chat",
          });
        });

        enrollmentsRes.data?.forEach((e: any) => {
          const name = e.students?.full_name ?? "";
          const num = e.students?.enrollment_number ?? "";
          if (!name.toLowerCase().includes(lower) && !num.toLowerCase().includes(lower)) return;
          out.push({
            id: `enrollment-${e.id}`,
            type: "matricula",
            title: num ? t("pesquisa.ctx_enrollment_title_num", { num }) : t("pesquisa.ctx_enrollment_title"),
            subtitle: `${name}${e.classrooms?.name ? ` · ${e.classrooms.name}` : ""}`,
            context: t("pesquisa.ctx_enrollment_status", {
              status: e.status ?? t("pesquisa.ctx_enrollment_title"),
              when: formatRel(e.enrolled_at),
            }),
            to: "/matriculas",
          });
        });

        setResults(out);
      } catch (err) {
        console.error("Erro na pesquisa:", err);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, t, i18n.language, tc]);

  const filtered = useMemo(() => {
    if (filter === "all") return results;
    return results.filter((r) => r.type === filter);
  }, [results, filter]);

  const grouped = useMemo(() => {
    const map = new Map<ResultType, Result[]>();
    filtered.forEach((r) => {
      const arr = map.get(r.type) ?? [];
      arr.push(r);
      map.set(r.type, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<FilterType, number> = { all: results.length } as Record<FilterType, number>;
    (Object.keys(typeMeta) as ResultType[]).forEach((rt) => (c[rt] = results.filter((r) => r.type === rt).length));
    return c;
  }, [results, typeMeta]);

  const filterTabs: { id: FilterType; label: string }[] = useMemo(
    () => [
      { id: "all", label: tc("shared.all") },
      ...(Object.keys(typeMeta) as ResultType[]).map((k) => ({ id: k as FilterType, label: typeMeta[k].label })),
    ],
    [typeMeta, tc],
  );

  const suggestionChips = useMemo(() => t("pesquisa.suggestions", { returnObjects: true }) as string[], [t]);

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("pesquisa.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("pesquisa.subtitle")}</p>
        </div>

        {/* Big input */}
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <div className="relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              maxLength={200}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder={t("pesquisa.placeholder")}
              className="h-14 w-full rounded-2xl border border-border bg-background pl-14 pr-14 text-base shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {query && (
              <button
                onClick={() => updateQuery("")}
                aria-label={t("shared.clear_search_aria")}
                className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="mt-4 flex flex-wrap gap-2">
            {filterTabs.map((tab) => {
              const active = filter === tab.id;
              const count = counts[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-pastel-blue-foreground bg-pastel-blue text-pastel-blue-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {tab.label}
                  <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-card/70" : "bg-muted")}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Resultados */}
        {!query.trim() ? (
          <div className="rounded-2xl bg-card p-12 text-center shadow-card">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Search className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">{t("pesquisa.hint_title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("pesquisa.hint_body")}</p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestionChips.map((s) => (
                <button
                  key={s}
                  onClick={() => updateQuery(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : loading ? (
          <div className="rounded-2xl bg-card p-12 text-center shadow-card">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" strokeWidth={1.5} />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">{t("pesquisa.searching")}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-card p-12 text-center shadow-card">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pastel-pink text-pastel-pink-foreground">
              <Search className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">{t("pesquisa.no_results_title", { query })}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("pesquisa.no_results_hint")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              {t("pesquisa.result_count", { count: filtered.length, query })}
            </p>

            {grouped.map(([type, items]) => {
              const meta = typeMeta[type];
              const Icon = meta.icon;
              return (
                <section key={type} className="overflow-hidden rounded-2xl bg-card shadow-card">
                  <header className="flex items-center justify-between border-b border-border px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", meta.bg, meta.text)}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{items.length}</span>
                    </div>
                  </header>
                  <ul className="divide-y divide-border">
                    {items.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => navigate(r.to)}
                          className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
                        >
                          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.bg, meta.text)}>
                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{r.context}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.75} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default Pesquisa;