import { useCallback, useEffect, useMemo, useState } from "react";
import type { TooltipProps } from "recharts";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";
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

interface Classroom {
  id: string;
  name: string;
}

interface WeekBucket {
  week: string;
  present: number;
  absent: number;
}

const monthShort = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const emptyMonths = (): WeekBucket[] =>
  Array.from({ length: 12 }, (_, i) => ({
    week: monthShort[i],
    present: 0,
    absent: 0,
  }));

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

const CHART_LIMIT = 25000;

function AttendanceTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-2.5 shadow-card",
        "text-sm text-foreground",
      )}
    >
      <p className="mb-1.5 border-b border-border pb-1 text-xs font-bold uppercase tracking-wide text-foreground">
        {label}
      </p>
      <ul className="flex flex-col gap-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? "");
          const labelPt = key === "present" ? "Presentes" : key === "absent" ? "Ausentes" : key;
          const color =
            key === "present"
              ? "hsl(var(--pastel-yellow-foreground))"
              : key === "absent"
                ? "hsl(var(--pastel-blue-foreground))"
                : "hsl(var(--foreground))";
          return (
            <li key={key} className="flex items-center justify-between gap-6 font-semibold text-foreground">
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      key === "present" ? "hsl(var(--pastel-yellow))" : "hsl(var(--pastel-blue))",
                  }}
                />
                <span style={{ color }}>{labelPt}</span>
              </span>
              <span className="tabular-nums text-base font-bold text-foreground">{entry.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const AttendanceCard = () => {
  const { selectedYear, selectedYearId } = useAcademicYear();
  const { role, loading: roleLoading } = useUserRole();
  /** Evita tratar como admin antes do perfil estar definido (cache/async). */
  const teacherMode = !roleLoading && role === "TEACHER";
  const { classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();

  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("ALL");
  const [data, setData] = useState<WeekBucket[]>(() => emptyMonths());

  /** Limites YYYY-MM-DD em calendário local da escola (evita desvio UTC com toISOString). */
  const dateBounds = useMemo(() => {
    if (selectedYear) {
      return {
        start: selectedYear.start_date.slice(0, 10),
        end: selectedYear.end_date.slice(0, 10),
      };
    }
    const now = new Date();
    const y = now.getFullYear();
    return {
      start: `${y}-01-01`,
      end: `${y}-12-31`,
    };
  }, [selectedYear]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setSchoolId(null);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle();
      if (!cancelled) setSchoolId(profile?.school_id ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const aggregateRows = useCallback((rows: { date: string; status: string | null; notes: string | null }[]) => {
    const months = emptyMonths();
    for (const row of rows) {
      const monthIdx = calendarMonthIndexFromIso(row.date);
      if (monthIdx === null) continue;
      const side = bucketAttendance(row.status, row.notes);
      if (side === "absent") months[monthIdx].absent += 1;
      else months[monthIdx].present += 1;
    }
    return months;
  }, []);

  useEffect(() => {
    const load = async () => {
      if (roleLoading) {
        setData(emptyMonths());
        return;
      }

      if (!schoolId) {
        setData(emptyMonths());
        return;
      }

      if (teacherMode) {
        if (teacherLoading || !classroomId) {
          setData(emptyMonths());
          return;
        }
        let query = supabase
          .from("attendance")
          .select("date, notes, status, classroom_id")
          .eq("school_id", schoolId)
          .gte("date", dateBounds.start)
          .lte("date", dateBounds.end)
          .eq("classroom_id", classroomId)
          .limit(CHART_LIMIT);

        const { data: rows, error } = await query;
        if (error) {
          console.error("AttendanceCard load", error);
          setData(emptyMonths());
          return;
        }
        setData(aggregateRows((rows ?? []) as { date: string; status: string | null; notes: string | null }[]));
        return;
      }

      let query = supabase
        .from("attendance")
        .select("date, notes, status, classroom_id")
        .eq("school_id", schoolId)
        .gte("date", dateBounds.start)
        .lte("date", dateBounds.end)
        .limit(CHART_LIMIT);

      if (classroomId !== "ALL") {
        query = query.eq("classroom_id", classroomId);
      }

      const { data: rows, error } = await query;
      if (error) {
        console.error("AttendanceCard load", error);
        setData(emptyMonths());
        return;
      }
      setData(aggregateRows((rows ?? []) as { date: string; status: string | null; notes: string | null }[]));
    };

    void load();
  }, [
    aggregateRows,
    classroomId,
    dateBounds.start,
    dateBounds.end,
    schoolId,
    teacherMode,
    teacherLoading,
    roleLoading,
  ]);

  const maxValue = Math.max(10, ...data.flatMap((d) => [d.present, d.absent]));
  const yMax = Math.ceil(maxValue / 5) * 5 || 10;
  const isEmpty = data.every((d) => d.present === 0 && d.absent === 0);

  const teacherSelectDisabled = teacherMode && (classrooms.length === 0 || !classroomId);

  return (
    <div className="flex h-full flex-col gap-5 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-foreground">Frequência</h3>
        <Select
          value={teacherMode ? classroomId || undefined : classroomId}
          onValueChange={setClassroomId}
          disabled={teacherSelectDisabled}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] rounded-full border-border bg-background px-3 text-xs font-medium disabled:opacity-60">
            <SelectValue placeholder={teacherMode ? "Sem turmas" : "Turma"} />
          </SelectTrigger>
          <SelectContent>
            {!teacherMode && <SelectItem value="ALL">Todas as turmas</SelectItem>}
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {teacherMode && classrooms.length === 0 && !teacherLoading && (
        <p className="text-xs text-muted-foreground">
          Sem turmas com horário definido neste ano letivo.
        </p>
      )}

      <div className="flex items-center gap-5 text-xs font-medium text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-yellow" /> Presentes
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-blue" /> Ausentes
        </div>
      </div>

      <div className="h-64 w-full min-h-[240px] touch-pan-x">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="25%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} domain={[0, yMax]} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
              content={<AttendanceTooltip />}
            />
            <Bar dataKey="present" name="Presentes" fill="hsl(var(--pastel-yellow))" radius={[8, 8, 0, 0]} stroke="hsl(var(--pastel-yellow-foreground) / 0.25)" strokeWidth={1} />
            <Bar dataKey="absent" name="Ausentes" fill="hsl(var(--pastel-blue))" radius={[8, 8, 0, 0]} stroke="hsl(var(--pastel-blue-foreground) / 0.35)" strokeWidth={1} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {isEmpty && (
        <p className="text-center text-xs text-muted-foreground">
          Sem registos de frequência neste período. Verifique o ano letivo no topo ou registe presenças em Presenças.
        </p>
      )}
    </div>
  );
};
