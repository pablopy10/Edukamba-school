import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, GraduationCap, BookOpen, Clock, CheckCircle2, XCircle, AlertCircle, Users, FileText, Pencil, Loader2, TrendingUp, Wallet, Bell, Upload, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  created_at: string | null;
  classrooms?: { id: string; name: string; courses?: { name: string } | null } | null;
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

interface PaymentRow {
  id: string;
  student_fee_id: string | null;
  amount_paid: number;
  method: string | null;
  status: string;
  proof_url: string | null;
  payment_date: string | null;
  rejection_reason: string | null;
}

const StatPill = ({ label, value, color }: { label: string; value: string; color: AvatarColor }) => (
  <div className="rounded-2xl bg-card p-5 shadow-card">
    <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", avatarStyles[color])}>{label}</span>
    <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
  </div>
);

const AlunoPerfil = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState<StudentRow | null>(null);
  const [guardian, setGuardian] = useState<{ full_name: string; phone: string | null } | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; full_name: string; subject: string | null; phone: string | null }[]>([]);
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [remindingFeeId, setRemindingFeeId] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [proofDialogFee, setProofDialogFee] = useState<FeeRow | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofMethod, setProofMethod] = useState<string>("transferencia");
  const [proofNotes, setProofNotes] = useState("");
  const [proofAmount, setProofAmount] = useState("");
  const [proofUploading, setProofUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: s } = await supabase
        .from("students")
        .select("id, full_name, email, phone, birth_date, gender, enrollment_number, avatar_color, classroom_id, parent_id, created_at, classrooms(id, name, courses(name))")
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
    if (attendance.length === 0) return "—";
    const present = attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
    return `${Math.round((present / attendance.length) * 100)}%`;
  }, [attendance]);

  const feesSummary = useMemo(() => {
    const paid = fees.filter((f) => f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const pending = fees.filter((f) => !f.is_paid).reduce((s, f) => s + Number(f.amount_due), 0);
    const overdue = fees.filter((f) => !f.is_paid && new Date(f.due_date) < new Date()).length;
    return { paid, pending, overdue };
  }, [fees]);

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
              <Link to="/alunos" className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Pencil className="h-4 w-4" strokeWidth={2} /> Editar
              </Link>
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
          <StatPill label="Disciplinas" value={String(subjectsAvg.length)} color="yellow" />
        </div>

        {/* Propinas */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-pastel-yellow-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Propinas</h2>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-pastel-green/60 px-3 py-1 font-medium text-pastel-green-foreground">Pago: {fmtAOA(feesSummary.paid)}</span>
              <span className="rounded-full bg-pastel-yellow/60 px-3 py-1 font-medium text-pastel-yellow-foreground">Em dívida: {fmtAOA(feesSummary.pending)}</span>
              {feesSummary.overdue > 0 && (
                <span className="rounded-full bg-pastel-pink/60 px-3 py-1 font-medium text-pastel-pink-foreground">{feesSummary.overdue} em atraso</span>
              )}
            </div>
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
                    return (
                      <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="py-3 pl-5 pr-4 font-medium text-foreground">{f.month_index ? monthNames[f.month_index - 1] : "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{formatDate(f.due_date)}</td>
                        <td className="py-3 pr-4 font-semibold text-foreground">{fmtAOA(Number(f.amount_due))}</td>
                        <td className="py-3 pr-4">
                          {f.is_paid ? (
                            <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">Pago</span>
                          ) : overdue ? (
                            <span className="rounded-full bg-pastel-pink px-3 py-1 text-xs font-semibold text-pastel-pink-foreground">Em atraso</span>
                          ) : (
                            <span className="rounded-full bg-pastel-yellow px-3 py-1 text-xs font-semibold text-pastel-yellow-foreground">Pendente</span>
                          )}
                        </td>
                        <td className="py-3 pr-5 text-right">
                          {!f.is_paid && (
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
    </DashboardLayout>
  );
};

export default AlunoPerfil;
