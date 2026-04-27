import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/context/AcademicYearContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const palette = [
  "bg-pastel-lilac text-pastel-lilac-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-pink text-pastel-pink-foreground",
  "bg-pastel-green text-pastel-green-foreground",
];

interface Classroom {
  id: string;
  name: string;
}

interface AgendaItem {
  id: string;
  time: string;
  grade: string;
  title: string;
}

interface AgendaCardProps {
  date: Date;
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const dateLabel = (date: Date) => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(date, today)) return "Hoje";
  if (isSameDay(date, tomorrow)) return "Amanhã";
  return date.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
};

export const AgendaCard = ({ date }: AgendaCardProps) => {
  const { selectedYearId } = useAcademicYear();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState<string>("ALL");
  const [items, setItems] = useState<AgendaItem[]>([]);

  useEffect(() => {
    let query = supabase
      .from("classrooms")
      .select("id, name")
      .order("name", { ascending: true });
    if (selectedYearId) query = query.eq("academic_year_id", selectedYearId);
    query.then(({ data }) => setClassrooms(data ?? []));
  }, [selectedYearId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const dow = date.getDay();
      let query = supabase
        .from("schedules")
        .select(
          "id, start_time, classroom_id, classrooms(name, grade_level), subjects(name)",
        )
        .eq("day_of_week", dow)
        .order("start_time", { ascending: true });

      if (selectedYearId) {
        query = query.eq("academic_year_id", selectedYearId);
      }

      if (classroomId !== "ALL") {
        query = query.eq("classroom_id", classroomId);
      }

      const { data } = await query;
      type Row = {
        id: string;
        start_time: string | null;
        classrooms: { name: string | null; grade_level: string | null } | null;
        subjects: { name: string | null } | null;
      };
      if (cancelled) return;
      setItems(
        ((data ?? []) as unknown as Row[]).map((s) => ({
          id: s.id,
          time: (s.start_time ?? "").slice(0, 5),
          grade: s.classrooms?.name ?? s.classrooms?.grade_level ?? "Turma",
          title: s.subjects?.name ?? "Aula",
        })),
      );
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [date, classroomId, selectedYearId]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-foreground">Agenda</h3>
          <p className="truncate text-xs capitalize text-muted-foreground">{dateLabel(date)}</p>
        </div>
        <Select value={classroomId} onValueChange={setClassroomId}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] rounded-full border-border bg-background px-3 text-xs font-medium">
            <SelectValue placeholder="Turma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as turmas</SelectItem>
            {classrooms.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
            Sem aulas agendadas neste dia.
          </p>
        ) : (
          items.map((it, i) => (
            <div
              key={it.id}
              className={cn("flex items-center gap-4 rounded-xl p-3", palette[i % palette.length])}
            >
              <span className="shrink-0 text-sm font-semibold opacity-80">{it.time}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium opacity-70">{it.grade}</p>
                <p className="truncate text-sm font-bold">{it.title}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
