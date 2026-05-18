import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { SCHOOL_MANAGEMENT_ROLES } from "@/lib/schoolStaffRoles";
import type { Enums } from "@/integrations/supabase/types";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";

const DASHBOARD_STAFF_ROLE_FILTER: Enums<"user_role">[] = [...SCHOOL_MANAGEMENT_ROLES, "TEACHER"];

const WEEKDAY_FALLBACK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("") || "?";

export const useDashboardData = () => {
  const { selectedYearId } = useAcademicYear();
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

        let classroomsQuery = supabase.from("classrooms").select("id", { count: "exact", head: true });
        let schedulesQuery = supabase
          .from("schedules")
          .select("id, start_time, end_time, day_of_week, classrooms(name, grade_level), subjects(name)")
          .eq("day_of_week", dow)
          .order("start_time", { ascending: true })
          .limit(6);

        if (selectedYearId) {
          classroomsQuery = classroomsQuery.eq("academic_year_id", selectedYearId);
          schedulesQuery = schedulesQuery.eq("academic_year_id", selectedYearId);
        }

        const [
          studentsRes,
          enrollmentsRes,
          teachersRes,
          staffRes,
          classroomsRes,
          studentsGenderRes,
          attendanceRes,
          schedulesTodayRes,
          messagesRes,
        ] = await Promise.all([
          supabase.from("students").select("id", { count: "exact", head: true }),
          selectedYearId
            ? supabase.from("enrollments").select("student_id").eq("academic_year_id", selectedYearId)
            : Promise.resolve({ data: null }),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "TEACHER"),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .in("role", DASHBOARD_STAFF_ROLE_FILTER),
          classroomsQuery,
          supabase.from("students").select("id, gender"),
          supabase
            .from("attendance")
            .select("date, notes")
            .gte("date", fmt(weekStart))
            .lt("date", fmt(weekEnd)),
          schedulesQuery,
          supabase
            .from("messages")
            .select("id, content, created_at, is_read, sender_id, receiver_id, profiles!messages_sender_id_fkey(full_name)")
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

        if (cancelled) return;

        const enrolledStudentIds = new Set((enrollmentsRes.data ?? []).map((e) => e.student_id).filter(Boolean));
        const scopedStudents = selectedYearId
          ? (studentsGenderRes.data ?? []).filter((s) => enrolledStudentIds.has(s.id))
          : (studentsGenderRes.data ?? []);

        setCounts({
          students: selectedYearId ? enrolledStudentIds.size : studentsRes.count ?? 0,
          teachers: teachersRes.count ?? 0,
          staff: staffRes.count ?? 0,
          classrooms: classroomsRes.count ?? 0,
        });

        const genders = scopedStudents;
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
        const wdLabelsUnknown = t("dashboard.calendar_weekdays_short", { returnObjects: true });
        const weekdayShort =
          Array.isArray(wdLabelsUnknown) && wdLabelsUnknown.length === 7 ? (wdLabelsUnknown as string[]) : WEEKDAY_FALLBACK_EN;

        setAttendance(
          [1, 2, 3, 4, 5].map((wd) => ({
            day: weekdayShort[wd],
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
            grade:
              s.classrooms?.name ?? s.classrooms?.grade_level ?? t("dashboard.agenda.fallback_class"),
            title: s.subjects?.name ?? t("dashboard.agenda.fallback_lesson"),
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
        const receiverNameMap = new Map<string, string>();
        if (receiverIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", receiverIds);
          (profs ?? []).forEach((p) =>
            receiverNameMap.set(p.id, p.full_name ?? t("dashboard.messages.unknown_contact")),
          );
        }

        // Group by contact — keep only the most recent message per conversation
        const conversationMap = new Map<string, MessagePreview>();
        for (const m of msgs) {
          const isOutgoing = !!currentUserId && m.sender_id === currentUserId;
          const contactId = isOutgoing ? m.receiver_id : m.sender_id;
          if (!contactId) continue;
          // Already have a (more recent) entry for this contact — skip
          if (conversationMap.has(contactId)) continue;
          const name = isOutgoing
            ? (receiverNameMap.get(m.receiver_id!) ?? t("dashboard.messages.unknown_contact"))
            : (m.profiles?.full_name ?? t("dashboard.messages.unknown_contact"));
          const d = new Date(m.created_at);
          const now = new Date();
          const isToday =
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate();
          const time = isToday
            ? d.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" })
            : d.toLocaleDateString(localeTag, { day: "2-digit", month: "2-digit" });
          const isIncoming = !!currentUserId && m.receiver_id === currentUserId && m.sender_id !== currentUserId;
          conversationMap.set(contactId, {
            id: m.id,
            name,
            initials: initials(name),
            text: isOutgoing ? t("dashboard.messages.you_prefix", { text: m.content }) : m.content,
            time,
            unread: isIncoming && !m.is_read,
            contactId,
          });
        }
        setMessages(Array.from(conversationMap.values()).slice(0, 5));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedYearId, i18n.language, t]);

  return { loading, counts, gender, attendance, agenda, messages };
};