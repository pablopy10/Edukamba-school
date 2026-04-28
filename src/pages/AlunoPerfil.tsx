import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, GraduationCap, BookOpen, Clock, CheckCircle2, XCircle, AlertCircle, Users, FileText, Pencil, Loader2, TrendingUp, Wallet, Bell, Upload, Paperclip, History, ArrowRightLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateStudentAccessDialog, ELIGIBLE_GRADES } from "@/components/alunos/CreateStudentAccessDialog";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

type AvatarColor = "lilac" | "blue" | "yellow" | "green" | "pink";

const avatarStyles: Record<AvatarColor, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const subjectColors: AvatarColor[] = ["blue", "pink", "yellow", "green", "lilac"];
const colorFor = (key: string): AvatarColor => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return subjectColors[h % subjectColors.length];
};

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

const formatDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("pt-PT");
};

const ageFrom = (s: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
};

const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

interface StudentRow {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  gender: string | null;
  enrollment_number: string | null;
  avatar_color: string | null;
  classroom_id: string | null;
  parent_id: string | null;
  user_id: string | null;
  created_at: string | null;
  classrooms?: { id: string; name: string; grade_level?: string | null; courses?: { name: string } | null } | null;
}

interface ScheduleRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  subjects: { name: string } | null;
  profiles: { full_name: string } | null;
}

interface AssessmentRow {
  id: string;
  title: string;
  date: string;
  type: string | null;
  subjects: { name: string } | null;
}

interface GradeRow {
  id: string;
  score: number;
  assessments: { title: string; date: string; subjects: { name: string } | null } | null;
}

interface AttendanceRow {
  id: string;
  date: string;
  status: string;
  classrooms?: { name: string } | null;
}

interface FeeRow {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
}

interface EnrollmentHistoryRow {
  id: string;
  enrolled_at: string | null;
  status: string | null;
  result: string | null;
  result_notes: string | null;
  result_published_at: string | null;
  classroom: { id: string; name: string; grade_level: string | null } | null;
  year: { id: string; label: string; start_date: string; end_date: string; is_active: boolean | null } | null;
}

interface PaymentRow {
  id: string;
  student_fee_id: string | null;
  activity_fee_id?: string | null;
  transport_fee_id?: string | null;
  amount_paid: number;
  method: string | null;
  status: string;
  proof_url: string | null;
  payment_date: string | null;
  rejection_reason: string | null;
}

interface ActivityFeeRow {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
  activity_id: string;
  activity?: { id: string; name: string } | null;
}

interface TransportFeeRow {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
  route_id: string;
  route?: { id: string; name: string } | null;
}

const StatPill = ({ label, value, color }: { label: string; value: string; color: AvatarColor }) => (
  <div className="rounded-2xl bg-card p-5 shadow-card">
    <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", avatarStyles[color])}>{label}</span>
    <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
  </div>
);

