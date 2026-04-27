import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Wallet, Users, Percent, PlayCircle, Bell, Search, CheckCircle2, XCircle, Eye, FileText, Upload, Bus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { GRADE_LEVELS } from "@/lib/grade-levels";

type FeeRule = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  grade_level: string;
  monthly_amount: number;
  due_day: number;
  months_count: number;
  start_month: number;
  notes: string | null;
};

type FamilyRule = {
  id: string;
  sibling_position: number;
  discount_percentage: number;
};

type StudentDiscount = {
  id: string;
  student_id: string;
  academic_year_id: string | null;
  discount_percentage: number | null;
  discount_fixed_amount: number | null;
  reason: string | null;
  is_active: boolean;
  student?: { full_name: string };
};

type AcademicYear = { id: string; label: string; is_active: boolean | null };
type StudentLite = { id: string; full_name: string };
type ClassroomLite = { id: string; name: string };

type FeeListRow = {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
  student_id: string | null;
  academic_year_id: string | null;
  student?: {
    id: string;
    full_name: string;
    parent_id: string | null;
    classroom_id: string | null;
    classroom?: { id: string; name: string } | null;
  } | null;
};

type PaymentListRow = {
  id: string;
  student_fee_id: string | null;
  activity_fee_id: string | null;
  transport_fee_id: string | null;
  amount_paid: number;
  method: string | null;
  status: string;
  proof_url: string | null;
  payment_date: string | null;
  notes: string | null;
  rejection_reason: string | null;
  submitted_by: string | null;
};

type ActivityFeeRow = {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
  student_id: string;
  activity_id: string;
  enrollment_id: string;
  academic_year_id: string | null;
  student?: {
    id: string;
    full_name: string;
    parent_id: string | null;
    classroom_id: string | null;
    classroom?: { id: string; name: string } | null;
  } | null;
  activity?: { id: string; name: string; category: string | null } | null;
};

