import { useCallback, useEffect, useMemo, useState } from "react";
import type { TooltipProps } from "recharts";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip, LabelList } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { sortByName, cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";

interface Classroom {
  id: string;
  name: string;
}

interface WeekBucket {
  week: string;
  present: number;
  absent: number;
}

/** Fallback se JSON não devolver array (12 meses Jan–Dez). */
const CHART_MONTHS_FALLBACK_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** Índice 0–11 a partir da parte calendário YYYY-MM-DD (sem UTC). */
const calendarMonthIndexFromIso = (dateStr: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return month - 1;
};

/** Presentes vs ausentes alinhado com Presencas.tsx (status). */
const bucketAttendance = (status: string | null, notes: string | null): "present" | "absent" => {
  const s = (status ?? "").trim().toUpperCase();
  const n = (notes ?? "").toUpperCase();
  if (s === "ABSENT" || s === "DISCIPLINARY" || s === "JUSTIFIED") return "absent";
  if (s === "PRESENT" || s === "LATE") return "present";
  if (n.includes("ABSEN") || n.includes("FALT")) return "absent";
  return "present";
};

function attendanceFromTooltipPayload(payload: TooltipProps<number, string>["payload"]): {
  present: number;
  absent: number;
  monthLabel: string;
} | null {
  if (!payload?.length) return null;
  /** Em barras agrupadas o valor fiável está em `payload` da série (linha do gráfico), não só em `entry.value`. */
  const row = payload[0]?.payload as WeekBucket | undefined;
  if (!row) return null;
  const present = Number(row.present ?? 0);
  const absent = Number(row.absent ?? 0);
  return { present, absent, monthLabel: row.week ?? "" };
}

function AttendanceTooltip({ active, payload, label }: TooltipProps<number, string>) {
  const { t } = useTranslation("common");
  if (!active) return null;
  const stats = attendanceFromTooltipPayload(payload);
  if (!stats) return null;
  const { present, absent, monthLabel } = stats;
  const header = typeof label === "string" && label.trim() ? label : monthLabel;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-2.5 shadow-card",
        "text-sm text-foreground",
      )}
    >
      <p className="mb-1.5 border-b border-border pb-1 text-xs font-bold uppercase tracking-wide text-foreground">
        {header}
      </p>
      <ul className="flex flex-col gap-1">
        <li className="flex items-center justify-between gap-6 font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: "hsl(var(--pastel-yellow))" }}
            />
            <span style={{ color: "hsl(var(--pastel-yellow-foreground))" }}>{t("dashboard.attendance.present")}</span>
          </span>
          <span className="tabular-nums text-base font-bold text-foreground">{present}</span>
        </li>
        <li className="flex items-center justify-between gap-6 font-semibold text-foreground">
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: "hsl(var(--pastel-blue))" }}
            />
            <span style={{ color: "hsl(var(--pastel-blue-foreground))" }}>{t("dashboard.attendance.absent")}</span>
          </span>
          <span className="tabular-nums text-base font-bold text-foreground">{absent}</span>
        </li>
      </ul>
    </div>
  );
}

function barCountLabel(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n));
}