const AlunoPerfil = () => {
  const { id } = useParams<{ id: string }>();
  const { role } = useUserRole();
  const isTeacher = role === "TEACHER";
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [guardian, setGuardian] = useState<{ full_name: string; phone: string | null } | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<{ total: number; present: number; late: number; absent: number; justified: number }>({ total: 0, present: 0, late: 0, absent: 0, justified: 0 });
  const [teachers, setTeachers] = useState<{ id: string; full_name: string; subject: string | null; phone: string | null }[]>([]);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [remindingFeeId, setRemindingFeeId] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [activityFees, setActivityFees] = useState<ActivityFeeRow[]>([]);
  const [activityPayments, setActivityPayments] = useState<PaymentRow[]>([]);
  const [transportFees, setTransportFees] = useState<TransportFeeRow[]>([]);
  const [transportPayments, setTransportPayments] = useState<PaymentRow[]>([]);
  const [proofDialogFee, setProofDialogFee] = useState<FeeRow | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofMethod, setProofMethod] = useState<string>("transferencia");
  const [proofNotes, setProofNotes] = useState("");
  const [proofAmount, setProofAmount] = useState("");
  const [proofUploading, setProofUploading] = useState(false);
  const [enrollmentHistory, setEnrollmentHistory] = useState<EnrollmentHistoryRow[]>([]);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("students")
        .select("id, full_name, email, phone, birth_date, gender, enrollment_number, avatar_color, classroom_id, parent_id, user_id, created_at, classrooms(id, name, grade_level, courses(name))")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      const studentRow = s as unknown as StudentRow | null;
      setStudent(studentRow);

      if (studentRow?.parent_id) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", studentRow.parent_id)
          .maybeSingle();
        if (!cancelled) setGuardian(p as { full_name: string; phone: string | null } | null);
      }

      if (studentRow?.classroom_id) {
        const [schRes, assRes, teaRes] = await Promise.all([
          supabase
            .from("schedules")
            .select("day_of_week, start_time, end_time, room, subjects(name), profiles!schedules_teacher_id_fkey(full_name)")
            .eq("classroom_id", studentRow.classroom_id)
            .order("day_of_week")
            .order("start_time"),
          supabase
            .from("assessments")
            .select("id, title, date, type, subjects(name)")
            .eq("classroom_id", studentRow.classroom_id)
            .order("date", { ascending: false })
            .limit(8),
          supabase
            .from("schedules")
            .select("teacher_id, subjects(name), profiles!schedules_teacher_id_fkey(id, full_name, phone)")
            .eq("classroom_id", studentRow.classroom_id),
        ]);
        if (!cancelled) {
          setSchedule((schRes.data ?? []) as unknown as ScheduleRow[]);
          setAssessments((assRes.data ?? []) as unknown as AssessmentRow[]);
          const seen = new Set<string>();
          const list: { id: string; full_name: string; subject: string | null; phone: string | null }[] = [];
          (teaRes.data ?? []).forEach((row) => {
            const r = row as unknown as { teacher_id: string | null; subjects: { name: string } | null; profiles: { id: string; full_name: string; phone: string | null } | null };
            if (r.profiles && !seen.has(r.profiles.id)) {
              seen.add(r.profiles.id);
              list.push({ id: r.profiles.id, full_name: r.profiles.full_name, subject: r.subjects?.name ?? null, phone: r.profiles.phone });
            }
          });
          setTeachers(list);
        }
      }

      const [grRes, atRes] = await Promise.all([
        supabase
          .from("grades")
          .select("id, score, assessments(title, date, subjects(name))")
          .eq("student_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("attendance")
          .select("id, date, status, classrooms(name)")
          .eq("student_id", id)
          .order("date", { ascending: false })
          .limit(10),
      ]);
      if (!cancelled) {
        setGrades((grRes.data ?? []) as unknown as GradeRow[]);
        setAttendance((atRes.data ?? []) as unknown as AttendanceRow[]);
      }

      // Aggregate attendance stats over ALL records (not just recent 10)
      const { data: allAttRows } = await supabase
        .from("attendance")
        .select("status, notes")
        .eq("student_id", id);
      if (!cancelled) {
        const rows = (allAttRows ?? []) as { status: string; notes: string | null }[];
        const stats = { total: rows.length, present: 0, late: 0, absent: 0, justified: 0 };
        rows.forEach((r) => {
          const hasJustification = !!r.notes && r.notes.trim().length > 0;
          if (r.status === "PRESENT") stats.present += 1;
          else if (r.status === "JUSTIFIED" || hasJustification) stats.justified += 1;
          else if (r.status === "LATE") stats.late += 1;
          else stats.absent += 1;
        });
        setAttendanceStats(stats);
      }

      // Enrollment history (across all academic years)
      const { data: histRows } = await supabase
        .from("enrollments")
        .select("id, enrolled_at, status, result, result_notes, result_published_at, classrooms(id, name, grade_level), academic_years(id, label, start_date, end_date, is_active)")
        .eq("student_id", id);
      if (!cancelled) {
        const mapped = (histRows ?? []).map((r) => {
          const row = r as unknown as {
            id: string;
            enrolled_at: string | null;
            status: string | null;
            result: string | null;
            result_notes: string | null;
            result_published_at: string | null;
            classrooms: { id: string; name: string; grade_level: string | null } | null;
            academic_years: { id: string; label: string; start_date: string; end_date: string; is_active: boolean | null } | null;
          };
          return {
            id: row.id,
            enrolled_at: row.enrolled_at,
            status: row.status,
            result: row.result,
            result_notes: row.result_notes,
            result_published_at: row.result_published_at,
            classroom: row.classrooms,
            year: row.academic_years,
          } as EnrollmentHistoryRow;
        }).sort((a, b) => {
          const da = a.year?.start_date ?? "";
          const db = b.year?.start_date ?? "";
          return db.localeCompare(da);
        });
        setEnrollmentHistory(mapped);
      }

      const { data: feeRows } = await supabase
        .from("student_fees")
        .select("id, amount_due, due_date, is_paid, month_index")
        .eq("student_id", id)
        .order("due_date", { ascending: true });
      if (!cancelled) {
        setFees((feeRows ?? []) as FeeRow[]);
      }

      const feeIds = (feeRows ?? []).map((f) => f.id);
      if (feeIds.length > 0) {
        const { data: payRows } = await supabase
          .from("payments")
          .select("id, student_fee_id, amount_paid, method, status, proof_url, payment_date, rejection_reason")
          .in("student_fee_id", feeIds)
          .order("payment_date", { ascending: false });
        if (!cancelled) setPayments((payRows ?? []) as PaymentRow[]);
      } else if (!cancelled) {
        setPayments([]);
      }

      // Activity (extracurricular) fees
      const { data: actFeeRows } = await supabase
        .from("activity_fees")
        .select("id, amount_due, due_date, is_paid, month_index, activity_id, activity:extracurricular_activities(id, name)")
        .eq("student_id", id)
        .order("due_date", { ascending: true });
      if (!cancelled) setActivityFees((actFeeRows ?? []) as unknown as ActivityFeeRow[]);
      const actIds = (actFeeRows ?? []).map((f) => f.id);
      if (actIds.length > 0) {
        const { data: actPayRows } = await supabase
          .from("payments")
          .select("id, student_fee_id, activity_fee_id, transport_fee_id, amount_paid, method, status, proof_url, payment_date, rejection_reason")
          .in("activity_fee_id", actIds)
          .order("payment_date", { ascending: false });
        if (!cancelled) setActivityPayments((actPayRows ?? []) as PaymentRow[]);
      } else if (!cancelled) {
        setActivityPayments([]);
      }

      // Transport fees
      const { data: trFeeRows } = await supabase
        .from("transport_fees")
        .select("id, amount_due, due_date, is_paid, month_index, route_id, route:transport_routes(id, name)")
        .eq("student_id", id)
        .order("due_date", { ascending: true });
      if (!cancelled) setTransportFees((trFeeRows ?? []) as unknown as TransportFeeRow[]);
      const trIds = (trFeeRows ?? []).map((f) => f.id);
      if (trIds.length > 0) {
        const { data: trPayRows } = await supabase
          .from("payments")
          .select("id, student_fee_id, activity_fee_id, transport_fee_id, amount_paid, method, status, proof_url, payment_date, rejection_reason")
          .in("transport_fee_id", trIds)
          .order("payment_date", { ascending: false });
        if (!cancelled) setTransportPayments((trPayRows ?? []) as PaymentRow[]);
      } else if (!cancelled) {
        setTransportPayments([]);
      }

      if (!cancelled) {
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const sendReminder = async (fee: FeeRow) => {
    if (!student) return;
    if (!student.parent_id) {
      toast({ title: "Sem encarregado associado", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    setRemindingFeeId(fee.id);
    const { data: schoolRow } = await supabase.from("profiles").select("school_id").eq("id", student.parent_id).maybeSingle();
    const monthLabel = fee.month_index ? monthNames[fee.month_index - 1] : "";
    const { error } = await supabase.from("notifications").insert({
      recipient_id: student.parent_id,
      school_id: schoolRow?.school_id ?? null,
      title: `Lembrete de propina ${monthLabel}`.trim(),
      description: `A propina de ${student.full_name} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${formatDate(fee.due_date)}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "/financas",
    });
    setRemindingFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado" });
  };

  const latestPaymentByFee = useMemo(() => {
    const map = new Map<string, PaymentRow>();
    payments.forEach((p) => {
      if (!p.student_fee_id) return;
      if (!map.has(p.student_fee_id)) map.set(p.student_fee_id, p);
    });
    return map;
  }, [payments]);

  const openProofDialog = (fee: FeeRow) => {
    setProofDialogFee(fee);
    setProofFile(null);
    setProofMethod("transferencia");
    setProofNotes("");
    setProofAmount(String(fee.amount_due));
  };

  const submitProof = async () => {
    if (!student || !proofDialogFee) return;
    if (!proofFile) {
      toast({ title: "Selecione um ficheiro", description: "É necessário anexar o comprovativo.", variant: "destructive" });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) {
      toast({ title: "Sessão expirada", variant: "destructive" });
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", userId).maybeSingle();
    const schoolId = profile?.school_id;
    if (!schoolId) {
      toast({ title: "Escola não encontrada", variant: "destructive" });
      return;
    }
    setProofUploading(true);
    const ext = proofFile.name.split(".").pop() || "bin";
    const path = `${schoolId}/${student.id}/${proofDialogFee.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, proofFile, { upsert: false });
    if (upErr) {
      setProofUploading(false);
      toast({ title: "Erro a enviar ficheiro", description: upErr.message, variant: "destructive" });
      return;
    }
    const amount = Number(proofAmount) || Number(proofDialogFee.amount_due);
    const { error: insErr } = await supabase.from("payments").insert({
      student_fee_id: proofDialogFee.id,
      amount_paid: amount,
      method: proofMethod,
      proof_url: path,
      status: "pendente",
      submitted_by: userId,
      school_id: schoolId,
      notes: proofNotes || null,
    });
    setProofUploading(false);
    if (insErr) {
      toast({ title: "Erro a registar pagamento", description: insErr.message, variant: "destructive" });
      return;
    }
    toast({ title: "Comprovativo enviado", description: "A escola será notificada para validar." });
    setProofDialogFee(null);
    // Reload payments
    const { data: payRows } = await supabase
      .from("payments")
      .select("id, student_fee_id, amount_paid, method, status, proof_url, payment_date, rejection_reason")
      .in("student_fee_id", fees.map((f) => f.id))
      .order("payment_date", { ascending: false });
    setPayments((payRows ?? []) as PaymentRow[]);
  };

  const subjectsAvg = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    grades.forEach((g) => {
      const name = g.assessments?.subjects?.name;
      if (!name) return;
      const cur = map.get(name) ?? { sum: 0, n: 0 };
      cur.sum += Number(g.score);
      cur.n += 1;
      map.set(name, cur);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, avg: v.sum / v.n, n: v.n, color: colorFor(name) }));
  }, [grades]);

  const overallAverage = useMemo(() => {
    if (grades.length === 0) return "—";
    const sum = grades.reduce((acc, g) => acc + Number(g.score), 0);
    return (sum / grades.length).toFixed(1);
  }, [grades]);

  const presenceRate = useMemo(() => {
    if (attendanceStats.total === 0) return "—";
    const present = attendanceStats.present + attendanceStats.late + attendanceStats.justified;
    return `${Math.round((present / attendanceStats.total) * 100)}%`;
  }, [attendanceStats]);

  const subjectsCount = useMemo(() => {
    const set = new Set<string>();
    schedule.forEach((s) => {
      const n = s.subjects?.name;
      if (n) set.add(n);
    });
    if (set.size > 0) return set.size;
    return subjectsAvg.length;
  }, [schedule, subjectsAvg]);

  const feesSummary = useMemo(() => {
    const paid = fees.filter((f) => f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const pending = fees.filter((f) => !f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const overdue = fees.filter((f) => !f.is_paid && new Date(f.due_date) < new Date()).length;
    return { paid, pending, overdue };
  }, [fees]);

  const activityFeesSummary = useMemo(() => {
    const paid = activityFees.filter((f) => f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const pending = activityFees.filter((f) => !f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const overdue = activityFees.filter((f) => !f.is_paid && new Date(f.due_date) < new Date()).length;
    return { paid, pending, overdue };
  }, [activityFees]);

  const transportFeesSummary = useMemo(() => {
    const paid = transportFees.filter((f) => f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const pending = transportFees.filter((f) => !f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const overdue = transportFees.filter((f) => !f.is_paid && new Date(f.due_date) < new Date()).length;
    return { paid, pending, overdue };
  }, [transportFees]);

  const latestPaymentByActivityFee = useMemo(() => {
    const map = new Map<string, PaymentRow>();
    activityPayments.forEach((p) => {
      if (!p.activity_fee_id) return;
      if (!map.has(p.activity_fee_id)) map.set(p.activity_fee_id, p);
    });
    return map;
  }, [activityPayments]);

  const latestPaymentByTransportFee = useMemo(() => {
    const map = new Map<string, PaymentRow>();
    transportPayments.forEach((p) => {
      if (!p.transport_fee_id) return;
      if (!map.has(p.transport_fee_id)) map.set(p.transport_fee_id, p);
    });
    return map;
  }, [transportPayments]);

  const scheduleByDay = useMemo(() => {
    const days: Record<number, ScheduleRow[]> = {};
    [1, 2, 3, 4, 5].forEach((d) => (days[d] = []));
    schedule.forEach((s) => {
      if (s.day_of_week >= 1 && s.day_of_week <= 5) days[s.day_of_week].push(s);
    });
    return days;
  }, [schedule]);

  const statusIcon = (status: string) => {
    if (status === "PRESENT") return <CheckCircle2 className="h-4 w-4 text-pastel-green-foreground" strokeWidth={2} />;
    if (status === "ABSENT") return <XCircle className="h-4 w-4 text-pastel-pink-foreground" strokeWidth={2} />;
    return <AlertCircle className="h-4 w-4 text-pastel-yellow-foreground" strokeWidth={2} />;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      PRESENT: { label: "Presente", cls: "bg-pastel-green text-pastel-green-foreground" },
      ABSENT: { label: "Falta", cls: "bg-pastel-pink text-pastel-pink-foreground" },
      LATE: { label: "Atraso", cls: "bg-pastel-yellow text-pastel-yellow-foreground" },
      JUSTIFIED: { label: "Justificada", cls: "bg-pastel-blue text-pastel-blue-foreground" },
    };
    const v = map[status] ?? { label: status, cls: "bg-muted text-foreground" };
    return <span className={cn("rounded-full px-3 py-1 text-xs font-medium", v.cls)}>{v.label}</span>;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!student) {
    return (
      <DashboardLayout>
        <div className="rounded-2xl bg-card p-8 text-center shadow-card">
          <p className="text-muted-foreground">Aluno não encontrado.</p>
          <Link to="/alunos" className="mt-4 inline-block text-sm font-medium text-pastel-blue-foreground hover:underline">Voltar a Alunos</Link>
        </div>
      </DashboardLayout>
    );
  }

  const avatarColor = (student.avatar_color as AvatarColor) || "blue";
  const age = ageFrom(student.birth_date);

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <Link to="/alunos" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Voltar a Alunos
        </Link>

        {/* Header */}
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className={cn("flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl text-3xl font-bold shadow-soft", avatarStyles[avatarColor])}>
                {initialsOf(student.full_name)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{student.full_name}</h1>
                  <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">Activo</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {student.enrollment_number ? `Nº ${student.enrollment_number}` : `ID ${student.id.slice(0, 8)}`}
                  {student.gender ? ` · ${student.gender === "F" ? "Feminino" : student.gender === "M" ? "Masculino" : student.gender}` : ""}
                  {age !== null ? ` · ${age} anos` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {student.classrooms?.name && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-blue/40 px-3 py-1 text-xs font-medium text-pastel-blue-foreground">
                      <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} /> Turma {student.classrooms.name}
                    </span>
                  )}
                  {student.classrooms?.courses?.name && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-lilac/50 px-3 py-1 text-xs font-medium text-pastel-lilac-foreground">
                      <BookOpen className="h-3.5 w-3.5" strokeWidth={2} /> {student.classrooms.courses.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isTeacher && (
              <>
              {(() => {
                if (!student) return null;
                if (student.user_id) {
                  return (
                    <span className="inline-flex h-10 items-center gap-2 rounded-full bg-pastel-green/40 px-4 text-xs font-semibold text-pastel-green-foreground">
                      <ShieldCheck className="h-4 w-4" strokeWidth={2} /> Acesso à plataforma activo
                    </span>
                  );
                }
                const currentGrade = student.classrooms?.grade_level ?? null;
                const eligibleNow = currentGrade ? ELIGIBLE_GRADES.has(currentGrade) : false;
                const eligibleHistory = enrollmentHistory.some(
                  (h) => h.status === "ACTIVE" && h.classroom?.grade_level && ELIGIBLE_GRADES.has(h.classroom.grade_level),
                );
                if (!eligibleNow && !eligibleHistory) return null;
                return (
                  <button
                    onClick={() => setAccessDialogOpen(true)}
                    className="flex h-10 items-center gap-2 rounded-full bg-pastel-lilac px-5 text-sm font-semibold text-pastel-lilac-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
                  >
                    <KeyRound className="h-4 w-4" strokeWidth={2} /> Criar acesso à plataforma
                  </button>
                );
              })()}
              <Link to="/alunos" className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Pencil className="h-4 w-4" strokeWidth={2} /> Editar
              </Link>
              </>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-blue/40 text-pastel-blue-foreground">
                <Mail className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="truncate text-sm font-medium text-foreground">{student.email || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-green/40 text-pastel-green-foreground">
                <Phone className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm font-medium text-foreground">{student.phone || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-pink/50 text-pastel-pink-foreground">
                <Calendar className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Data de Nasc.</p>
                <p className="truncate text-sm font-medium text-foreground">{formatDate(student.birth_date)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-yellow/50 text-pastel-yellow-foreground">
                <Calendar className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Matriculado em</p>
                <p className="text-sm font-medium text-foreground">{formatDate(student.created_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatPill label="Média Geral" value={overallAverage} color="lilac" />
          <StatPill label="Assiduidade" value={presenceRate} color="green" />
          <StatPill label="Avaliações" value={String(assessments.length)} color="blue" />
          <StatPill label="Disciplinas" value={String(subjectsCount)} color="yellow" />
        </div>

        {/* Histórico de matrículas */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Histórico de Matrículas</h2>
            </div>
            <span className="text-xs text-muted-foreground">{enrollmentHistory.length} ano(s) lectivo(s)</span>
          </div>
          {enrollmentHistory.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem histórico de matrículas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pastel-blue/30 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                    <th className="py-3 pl-5 pr-4 font-semibold">Ano lectivo</th>
                    <th className="py-3 pr-4 font-semibold">Turma</th>
                    <th className="py-3 pr-4 font-semibold">Classe</th>
                    <th className="py-3 pr-4 font-semibold">Estado</th>
                    <th className="py-3 pr-5 font-semibold">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollmentHistory.map((h, idx) => {
                    const prev = enrollmentHistory[idx + 1];
                    const promoted = prev && prev.result === "APROVADO" && prev.classroom?.grade_level !== h.classroom?.grade_level;
                    return (
                      <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="py-3 pl-5 pr-4">
                          <div className="font-medium text-foreground">
                            {h.year?.label ?? "—"}
                            {h.year?.is_active && (
                              <span className="ml-2 rounded-full bg-pastel-green/60 px-2 py-0.5 text-[10px] font-semibold text-pastel-green-foreground">Actual</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{h.classroom?.name ?? "—"}</span>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {h.classroom?.grade_level ?? "—"}
                          {promoted && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-pastel-green/40 px-2 py-0.5 text-[10px] font-semibold text-pastel-green-foreground">
                              <ArrowUpRight className="h-3 w-3" /> Subiu
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium",
                            h.status === "ACTIVE" ? "bg-pastel-green text-pastel-green-foreground" :
                            h.status === "PENDING" ? "bg-pastel-yellow text-pastel-yellow-foreground" :
                            h.status === "CANCELLED" ? "bg-pastel-pink text-pastel-pink-foreground" :
                            "bg-muted text-foreground"
                          )}>
                            {h.status === "ACTIVE" ? "Confirmada" : h.status === "PENDING" ? "Pendente" : h.status === "CANCELLED" ? "Cancelada" : (h.status ?? "—")}
                          </span>
                        </td>
                        <td className="py-3 pr-5">
                          {h.result === "APROVADO" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">
                              <CheckCircle2 className="h-3 w-3" /> Aprovado
                            </span>
                          ) : h.result === "REPROVADO" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground">
                              <XCircle className="h-3 w-3" /> Reprovado
                            </span>
                          ) : h.result === "TRANSFERIDO" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pastel-blue px-3 py-1 text-xs font-semibold text-pastel-blue-foreground">
                              <ArrowRightLeft className="h-3 w-3" /> Transferido
                            </span>
                          ) : (
                            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Em curso</span>
                          )}
                          {h.result_notes && (
                            <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground" title={h.result_notes}>{h.result_notes}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagamentos */}
        {!isTeacher && (
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border p-5">
            <Wallet className="h-5 w-5 text-pastel-yellow-foreground" strokeWidth={1.75} />
            <h2 className="text-lg font-bold text-foreground">Pagamentos</h2>
          </div>
          <Tabs defaultValue="propinas" className="w-full">
            <div className="px-5 pt-4">
              <TabsList>
                <TabsTrigger value="propinas">Propinas</TabsTrigger>
                <TabsTrigger value="extracurriculares">Extracurriculares</TabsTrigger>
                <TabsTrigger value="transporte">Transporte</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="propinas" className="mt-0">
              <div className="flex flex-wrap gap-2 px-5 pb-3 pt-3 text-xs">
                <span className="rounded-full bg-pastel-green/60 px-3 py-1 font-medium text-pastel-green-foreground">Pago: {fmtAOA(feesSummary.paid)}</span>
                <span className="rounded-full bg-pastel-yellow/60 px-3 py-1 font-medium text-pastel-yellow-foreground">Em dívida: {fmtAOA(feesSummary.pending)}</span>
                {feesSummary.overdue > 0 && (
                  <span className="rounded-full bg-pastel-pink/60 px-3 py-1 font-medium text-pastel-pink-foreground">{feesSummary.overdue} em atraso</span>
                )}
              </div>
              {fees.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem propinas geradas para este aluno.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-pastel-yellow/30 text-left text-xs uppercase tracking-wider text-pastel-yellow-foreground">
                        <th className="py-3 pl-5 pr-4 font-semibold">Mês</th>
                        <th className="py-3 pr-4 font-semibold">Vencimento</th>
                        <th className="py-3 pr-4 font-semibold">Valor</th>
                        <th className="py-3 pr-4 font-semibold">Estado</th>
                        <th className="py-3 pr-5 text-right font-semibold">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fees.map((f) => {
                        const overdue = !f.is_paid && new Date(f.due_date) < new Date();
                        const pay = latestPaymentByFee.get(f.id);
                        const pendingValidation = !!pay && pay.status === "pendente";
                        const rejected = !!pay && pay.status === "rejeitado";
                        return (
                          <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                            <td className="py-3 pl-5 pr-4 font-medium text-foreground">{f.month_index ? monthNames[f.month_index - 1] : "—"}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{formatDate(f.due_date)}</td>
                            <td className="py-3 pr-4 font-semibold text-foreground">{fmtAOA(Number(f.amount_due))}</td>
                            <td className="py-3 pr-4">
                              {f.is_paid ? (
                                <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">Pago</span>
                              ) : pendingValidation ? (
                                <span className="rounded-full bg-pastel-blue px-3 py-1 text-xs font-semibold text-pastel-blue-foreground">A validar</span>
                              ) : rejected ? (
                                <span className="rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground" title={pay?.rejection_reason ?? undefined}>Rejeitado</span>
                              ) : overdue ? (
                                <span className="rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground">Em atraso</span>
                              ) : (
                                <span className="rounded-full bg-pastel-yellow px-3 py-1 text-xs font-semibold text-pastel-yellow-foreground">Pendente</span>
                              )}
                            </td>
                            <td className="py-3 pr-5 text-right">
                              {!f.is_paid && (
                                <div className="flex flex-wrap justify-end gap-2">
                                  {!pendingValidation && (
                                    <Button size="sm" variant="outline" className="gap-2" onClick={() => openProofDialog(f)}>
                                      <Upload className="h-3.5 w-3.5" />
                                      {rejected ? "Reenviar" : "Comprovativo"}
                                    </Button>
                                  )}
                                  {pendingValidation && (
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                      <Paperclip className="h-3.5 w-3.5" /> Aguarda validação
                                    </span>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-2"
                                    onClick={() => sendReminder(f)}
                                    disabled={remindingFeeId === f.id || !student.parent_id}
                                  >
                                    {remindingFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                    Cobrar
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="extracurriculares" className="mt-0">
              <div className="flex flex-wrap gap-2 px-5 pb-3 pt-3 text-xs">
                <span className="rounded-full bg-pastel-green/60 px-3 py-1 font-medium text-pastel-green-foreground">Pago: {fmtAOA(activityFeesSummary.paid)}</span>
                <span className="rounded-full bg-pastel-yellow/60 px-3 py-1 font-medium text-pastel-yellow-foreground">Em dívida: {fmtAOA(activityFeesSummary.pending)}</span>
                {activityFeesSummary.overdue > 0 && (
                  <span className="rounded-full bg-pastel-pink/60 px-3 py-1 font-medium text-pastel-pink-foreground">{activityFeesSummary.overdue} em atraso</span>
                )}
              </div>
              {activityFees.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem cobranças de atividades extracurriculares.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-pastel-blue/30 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                        <th className="py-3 pl-5 pr-4 font-semibold">Atividade</th>
                        <th className="py-3 pr-4 font-semibold">Mês</th>
                        <th className="py-3 pr-4 font-semibold">Vencimento</th>
                        <th className="py-3 pr-4 font-semibold">Valor</th>
                        <th className="py-3 pr-5 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityFees.map((f) => {
                        const overdue = !f.is_paid && new Date(f.due_date) < new Date();
                        const pay = latestPaymentByActivityFee.get(f.id);
                        const pendingValidation = !!pay && pay.status === "pendente";
                        const rejected = !!pay && pay.status === "rejeitado";
                        return (
                          <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                            <td className="py-3 pl-5 pr-4 font-medium text-foreground">{f.activity?.name ?? "—"}</td>
                            <td className="py-3 pr-4">{f.month_index ? monthNames[f.month_index - 1] : "—"}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{formatDate(f.due_date)}</td>
                            <td className="py-3 pr-4 font-semibold text-foreground">{fmtAOA(Number(f.amount_due))}</td>
                            <td className="py-3 pr-5">
                              {f.is_paid ? (
                                <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">Pago</span>
                              ) : pendingValidation ? (
                                <span className="rounded-full bg-pastel-blue px-3 py-1 text-xs font-semibold text-pastel-blue-foreground">A validar</span>
                              ) : rejected ? (
                                <span className="rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground">Rejeitado</span>
                              ) : overdue ? (
                                <span className="rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground">Em atraso</span>
                              ) : (
                                <span className="rounded-full bg-pastel-yellow px-3 py-1 text-xs font-semibold text-pastel-yellow-foreground">Pendente</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-5 py-3 text-right">
                    <Link to="/pagamentos" className="text-xs font-medium text-pastel-blue-foreground hover:underline">Gerir pagamentos →</Link>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="transporte" className="mt-0">
              <div className="flex flex-wrap gap-2 px-5 pb-3 pt-3 text-xs">
                <span className="rounded-full bg-pastel-green/60 px-3 py-1 font-medium text-pastel-green-foreground">Pago: {fmtAOA(transportFeesSummary.paid)}</span>
                <span className="rounded-full bg-pastel-yellow/60 px-3 py-1 font-medium text-pastel-yellow-foreground">Em dívida: {fmtAOA(transportFeesSummary.pending)}</span>
                {transportFeesSummary.overdue > 0 && (
                  <span className="rounded-full bg-pastel-pink/60 px-3 py-1 font-medium text-pastel-pink-foreground">{transportFeesSummary.overdue} em atraso</span>
                )}
              </div>
              {transportFees.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem cobranças de transporte para este aluno.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-pastel-lilac/30 text-left text-xs uppercase tracking-wider text-pastel-lilac-foreground">
                        <th className="py-3 pl-5 pr-4 font-semibold">Rota</th>
                        <th className="py-3 pr-4 font-semibold">Mês</th>
                        <th className="py-3 pr-4 font-semibold">Vencimento</th>
                        <th className="py-3 pr-4 font-semibold">Valor</th>
                        <th className="py-3 pr-5 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transportFees.map((f) => {
                        const overdue = !f.is_paid && new Date(f.due_date) < new Date();
                        const pay = latestPaymentByTransportFee.get(f.id);
                        const pendingValidation = !!pay && pay.status === "pendente";
                        const rejected = !!pay && pay.status === "rejeitado";
                        return (
                          <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                            <td className="py-3 pl-5 pr-4 font-medium text-foreground">{f.route?.name ?? "—"}</td>
                            <td className="py-3 pr-4">{f.month_index ? monthNames[f.month_index - 1] : "—"}</td>
                            <td className="py-3 pr-4 text-muted-foreground">{formatDate(f.due_date)}</td>
                            <td className="py-3 pr-4 font-semibold text-foreground">{fmtAOA(Number(f.amount_due))}</td>
                            <td className="py-3 pr-5">
                              {f.is_paid ? (
                                <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">Pago</span>
                              ) : pendingValidation ? (
                                <span className="rounded-full bg-pastel-blue px-3 py-1 text-xs font-semibold text-pastel-blue-foreground">A validar</span>
                              ) : rejected ? (
                                <span className="rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground">Rejeitado</span>
                              ) : overdue ? (
                                <span className="rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground">Em atraso</span>
                              ) : (
                                <span className="rounded-full bg-pastel-yellow px-3 py-1 text-xs font-semibold text-pastel-yellow-foreground">Pendente</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-5 py-3 text-right">
                    <Link to="/pagamentos" className="text-xs font-medium text-pastel-blue-foreground hover:underline">Gerir pagamentos →</Link>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        )}

        {/* Schedule + guardian */}
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
                      {scheduleByDay[d].length === 0 && <p className="text-xs italic text-muted-foreground">—</p>}
                      {scheduleByDay[d].map((s, i) => {
                        const subj = s.subjects?.name ?? "—";
                        return (
                          <div key={i} className={cn("rounded-lg p-2.5 text-xs", avatarStyles[colorFor(subj)])}>
                            <p className="font-semibold">{subj}</p>
                            <p className="opacity-80">{s.start_time?.slice(0, 5)} — {s.end_time?.slice(0, 5)}</p>
                            {s.room && <p className="opacity-70">{s.room}</p>}
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
                <Users className="h-5 w-5 text-pastel-pink-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Encarregado de Educação</h2>
              </div>
              {guardian ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pastel-pink font-bold text-pastel-pink-foreground">
                    {initialsOf(guardian.full_name)}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{guardian.full_name}</p>
                    <p className="text-xs text-muted-foreground">{guardian.phone || "Sem contacto"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem encarregado associado.</p>
              )}
            </div>
          </div>
        </div>

        {/* Grades */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-pastel-lilac-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Médias por Disciplina</h2>
            </div>
            <span className="rounded-full bg-pastel-lilac/50 px-3 py-1 text-xs font-semibold text-pastel-lilac-foreground">Média: {overallAverage}</span>
          </div>
          {subjectsAvg.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem notas registadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pastel-lilac/30 text-left text-xs uppercase tracking-wider text-pastel-lilac-foreground">
                    <th className="py-4 pl-5 pr-4 font-semibold">Disciplina</th>
                    <th className="py-4 pr-4 text-center font-semibold">Avaliações</th>
                    <th className="py-4 pr-5 text-center font-semibold">Média</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectsAvg.map((g) => (
                    <tr key={g.name} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="py-3.5 pl-5 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("h-8 w-8 rounded-lg", avatarStyles[g.color])} />
                          <span className="font-medium text-foreground">{g.name}</span>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-center text-muted-foreground">{g.n}</td>
                      <td className="py-3.5 pr-5 text-center">
                        <span className={cn(
                          "inline-block min-w-[40px] rounded-full px-3 py-1 text-xs font-bold",
                          g.avg >= 16 ? "bg-pastel-green text-pastel-green-foreground" :
                          g.avg >= 14 ? "bg-pastel-blue text-pastel-blue-foreground" :
                          g.avg >= 10 ? "bg-pastel-yellow text-pastel-yellow-foreground" :
                          "bg-pastel-pink text-pastel-pink-foreground"
                        )}>{g.avg.toFixed(1)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Assessments + Attendance */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Avaliações Recentes</h2>
              </div>
              <Link to="/avaliacoes" className="text-xs font-medium text-pastel-blue-foreground hover:underline">Ver todas</Link>
            </div>
            {assessments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem avaliações.</p>
            ) : (
              <div className="divide-y divide-border">
                {assessments.map((a) => {
                  const grade = grades.find((g) => g.assessments?.title === a.title);
                  return (
                    <div key={a.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-semibold text-foreground">{a.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.date)} · {a.type ?? "Avaliação"}{a.subjects?.name ? ` · ${a.subjects.name}` : ""}</p>
                      </div>
                      <div className="text-right">
                        {grade ? (
                          <p className="text-lg font-bold text-foreground">{Number(grade.score).toFixed(1)}<span className="text-xs font-normal text-muted-foreground">/20</span></p>
                        ) : (
                          <span className="rounded-full bg-pastel-yellow px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">Pendente</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-pastel-green-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Presenças Recentes</h2>
              </div>
              <Link to="/presencas" className="text-xs font-medium text-pastel-green-foreground hover:underline">Ver todas</Link>
            </div>
            {attendanceStats.total > 0 && (
              <div className="grid grid-cols-2 gap-3 border-b border-border p-5 sm:grid-cols-4">
                <div className="rounded-xl bg-pastel-green/40 p-3">
                  <p className="text-xs text-muted-foreground">Presenças</p>
                  <p className="text-xl font-bold text-foreground">{attendanceStats.present}</p>
                </div>
                <div className="rounded-xl bg-pastel-yellow/40 p-3">
                  <p className="text-xs text-muted-foreground">Atrasos</p>
                  <p className="text-xl font-bold text-foreground">{attendanceStats.late}</p>
                </div>
                <div className="rounded-xl bg-pastel-pink/40 p-3">
                  <p className="text-xs text-muted-foreground">Faltas</p>
                  <p className="text-xl font-bold text-foreground">{attendanceStats.absent}</p>
                </div>
                <div className="rounded-xl bg-pastel-blue/40 p-3">
                  <p className="text-xs text-muted-foreground">Justificadas</p>
                  <p className="text-xl font-bold text-foreground">{attendanceStats.justified}</p>
                </div>
              </div>
            )}
            {attendance.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sem registos de presença.</p>
            ) : (
              <div className="divide-y divide-border">
                {attendance.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      {statusIcon(a.status)}
                      <div>
                        <p className="font-semibold text-foreground">{a.classrooms?.name ?? "Aula"}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(a.date)}</p>
                      </div>
                    </div>
                    {statusBadge(a.status)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Teachers */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-pastel-pink-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Professores</h2>
            </div>
            <Link to="/professores" className="text-xs font-medium text-pastel-pink-foreground hover:underline">Ver todos</Link>
          </div>
          {teachers.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Sem professores associados.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.map((t) => (
                <div key={t.id} className="flex items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
                  <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarStyles[colorFor(t.id)])}>
                    {initialsOf(t.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{t.full_name}</p>
                    <p className="text-xs text-muted-foreground">{t.subject ?? "Professor"}</p>
                    {t.phone && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {t.phone}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!proofDialogFee} onOpenChange={(o) => { if (!o) setProofDialogFee(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submeter comprovativo de pagamento</DialogTitle>
            <DialogDescription>
              {proofDialogFee && (
                <>Propina de {proofDialogFee.month_index ? monthNames[proofDialogFee.month_index - 1] : ""} — vencimento {formatDate(proofDialogFee.due_date)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="proof-amount">Valor pago</Label>
                <Input id="proof-amount" type="number" min="0" value={proofAmount} onChange={(e) => setProofAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Método</Label>
                <Select value={proofMethod} onValueChange={setProofMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="multicaixa">Multicaixa</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof-file">Comprovativo (imagem ou PDF)</Label>
              <Input id="proof-file" type="file" accept="image/*,application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof-notes">Notas (opcional)</Label>
              <Textarea id="proof-notes" rows={3} value={proofNotes} onChange={(e) => setProofNotes(e.target.value)} placeholder="Referência, data da operação, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofDialogFee(null)} disabled={proofUploading}>Cancelar</Button>
            <Button onClick={submitProof} disabled={proofUploading} className="gap-2">
              {proofUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Submeter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {student && (
        <CreateStudentAccessDialog
          open={accessDialogOpen}
          onOpenChange={setAccessDialogOpen}
          studentId={student.id}
          studentName={student.full_name}
          defaultEmail={student.email}
          onCreated={() => {
            setStudent({ ...student, user_id: student.user_id ?? "pending" });
          }}
        />
      )}
    </DashboardLayout>
  );
};

export default AlunoPerfil;