type TransportFeeRow = {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
  student_id: string;
  route_id: string;
  enrollment_id: string;
  academic_year_id: string | null;
  student?: {
    id: string;
    full_name: string;
    parent_id: string | null;
    classroom_id: string | null;
    classroom?: { id: string; name: string } | null;
  } | null;
  route?: { id: string; name: string } | null;
};

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const Pagamentos = () => {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [familyRules, setFamilyRules] = useState<FamilyRule[]>([]);
  const [discounts, setDiscounts] = useState<StudentDiscount[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<FeeRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    grade_level: "",
    monthly_amount: "0",
    due_day: "10",
    months_count: "10",
    start_month: "9",
    notes: "",
  });

  const [familyDialog, setFamilyDialog] = useState(false);
  const [editingFamily, setEditingFamily] = useState<FamilyRule | null>(null);
  const [familyForm, setFamilyForm] = useState({ sibling_position: "2", discount_percentage: "10" });

  const [discountDialog, setDiscountDialog] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<StudentDiscount | null>(null);
  const [discountForm, setDiscountForm] = useState({
    student_id: "",
    discount_percentage: "",
    discount_fixed_amount: "",
    reason: "",
  });

  const [deleteRule, setDeleteRule] = useState<string | null>(null);
  const [deleteFamily, setDeleteFamily] = useState<string | null>(null);
  const [deleteDiscount, setDeleteDiscount] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateYearId, setGenerateYearId] = useState<string>("");

  const [allFees, setAllFees] = useState<FeeListRow[]>([]);
  const [feeFilter, setFeeFilter] = useState<"all" | "paid" | "pending" | "overdue">("pending");
  const [feeYearFilter, setFeeYearFilter] = useState<string>("all");
  const [feeClassroomFilter, setFeeClassroomFilter] = useState<string>("all");
  const [feeSearch, setFeeSearch] = useState("");
  const [remindingFeeId, setRemindingFeeId] = useState<string | null>(null);
  const [classrooms, setClassrooms] = useState<ClassroomLite[]>([]);
  const [payments, setPayments] = useState<PaymentListRow[]>([]);
  const [validatingId, setValidatingId] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<PaymentListRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Activity fees (extracurriculares)
  const [allActivityFees, setAllActivityFees] = useState<ActivityFeeRow[]>([]);
  const [activityPayments, setActivityPayments] = useState<PaymentListRow[]>([]);
  const [actFilter, setActFilter] = useState<"all" | "paid" | "pending" | "overdue">("pending");
  const [actYearFilter, setActYearFilter] = useState<string>("all");
  const [actActivityFilter, setActActivityFilter] = useState<string>("all");
  const [actSearch, setActSearch] = useState("");
  const [activitiesList, setActivitiesList] = useState<Array<{ id: string; name: string }>>([]);
  const [remindingActFeeId, setRemindingActFeeId] = useState<string | null>(null);

  // Transport fees
  const [allTransportFees, setAllTransportFees] = useState<TransportFeeRow[]>([]);
  const [transportPayments, setTransportPayments] = useState<PaymentListRow[]>([]);
  const [trFilter, setTrFilter] = useState<"all" | "paid" | "pending" | "overdue">("pending");
  const [trYearFilter, setTrYearFilter] = useState<string>("all");
  const [trRouteFilter, setTrRouteFilter] = useState<string>("all");
  const [trSearch, setTrSearch] = useState("");
  const [routesList, setRoutesList] = useState<Array<{ id: string; name: string }>>([]);
  const [remindingTrFeeId, setRemindingTrFeeId] = useState<string | null>(null);

  // Staff "registar pagamento" dialog (works for both tuition and activity fees)
  const [recordDialog, setRecordDialog] = useState<
    | { kind: "fee"; fee: FeeListRow }
    | { kind: "activity"; fee: ActivityFeeRow }
    | { kind: "transport"; fee: TransportFeeRow }
    | null
  >(null);
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [recordAmount, setRecordAmount] = useState("");
  const [recordMethod, setRecordMethod] = useState("transferencia");
  const [recordNotes, setRecordNotes] = useState("");
  const [recordUploading, setRecordUploading] = useState(false);

  const openRecordForFee = (fee: FeeListRow) => {
    setRecordDialog({ kind: "fee", fee });
    setRecordFile(null);
    setRecordAmount(String(fee.amount_due));
    setRecordMethod("transferencia");
    setRecordNotes("");
  };
  const openRecordForActivity = (fee: ActivityFeeRow) => {
    setRecordDialog({ kind: "activity", fee });
    setRecordFile(null);
    setRecordAmount(String(fee.amount_due));
    setRecordMethod("transferencia");
    setRecordNotes("");
  };
  const openRecordForTransport = (fee: TransportFeeRow) => {
    setRecordDialog({ kind: "transport", fee });
    setRecordFile(null);
    setRecordAmount(String(fee.amount_due));
    setRecordMethod("transferencia");
    setRecordNotes("");
  };

  const submitStaffPayment = async () => {
    if (!recordDialog || !schoolId) return;
    if (!recordFile) {
      toast({ title: "Selecione um ficheiro", description: "É necessário anexar o comprovativo.", variant: "destructive" });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) { toast({ title: "Sessão expirada", variant: "destructive" }); return; }

    const kind = recordDialog.kind;
    const fee = recordDialog.fee;
    const studentId =
      kind === "fee"
        ? (fee as FeeListRow).student_id
        : kind === "activity"
        ? (fee as ActivityFeeRow).student_id
        : (fee as TransportFeeRow).student_id;
    setRecordUploading(true);
    const ext = recordFile.name.split(".").pop() || "bin";
    const path = `${schoolId}/${studentId}/${fee.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, recordFile, { upsert: false });
    if (upErr) {
      setRecordUploading(false);
      toast({ title: "Erro a enviar ficheiro", description: upErr.message, variant: "destructive" });
      return;
    }
    const amount = Number(recordAmount) || Number(fee.amount_due);
    const insertPayload = {
      amount_paid: amount,
      method: recordMethod,
      proof_url: path,
      status: "validado",
      submitted_by: userId,
      validated_by: userId,
      validated_at: new Date().toISOString(),
      school_id: schoolId,
      notes: recordNotes || null,
      student_fee_id: kind === "fee" ? fee.id : null,
      activity_fee_id: kind === "activity" ? fee.id : null,
      transport_fee_id: kind === "transport" ? fee.id : null,
    };
    const { error: insErr } = await supabase.from("payments").insert(insertPayload);
    if (insErr) {
      setRecordUploading(false);
      toast({ title: "Erro a registar pagamento", description: insErr.message, variant: "destructive" });
      return;
    }
    const { error: feeErr } =
      kind === "fee"
        ? await supabase.from("student_fees").update({ is_paid: true }).eq("id", fee.id)
        : kind === "activity"
        ? await supabase.from("activity_fees").update({ is_paid: true }).eq("id", fee.id)
        : await supabase.from("transport_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) {
      setRecordUploading(false);
      toast({ title: "Pagamento registado mas falha a marcar como pago", description: feeErr.message, variant: "destructive" });
      return;
    }
    // Notificar encarregado
    const parentId = (fee as FeeListRow | ActivityFeeRow | TransportFeeRow).student?.parent_id;
    if (parentId) {
      if (kind === "fee") {
        const f = fee as FeeListRow;
        const monthLabel = f.month_index ? monthNames[f.month_index - 1] : "";
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento registado — ${monthLabel}`.trim(),
          description: `A escola registou o pagamento da propina de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}). Pode consultar o comprovativo no portal.`,
          category: "pagamento",
          link: "/financas",
        });
      } else if (kind === "activity") {
        const f = fee as ActivityFeeRow;
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento registado — ${f.activity?.name ?? "atividade"}`,
          description: `A escola registou o pagamento da atividade ${f.activity?.name ?? ""} de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}). Pode consultar o comprovativo no portal.`,
          category: "pagamento",
          link: "/extracurriculares",
        });
      } else {
        const f = fee as TransportFeeRow;
        const monthLabel = f.month_index ? monthNames[f.month_index - 1] : "";
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento de transporte registado — ${monthLabel}`.trim(),
          description: `A escola registou o pagamento do transporte (${f.route?.name ?? "rota"}) de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}).`,
          category: "pagamento",
          link: "/transportes",
        });
      }
    }
    setRecordUploading(false);
    setRecordDialog(null);
    toast({ title: "Pagamento registado e validado" });
    await fetchAll();
  };

  const fetchAll = async () => {
    setLoading(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single();
    const sId = profile?.school_id ?? null;
    setSchoolId(sId);
    if (!sId) { setLoading(false); return; }

    const [yRes, rRes, fRes, dRes, sRes, cRes] = await Promise.all([
      supabase.from("academic_years").select("id, label, is_active").eq("school_id", sId).order("start_date", { ascending: true }),
      supabase.from("fee_rules").select("*").eq("school_id", sId).order("grade_level"),
      supabase.from("family_discount_rules").select("*").eq("school_id", sId).order("sibling_position"),
      supabase.from("student_discounts").select("*, student:students(full_name)").eq("school_id", sId).order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name").eq("school_id", sId).order("full_name"),
      supabase.from("classrooms").select("id, name").eq("school_id", sId).order("name"),
    ]);

    if (yRes.error) toast({ title: "Erro a carregar anos letivos", description: yRes.error.message, variant: "destructive" });
    if (rRes.error) toast({ title: "Erro a carregar regras", description: rRes.error.message, variant: "destructive" });

    const yList = (yRes.data ?? []) as AcademicYear[];
    setYears(yList);
    const active = yList.find((y) => y.is_active) ?? yList[0];
    setActiveYearId(active?.id ?? null);
    setGenerateYearId(active?.id ?? "");

    setRules((rRes.data ?? []) as FeeRule[]);
    setFamilyRules((fRes.data ?? []) as FamilyRule[]);
    setDiscounts((dRes.data ?? []) as StudentDiscount[]);
    setStudents((sRes.data ?? []) as StudentLite[]);
    setClassrooms((cRes.data ?? []) as ClassroomLite[]);

    // Carregar propinas com aluno e educador
    const studentIds = (sRes.data ?? []).map((s) => s.id);
    if (studentIds.length > 0) {
      const { data: feesData } = await supabase
        .from("student_fees")
        .select("id, amount_due, due_date, is_paid, month_index, student_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name))")
        .in("student_id", studentIds)
        .order("due_date", { ascending: true });
      setAllFees((feesData ?? []) as unknown as FeeListRow[]);

      const feeIds = (feesData ?? []).map((f) => f.id);
      if (feeIds.length > 0) {
        const { data: payRows } = await supabase
          .from("payments")
          .select("id, student_fee_id, activity_fee_id, transport_fee_id, amount_paid, method, status, proof_url, payment_date, notes, rejection_reason, submitted_by")
          .in("student_fee_id", feeIds)
          .order("payment_date", { ascending: false });
        setPayments((payRows ?? []) as PaymentListRow[]);
      } else {
        setPayments([]);
      }

      // Activity fees + lista de atividades para filtros
      const [{ data: actFees }, { data: actsList }] = await Promise.all([
        supabase
          .from("activity_fees")
          .select("id, amount_due, due_date, is_paid, month_index, student_id, activity_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), activity:extracurricular_activities(id, name, category)")
          .eq("school_id", sId)
          .order("due_date", { ascending: true }),
        supabase
          .from("extracurricular_activities")
          .select("id, name")
          .eq("school_id", sId)
          .order("name"),
      ]);
      setAllActivityFees((actFees ?? []) as unknown as ActivityFeeRow[]);
      setActivitiesList((actsList ?? []) as Array<{ id: string; name: string }>);

      const actFeeIds = (actFees ?? []).map((f: { id: string }) => f.id);
      if (actFeeIds.length > 0) {
        const { data: actPayRows } = await supabase
          .from("payments")
          .select("id, student_fee_id, activity_fee_id, transport_fee_id, amount_paid, method, status, proof_url, payment_date, notes, rejection_reason, submitted_by")
          .in("activity_fee_id", actFeeIds)
          .order("payment_date", { ascending: false });
        setActivityPayments((actPayRows ?? []) as PaymentListRow[]);
      } else {
        setActivityPayments([]);
      }

      // Transport fees + lista de rotas para filtros
      const [{ data: trFees }, { data: rtsList }] = await Promise.all([
        supabase
          .from("transport_fees")
          .select("id, amount_due, due_date, is_paid, month_index, student_id, route_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), route:transport_routes(id, name)")
          .eq("school_id", sId)
          .order("due_date", { ascending: true }),
        supabase
          .from("transport_routes")
          .select("id, name")
          .eq("school_id", sId)
          .order("name"),
      ]);
      setAllTransportFees((trFees ?? []) as unknown as TransportFeeRow[]);
      setRoutesList((rtsList ?? []) as Array<{ id: string; name: string }>);

      const trFeeIds = (trFees ?? []).map((f: { id: string }) => f.id);
      if (trFeeIds.length > 0) {
        const { data: trPayRows } = await supabase
          .from("payments")
          .select("id, student_fee_id, activity_fee_id, transport_fee_id, amount_paid, method, status, proof_url, payment_date, notes, rejection_reason, submitted_by")
          .in("transport_fee_id", trFeeIds)
          .order("payment_date", { ascending: false });
        setTransportPayments((trPayRows ?? []) as PaymentListRow[]);
      } else {
        setTransportPayments([]);
      }
    } else {
      setAllFees([]);
      setPayments([]);
      setAllActivityFees([]);
      setActivityPayments([]);
      setAllTransportFees([]);
      setTransportPayments([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Fee rules
  const openNewRule = () => {
    setEditingRule(null);
    setRuleForm({ grade_level: "", monthly_amount: "0", due_day: "10", months_count: "10", start_month: "9", notes: "" });
    setRuleDialog(true);
  };
  const openEditRule = (r: FeeRule) => {
    setEditingRule(r);
    setRuleForm({
      grade_level: r.grade_level,
      monthly_amount: String(r.monthly_amount),
      due_day: String(r.due_day),
      months_count: String(r.months_count),
      start_month: String(r.start_month),
      notes: r.notes ?? "",
    });
    setRuleDialog(true);
  };
  const saveRule = async () => {
    if (!schoolId) return;
    if (!ruleForm.grade_level.trim()) {
      toast({ title: "Indica o nível de ensino", variant: "destructive" }); return;
    }
    const payload = {
      school_id: schoolId,
      academic_year_id: activeYearId,
      grade_level: ruleForm.grade_level.trim(),
      monthly_amount: Number(ruleForm.monthly_amount) || 0,
      due_day: Math.max(1, Math.min(28, Number(ruleForm.due_day) || 10)),
      months_count: Math.max(1, Math.min(12, Number(ruleForm.months_count) || 10)),
      start_month: Math.max(1, Math.min(12, Number(ruleForm.start_month) || 9)),
      notes: ruleForm.notes.trim() || null,
    };
    const { error } = editingRule
      ? await supabase.from("fee_rules").update(payload).eq("id", editingRule.id)
      : await supabase.from("fee_rules").insert(payload);
    if (error) { toast({ title: "Erro a guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingRule ? "Regra atualizada" : "Regra criada" });
    setRuleDialog(false);
    fetchAll();
  };
  const confirmDeleteRule = async () => {
    if (!deleteRule) return;
    const { error } = await supabase.from("fee_rules").delete().eq("id", deleteRule);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Regra apagada" });
    setDeleteRule(null);
    fetchAll();
  };

  // Family rules
  const openNewFamily = () => {
    setEditingFamily(null);
    setFamilyForm({ sibling_position: "2", discount_percentage: "10" });
    setFamilyDialog(true);
  };
  const openEditFamily = (f: FamilyRule) => {
    setEditingFamily(f);
    setFamilyForm({ sibling_position: String(f.sibling_position), discount_percentage: String(f.discount_percentage) });
    setFamilyDialog(true);
  };
  const saveFamily = async () => {
    if (!schoolId) return;
    const payload = {
      school_id: schoolId,
      sibling_position: Math.max(2, Math.min(10, Number(familyForm.sibling_position) || 2)),
      discount_percentage: Math.max(0, Math.min(100, Number(familyForm.discount_percentage) || 0)),
    };
    const { error } = editingFamily
      ? await supabase.from("family_discount_rules").update(payload).eq("id", editingFamily.id)
      : await supabase.from("family_discount_rules").insert(payload);
    if (error) { toast({ title: "Erro a guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingFamily ? "Regra atualizada" : "Regra criada" });
    setFamilyDialog(false);
    fetchAll();
  };
  const confirmDeleteFamily = async () => {
    if (!deleteFamily) return;
    const { error } = await supabase.from("family_discount_rules").delete().eq("id", deleteFamily);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Regra apagada" });
    setDeleteFamily(null);
    fetchAll();
  };

  // Student discount overrides
  const openNewDiscount = () => {
    setEditingDiscount(null);
    setDiscountForm({ student_id: "", discount_percentage: "", discount_fixed_amount: "", reason: "" });
    setDiscountDialog(true);
  };
  const openEditDiscount = (d: StudentDiscount) => {
    setEditingDiscount(d);
    setDiscountForm({
      student_id: d.student_id,
      discount_percentage: d.discount_percentage != null ? String(d.discount_percentage) : "",
      discount_fixed_amount: d.discount_fixed_amount != null ? String(d.discount_fixed_amount) : "",
      reason: d.reason ?? "",
    });
    setDiscountDialog(true);
  };
  const saveDiscount = async () => {
    if (!schoolId) return;
    if (!discountForm.student_id) { toast({ title: "Seleciona um aluno", variant: "destructive" }); return; }
    const pct = discountForm.discount_percentage ? Number(discountForm.discount_percentage) : null;
    const fixed = discountForm.discount_fixed_amount ? Number(discountForm.discount_fixed_amount) : null;
    if (pct == null && fixed == null) {
      toast({ title: "Indica uma percentagem ou um valor fixo", variant: "destructive" }); return;
    }
    const payload = {
      school_id: schoolId,
      student_id: discountForm.student_id,
      academic_year_id: activeYearId,
      discount_percentage: pct,
      discount_fixed_amount: fixed,
      reason: discountForm.reason.trim() || null,
      is_active: true,
    };
    const { error } = editingDiscount
      ? await supabase.from("student_discounts").update(payload).eq("id", editingDiscount.id)
      : await supabase.from("student_discounts").insert(payload);
    if (error) { toast({ title: "Erro a guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingDiscount ? "Desconto atualizado" : "Desconto criado" });
    setDiscountDialog(false);
    fetchAll();
  };
  const confirmDeleteDiscount = async () => {
    if (!deleteDiscount) return;
    const { error } = await supabase.from("student_discounts").delete().eq("id", deleteDiscount);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Desconto removido" });
    setDeleteDiscount(null);
    fetchAll();
  };

  // Generate fees for all students
  const runGeneration = async () => {
    if (!schoolId || !generateYearId) return;
    setGenerating(true);
    const { data: studs } = await supabase
      .from("students")
      .select("id, classroom_id, classroom:classrooms(grade_level)")
      .eq("school_id", schoolId);
    if (!studs) { setGenerating(false); return; }

    let total = 0;
    let skipped = 0;
    for (const st of studs as Array<{ id: string; classroom: { grade_level: string | null } | null }>) {
      if (!st.classroom?.grade_level) { skipped++; continue; }
      // Skip if already has fees for the year
      const { count } = await supabase
        .from("student_fees")
        .select("id", { count: "exact", head: true })
        .eq("student_id", st.id)
        .eq("academic_year_id", generateYearId);
      if ((count ?? 0) > 0) { skipped++; continue; }
      const { data: created } = await supabase.rpc("generate_student_fees_for_year", {
        _student_id: st.id,
        _academic_year_id: generateYearId,
      });
      total += (created as number | null) ?? 0;
    }
    setGenerating(false);
    setGenerateOpen(false);
    toast({ title: "Geração concluída", description: `${total} propinas criadas. ${skipped} alunos ignorados (sem nível ou já gerado).` });
  };

  const totalActiveStudents = students.length;
  const monthlyRevenue = useMemo(() => rules.reduce((s, r) => s + Number(r.monthly_amount), 0), [rules]);

  const filteredFees = useMemo(() => {
    const now = Date.now();
    const search = feeSearch.trim().toLowerCase();
    return allFees.filter((f) => {
      if (feeYearFilter !== "all" && f.academic_year_id !== feeYearFilter) return false;
      if (feeClassroomFilter !== "all" && f.student?.classroom_id !== feeClassroomFilter) return false;
      if (feeFilter === "paid" && !f.is_paid) return false;
      if (feeFilter === "pending" && f.is_paid) return false;
      if (feeFilter === "overdue" && (f.is_paid || new Date(f.due_date).getTime() >= now)) return false;
      if (search && !(f.student?.full_name ?? "").toLowerCase().includes(search)) return false;
      return true;
    });
  }, [allFees, feeFilter, feeYearFilter, feeClassroomFilter, feeSearch]);

  const feeStats = useMemo(() => {
    const now = Date.now();
    let paid = 0, pending = 0, overdue = 0;
    allFees.forEach((f) => {
      if (f.is_paid) paid += Number(f.amount_due);
      else {
        pending += Number(f.amount_due);
        if (new Date(f.due_date).getTime() < now) overdue += Number(f.amount_due);
      }
    });
    return { paid, pending, overdue };
  }, [allFees]);

  const latestPaymentByFee = useMemo(() => {
    const map = new Map<string, PaymentListRow>();
    payments.forEach((p) => {
      if (!p.student_fee_id) return;
      if (!map.has(p.student_fee_id)) map.set(p.student_fee_id, p);
    });
    return map;
  }, [payments]);

  const pendingValidations = useMemo(() => {
    return allFees
      .map((f) => ({ fee: f, payment: latestPaymentByFee.get(f.id) }))
      .filter((x) => x.payment && x.payment.status === "pendente") as Array<{ fee: FeeListRow; payment: PaymentListRow }>;
  }, [allFees, latestPaymentByFee]);

  const viewProof = async (path: string) => {
    const { data, error } = await supabase.storage.from("payment-proofs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro a abrir comprovativo", description: error?.message ?? "Sem URL", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const validatePayment = async (fee: FeeListRow, payment: PaymentListRow) => {
    if (!schoolId) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) {
      setValidatingId(null);
      toast({ title: "Erro a validar", description: payErr.message, variant: "destructive" });
      return;
    }
    const { error: feeErr } = await supabase.from("student_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) {
      setValidatingId(null);
      toast({ title: "Erro a marcar propina", description: feeErr.message, variant: "destructive" });
      return;
    }
    if (fee.student?.parent_id) {
      const monthLabel = fee.month_index ? monthNames[fee.month_index - 1] : "";
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento validado — ${monthLabel}`.trim(),
        description: `O pagamento da propina de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "/financas",
      });
    }
    setValidatingId(null);
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await fetchAll();
  };

  const confirmReject = async () => {
    if (!rejectDialog || !schoolId) return;
    const payment = rejectDialog;
    const fee = payment.student_fee_id ? allFees.find((f) => f.id === payment.student_fee_id) : null;
    const actFee = payment.activity_fee_id ? allActivityFees.find((f) => f.id === payment.activity_fee_id) : null;
    const trFee = payment.transport_fee_id ? allTransportFees.find((f) => f.id === payment.transport_fee_id) : null;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const { error } = await supabase
      .from("payments")
      .update({ status: "rejeitado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: rejectReason || null })
      .eq("id", payment.id);
    if (error) {
      setValidatingId(null);
      toast({ title: "Erro a rejeitar", description: error.message, variant: "destructive" });
      return;
    }
    if (fee?.student?.parent_id) {
      const monthLabel = fee.month_index ? monthNames[fee.month_index - 1] : "";
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento rejeitado — ${monthLabel}`.trim(),
        description: `O comprovativo de pagamento de ${fee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}.` : ""} Por favor reenvie o comprovativo correto.`,
        category: "pagamento",
        link: "/financas",
      });
    }
    if (actFee?.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: actFee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento rejeitado — ${actFee.activity?.name ?? "atividade"}`,
        description: `O comprovativo de pagamento da atividade ${actFee.activity?.name ?? ""} de ${actFee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}.` : ""} Por favor reenvie o comprovativo correto.`,
        category: "pagamento",
        link: "/extracurriculares",
      });
    }
    if (trFee?.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: trFee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de transporte rejeitado`,
        description: `O comprovativo de pagamento do transporte (${trFee.route?.name ?? "rota"}) de ${trFee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}.` : ""} Por favor reenvie o comprovativo correto.`,
        category: "pagamento",
        link: "/transportes",
      });
    }
    setValidatingId(null);
    setRejectDialog(null);
    setRejectReason("");
    toast({ title: "Pagamento rejeitado", description: "O encarregado foi notificado." });
    await fetchAll();
  };

  const sendReminder = async (fee: FeeListRow) => {
    if (!schoolId) return;
    const parentId = fee.student?.parent_id;
    if (!parentId) {
      toast({ title: "Aluno sem encarregado", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    setRemindingFeeId(fee.id);
    const monthLabel = fee.month_index ? monthNames[fee.month_index - 1] : "";
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title: `Lembrete de propina ${monthLabel}`.trim(),
      description: `A propina de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${new Date(fee.due_date).toLocaleDateString("pt-PT")}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "/financas",
    });
    setRemindingFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado" });
  };

  const sendBulkReminders = async () => {
    const targets = filteredFees.filter((f) => !f.is_paid && f.student?.parent_id);
    if (targets.length === 0) {
      toast({ title: "Sem destinatários", description: "Não há propinas em dívida com encarregado associado." });
      return;
    }
    const rows = targets.map((f) => ({
      recipient_id: f.student!.parent_id!,
      school_id: schoolId!,
      title: `Lembrete de propina ${f.month_index ? monthNames[f.month_index - 1] : ""}`.trim(),
      description: `A propina de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString("pt-PT")}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "/financas",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${rows.length} lembrete(s) enviado(s)` });
  };

  // ===== Activity fees logic =====
  const filteredActivityFees = useMemo(() => {
    const now = Date.now();
    const search = actSearch.trim().toLowerCase();
    return allActivityFees.filter((f) => {
      if (actYearFilter !== "all" && f.academic_year_id !== actYearFilter) return false;
      if (actActivityFilter !== "all" && f.activity_id !== actActivityFilter) return false;
      if (actFilter === "paid" && !f.is_paid) return false;
      if (actFilter === "pending" && f.is_paid) return false;
      if (actFilter === "overdue" && (f.is_paid || new Date(f.due_date).getTime() >= now)) return false;
      if (search && !(f.student?.full_name ?? "").toLowerCase().includes(search) && !(f.activity?.name ?? "").toLowerCase().includes(search)) return false;
      return true;
    });
  }, [allActivityFees, actFilter, actYearFilter, actActivityFilter, actSearch]);

  const activityFeeStats = useMemo(() => {
    const now = Date.now();
    let paid = 0, pending = 0, overdue = 0;
    allActivityFees.forEach((f) => {
      if (f.is_paid) paid += Number(f.amount_due);
      else {
        pending += Number(f.amount_due);
        if (new Date(f.due_date).getTime() < now) overdue += Number(f.amount_due);
      }
    });
    return { paid, pending, overdue };
  }, [allActivityFees]);

  const latestPaymentByActivityFee = useMemo(() => {
    const map = new Map<string, PaymentListRow>();
    activityPayments.forEach((p) => {
      if (!p.activity_fee_id) return;
      if (!map.has(p.activity_fee_id)) map.set(p.activity_fee_id, p);
    });
    return map;
  }, [activityPayments]);

  const pendingActivityValidations = useMemo(() => {
    return allActivityFees
      .map((f) => ({ fee: f, payment: latestPaymentByActivityFee.get(f.id) }))
      .filter((x) => x.payment && x.payment.status === "pendente") as Array<{ fee: ActivityFeeRow; payment: PaymentListRow }>;
  }, [allActivityFees, latestPaymentByActivityFee]);

  const validateActivityPayment = async (fee: ActivityFeeRow, payment: PaymentListRow) => {
    if (!schoolId) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) {
      setValidatingId(null);
      toast({ title: "Erro a validar", description: payErr.message, variant: "destructive" });
      return;
    }
    const { error: feeErr } = await supabase.from("activity_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) {
      setValidatingId(null);
      toast({ title: "Erro a marcar cobrança", description: feeErr.message, variant: "destructive" });
      return;
    }
    if (fee.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento validado — ${fee.activity?.name ?? "atividade"}`,
        description: `O pagamento da atividade ${fee.activity?.name ?? ""} de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "/extracurriculares",
      });
    }
    setValidatingId(null);
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await fetchAll();
  };

  const sendActivityReminder = async (fee: ActivityFeeRow) => {
    if (!schoolId) return;
    const parentId = fee.student?.parent_id;
    if (!parentId) {
      toast({ title: "Aluno sem encarregado", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    setRemindingActFeeId(fee.id);
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title: `Lembrete — ${fee.activity?.name ?? "Atividade"}`,
      description: `A cobrança da atividade ${fee.activity?.name ?? ""} de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${new Date(fee.due_date).toLocaleDateString("pt-PT")}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "/extracurriculares",
    });
    setRemindingActFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado" });
  };

  const sendActivityBulkReminders = async () => {
    const targets = filteredActivityFees.filter((f) => !f.is_paid && f.student?.parent_id);
    if (targets.length === 0) {
      toast({ title: "Sem destinatários", description: "Não há cobranças em dívida com encarregado associado." });
      return;
    }
    const rows = targets.map((f) => ({
      recipient_id: f.student!.parent_id!,
      school_id: schoolId!,
      title: `Lembrete — ${f.activity?.name ?? "Atividade"}`,
      description: `A cobrança da atividade ${f.activity?.name ?? ""} de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString("pt-PT")}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "/extracurriculares",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${rows.length} lembrete(s) enviado(s)` });
  };

  // ===== Transport fees logic =====
  const filteredTransportFees = useMemo(() => {
    const now = Date.now();
    const search = trSearch.trim().toLowerCase();
    return allTransportFees.filter((f) => {
      if (trYearFilter !== "all" && f.academic_year_id !== trYearFilter) return false;
      if (trRouteFilter !== "all" && f.route_id !== trRouteFilter) return false;
      if (trFilter === "paid" && !f.is_paid) return false;
      if (trFilter === "pending" && f.is_paid) return false;
      if (trFilter === "overdue" && (f.is_paid || new Date(f.due_date).getTime() >= now)) return false;
      if (search && !(f.student?.full_name ?? "").toLowerCase().includes(search) && !(f.route?.name ?? "").toLowerCase().includes(search)) return false;
      return true;
    });
  }, [allTransportFees, trFilter, trYearFilter, trRouteFilter, trSearch]);

  const transportFeeStats = useMemo(() => {
    const now = Date.now();
    let paid = 0, pending = 0, overdue = 0;
    allTransportFees.forEach((f) => {
      if (f.is_paid) paid += Number(f.amount_due);
      else {
        pending += Number(f.amount_due);
        if (new Date(f.due_date).getTime() < now) overdue += Number(f.amount_due);
      }
    });
    return { paid, pending, overdue };
  }, [allTransportFees]);

  const latestPaymentByTransportFee = useMemo(() => {
    const map = new Map<string, PaymentListRow>();
    transportPayments.forEach((p) => {
      if (!p.transport_fee_id) return;
      if (!map.has(p.transport_fee_id)) map.set(p.transport_fee_id, p);
    });
    return map;
  }, [transportPayments]);

  const pendingTransportValidations = useMemo(() => {
    return allTransportFees
      .map((f) => ({ fee: f, payment: latestPaymentByTransportFee.get(f.id) }))
      .filter((x) => x.payment && x.payment.status === "pendente") as Array<{ fee: TransportFeeRow; payment: PaymentListRow }>;
  }, [allTransportFees, latestPaymentByTransportFee]);

  const validateTransportPayment = async (fee: TransportFeeRow, payment: PaymentListRow) => {
    if (!schoolId) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) {
      setValidatingId(null);
      toast({ title: "Erro a validar", description: payErr.message, variant: "destructive" });
      return;
    }
    const { error: feeErr } = await supabase.from("transport_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) {
      setValidatingId(null);
      toast({ title: "Erro a marcar cobrança", description: feeErr.message, variant: "destructive" });
      return;
    }
    if (fee.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de transporte validado`,
        description: `O pagamento do transporte (${fee.route?.name ?? "rota"}) de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "/transportes",
      });
    }
    setValidatingId(null);
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await fetchAll();
  };

  const sendTransportReminder = async (fee: TransportFeeRow) => {
    if (!schoolId) return;
    const parentId = fee.student?.parent_id;
    if (!parentId) {
      toast({ title: "Aluno sem encarregado", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    setRemindingTrFeeId(fee.id);
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title: `Lembrete — Transporte (${fee.route?.name ?? "rota"})`,
      description: `A cobrança do transporte de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${new Date(fee.due_date).toLocaleDateString("pt-PT")}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "/transportes",
    });
    setRemindingTrFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado" });
  };

  const sendTransportBulkReminders = async () => {
    const targets = filteredTransportFees.filter((f) => !f.is_paid && f.student?.parent_id);
    if (targets.length === 0) {
      toast({ title: "Sem destinatários", description: "Não há cobranças em dívida com encarregado associado." });
      return;
    }
    const rows = targets.map((f) => ({
      recipient_id: f.student!.parent_id!,
      school_id: schoolId!,
      title: `Lembrete — Transporte (${f.route?.name ?? "rota"})`,
      description: `A cobrança do transporte de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString("pt-PT")}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "/transportes",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${rows.length} lembrete(s) enviado(s)` });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
            <p className="text-sm text-muted-foreground">Gere as propinas, descontos e cobranças mensais.</p>
          </div>
          <Button onClick={() => setGenerateOpen(true)} className="gap-2">
            <PlayCircle className="h-4 w-4" /> Gerar propinas do ano
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Regras de propina</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{rules.length}</p>
              <p className="text-xs text-muted-foreground">por nível de ensino</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Alunos ativos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalActiveStudents}</p>
              <p className="text-xs text-muted-foreground">na escola</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Descontos manuais</CardTitle>
              <Percent className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{discounts.length}</p>
              <p className="text-xs text-muted-foreground">overrides ativos</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="rules" className="w-full">
          <TabsList>
            <TabsTrigger value="rules">Regras de propina</TabsTrigger>
            <TabsTrigger value="fees">Propinas</TabsTrigger>
            <TabsTrigger value="activity-fees">Extracurriculares</TabsTrigger>
            <TabsTrigger value="transport-fees">Transporte</TabsTrigger>
            <TabsTrigger value="family">Descontos por familiar</TabsTrigger>
            <TabsTrigger value="overrides">Descontos por aluno</TabsTrigger>
          </TabsList>

          {/* FEES TAB */}
          <TabsContent value="fees" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total recebido</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(feeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em dívida</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(feeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em atraso</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(feeStats.overdue)}</p></CardContent>
              </Card>
            </div>

            {pendingValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Comprovativos a validar
                    <Badge variant="secondary">{pendingValidations.length}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Comprovativos enviados pelos educadores que aguardam validação.</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Aluno</th>
                          <th className="py-2 px-2">Mês</th>
                          <th className="py-2 px-2">Valor pago</th>
                          <th className="py-2 px-2">Método</th>
                          <th className="py-2 px-2">Submetido</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.month_index ? monthNames[fee.month_index - 1] : "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString("pt-PT") : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> Ver
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={validatingId === payment.id}
                                  onClick={() => validatePayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Validar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> Rejeitar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Lista de propinas</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Controla o estado das propinas e envia lembretes aos encarregados.</p>
                </div>
                <Button onClick={sendBulkReminders} size="sm" variant="outline" className="gap-2">
                  <Bell className="h-4 w-4" /> Enviar lembretes (filtro atual)
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Pesquisar aluno..." value={feeSearch} onChange={(e) => setFeeSearch(e.target.value)} />
                  </div>
                  <Select value={feeFilter} onValueChange={(v) => setFeeFilter(v as typeof feeFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="pending">Não pagas</SelectItem>
                      <SelectItem value="overdue">Em atraso</SelectItem>
                      <SelectItem value="paid">Pagas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={feeYearFilter} onValueChange={setFeeYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder="Ano letivo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os anos</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={feeClassroomFilter} onValueChange={setFeeClassroomFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder="Turma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as turmas</SelectItem>
                      {classrooms.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem propinas a apresentar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Aluno</th>
                          <th className="py-2 px-2">Turma</th>
                          <th className="py-2 px-2">Mês</th>
                          <th className="py-2 px-2">Vencimento</th>
                          <th className="py-2 px-2">Valor</th>
                          <th className="py-2 px-2">Estado</th>
                          <th className="py-2 px-2 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFees.slice(0, 200).map((f) => {
                          const overdue = !f.is_paid && new Date(f.due_date).getTime() < Date.now();
                          const pay = latestPaymentByFee.get(f.id);
                          const pendingValidation = !!pay && pay.status === "pendente";
                          const rejected = !!pay && pay.status === "rejeitado";
                          return (
                            <tr key={f.id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{f.student?.classroom?.name ?? "—"}</td>
                              <td className="py-2 px-2">{f.month_index ? monthNames[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString("pt-PT")}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">Pago</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">A validar</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">Rejeitado</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">Em atraso</Badge>
                                ) : (
                                  <Badge variant="secondary">Pendente</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> Ver
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                        disabled={validatingId === pay.id}
                                        onClick={() => validatePayment(f, pay)}
                                      >
                                        {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                        Validar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1 text-destructive"
                                        disabled={validatingId === pay.id}
                                        onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                      >
                                        <XCircle className="h-3.5 w-3.5" /> Rejeitar
                                      </Button>
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForFee(f)}>
                                        <Upload className="h-3.5 w-3.5" /> Registar pagamento
                                      </Button>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => sendReminder(f)} disabled={remindingFeeId === f.id || !f.student?.parent_id}>
                                        {remindingFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                        Cobrar
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">A mostrar 200 de {filteredFees.length}. Refina os filtros para ver as restantes.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ACTIVITY FEES TAB (extracurriculares) */}
          <TabsContent value="activity-fees" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total recebido</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(activityFeeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em dívida</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(activityFeeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em atraso</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(activityFeeStats.overdue)}</p></CardContent>
              </Card>
            </div>

            {pendingActivityValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Comprovativos a validar
                    <Badge variant="secondary">{pendingActivityValidations.length}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Comprovativos de atividades extracurriculares enviados pelos educadores.</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Aluno</th>
                          <th className="py-2 px-2">Atividade</th>
                          <th className="py-2 px-2">Valor pago</th>
                          <th className="py-2 px-2">Método</th>
                          <th className="py-2 px-2">Submetido</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingActivityValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.activity?.name ?? "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString("pt-PT") : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> Ver
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={validatingId === payment.id}
                                  onClick={() => validateActivityPayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Validar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> Rejeitar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Cobranças de atividades extracurriculares</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Controla o estado das cobranças e envia lembretes aos encarregados.</p>
                </div>
                <Button onClick={sendActivityBulkReminders} size="sm" variant="outline" className="gap-2">
                  <Bell className="h-4 w-4" /> Enviar lembretes (filtro atual)
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Pesquisar aluno ou atividade..." value={actSearch} onChange={(e) => setActSearch(e.target.value)} />
                  </div>
                  <Select value={actFilter} onValueChange={(v) => setActFilter(v as typeof actFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="pending">Não pagas</SelectItem>
                      <SelectItem value="overdue">Em atraso</SelectItem>
                      <SelectItem value="paid">Pagas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={actYearFilter} onValueChange={setActYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder="Ano letivo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os anos</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={actActivityFilter} onValueChange={setActActivityFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder="Atividade" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as atividades</SelectItem>
                      {activitiesList.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredActivityFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem cobranças a apresentar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Aluno</th>
                          <th className="py-2 px-2">Atividade</th>
                          <th className="py-2 px-2">Mês</th>
                          <th className="py-2 px-2">Vencimento</th>
                          <th className="py-2 px-2">Valor</th>
                          <th className="py-2 px-2">Estado</th>
                          <th className="py-2 px-2 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredActivityFees.slice(0, 200).map((f) => {
                          const overdue = !f.is_paid && new Date(f.due_date).getTime() < Date.now();
                          const pay = latestPaymentByActivityFee.get(f.id);
                          const pendingValidation = !!pay && pay.status === "pendente";
                          const rejected = !!pay && pay.status === "rejeitado";
                          return (
                            <tr key={f.id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2">{f.activity?.name ?? "—"}</td>
                              <td className="py-2 px-2">{f.month_index ? monthNames[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString("pt-PT")}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">Pago</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">A validar</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">Rejeitado</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">Em atraso</Badge>
                                ) : (
                                  <Badge variant="secondary">Pendente</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> Ver
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                        disabled={validatingId === pay.id}
                                        onClick={() => validateActivityPayment(f, pay)}
                                      >
                                        {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                        Validar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1 text-destructive"
                                        disabled={validatingId === pay.id}
                                        onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                      >
                                        <XCircle className="h-3.5 w-3.5" /> Rejeitar
                                      </Button>
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForActivity(f)}>
                                        <Upload className="h-3.5 w-3.5" /> Registar pagamento
                                      </Button>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => sendActivityReminder(f)} disabled={remindingActFeeId === f.id || !f.student?.parent_id}>
                                        {remindingActFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                        Cobrar
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredActivityFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">A mostrar 200 de {filteredActivityFees.length}. Refina os filtros para ver as restantes.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TRANSPORT FEES TAB */}
          <TabsContent value="transport-fees" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total recebido</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(transportFeeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em dívida</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(transportFeeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Em atraso</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(transportFeeStats.overdue)}</p></CardContent>
              </Card>
            </div>

            {pendingTransportValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Comprovativos a validar
                    <Badge variant="secondary">{pendingTransportValidations.length}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Comprovativos de transporte escolar enviados pelos educadores.</p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Aluno</th>
                          <th className="py-2 px-2">Rota</th>
                          <th className="py-2 px-2">Valor pago</th>
                          <th className="py-2 px-2">Método</th>
                          <th className="py-2 px-2">Submetido</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingTransportValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.route?.name ?? "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString("pt-PT") : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> Ver
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={validatingId === payment.id}
                                  onClick={() => validateTransportPayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  Validar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> Rejeitar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Bus className="h-4 w-4" /> Cobranças de transporte escolar</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Controla as mensalidades de transporte e envia lembretes aos encarregados.</p>
                </div>
                <Button onClick={sendTransportBulkReminders} size="sm" variant="outline" className="gap-2">
                  <Bell className="h-4 w-4" /> Enviar lembretes (filtro atual)
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Pesquisar aluno ou rota..." value={trSearch} onChange={(e) => setTrSearch(e.target.value)} />
                  </div>
                  <Select value={trFilter} onValueChange={(v) => setTrFilter(v as typeof trFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      <SelectItem value="pending">Não pagas</SelectItem>
                      <SelectItem value="overdue">Em atraso</SelectItem>
                      <SelectItem value="paid">Pagas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={trYearFilter} onValueChange={setTrYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder="Ano letivo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os anos</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={trRouteFilter} onValueChange={setTrRouteFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder="Rota" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as rotas</SelectItem>
                      {routesList.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredTransportFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem cobranças a apresentar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Aluno</th>
                          <th className="py-2 px-2">Rota</th>
                          <th className="py-2 px-2">Mês</th>
                          <th className="py-2 px-2">Vencimento</th>
                          <th className="py-2 px-2">Valor</th>
                          <th className="py-2 px-2">Estado</th>
                          <th className="py-2 px-2 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransportFees.slice(0, 200).map((f) => {
                          const overdue = !f.is_paid && new Date(f.due_date).getTime() < Date.now();
                          const pay = latestPaymentByTransportFee.get(f.id);
                          const pendingValidation = !!pay && pay.status === "pendente";
                          const rejected = !!pay && pay.status === "rejeitado";
                          return (
                            <tr key={f.id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2">{f.route?.name ?? "—"}</td>
                              <td className="py-2 px-2">{f.month_index ? monthNames[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString("pt-PT")}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">Pago</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">A validar</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">Rejeitado</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">Em atraso</Badge>
                                ) : (
                                  <Badge variant="secondary">Pendente</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> Ver
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                        disabled={validatingId === pay.id}
                                        onClick={() => validateTransportPayment(f, pay)}
                                      >
                                        {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                        Validar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1 text-destructive"
                                        disabled={validatingId === pay.id}
                                        onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                      >
                                        <XCircle className="h-3.5 w-3.5" /> Rejeitar
                                      </Button>
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForTransport(f)}>
                                        <Upload className="h-3.5 w-3.5" /> Registar pagamento
                                      </Button>
                                      <Button size="sm" variant="outline" className="gap-2" onClick={() => sendTransportReminder(f)} disabled={remindingTrFeeId === f.id || !f.student?.parent_id}>
                                        {remindingTrFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                        Cobrar
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredTransportFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">A mostrar 200 de {filteredTransportFees.length}. Refina os filtros para ver as restantes.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RULES TAB */}
          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Propinas por nível de ensino</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Define o valor mensal cobrado em cada nível.</p>
                </div>
                <Button onClick={openNewRule} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova regra</Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : rules.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem regras definidas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Nível</th>
                          <th className="py-2 px-2">Valor mensal</th>
                          <th className="py-2 px-2">Vencimento</th>
                          <th className="py-2 px-2">Meses</th>
                          <th className="py-2 px-2">Início</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rules.map((r) => (
                          <tr key={r.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{r.grade_level}</td>
                            <td className="py-2 px-2">{fmtAOA(Number(r.monthly_amount))}</td>
                            <td className="py-2 px-2">Dia {r.due_day}</td>
                            <td className="py-2 px-2">{r.months_count}</td>
                            <td className="py-2 px-2">{monthNames[r.start_month - 1]}</td>
                            <td className="py-2 px-2 text-right">
                              <Button size="icon" variant="ghost" onClick={() => openEditRule(r)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteRule(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* FAMILY TAB */}
          <TabsContent value="family" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Desconto automático por familiar</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Quando um educador tem vários filhos na escola, aplica-se um desconto.</p>
                </div>
                <Button onClick={openNewFamily} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova regra</Button>
              </CardHeader>
              <CardContent>
                {familyRules.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem regras definidas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Posição do familiar</th>
                          <th className="py-2 px-2">Desconto</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {familyRules.map((f) => (
                          <tr key={f.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{f.sibling_position}º filho ou superior</td>
                            <td className="py-2 px-2"><Badge variant="secondary">{f.discount_percentage}%</Badge></td>
                            <td className="py-2 px-2 text-right">
                              <Button size="icon" variant="ghost" onClick={() => openEditFamily(f)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteFamily(f.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* OVERRIDES TAB */}
          <TabsContent value="overrides" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Descontos manuais por aluno</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Sobrepõe a regra automática em casos especiais.</p>
                </div>
                <Button onClick={openNewDiscount} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Novo desconto</Button>
              </CardHeader>
              <CardContent>
                {discounts.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem descontos manuais.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Aluno</th>
                          <th className="py-2 px-2">Desconto</th>
                          <th className="py-2 px-2">Motivo</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discounts.map((d) => (
                          <tr key={d.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{d.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">
                              {d.discount_percentage != null ? `${d.discount_percentage}%` : null}
                              {d.discount_fixed_amount != null ? fmtAOA(Number(d.discount_fixed_amount)) : null}
                            </td>
                            <td className="py-2 px-2 text-muted-foreground">{d.reason ?? "—"}</td>
                            <td className="py-2 px-2 text-right">
                              <Button size="icon" variant="ghost" onClick={() => openEditDiscount(d)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteDiscount(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* RULE DIALOG */}
      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar regra" : "Nova regra de propina"}</DialogTitle>
            <DialogDescription>Define o valor mensal por nível de ensino.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nível de ensino</Label>
              <Select value={ruleForm.grade_level} onValueChange={(v) => setRuleForm({ ...ruleForm, grade_level: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar nível..." /></SelectTrigger>
                <SelectContent>
                  {GRADE_LEVELS.map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Valor mensal (AOA)</Label>
              <Input type="number" min="0" value={ruleForm.monthly_amount} onChange={(e) => setRuleForm({ ...ruleForm, monthly_amount: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Dia vencimento</Label>
                <Input type="number" min="1" max="28" value={ruleForm.due_day} onChange={(e) => setRuleForm({ ...ruleForm, due_day: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Nº de meses</Label>
                <Input type="number" min="1" max="12" value={ruleForm.months_count} onChange={(e) => setRuleForm({ ...ruleForm, months_count: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Mês início</Label>
                <Select value={ruleForm.start_month} onValueChange={(v) => setRuleForm({ ...ruleForm, start_month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notas (opcional)</Label>
              <Input value={ruleForm.notes} onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialog(false)}>Cancelar</Button>
            <Button onClick={saveRule}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAMILY DIALOG */}
      <Dialog open={familyDialog} onOpenChange={setFamilyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFamily ? "Editar regra" : "Nova regra de família"}</DialogTitle>
            <DialogDescription>Aplica-se a alunos com o mesmo educador.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>A partir do … familiar</Label>
              <Input type="number" min="2" max="10" value={familyForm.sibling_position} onChange={(e) => setFamilyForm({ ...familyForm, sibling_position: e.target.value })} />
              <p className="text-xs text-muted-foreground">2 = aplicar ao 2º filho em diante; 3 = só ao 3º em diante; etc.</p>
            </div>
            <div className="grid gap-2">
              <Label>Desconto (%)</Label>
              <Input type="number" min="0" max="100" value={familyForm.discount_percentage} onChange={(e) => setFamilyForm({ ...familyForm, discount_percentage: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFamilyDialog(false)}>Cancelar</Button>
            <Button onClick={saveFamily}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DISCOUNT DIALOG */}
      <Dialog open={discountDialog} onOpenChange={setDiscountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDiscount ? "Editar desconto" : "Novo desconto manual"}</DialogTitle>
            <DialogDescription>Sobrepõe a regra automática para um aluno específico.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Aluno</Label>
              <Select value={discountForm.student_id} onValueChange={(v) => setDiscountForm({ ...discountForm, student_id: v })} disabled={!!editingDiscount}>
                <SelectTrigger><SelectValue placeholder="Seleciona um aluno" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Desconto %</Label>
                <Input type="number" min="0" max="100" value={discountForm.discount_percentage} onChange={(e) => setDiscountForm({ ...discountForm, discount_percentage: e.target.value, discount_fixed_amount: "" })} />
              </div>
              <div className="grid gap-2">
                <Label>Ou valor fixo</Label>
                <Input type="number" min="0" value={discountForm.discount_fixed_amount} onChange={(e) => setDiscountForm({ ...discountForm, discount_fixed_amount: e.target.value, discount_percentage: "" })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Motivo</Label>
              <Input value={discountForm.reason} onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })} placeholder="Ex: bolsa de mérito" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountDialog(false)}>Cancelar</Button>
            <Button onClick={saveDiscount}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GENERATE DIALOG */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar propinas do ano letivo</DialogTitle>
            <DialogDescription>
              Cria as 10 propinas mensais para todos os alunos com base nas regras definidas.
              Alunos que já têm propinas geradas para este ano serão ignorados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Ano letivo</Label>
              <Select value={generateYearId} onValueChange={setGenerateYearId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (ativo)" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>Cancelar</Button>
            <Button onClick={runGeneration} disabled={generating || !generateYearId}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Gerar propinas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATIONS */}
      <AlertDialog open={!!deleteRule} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar regra?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRule}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteFamily} onOpenChange={(o) => !o && setDeleteFamily(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar regra?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFamily}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteDiscount} onOpenChange={(o) => !o && setDeleteDiscount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover desconto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteDiscount}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!rejectDialog} onOpenChange={(o) => { if (!o) { setRejectDialog(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar comprovativo</DialogTitle>
            <DialogDescription>Indique o motivo. O encarregado será notificado para reenviar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Motivo</Label>
            <Textarea id="reject-reason" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Ex.: comprovativo ilegível, valor incorreto..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)} disabled={!!validatingId}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={!!validatingId} className="gap-2">
              {validatingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECORD PAYMENT DIALOG (staff registers proof and validates immediately) */}
      <Dialog open={!!recordDialog} onOpenChange={(o) => { if (!o && !recordUploading) setRecordDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar pagamento</DialogTitle>
            <DialogDescription>
              {recordDialog?.kind === "fee"
                ? `Anexa o comprovativo da propina de ${recordDialog.fee.student?.full_name ?? ""}. Será marcado como pago e validado, e o encarregado será notificado.`
                : recordDialog?.kind === "activity"
                ? `Anexa o comprovativo da atividade ${recordDialog.fee.activity?.name ?? ""} de ${recordDialog.fee.student?.full_name ?? ""}. Será marcado como pago e validado.`
                : recordDialog?.kind === "transport"
                ? `Anexa o comprovativo do transporte (${recordDialog.fee.route?.name ?? ""}) de ${recordDialog.fee.student?.full_name ?? ""}. Será marcado como pago e validado.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="record-file">Comprovativo (PDF ou imagem)</Label>
              <Input id="record-file" type="file" accept="image/*,application/pdf" onChange={(e) => setRecordFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="record-amount">Valor pago (AOA)</Label>
              <Input id="record-amount" type="number" min="0" value={recordAmount} onChange={(e) => setRecordAmount(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Método</Label>
              <Select value={recordMethod} onValueChange={setRecordMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="multicaixa">Multicaixa Express</SelectItem>
                  <SelectItem value="numerario">Numerário</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="record-notes">Notas (opcional)</Label>
              <Textarea id="record-notes" rows={2} value={recordNotes} onChange={(e) => setRecordNotes(e.target.value)} placeholder="Ex.: nº do recibo, observações..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialog(null)} disabled={recordUploading}>Cancelar</Button>
            <Button onClick={submitStaffPayment} disabled={recordUploading || !recordFile} className="gap-2">
              {recordUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Registar e validar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Pagamentos;