const isUuidLike = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export const AttendanceCard = () => {
  const { t, i18n } = useTranslation("common");
  const chartMonthsShort = useMemo(() => {
    const arr = t("dashboard.chart_months_short", { returnObjects: true });
    return Array.isArray(arr) && arr.length === 12 ? (arr as string[]) : CHART_MONTHS_FALLBACK_PT;
  }, [t, i18n.language]);

  const makeEmptyMonths = useCallback(
    (): WeekBucket[] => chartMonthsShort.map((week) => ({ week, present: 0, absent: 0 })),
    [chartMonthsShort],
  );

  const { selectedYear, selectedYearId, schoolId, loading: academicYearLoading } = useAcademicYear();
  const { role, loading: roleLoading } = useUserRole();
  /** Evita tratar como admin antes do perfil estar definido (cache/async). */
  const teacherMode = !roleLoading && role === "TEACHER";
  const { classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("ALL");
  const [data, setData] = useState<WeekBucket[]>(() =>
    CHART_MONTHS_FALLBACK_PT.map((week) => ({ week, present: 0, absent: 0 })),
  );

  /** Limites estritos do ano letivo (YYYY-MM-DD). */
  const dateBounds = useMemo(() => {
    const clip = (s: string) => s.trim().slice(0, 10);
    if (selectedYear) {
      let start = clip(selectedYear.start_date);
      let end = clip(selectedYear.end_date);
      if (start > end) {
        const t = start;
        start = end;
        end = t;
      }
      return { start, end };
    }
    const now = new Date();
    const y = now.getFullYear();
    return {
      start: `${y}-01-01`,
      end: `${y}-12-31`,
    };
  }, [selectedYear]);

  /**
   * Intervalo usado na query: envolve os anos civis de início e fim do ano letivo
   * (ex. Set/2025–Jun/2026 → 2025-01-01 … 2026-12-31) para não perder meses se
   * `end_date` na BD estiver incorreto; o gráfico continua a agregar por mês civil.
   */
  const queryDateBounds = useMemo(() => {
    if (!selectedYear) return dateBounds;
    const ys = Number(dateBounds.start.slice(0, 4));
    const ye = Number(dateBounds.end.slice(0, 4));
    if (!Number.isFinite(ys) || !Number.isFinite(ye)) return dateBounds;
    const yLo = Math.min(ys, ye);
    const yHi = Math.max(ys, ye);
    return { start: `${yLo}-01-01`, end: `${yHi}-12-31` };
  }, [selectedYear, dateBounds.start, dateBounds.end]);

  // Turmas no select: admin = todas do ano; professor = só turmas com horário (schedules) ∩ ano letivo atual.
  useEffect(() => {
    if (roleLoading) return;

    if (!selectedYearId) {
      setClassrooms([]);
      setClassroomId(teacherMode ? "" : "ALL");
      return;
    }

    if (teacherMode) {
      if (teacherLoading) return;
      if (teacherClassroomIds.length === 0) {
        setClassrooms([]);
        setClassroomId("");
        return;
      }
      let cancelled = false;
      void supabase
        .from("classrooms")
        .select("id, name")
        .eq("academic_year_id", selectedYearId)
        .in("id", teacherClassroomIds)
        .order("name", { ascending: true })
        .then(({ data: rows }) => {
          if (cancelled) return;
          const list = sortByName(rows ?? []);
          setClassrooms(list);
          setClassroomId((prev) => {
            if (list.length === 0) return "";
            if (prev && prev !== "ALL" && list.some((c) => c.id === prev)) return prev;
            return list[0].id;
          });
        });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    void supabase
      .from("classrooms")
      .select("id, name")
      .eq("academic_year_id", selectedYearId)
      .order("name", { ascending: true })
      .then(({ data: rows }) => {
        if (cancelled) return;
        setClassrooms(rows ?? []);
        setClassroomId("ALL");
      });
    return () => {
      cancelled = true;
    };
  }, [roleLoading, teacherMode, selectedYearId, teacherLoading, teacherClassroomIds.join(",")]);

  useEffect(() => {
    setData((prev) => {
      const empty = makeEmptyMonths();
      if (prev.length !== 12) return empty;
      return prev.map((row, i) => ({ ...row, week: chartMonthsShort[i] ?? row.week }));
    });
  }, [chartMonthsShort, makeEmptyMonths]);

  const aggregateRows = useCallback((rows: { date: string; status: string | null; notes: string | null }[]) => {
    const months = makeEmptyMonths();
    const toDateKey = (raw: unknown): string => {
      if (typeof raw === "string") return raw;
      if (raw instanceof Date) {
        const y = raw.getFullYear();
        const m = String(raw.getMonth() + 1).padStart(2, "0");
        const d = String(raw.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
      return String(raw ?? "");
    };
    for (const row of rows) {
      const monthIdx = calendarMonthIndexFromIso(toDateKey(row.date));
      if (monthIdx === null) continue;
      const side = bucketAttendance(row.status, row.notes);
      if (side === "absent") months[monthIdx].absent += 1;
      else months[monthIdx].present += 1;
    }
    return months;
  }, [makeEmptyMonths]);

  useEffect(() => {
    const load = async () => {
      if (roleLoading) {
        setData(makeEmptyMonths());
        return;
      }

      /** Evita intervalo só com ano civil (errado) antes de `academic_years` estar resolvido. */
      if (academicYearLoading) {
        setData(makeEmptyMonths());
        return;
      }

      if (!schoolId) {
        setData(makeEmptyMonths());
        return;
      }

      if (teacherMode) {
        /** Estado inicial é "ALL"; professores nunca usam todas as turmas — esperar UUID real. */
        if (teacherLoading || !classroomId || classroomId === "ALL" || !isUuidLike(classroomId)) {
          setData(makeEmptyMonths());
          return;
        }
        let query = supabase
          .from("attendance")
          .select("date, notes, status, classroom_id")
          .gte("date", queryDateBounds.start)
          .lte("date", queryDateBounds.end)
          .eq("classroom_id", classroomId)
          .order("date", { ascending: true });

        const { data: rows, error } = await query;
        if (error) {
          console.error("AttendanceCard load", error);
          setData(makeEmptyMonths());
          return;
        }
        setData(aggregateRows((rows ?? []) as { date: string; status: string | null; notes: string | null }[]));
        return;
      }

      let query = supabase
        .from("attendance")
        .select("date, notes, status, classroom_id")
        .gte("date", queryDateBounds.start)
        .lte("date", queryDateBounds.end)
        .order("date", { ascending: true });

      if (classroomId !== "ALL") {
        query = query.eq("classroom_id", classroomId);
      }

      const { data: rows, error } = await query;
      if (error) {
        console.error("AttendanceCard load", error);
        setData(makeEmptyMonths());
        return;
      }
      setData(aggregateRows((rows ?? []) as { date: string; status: string | null; notes: string | null }[]));
    };

    void load();
  }, [
    aggregateRows,
    academicYearLoading,
    classroomId,
    queryDateBounds.start,
    queryDateBounds.end,
    schoolId,
    teacherMode,
    teacherLoading,
    roleLoading,
    makeEmptyMonths,
  ]);

  const maxValue = Math.max(10, ...data.flatMap((d) => [d.present, d.absent]));
  const yMax = Math.ceil(maxValue / 5) * 5 || 10;
  const isEmpty = data.every((d) => d.present === 0 && d.absent === 0);

  const teacherSelectDisabled = teacherMode && (classrooms.length === 0 || !classroomId);

  const presentLabel = t("dashboard.attendance.present");
  const absentLabel = t("dashboard.attendance.absent");

  return (
    <div className="flex h-full flex-col gap-5 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">{t("dashboard.attendance.title")}</h3>
        <Select
          value={teacherMode ? classroomId || undefined : classroomId}
          onValueChange={setClassroomId}
          disabled={teacherSelectDisabled}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] rounded-full border-border bg-background px-3 text-xs font-medium disabled:opacity-60">
            <SelectValue
              placeholder={teacherMode ? t("dashboard.attendance.placeholder_no_classes") : t("dashboard.attendance.placeholder_class")}
            />
          </SelectTrigger>
          <SelectContent>
            {!teacherMode && <SelectItem value="ALL">{t("dashboard.attendance.all_classes")}</SelectItem>}
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {teacherMode && classrooms.length === 0 && !teacherLoading && (
        <p className="text-xs text-muted-foreground">{t("dashboard.attendance.teacher_no_schedules")}</p>
      )}

      <div className="flex items-center gap-5 text-xs font-medium text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-yellow" /> {presentLabel}
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-blue" /> {absentLabel}
        </div>
      </div>

      <div className="h-64 w-full min-h-[240px] touch-pan-x">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="25%" margin={{ top: 20, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} domain={[0, yMax]} allowDecimals={false} />
            <Tooltip<number, string>
              cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
              content={(props) => <AttendanceTooltip {...props} />}
            />
            <Bar dataKey="present" name={presentLabel} fill="hsl(var(--pastel-yellow))" radius={[8, 8, 0, 0]} stroke="hsl(var(--pastel-yellow-foreground) / 0.25)" strokeWidth={1}>
              <LabelList
                dataKey="present"
                position="top"
                fill="hsl(var(--foreground))"
                fontSize={11}
                formatter={barCountLabel}
              />
            </Bar>
            <Bar dataKey="absent" name={absentLabel} fill="hsl(var(--pastel-blue))" radius={[8, 8, 0, 0]} stroke="hsl(var(--pastel-blue-foreground) / 0.35)" strokeWidth={1}>
              <LabelList
                dataKey="absent"
                position="top"
                fill="hsl(var(--foreground))"
                fontSize={11}
                formatter={barCountLabel}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {isEmpty && (
        <p className="text-center text-xs text-muted-foreground">{t("dashboard.attendance.empty_hint")}</p>
      )}
    </div>
  );
};
