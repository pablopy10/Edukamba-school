import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardCounts {
  students: number;
  teachers: number;
  staff: number;
  classrooms: number;
}

export interface GenderSplit {
  male: number;
  female: number;
  total: number;
}

export interface AttendanceDay {
  day: string;
  present: number;
  absent: number;
}

export interface AgendaItem {
  id: string;
  time: string;
  grade: string;
  title: string;
}

export interface MessagePreview {
  id: string;
  name: string;
  initials: string;
  text: string;
  time: string;
  unread: boolean;
  contactId: string | null;
}

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const useDashboardData = () => {
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<DashboardCounts>({
    students: 0,
    teachers: 0,
    staff: 0,
    classrooms: 0,
  });
  const [gender, setGender] = useState<GenderSplit>({ male: 0, female: 0, total: 0 });
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [messages, setMessages] = useState<MessagePreview[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const today = new Date();
        const dow = today.getDay();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - dow);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);

        const fmt = (d: Date) => d.toISOString().slice(0, 10);

        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData.user?.id ?? null;

        const [
          studentsRes,
          teachersRes,
          staffRes,
          classroomsRes,
          studentsGenderRes,
          attendanceRes,
          schedulesTodayRes,
          messagesRes,
        ] = await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "TEACHER"),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .in("role", ["ADMIN", "TEACHER"]),
          supabase.from("classrooms").select("id", { count: "exact", head: true }),
          supabase.from("students").select("gender"),
          supabase
            .from("attendance")
            .select("date, notes")
            .gte("date", fmt(weekStart))
            .lt("date", fmt(weekEnd)),
          supabase
            .from("schedules")
            .select("id, start_time, end_time, day_of_week, classrooms(name, grade_level), subjects(name)")
            .eq("day_of_week", dow)
            .order("start_time", { ascending: true })
            .limit(6),
          supabase
            .from("messages")
            .select("id, content, created_at, is_read, sender_id, receiver_id, profiles!messages_sender_id_fkey(full_name)")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        if (cancelled) return;

        setCounts({
          students: studentsRes.count ?? 0,
          teachers: teachersRes.count ?? 0,
          staff: staffRes.count ?? 0,
          classrooms: classroomsRes.count ?? 0,
        });

        const genders = studentsGenderRes.data ?? [];
        const male = genders.filter((g) => (g.gender ?? "").toUpperCase().startsWith("M")).length;
        const female = genders.filter((g) => (g.gender ?? "").toUpperCase().startsWith("F")).length;
        setGender({ male, female, total: genders.length });

        // Attendance grouped by weekday (Mon..Fri)
        const buckets: Record<number, { present: number; absent: number }> = {};
        for (let i = 1; i <= 5; i++) buckets[i] = { present: 0, absent: 0 };
        (attendanceRes.data ?? []).forEach((row: { date: string; notes: string | null }) => {
          const d = new Date(row.date);
          const wd = d.getDay();
          if (!buckets[wd]) return;
          const isAbsent = (row.notes ?? "").toUpperCase().includes("ABSEN") || (row.notes ?? "").toUpperCase().includes("FALT");
          if (isAbsent) buckets[wd].absent += 1;
          else buckets[wd].present += 1;
        });
        setAttendance(
          [1, 2, 3, 4, 5].map((wd) => ({
            day: dayLabels[wd],
            present: buckets[wd].present,
            absent: buckets[wd].absent,
          })),
        );

        // Agenda from today's schedules
        type ScheduleRow = {
          id: string;
          start_time: string;
          classrooms: { name: string | null; grade_level: string | null } | null;
          subjects: { name: string | null } | null;
        };
        const sched = (schedulesTodayRes.data ?? []) as unknown as ScheduleRow[];
        setAgenda(
          sched.map((s) => ({
            id: s.id,
            time: (s.start_time ?? "").slice(0, 5),
            grade: s.classrooms?.name ?? s.classrooms?.grade_level ?? "Turma",
            title: s.subjects?.name ?? "Aula",
          })),
        );

        // Messages
        type MsgRow = {
          id: string;
          content: string;
          created_at: string;
          is_read: boolean | null;
          sender_id: string | null;
          receiver_id: string | null;
          profiles: { full_name: string | null } | null;
        };
        const msgs = (messagesRes.data ?? []) as unknown as MsgRow[];
        // Need names for the "other" participant, not just the sender.
        // Fetch receiver names for outgoing messages.
        const receiverIds = Array.from(
          new Set(
            msgs
              .filter((m) => currentUserId && m.sender_id === currentUserId && m.receiver_id)
              .map((m) => m.receiver_id as string),
          ),
        );
        let receiverNameMap = new Map<string, string>();
        if (receiverIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", receiverIds);
          (profs ?? []).forEach((p) => receiverNameMap.set(p.id, p.full_name ?? "Desconhecido"));
        }

        setMessages(
          msgs.map((m) => {
            const isOutgoing = !!currentUserId && m.sender_id === currentUserId;
            const contactId = isOutgoing ? m.receiver_id : m.sender_id;
            const name = isOutgoing
              ? (m.receiver_id ? receiverNameMap.get(m.receiver_id) ?? "Desconhecido" : "Desconhecido")
              : (m.profiles?.full_name ?? "Desconhecido");
            const d = new Date(m.created_at);
            const time = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
            const isIncoming = !!currentUserId && m.receiver_id === currentUserId && m.sender_id !== currentUserId;
            return {
              id: m.id,
              name,
              initials: initials(name),
              text: m.content,
              time,
              unread: isIncoming && !m.is_read,
              contactId,
            };
          }),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, counts, gender, attendance, agenda, messages };
};