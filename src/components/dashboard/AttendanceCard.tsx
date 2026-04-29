import { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { sortByName } from "@/lib/utils";
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

export const AttendanceCard = () => {
  const { selectedYear, selectedYearId } = useAcademicYear();
  const { role, loading: roleLoading } = useUserRole();
  /** Evita tratar como admin antes do perfil estar definido (cache/async). */
  const teacherMode = !roleLoading && role === "TEACHER";
  const { classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("ALL");
  const [data, setData] = useState<WeekBucket[]>(() => emptyMonths());

  const yearRange = useMemo(() => {
    if (selectedYear) {
      return {
        start: new Date(`${selectedYear.start_date}T00:00:00`),
        end: new Date(`${selectedYear.end_date}T00:00:00`),
        year: Number(selectedYear.start_date.slice(0, 4)),
      };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear() + 1, 0, 1);
    return { start, end, year: now.getFullYear() };
  }, [selectedYear]);

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
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const load = async () => {
      if (roleLoading) {
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
          .gte("date", fmt(yearRange.start))
          .lt("date", fmt(yearRange.end))
          .eq("classroom_id", classroomId);

        const { data: rows } = await query;
        const filtered = rows ?? [];
        const months = emptyMonths();

        filtered.forEach((row) => {
          const d = new Date((row as { date: string }).date);
          const monthIdx = d.getMonth();
          const status = ((row as { status: string | null }).status ?? "").toUpperCase();
          const notes = ((row as { notes: string | null }).notes ?? "").toUpperCase();
          const isAbsent =
            status === "ABSENT" ||
            status === "JUSTIFIED" ||
            notes.includes("ABSEN") ||
            notes.includes("FALT");
          if (isAbsent) months[monthIdx].absent += 1;
          else months[monthIdx].present += 1;
        });

        setData(months);
        return;
      }

      let query = supabase
        .from("attendance")
        .select("date, notes, status, classroom_id")
        .gte("date", fmt(yearRange.start))
        .lt("date", fmt(yearRange.end));

      if (classroomId !== "ALL") {
        query = query.eq("classroom_id", classroomId);
      }

      const { data: rows } = await query;
      const filtered = rows ?? [];
      const months = emptyMonths();

      filtered.forEach((row) => {
        const d = new Date((row as { date: string }).date);
        const monthIdx = d.getMonth();
        const status = ((row as { status: string | null }).status ?? "").toUpperCase();
        const notes = ((row as { notes: string | null }).notes ?? "").toUpperCase();
        const isAbsent =
          status === "ABSENT" ||
          status === "JUSTIFIED" ||
          notes.includes("ABSEN") ||
          notes.includes("FALT");
        if (isAbsent) months[monthIdx].absent += 1;
        else months[monthIdx].present += 1;
      });

      setData(months);
    };

    void load();
  }, [
    classroomId,
    yearRange.start,
    yearRange.end,
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

      <div className="flex items-center gap-5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-yellow" /> Presentes
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pastel-blue" /> Ausentes
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="25%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} domain={[0, yMax]} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "12px",
                boxShadow: "var(--shadow-soft)",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  present: "Presentes",
                  absent: "Ausentes",
                };
                return [value, labels[name] ?? name];
              }}
              labelFormatter={(label: string) => label}
            />
            <Bar dataKey="present" fill="hsl(var(--pastel-yellow))" radius={[8, 8, 0, 0]} />
            <Bar dataKey="absent" fill="hsl(var(--pastel-blue))" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {isEmpty && (
        <p className="text-center text-xs text-muted-foreground">Sem registos de frequência este mês.</p>
      )}
    </div>
  );
};
