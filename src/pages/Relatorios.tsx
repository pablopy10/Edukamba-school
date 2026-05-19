import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  CalendarDays,
  GraduationCap,
  ClipboardList,
  UserCheck,
  Boxes,
  Package,
  School,
  Activity,
  Download,
  Filter,
  Search,
  FileSpreadsheet,
  FileText,
  Calendar,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAcademicYear } from "@/context/AcademicYearContext";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { dateLocaleTag } from "@/lib/i18nDateLocale";

type ReportKey =
  | "alunos"
  | "presencas"
  | "notas"
  | "professores"
  | "pedidos_ausencia"
  | "pedidos_material"
  | "stock"
  | "eventos"
  | "atividades";

type ReportMeta = {
  key: ReportKey;
  label: string;
  description: string;
  icon: typeof Users;
  color: string;
};

const REPORT_DEFS: Omit<ReportMeta, "label" | "description">[] = [
  { key: "alunos", icon: Users, color: "bg-pastel-blue text-pastel-blue-foreground" },
  { key: "presencas", icon: UserCheck, color: "bg-pastel-green text-pastel-green-foreground" },
  { key: "notas", icon: GraduationCap, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  { key: "professores", icon: School, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
  { key: "pedidos_ausencia", icon: ClipboardList, color: "bg-pastel-pink text-pastel-pink-foreground" },
  { key: "pedidos_material", icon: Package, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  { key: "stock", icon: Boxes, color: "bg-pastel-blue text-pastel-blue-foreground" },
  { key: "eventos", icon: CalendarDays, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
  { key: "atividades", icon: Activity, color: "bg-pastel-green text-pastel-green-foreground" },
];

const Relatorios = () => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "relatorios" });
  const emDash = t("em_dash");
  const dateLocale = dateLocaleTag(i18n.language);

  const fmtDate = useCallback(
    (d: string | null | undefined) =>
      d ? new Date(d).toLocaleDateString(dateLocale) : emDash,
    [dateLocale, emDash],
  );

  const reports = useMemo<ReportMeta[]>(
    () =>
      REPORT_DEFS.map((r) => ({
        ...r,
        label: t(`reports.${r.key}.label`),
        description: t(`reports.${r.key}.description`),
      })),
    [t],
  );

  const colHeaders = useCallback(
    (report: ReportKey, keys: string[]) => keys.map((k) => t(`columns.${report}.${k}`)),
    [t],
  );

  const attendanceLabel = useCallback(
    (status: string) => t(`attendance_status.${status}`, { defaultValue: status }),
    [t],
  );

  const absenceStatusLabel = useCallback(
    (status: string) => t(`absence_status.${status}`, { defaultValue: status }),
    [t],
  );

  const materialStatusLabel = useCallback(
    (status: string) => t(`material_request_status.${status}`, { defaultValue: status }),
    [t],
  );

  const { user } = useAuth();
  const { selectedYearId } = useAcademicYear();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string>("");
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<ReportKey>("alunos");
  const [search, setSearch] = useState("");
  const [turma, setTurma] = useState("all");
  const [curso, setCurso] = useState("all");
  const [estado, setEstado] = useState("all");
  const [professorFilter, setProfessorFilter] = useState("all");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const estadoFilterLabel = useCallback(
    (value: string) => {
      switch (active) {
        case "presencas":
          return attendanceLabel(value);
        case "professores":
          return t(`teacher_filter.${value}`, { defaultValue: value });
        case "pedidos_ausencia":
          return absenceStatusLabel(value);
        case "pedidos_material":
          return materialStatusLabel(value);
        case "stock":
          return t(`stock_filter.${value}`, { defaultValue: value });
        default:
          return value;
      }
    },
    [active, attendanceLabel, absenceStatusLabel, materialStatusLabel, t],
  );

  // Raw data
  const [students, setStudents] = useState<any[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [attendance, setAttendance] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [matRequests, setMatRequests] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      const sid = effectiveSchoolIdFromProfile(profile);
      if (!sid) { setLoading(false); return; }
      setSchoolId(sid);
      setRole(profile?.role ?? null);
      const [school, st, cls, crs, prof, att, gr, asm, sub, tch, abs, mr, mat, ev, act] = await Promise.all([
        supabase.from("schools").select("name").eq("id", sid).maybeSingle(),
        supabase.from("students").select("*").eq("school_id", sid),
        (selectedYearId
          ? supabase.from("classrooms").select("id, name, course_id").eq("school_id", sid).eq("academic_year_id", selectedYearId)
          : supabase.from("classrooms").select("id, name, course_id").eq("school_id", sid)),
        supabase.from("courses").select("id, name").eq("school_id", sid),
        supabase.from("profiles").select("id, full_name").eq("school_id", sid),
        supabase.from("attendance").select("*").eq("school_id", sid),
        supabase.from("grades").select("*"),
        supabase.from("assessments").select("*").eq("school_id", sid),
        supabase.from("subjects").select("id, name").eq("school_id", sid),
        supabase.from("teachers").select("*").eq("school_id", sid),
        supabase.from("staff_absences").select("*").eq("school_id", sid),
        supabase.from("material_requests").select("*").eq("school_id", sid),
        supabase.from("materials").select("*").eq("school_id", sid),
        supabase.from("events").select("*").eq("school_id", sid),
        supabase.from("extracurricular_activities").select("*").eq("school_id", sid),
      ]);
      setSchoolName(school.data?.name ?? "");
      setStudents(st.data ?? []);
      setClassrooms(cls.data ?? []);
      setCourses(crs.data ?? []);
      const pm = new Map<string, string>();
      (prof.data ?? []).forEach((p: any) => pm.set(p.id, p.full_name));
      setProfilesMap(pm);
      setAttendance(att.data ?? []);
      setGrades(gr.data ?? []);
      setAssessments(asm.data ?? []);
      setSubjects(sub.data ?? []);
      setTeachers(tch.data ?? []);
      setAbsences(abs.data ?? []);
      setMatRequests(mr.data ?? []);
      setMaterials(mat.data ?? []);
      setEvents(ev.data ?? []);
      setActivities(act.data ?? []);
      setLoading(false);
    };
    load();
  }, [user?.id, selectedYearId]);

  const isAdmin = isSchoolManagementRole(role);

  const meta = reports.find((r) => r.key === active)!;

  // Lookup helpers
  const classroomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name ?? emDash;
  const courseName = (id: string | null) => courses.find((c) => c.id === id)?.name ?? emDash;
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name ?? emDash;
  const studentName = (id: string | null) => students.find((s) => s.id === id)?.full_name ?? emDash;
  const profileName = (id: string | null) => (id ? profilesMap.get(id) ?? emDash : emDash);

  const estadoOptionsByReport = useMemo<Record<ReportKey, { value: string; label: string }[]>>(() => ({
    alunos: [],
    presencas: (["PRESENT", "ABSENT", "LATE", "JUSTIFIED"] as const).map((value) => ({
      value,
      label: t(`attendance_status.${value}`),
    })),
    notas: [],
    professores: (["active", "inactive"] as const).map((value) => ({
      value,
      label: t(`teacher_filter.${value}`),
    })),
    pedidos_ausencia: (["PENDING", "APPROVED", "REJECTED"] as const).map((value) => ({
      value,
      label: t(`absence_status.${value}`),
    })),
    pedidos_material: (["pendente", "aprovado", "rejeitado", "entregue"] as const).map((value) => ({
      value,
      label: t(`material_request_status.${value}`),
    })),
    stock: [{ value: "low", label: t("stock_filter.low") }],
    eventos: [],
    atividades: [],
  }), [t]);

  const teacherOptions = useMemo(() => {
    return teachers
      .map((tch) => ({ id: tch.profile_id, name: profilesMap.get(tch.profile_id) ?? emDash }))
      .filter((tch) => tch.id);
  }, [teachers, profilesMap, emDash]);

  const inDate = (d: string | null | undefined) => {
    if (!d) return !dataInicio && !dataFim;
    if (dataInicio && d < dataInicio) return false;
    if (dataFim && d > dataFim) return false;
    return true;
  };

  const { columns, rows } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchText = (...parts: (string | number | null | undefined)[]) =>
      !q || parts.some((p) => String(p ?? "").toLowerCase().includes(q));

    switch (active) {
      case "alunos": {
        const data = students.filter((s) => {
          if (turma !== "all" && s.classroom_id !== turma) return false;
          if (curso !== "all") {
            const cls = classrooms.find((c) => c.id === s.classroom_id);
            if (cls?.course_id !== curso) return false;
          }
          return matchText(s.full_name, s.email, s.phone, s.enrollment_number);
        });
        return {
          columns: colHeaders("alunos", ["numero", "nome", "turma", "curso", "data_nasc", "email", "telefone", "encarregado"]),
          rows: data.map((s) => {
            const cls = classrooms.find((c) => c.id === s.classroom_id);
            return [
              s.enrollment_number ?? emDash,
              s.full_name,
              cls?.name ?? emDash,
              cls ? courseName(cls.course_id) : emDash,
              fmtDate(s.birth_date),
              s.email ?? emDash,
              s.phone ?? emDash,
              profileName(s.parent_id),
            ];
          }),
        };
      }
      case "presencas": {
        const data = attendance.filter((a) => {
          if (turma !== "all" && a.classroom_id !== turma) return false;
          if (estado !== "all" && a.status !== estado) return false;
          if (!inDate(a.date)) return false;
          const sName = studentName(a.student_id);
          return matchText(sName, a.notes);
        });
        return {
          columns: colHeaders("presencas", ["data", "aluno", "turma", "estado", "professor", "notas"]),
          rows: data.map((a) => [
            fmtDate(a.date),
            studentName(a.student_id),
            classroomName(a.classroom_id),
            attendanceLabel(a.status),
            profileName(a.teacher_id),
            a.notes ?? emDash,
          ]),
        };
      }
      case "notas": {
        const data = grades.filter((g) => {
          const a = assessments.find((x) => x.id === g.assessment_id);
          if (!a) return false;
          if (turma !== "all" && a.classroom_id !== turma) return false;
          if (!inDate(a.date)) return false;
          const sName = studentName(g.student_id);
          return matchText(sName, a.title, subjectName(a.subject_id));
        });
        return {
          columns: colHeaders("notas", ["data", "aluno", "turma", "disciplina", "avaliacao", "nota"]),
          rows: data.map((g) => {
            const a = assessments.find((x) => x.id === g.assessment_id);
            return [
              fmtDate(a?.date),
              studentName(g.student_id),
              classroomName(a?.classroom_id ?? null),
              subjectName(a?.subject_id ?? null),
              a?.title ?? emDash,
              g.score,
            ];
          }),
        };
      }
      case "professores": {
        const data = teachers.filter((tch) => {
          if (estado === "active" && !tch.is_active) return false;
          if (estado === "inactive" && tch.is_active) return false;
          return matchText(profileName(tch.profile_id), tch.employee_id, subjectName(tch.subject_id));
        });
        return {
          columns: colHeaders("professores", ["nome", "numero_funcionario", "disciplina", "data_contratacao", "estado"]),
          rows: data.map((tch) => [
            profileName(tch.profile_id),
            tch.employee_id ?? emDash,
            subjectName(tch.subject_id),
            fmtDate(tch.hire_date),
            tch.is_active ? t("teacher_status.active") : t("teacher_status.inactive"),
          ]),
        };
      }
      case "pedidos_ausencia": {
        const data = absences.filter((a) => {
          if (estado !== "all" && a.status !== estado) return false;
          if (dataInicio && a.end_date < dataInicio) return false;
          if (dataFim && a.start_date > dataFim) return false;
          return matchText(profileName(a.profile_id ?? a.requester_id), a.reason, a.description);
        });
        return {
          columns: colHeaders("pedidos_ausencia", ["funcionario", "motivo", "inicio", "fim", "estado", "descricao"]),
          rows: data.map((a) => [
            profileName(a.profile_id ?? a.requester_id),
            a.reason,
            fmtDate(a.start_date),
            fmtDate(a.end_date),
            absenceStatusLabel(a.status),
            a.description ?? emDash,
          ]),
        };
      }
      case "pedidos_material": {
        const data = matRequests.filter((r) => {
          if (estado !== "all" && r.status !== estado) return false;
          if (professorFilter !== "all" && r.requester_id !== professorFilter) return false;
          if (turma !== "all" && r.classroom_id !== turma) return false;
          if (!inDate(r.needed_date)) return false;
          return matchText(r.item_name, r.teacher_name, r.recipient, r.description);
        });
        return {
          columns: colHeaders("pedidos_material", ["material", "qtd", "professor", "turma", "aluno", "dia", "estado"]),
          rows: data.map((r) => [
            r.item_name,
            r.quantity,
            r.teacher_name ?? profileName(r.requester_id),
            classroomName(r.classroom_id),
            r.student_id ? studentName(r.student_id) : emDash,
            fmtDate(r.needed_date),
            materialStatusLabel(r.status),
          ]),
        };
      }
      case "stock": {
        const data = materials.filter((m) => {
          if (estado === "low" && !(m.quantity < m.min_quantity)) return false;
          return matchText(m.name, m.sku, m.category, m.location);
        });
        return {
          columns: colHeaders("stock", ["nome", "categoria", "sku", "quantidade", "minimo", "unidade", "localizacao"]),
          rows: data.map((m) => [m.name, m.category, m.sku ?? emDash, m.quantity, m.min_quantity, m.unit, m.location ?? emDash]),
        };
      }
      case "eventos": {
        const data = events.filter((e) => {
          if (!inDate(e.event_date)) return false;
          return matchText(e.title, e.type, e.location, e.organizer);
        });
        return {
          columns: colHeaders("eventos", ["data", "titulo", "tipo", "localizacao", "organizador", "audiencia"]),
          rows: data.map((e) => [fmtDate(e.event_date), e.title, e.type, e.location ?? emDash, e.organizer ?? emDash, e.audience ?? emDash]),
        };
      }
      case "atividades": {
        const data = activities.filter((a) => {
          return matchText(a.name, a.category, a.responsible, a.location);
        });
        return {
          columns: colHeaders("atividades", ["nome", "categoria", "responsavel", "localizacao", "capacidade", "recorrente"]),
          rows: data.map((a) => [
            a.name,
            a.category,
            a.responsible ?? emDash,
            a.location ?? emDash,
            a.capacity,
            a.is_recurring ? t("yes") : t("no"),
          ]),
        };
      }
    }
  }, [
    active,
    search,
    turma,
    curso,
    estado,
    professorFilter,
    dataInicio,
    dataFim,
    students,
    classrooms,
    courses,
    attendance,
    grades,
    assessments,
    subjects,
    teachers,
    absences,
    matRequests,
    materials,
    events,
    activities,
    profilesMap,
    colHeaders,
    fmtDate,
    emDash,
    attendanceLabel,
    absenceStatusLabel,
    materialStatusLabel,
    t,
  ]);

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (search) parts.push(t("filter_summary.search", { value: search }));
    if (turma !== "all") parts.push(t("filter_summary.classroom", { value: classroomName(turma) }));
    if (curso !== "all") parts.push(t("filter_summary.course", { value: courseName(curso) }));
    if (estado !== "all") parts.push(t("filter_summary.status", { value: estadoFilterLabel(estado) }));
    if (professorFilter !== "all") parts.push(t("filter_summary.teacher", { value: profileName(professorFilter) }));
    if (dataInicio) parts.push(t("filter_summary.from", { value: fmtDate(dataInicio) }));
    if (dataFim) parts.push(t("filter_summary.to", { value: fmtDate(dataFim) }));
    return parts;
  }, [search, turma, curso, estado, professorFilter, dataInicio, dataFim, classrooms, courses, profilesMap, t, fmtDate, estadoFilterLabel]);

  const exportXLSX = () => {
    const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, meta.label.slice(0, 31));
    const filename = `relatorio-${active}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast({
      title: t("toast.excel_title"),
      description: t("toast.excel_description", { label: meta.label, count: rows.length }),
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(schoolName || t("pdf.default_title"), 40, 40);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(t("pdf.report_title", { label: meta.label }), 40, 58);

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(
      t("pdf.generated_at", { date: new Date().toLocaleString(dateLocale) }),
      pageWidth - 40,
      40,
      { align: "right" },
    );
    doc.text(
      t("pdf.records_count", { count: rows.length }),
      pageWidth - 40,
      54,
      { align: "right" },
    );

    if (filtersSummary.length) {
      doc.setFontSize(8);
      doc.setTextColor(80);
      doc.text(`${t("pdf.filters_prefix")} ${filtersSummary.join(" · ")}`, 40, 75, { maxWidth: pageWidth - 80 });
    }

    autoTable(doc, {
      head: [columns],
      body: rows.map((r) => r.map((c) => (c == null ? emDash : String(c)))),
      startY: filtersSummary.length ? 90 : 75,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      margin: { left: 40, right: 40 },
    });

    const filename = `relatorio-${active}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    toast({
      title: t("toast.pdf_title"),
      description: t("toast.pdf_description", { label: meta.label, count: rows.length }),
    });
  };

  // Visibility of filters per report
  const showTurma = ["alunos", "presencas", "notas", "pedidos_material"].includes(active);
  const showCurso = active === "alunos";
  const showEstado = (estadoOptionsByReport[active] ?? []).length > 0;
  const showProfessor = active === "pedidos_material";
  const showDate = ["presencas", "notas", "pedidos_ausencia", "pedidos_material", "eventos"].includes(active);

  if (!loading && !isAdmin) {
    return (
      <>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <ShieldAlert className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">{t("access_denied.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("access_denied.message")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPDF}
            disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-[var(--transition-smooth)]"
          >
            <FileText className="h-4 w-4" /> {t("export.pdf")}
          </button>
          <button
            onClick={exportXLSX}
            disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90 transition-[var(--transition-smooth)]"
          >
            <FileSpreadsheet className="h-4 w-4" /> {t("export.excel")}
          </button>
        </div>
      </div>

      {/* Report selector cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5">
        {reports.map((r) => {
          const Icon = r.icon;
          const isActive = active === r.key;
          return (
            <button
              key={r.key}
              onClick={() => {
                setActive(r.key);
                setEstado("all");
                setTurma("all");
                setCurso("all");
                setProfessorFilter("all");
              }}
              className={cn(
                "group flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-[var(--transition-smooth)]",
                isActive
                  ? "border-primary bg-card shadow-card ring-2 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40 hover:shadow-soft",
              )}
            >
              <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl", r.color)}>
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{r.label}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{r.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" /> {t("filters.title")}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("filters.search_placeholder")}
              className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {showTurma && (
            <select
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t("filters.all_classrooms")}</option>
              {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {showCurso && (
            <select
              value={curso}
              onChange={(e) => setCurso(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t("filters.all_courses")}</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {showEstado && (
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t("filters.all_statuses")}</option>
              {estadoOptionsByReport[active].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}

          {showProfessor && (
            <select
              value={professorFilter}
              onChange={(e) => setProfessorFilter(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{t("filters.all_teachers")}</option>
              {teacherOptions.map((tch) => <option key={tch.id} value={tch.id}>{tch.name}</option>)}
            </select>
          )}

          {showDate && (
            <>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Result table */}
      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", meta.color)}>
              <meta.icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">{t("table.report_title", { label: meta.label })}</h2>
              <p className="text-xs text-muted-foreground">
                {loading ? t("table.loading") : t("table.records_found", { count: rows.length })}
              </p>
            </div>
          </div>
          <button
            onClick={exportXLSX}
            disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-[var(--transition-smooth)]"
          >
            <Download className="h-3.5 w-3.5" /> {t("export.download")}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {columns.map((c) => (
                  <th key={c} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {t("table.loading_data")}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    {t("table.empty")}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className="px-5 py-3 text-foreground">
                        {cell == null || cell === "" ? emDash : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </>
  );
};

export default Relatorios;
