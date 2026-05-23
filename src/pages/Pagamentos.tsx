import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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
import {
  Loader2, Plus, Pencil, Trash2, PlayCircle, Bell, Search, CheckCircle2, XCircle, Eye, FileText, Upload, Bus,
  GraduationCap, FileDown, Utensils, CalendarDays, MoreVertical, Ban, Receipt,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { GRADE_LEVELS } from "@/lib/grade-levels";
import { useAuth } from "@/hooks/useAuth";
import { useHomeroomStudentIds } from "@/hooks/useHomeroomStudentIds";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUserRole } from "@/hooks/useUserRole";
import { canCancelFiscalInvoice, canValidateSchoolPaymentProofs } from "@/lib/schoolStaffRoles";
import type { GuardianPaymentMode } from "@/lib/guardianPayment";
import { encarregadosUsamAnexo, normalizeGuardianPaymentMode } from "@/lib/guardianPayment";
import {
  formatEmitFiscalInvoicesFailureDescription,
  invokeEmitFiscalInvoices,
  type EmitFiscalInvoicesResult,
} from "@/lib/fiscal/invokeEmitFiscalInvoices";
import { downloadFiscalInvoicePdfById } from "@/lib/fiscal/downloadFiscalInvoicePdf";
import { invokeCancelFiscalInvoice } from "@/lib/fiscal/invokeCancelFiscalInvoice";
import { invokeCreditNote } from "@/lib/fiscal/invokeCreditNote";
import { downloadCreditNotePdfById } from "@/lib/fiscal/downloadCreditNotePdf";
import {
  FISCAL_CANCELLATION_REASON_CODES,
  type FiscalCancellationReasonCode,
  resolveCancellationReasonText,
} from "@/lib/fiscal/cancellationReasons";
import {
  CREDIT_NOTE_REASON_CODES,
  type CreditNoteReasonCode,
  resolveCreditNoteReasonText,
} from "@/lib/fiscal/creditNoteReasons";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";
import { uploadFileToR2, R2UploadError } from "@/lib/r2/uploadFileToR2";
import { openFileUrl } from "@/lib/r2/resolveFileUrl";

type StaffValidatedInsertResult = { error: string | null; paymentId?: string };

type FeeTargetScope = "grade_level" | "classrooms" | "students";
type FeeRecurrence = "monthly" | "quarterly" | "semester" | "yearly";

const CALENDAR_MONTHS_FALLBACK_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

function recurrenceStepMonths(r: FeeRecurrence): number {
  if (r === "quarterly") return 3;
  if (r === "semester") return 6;
  if (r === "yearly") return 12;
  return 1;
}

/** Número de períodos de cobrança entre mês início e mês fim (inclusive), conforme a recorrência. */
function countBillingPeriods(startMonth: number, endMonth: number, recurrence: FeeRecurrence): number {
  const step = recurrenceStepMonths(recurrence);
  let m = startMonth;
  for (let c = 1; c < 48; c++) {
    if (m === endMonth) return c;
    m = ((m - 1 + step) % 12) + 1;
  }
  return 1;
}

type FeeRule = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  grade_level: string | null;
  monthly_amount: number;
  due_day: number;
  months_count: number;
  start_month: number;
  end_month: number | null;
  notes: string | null;
  target_scope: string;
  recurrence: string;
  generate_all_upfront: boolean;
  fee_rule_classrooms?: { classroom_id: string }[] | null;
  fee_rule_students?: { student_id: string }[] | null;
};

function formatFeeRuleTarget(r: FeeRule, tuitionT: (key: string, options?: Record<string, unknown>) => string): string {
  const ts = r.target_scope || "grade_level";
  const nStudents = r.fee_rule_students?.length ?? 0;
  if (ts === "students") return tuitionT("fee_target_student", { count: nStudents });
  const nRooms = r.fee_rule_classrooms?.length ?? 0;
  if (ts === "classrooms") return tuitionT("fee_target_class", { count: nRooms });
  return r.grade_level ?? "—";
}

function formatRecurrenceLabel(r: string | undefined, labels: Record<FeeRecurrence, string>): string {
  const k = (r as FeeRecurrence) || "monthly";
  return labels[k] ?? String(r ?? "");
}

type AcademicYear = { id: string; label: string; is_active: boolean | null; start_date?: string | null };
type StudentLite = { id: string; full_name: string; classroom_id: string | null };
type ClassroomLite = { id: string; name: string; academic_year_id?: string | null; grade_level?: string | null };

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

/** Data de vencimento e índice de mês civil (1–12), alinhado com `generate_student_fees_for_year`. */
function feeRuleDueDateForPeriodIndex(
  rule: Pick<FeeRule, "start_month" | "due_day" | "recurrence" | "months_count">,
  academicYearStartDate: string | null | undefined,
  periodIndex: number,
): { monthIndex: number; dueIso: string } | null {
  if (!academicYearStartDate?.trim() || periodIndex < 0 || periodIndex >= rule.months_count) return null;
  const step = recurrenceStepMonths(rule.recurrence as FeeRecurrence);
  const im = periodIndex * step;
  const monthIdx = ((rule.start_month - 1 + im) % 12) + 1;
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(academicYearStartDate);
  const startYear = m ? Number(m[1]) : new Date().getFullYear();
  const yearPart = startYear + Math.floor((rule.start_month - 1 + im) / 12);
  const day = Math.min(Number(rule.due_day) || 10, 28);
  const dueIso = `${yearPart}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { monthIndex: monthIdx, dueIso };
}

/** Alunos abrangidos por esta regra no ano lectivo seleccionado (pré-visualização; a RPC valida prioridade entre regras). */
function studentsMatchingFeeRule(
  rule: FeeRule,
  yearId: string | null | undefined,
  studentList: StudentLite[],
  roomList: ClassroomLite[],
): StudentLite[] {
  if (!yearId) return [];
  if (rule.academic_year_id && rule.academic_year_id !== yearId) return [];

  const yearClsIds = new Set(roomList.filter((c) => c.academic_year_id === yearId).map((c) => c.id));
  const ts = rule.target_scope || "grade_level";

  if (ts === "students") {
    const allow = new Set((rule.fee_rule_students ?? []).map((x) => x.student_id));
    return studentList.filter((s) => allow.has(s.id));
  }

  if (ts === "classrooms") {
    const allowCls = new Set((rule.fee_rule_classrooms ?? []).map((x) => x.classroom_id));
    return studentList.filter(
      (s) => !!(s.classroom_id && allowCls.has(s.classroom_id) && yearClsIds.has(s.classroom_id)),
    );
  }

  const gl = rule.grade_level;
  if (!gl) return [];
  const clsGrade = new Map(
    roomList.filter((c) => c.academic_year_id === yearId).map((c) => [c.id, c.grade_level ?? null]),
  );
  return studentList.filter((s) => {
    if (!s.classroom_id || !yearClsIds.has(s.classroom_id)) return false;
    return clsGrade.get(s.classroom_id) === gl;
  });
}

function findTuitionFeeForPeriod(
  fees: FeeListRow[],
  studentId: string,
  yearId: string | null | undefined,
  monthIndex: number,
  dueIso: string,
): FeeListRow | null {
  if (!yearId) return null;
  const hits = fees.filter(
    (f) => f.student_id === studentId && f.academic_year_id === yearId && Number(f.month_index) === monthIndex,
  );
  if (hits.length === 0) return null;
  const exact = hits.find((f) => (f.due_date ?? "").slice(0, 10) === dueIso);
  return exact ?? hits[0] ?? null;
}

type PaymentListRow = {
  id: string;
  student_fee_id: string | null;
  activity_fee_id: string | null;
  transport_fee_id: string | null;
  meal_fee_id?: string | null;
  enrollment_fee_id?: string | null;
  event_fee_id?: string | null;
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

type MealFeeRow = {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
  student_id: string;
  meal_program_id: string;
  enrollment_id: string;
  academic_year_id: string | null;
  student?: {
    id: string;
    full_name: string;
    parent_id: string | null;
    classroom_id: string | null;
    classroom?: { id: string; name: string } | null;
  } | null;
  meal_program?: { id: string; name: string } | null;
};

type EventFeeRow = {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  month_index: number | null;
  student_id: string;
  event_id: string;
  academic_year_id: string | null;
  student?: {
    id: string;
    full_name: string;
    parent_id: string | null;
    classroom_id: string | null;
    classroom?: { id: string; name: string } | null;
  } | null;
  event?: { id: string; title: string; event_date: string } | null;
};

type EnrollmentFeeRow = {
  id: string;
  amount_due: number;
  due_date: string;
  is_paid: boolean | null;
  fee_type: "NEW" | "RENEWAL";
  student_id: string;
  enrollment_id: string | null;
  academic_year_id: string | null;
  student?: {
    id: string;
    full_name: string;
    parent_id: string | null;
    classroom_id: string | null;
    classroom?: { id: string; name: string } | null;
  } | null;
  academic_year?: { id: string; label: string } | null;
};

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

/** Particiona lista de IDs para consultas `.in(...)` dentro dos limites do PostgREST. */
function chunkBySize<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) return [items.slice()];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type PagamentosFinancePageMode =
  | "tuition"
  | "activityCharges"
  | "transportCharges"
  | "mealCharges"
  | "eventCharges"
  | "enrollmentCharges";

/** `tuition` = página Propinas. Demais modos: listas de cobrança embutidas em Matrículas, Extracurricular, Transporte, Refeições ou Eventos. */
export function PagamentosFinanceHub({ financePage }: { financePage: PagamentosFinancePageMode }) {
  const { t: tPages } = useTranslation("pages");
  const { t: tCommon, i18n } = useTranslation("common");

  const monthNamesLong = useMemo(() => {
    const arr = tCommon("dashboard.calendar_months_long", { returnObjects: true });
    return Array.isArray(arr) && arr.length === 12 ? (arr as string[]) : [...CALENDAR_MONTHS_FALLBACK_PT];
  }, [tCommon, i18n.language]);

  const recurrenceLabels = useMemo(
    (): Record<FeeRecurrence, string> => ({
      monthly: tPages("pagamentos.recurrence.monthly"),
      quarterly: tPages("pagamentos.recurrence.quarterly"),
      semester: tPages("pagamentos.recurrence.semester"),
      yearly: tPages("pagamentos.recurrence.yearly"),
    }),
    [tPages],
  );

  const dateLocaleTag =
    i18n.language?.startsWith("fr") ? "fr-FR" : i18n.language?.startsWith("pt") ? "pt-PT" : "en-GB";

  const tuitionT = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      tPages(`pagamentos.propinas.${key}`, options ?? ({} as Record<string, unknown>)),
    [tPages],
  );

  const embeddedT = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      tPages(`pagamentos_embedded.${key}`, options ?? ({} as Record<string, unknown>)),
    [tPages],
  );

  const tuitionOnly = financePage === "tuition";
  const activityChargesOnly = financePage === "activityCharges";
  const transportChargesOnly = financePage === "transportCharges";
  const mealChargesOnly = financePage === "mealCharges";
  const eventChargesOnly = financePage === "eventCharges";
  const enrollmentChargesOnly = financePage === "enrollmentCharges";
  const chargesEmbeddedOnly =
    activityChargesOnly ||
    transportChargesOnly ||
    mealChargesOnly ||
    eventChargesOnly ||
    enrollmentChargesOnly;

  const embeddedVariantKey = activityChargesOnly
    ? "activity"
    : transportChargesOnly
      ? "transport"
      : mealChargesOnly
        ? "meal"
        : eventChargesOnly
          ? "event"
          : enrollmentChargesOnly
            ? "enrollment"
            : null;
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const { role } = useUserRole();
  const { user } = useAuth();
  const teacherUserId = user?.id ?? null;
  const { ids: homeroomStudentIds, loading: homeroomStudentsLoading } = useHomeroomStudentIds(
    schoolId,
    role,
    teacherUserId,
  );
  const canValidatePaymentProofs = canValidateSchoolPaymentProofs(role);
  const canCancelInvoice = canCancelFiscalInvoice(role);

  const fiscalT = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      tPages(`pagamentos.fiscal_invoice.${key}`, options ?? ({} as Record<string, unknown>)),
    [tPages],
  );
  const { isParent, childIds, classroomIds: parentClassroomIds, loading: parentLoading } = useParentChildren();
  const { selectedYearId: globalAcademicYearId } = useAcademicYear();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);
  const [rules, setRules] = useState<FeeRule[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<FeeRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    target_scope: "grade_level" as FeeTargetScope,
    grade_level: "",
    classroom_ids: [] as string[],
    student_ids: [] as string[],
    monthly_amount: "0",
    recurrence: "monthly" as FeeRecurrence,
    due_day: "10",
    start_month: "9",
    end_month: "6",
    notes: "",
    generate_all_upfront: false,
  });

  const [deleteRule, setDeleteRule] = useState<string | null>(null);

  const [ruleDetailOpen, setRuleDetailOpen] = useState(false);
  const [ruleDetailRule, setRuleDetailRule] = useState<FeeRule | null>(null);
  const [ruleDetailYearId, setRuleDetailYearId] = useState<string | null>(null);
  const [ruleDetailGeneratingKey, setRuleDetailGeneratingKey] = useState<string | null>(null);

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
  const [bulkValidating, setBulkValidating] = useState(false);
  const [bulkRemindingTuition, setBulkRemindingTuition] = useState(false);
  const [bulkSelectedActivityFeeIds, setBulkSelectedActivityFeeIds] = useState<Set<string>>(() => new Set());
  const [bulkSelectedTransportFeeIds, setBulkSelectedTransportFeeIds] = useState<Set<string>>(() => new Set());
  const [bulkSelectedMealFeeIds, setBulkSelectedMealFeeIds] = useState<Set<string>>(() => new Set());
  const [bulkSelectedEnrollmentFeeIds, setBulkSelectedEnrollmentFeeIds] = useState<Set<string>>(() => new Set());
  const [bulkSelectedEventFeeIds, setBulkSelectedEventFeeIds] = useState<Set<string>>(() => new Set());
  /** Propinas (student_fees): selecção na lista principal e em «Comprovativos a validar». */
  const [bulkSelectedTuitionFeeIds, setBulkSelectedTuitionFeeIds] = useState<Set<string>>(() => new Set());
  const [guardianPaymentMode, setGuardianPaymentMode] = useState<GuardianPaymentMode>("proof_attachment");
  const [rejectDialog, setRejectDialog] = useState<PaymentListRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const usarAnexoEncarregado = encarregadosUsamAnexo(guardianPaymentMode);

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

  const [allMealFees, setAllMealFees] = useState<MealFeeRow[]>([]);
  const [mealPayments, setMealPayments] = useState<PaymentListRow[]>([]);
  const [meFilter, setMeFilter] = useState<"all" | "paid" | "pending" | "overdue">("pending");
  const [meYearFilter, setMeYearFilter] = useState<string>("all");
  const [meProgramFilter, setMeProgramFilter] = useState<string>("all");
  const [meSearch, setMeSearch] = useState("");
  const [mealProgramsList, setMealProgramsList] = useState<Array<{ id: string; name: string }>>([]);
  const [remindingMeFeeId, setRemindingMeFeeId] = useState<string | null>(null);

  const [allEventFees, setAllEventFees] = useState<EventFeeRow[]>([]);
  const [eventPayments, setEventPayments] = useState<PaymentListRow[]>([]);
  const [evFilter, setEvFilter] = useState<"all" | "paid" | "pending" | "overdue">("pending");
  const [evYearFilter, setEvYearFilter] = useState<string>("all");
  const [evEventFilter, setEvEventFilter] = useState<string>("all");
  const [evSearch, setEvSearch] = useState("");
  const [eventsList, setEventsList] = useState<Array<{ id: string; title: string }>>([]);
  const [remindingEvFeeId, setRemindingEvFeeId] = useState<string | null>(null);

  // Enrollment fees (matrículas / renovações)
  const [allEnrollmentFees, setAllEnrollmentFees] = useState<EnrollmentFeeRow[]>([]);
  const [enrollmentPayments, setEnrollmentPayments] = useState<PaymentListRow[]>([]);
  const [enFilter, setEnFilter] = useState<"all" | "paid" | "pending" | "overdue">("pending");
  const [enYearFilter, setEnYearFilter] = useState<string>("all");
  const [enTypeFilter, setEnTypeFilter] = useState<"all" | "NEW" | "RENEWAL">("all");
  const [enSearch, setEnSearch] = useState("");
  const [remindingEnFeeId, setRemindingEnFeeId] = useState<string | null>(null);

  /** Fatura fiscal (FACTURA‑RECIBO) por id de pagamento — para ícone/link na lista. */
  const [invoiceByPaymentId, setInvoiceByPaymentId] = useState<
    Record<string, { invoiceId: string; documentNumber: string; invoiceStatus: "N" | "A" }>
  >({});
  const [downloadingInvoicePdfId, setDownloadingInvoicePdfId] = useState<string | null>(null);
  const [cancelInvoiceDialog, setCancelInvoiceDialog] = useState<{
    invoiceId: string;
    documentNumber: string;
    paymentId: string;
  } | null>(null);
  const [cancelReasonCode, setCancelReasonCode] = useState<FiscalCancellationReasonCode>("data_error_nif");
  const [cancelReasonOther, setCancelReasonOther] = useState("");
  const [cancellingInvoiceId, setCancellingInvoiceId] = useState<string | null>(null);

  // Credit Note dialog states
  const [creditNoteDialog, setCreditNoteDialog] = useState<{
    invoiceId: string;
    documentNumber: string;
    paymentId: string;
    grossTotal: number;
  } | null>(null);
  const [creditNoteReasonCode, setCreditNoteReasonCode] = useState<CreditNoteReasonCode>("data_error");
  const [creditNoteReasonOther, setCreditNoteReasonOther] = useState("");
  const [creditNotePartialAmount, setCreditNotePartialAmount] = useState("");
  const [emittingCreditNoteId, setEmittingCreditNoteId] = useState<string | null>(null);

  // Staff "registar pagamento" dialog (works for both tuition and activity fees)
  const [recordDialog, setRecordDialog] = useState<
    | { kind: "fee"; fee: FeeListRow }
    | { kind: "activity"; fee: ActivityFeeRow }
    | { kind: "transport"; fee: TransportFeeRow }
    | { kind: "meal"; fee: MealFeeRow }
    | { kind: "event"; fee: EventFeeRow }
    | { kind: "enrollment"; fee: EnrollmentFeeRow }
    | null
  >(null);
  const [recordFile, setRecordFile] = useState<File | null>(null);
  const [recordAmount, setRecordAmount] = useState("");
  const [recordMethod, setRecordMethod] = useState("transferencia");
  const [recordNotes, setRecordNotes] = useState("");
  const [recordUploading, setRecordUploading] = useState(false);

  // Status change dialog
  const [statusChangeDialog, setStatusChangeDialog] = useState<
    | { kind: "fee"; fee: FeeListRow; payment: PaymentListRow | null }
    | { kind: "activity"; fee: ActivityFeeRow; payment: PaymentListRow | null }
    | { kind: "transport"; fee: TransportFeeRow; payment: PaymentListRow | null }
    | { kind: "meal"; fee: MealFeeRow; payment: PaymentListRow | null }
    | { kind: "event"; fee: EventFeeRow; payment: PaymentListRow | null }
    | { kind: "enrollment"; fee: EnrollmentFeeRow; payment: PaymentListRow | null }
    | null
  >(null);
  const [newStatus, setNewStatus] = useState<"paid" | "unpaid" | "rejected">("paid");
  const [statusChanging, setStatusChanging] = useState(false);

  // Details dialog
  const [detailsDialog, setDetailsDialog] = useState<
    | { kind: "fee"; fee: FeeListRow; payment: PaymentListRow | null }
    | { kind: "activity"; fee: ActivityFeeRow; payment: PaymentListRow | null }
    | { kind: "transport"; fee: TransportFeeRow; payment: PaymentListRow | null }
    | { kind: "meal"; fee: MealFeeRow; payment: PaymentListRow | null }
    | { kind: "event"; fee: EventFeeRow; payment: PaymentListRow | null }
    | { kind: "enrollment"; fee: EnrollmentFeeRow; payment: PaymentListRow | null }
    | null
  >(null);

  const openStatusChangeForFee = (fee: FeeListRow, payment: PaymentListRow | null) => {
    setStatusChangeDialog({ kind: "fee", fee, payment });
    setNewStatus(fee.is_paid ? "paid" : "unpaid");
  };
  const openStatusChangeForActivity = (fee: ActivityFeeRow, payment: PaymentListRow | null) => {
    setStatusChangeDialog({ kind: "activity", fee, payment });
    setNewStatus(fee.is_paid ? "paid" : "unpaid");
  };
  const openStatusChangeForTransport = (fee: TransportFeeRow, payment: PaymentListRow | null) => {
    setStatusChangeDialog({ kind: "transport", fee, payment });
    setNewStatus(fee.is_paid ? "paid" : "unpaid");
  };
  const openStatusChangeForMeal = (fee: MealFeeRow, payment: PaymentListRow | null) => {
    setStatusChangeDialog({ kind: "meal", fee, payment });
    setNewStatus(fee.is_paid ? "paid" : "unpaid");
  };
  const openStatusChangeForEvent = (fee: EventFeeRow, payment: PaymentListRow | null) => {
    setStatusChangeDialog({ kind: "event", fee, payment });
    setNewStatus(fee.is_paid ? "paid" : "unpaid");
  };
  const openStatusChangeForEnrollment = (fee: EnrollmentFeeRow, payment: PaymentListRow | null) => {
    setStatusChangeDialog({ kind: "enrollment", fee, payment });
    setNewStatus(fee.is_paid ? "paid" : "unpaid");
  };

  const openDetailsForFee = (fee: FeeListRow, payment: PaymentListRow | null) => {
    setDetailsDialog({ kind: "fee", fee, payment });
  };
  const openDetailsForActivity = (fee: ActivityFeeRow, payment: PaymentListRow | null) => {
    setDetailsDialog({ kind: "activity", fee, payment });
  };
  const openDetailsForTransport = (fee: TransportFeeRow, payment: PaymentListRow | null) => {
    setDetailsDialog({ kind: "transport", fee, payment });
  };
  const openDetailsForMeal = (fee: MealFeeRow, payment: PaymentListRow | null) => {
    setDetailsDialog({ kind: "meal", fee, payment });
  };
  const openDetailsForEvent = (fee: EventFeeRow, payment: PaymentListRow | null) => {
    setDetailsDialog({ kind: "event", fee, payment });
  };
  const openDetailsForEnrollment = (fee: EnrollmentFeeRow, payment: PaymentListRow | null) => {
    setDetailsDialog({ kind: "enrollment", fee, payment });
  };

  const submitStatusChange = async () => {
    if (!statusChangeDialog || !schoolId) return;
    const kind = statusChangeDialog.kind;
    const fee = statusChangeDialog.fee;

    setStatusChanging(true);
    try {
      let table = "";
      let feeId = "";

      if (kind === "fee") {
        table = "student_fees";
        feeId = (fee as FeeListRow).id;
      } else if (kind === "activity") {
        table = "activity_fees";
        feeId = (fee as ActivityFeeRow).id;
      } else if (kind === "transport") {
        table = "transport_fees";
        feeId = (fee as TransportFeeRow).id;
      } else if (kind === "meal") {
        table = "meal_fees";
        feeId = (fee as MealFeeRow).id;
      } else if (kind === "event") {
        table = "event_fees";
        feeId = (fee as EventFeeRow).id;
      } else if (kind === "enrollment") {
        table = "enrollment_fees";
        feeId = (fee as EnrollmentFeeRow).id;
      }

      const isPaid = newStatus === "paid";
      const { error } = await supabase.from(table).update({ is_paid: isPaid }).eq("id", feeId);

      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Sucesso", description: "Estado do pagamento alterado com sucesso." });
        // Update local state
        if (kind === "fee") {
          setAllFees(prevFees =>
            prevFees.map(f => f.id === feeId ? { ...f, is_paid: isPaid } : f)
          );
        } else if (kind === "activity") {
          setAllActivityFees(prevFees =>
            prevFees.map(f => f.id === feeId ? { ...f, is_paid: isPaid } : f)
          );
        } else if (kind === "transport") {
          setAllTransportFees(prevFees =>
            prevFees.map(f => f.id === feeId ? { ...f, is_paid: isPaid } : f)
          );
        } else if (kind === "meal") {
          setAllMealFees(prevFees =>
            prevFees.map(f => f.id === feeId ? { ...f, is_paid: isPaid } : f)
          );
        } else if (kind === "event") {
          setAllEventFees(prevFees =>
            prevFees.map(f => f.id === feeId ? { ...f, is_paid: isPaid } : f)
          );
        } else if (kind === "enrollment") {
          setAllEnrollmentFees(prevFees =>
            prevFees.map(f => f.id === feeId ? { ...f, is_paid: isPaid } : f)
          );
        }
        setStatusChangeDialog(null);
      }
    } finally {
      setStatusChanging(false);
    }
  };


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
  const openRecordForMeal = (fee: MealFeeRow) => {
    setRecordDialog({ kind: "meal", fee });
    setRecordFile(null);
    setRecordAmount(String(fee.amount_due));
    setRecordMethod("transferencia");
    setRecordNotes("");
  };
  const openRecordForEvent = (fee: EventFeeRow) => {
    setRecordDialog({ kind: "event", fee });
    setRecordFile(null);
    setRecordAmount(String(fee.amount_due));
    setRecordMethod("transferencia");
    setRecordNotes("");
  };
  const openRecordForEnrollment = (fee: EnrollmentFeeRow) => {
    setRecordDialog({ kind: "enrollment", fee });
    setRecordFile(null);
    setRecordAmount(String(fee.amount_due));
    setRecordMethod("transferencia");
    setRecordNotes("");
  };

  const submitStaffPayment = async () => {
    if (!recordDialog || !schoolId) return;
    const exigeAnexo = isParent ? usarAnexoEncarregado : guardianPaymentMode === "proof_attachment";
    if (exigeAnexo && !recordFile) {
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
        : kind === "transport"
        ? (fee as TransportFeeRow).student_id
        : kind === "meal"
        ? (fee as MealFeeRow).student_id
        : kind === "event"
        ? (fee as EventFeeRow).student_id
        : (fee as EnrollmentFeeRow).student_id;
    setRecordUploading(true);
    let proofPath: string | null = null;
    if (recordFile) {
      try {
        proofPath = await uploadFileToR2(recordFile, { prefix: "payment-proofs" });
      } catch (e) {
        setRecordUploading(false);
        const msg = e instanceof R2UploadError ? e.message : e instanceof Error ? e.message : "Upload failed";
        toast({ title: "Erro a enviar ficheiro", description: msg, variant: "destructive" });
        return;
      }
    }
    const amount = Number(recordAmount) || Number(fee.amount_due);
    const insertPayload = isParent ? {
      amount_paid: amount,
      method: recordMethod,
      proof_url: proofPath,
      status: "pendente",
      submitted_by: userId,
      school_id: schoolId,
      notes: recordNotes || null,
      student_fee_id: kind === "fee" ? fee.id : null,
      activity_fee_id: kind === "activity" ? fee.id : null,
      transport_fee_id: kind === "transport" ? fee.id : null,
      meal_fee_id: kind === "meal" ? fee.id : null,
      event_fee_id: kind === "event" ? fee.id : null,
      enrollment_fee_id: kind === "enrollment" ? fee.id : null,
    } : {
      amount_paid: amount,
      method: recordMethod,
      proof_url: proofPath,
      status: "validado",
      submitted_by: userId,
      validated_by: userId,
      validated_at: new Date().toISOString(),
      school_id: schoolId,
      notes: recordNotes || null,
      student_fee_id: kind === "fee" ? fee.id : null,
      activity_fee_id: kind === "activity" ? fee.id : null,
      transport_fee_id: kind === "transport" ? fee.id : null,
      meal_fee_id: kind === "meal" ? fee.id : null,
      event_fee_id: kind === "event" ? fee.id : null,
      enrollment_fee_id: kind === "enrollment" ? fee.id : null,
    };
    const { data: payRow, error: insErr } = await supabase.from("payments").insert(insertPayload).select("id").single();
    if (insErr) {
      setRecordUploading(false);
      toast({ title: "Erro a registar pagamento", description: insErr.message, variant: "destructive" });
      return;
    }
    const { error: feeErr } = isParent ? { error: null } as { error: null } :
      kind === "fee"
        ? await supabase.from("student_fees").update({ is_paid: true }).eq("id", fee.id)
        : kind === "activity"
        ? await supabase.from("activity_fees").update({ is_paid: true }).eq("id", fee.id)
        : kind === "transport"
        ? await supabase.from("transport_fees").update({ is_paid: true }).eq("id", fee.id)
        : kind === "meal"
        ? await supabase.from("meal_fees").update({ is_paid: true }).eq("id", fee.id)
        : kind === "event"
        ? await supabase.from("event_fees").update({ is_paid: true }).eq("id", fee.id)
        : await supabase.from("enrollment_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) {
      setRecordUploading(false);
      toast({ title: "Pagamento registado mas falha a marcar como pago", description: feeErr.message, variant: "destructive" });
      return;
    }
    // Notificação ao encarregado é feita automaticamente pelo trigger tg_notify_payment_validation
    // (evita duplicação de push/email)
    setRecordUploading(false);
    setRecordDialog(null);
    toast({ title: isParent ? "Comprovativo enviado para validação" : "Pagamento registado e validado" });
    if (!isParent && payRow?.id) await emitFtAfterValidation([payRow.id]);
    await fetchAll();
  };

  /**
   * Regista na escola um pagamento já válido quando não há comprovativo pendente (ex.: validação em lote).
   */
  const insertStaffValidatedCharge = async (
    kind: "fee" | "activity" | "transport" | "meal" | "event" | "enrollment",
    fee: FeeListRow | ActivityFeeRow | TransportFeeRow | MealFeeRow | EventFeeRow | EnrollmentFeeRow,
    userId: string | null,
  ): Promise<StaffValidatedInsertResult> => {
    if (!schoolId) return { error: "Sem escola" };
    if (!userId) return { error: "Sessão inválida" };
    const amount = Number((fee as { amount_due: number }).amount_due) || 0;
    const { data: payRow, error: insErr } = await supabase.from("payments").insert({
      amount_paid: amount,
      method: "transferencia",
      proof_url: null,
      status: "validado",
      submitted_by: userId,
      validated_by: userId,
      validated_at: new Date().toISOString(),
      school_id: schoolId,
      notes: "Validação em lote (sem comprovativo pendente)",
      student_fee_id: kind === "fee" ? fee.id : null,
      activity_fee_id: kind === "activity" ? fee.id : null,
      transport_fee_id: kind === "transport" ? fee.id : null,
      meal_fee_id: kind === "meal" ? fee.id : null,
      event_fee_id: kind === "event" ? fee.id : null,
      enrollment_fee_id: kind === "enrollment" ? fee.id : null,
    }).select("id").single();
    if (insErr) return { error: insErr.message };
    if (!payRow?.id) return { error: "Pagamento não criado." };
    const { error: feeErr } =
      kind === "fee"
        ? await supabase.from("student_fees").update({ is_paid: true }).eq("id", fee.id)
        : kind === "activity"
          ? await supabase.from("activity_fees").update({ is_paid: true }).eq("id", fee.id)
          : kind === "transport"
            ? await supabase.from("transport_fees").update({ is_paid: true }).eq("id", fee.id)
            : kind === "meal"
              ? await supabase.from("meal_fees").update({ is_paid: true }).eq("id", fee.id)
              : kind === "event"
                ? await supabase.from("event_fees").update({ is_paid: true }).eq("id", fee.id)
                : await supabase.from("enrollment_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) return { error: feeErr.message };
    const parentId = fee.student?.parent_id ?? null;
    const comprovativoMencao = "";
    if (parentId) {
      if (kind === "fee") {
        const f = fee as FeeListRow;
        const monthLabel = f.month_index ? monthNamesLong[f.month_index - 1] : "";
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento registado — ${monthLabel}`.trim(),
          description: `A escola registou o pagamento da propina de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}).${comprovativoMencao}`,
          category: "pagamento",
          link: "https://www.edukamba.com/pagamentos",
        });
      } else if (kind === "activity") {
        const f = fee as ActivityFeeRow;
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento registado — ${f.activity?.name ?? "atividade"}`,
          description: `A escola registou o pagamento da atividade ${f.activity?.name ?? ""} de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}).${comprovativoMencao}`,
          category: "pagamento",
          link: "https://www.edukamba.com/pagamentos",
        });
      } else if (kind === "transport") {
        const f = fee as TransportFeeRow;
        const monthLabel = f.month_index ? monthNamesLong[f.month_index - 1] : "";
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento de transporte registado — ${monthLabel}`.trim(),
          description: `A escola registou o pagamento do transporte (${f.route?.name ?? "rota"}) de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}).${comprovativoMencao}`,
          category: "pagamento",
          link: "https://www.edukamba.com/pagamentos",
        });
      } else if (kind === "meal") {
        const f = fee as MealFeeRow;
        const monthLabel = f.month_index ? monthNamesLong[f.month_index - 1] : "";
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento de refeições registado — ${monthLabel}`.trim(),
          description: `A escola registou o pagamento do plano ${f.meal_program?.name ?? "refeições"} de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}).${comprovativoMencao}`,
          category: "pagamento",
          link: "https://www.edukamba.com/pagamentos",
        });
      } else if (kind === "event") {
        const f = fee as EventFeeRow;
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento de evento registado`,
          description: `A escola registou o pagamento do evento «${f.event?.title ?? "evento"}» de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}).${comprovativoMencao}`,
          category: "pagamento",
          link: "https://www.edukamba.com/eventos?tab=pagamentos",
        });
      } else {
        const f = fee as EnrollmentFeeRow;
        const label = f.fee_type === "RENEWAL" ? "renovação de matrícula" : "matrícula";
        await supabase.from("notifications").insert({
          recipient_id: parentId,
          school_id: schoolId,
          title: `Pagamento de ${label} registado`,
          description: `A escola registou o pagamento da ${label} de ${f.student?.full_name ?? "o aluno"} (${fmtAOA(amount)}).${comprovativoMencao}`,
          category: "pagamento",
          link: "https://www.edukamba.com/pagamentos",
        });
      }
    }
    return { error: null, paymentId: payRow.id };
  };

  const fetchAll = async () => {
    setLoading(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, support_context_school_id")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single();
    const sId = effectiveSchoolIdFromProfile(profile);
    setSchoolId(sId);
    if (!sId) { setLoading(false); return; }

    const yRes = await supabase.from("academic_years").select("id, label, is_active, start_date").eq("school_id", sId).order("start_date", { ascending: true });

    if (yRes.error) toast({ title: "Erro a carregar anos letivos", description: yRes.error.message, variant: "destructive" });

    const yList = (yRes.data ?? []) as AcademicYear[];
    setYears(yList);
    const active = yList.find((y) => y.is_active) ?? yList[0];
    setActiveYearId(active?.id ?? null);
    setGenerateYearId(active?.id ?? "");

    if (tuitionOnly) {
      const rRes = await supabase
        .from("fee_rules")
        .select("*, fee_rule_classrooms(classroom_id), fee_rule_students(student_id)")
        .eq("school_id", sId)
        .order("created_at", { ascending: false });
      if (rRes.error) toast({ title: "Erro a carregar regras", description: rRes.error.message, variant: "destructive" });
      setRules((rRes.data ?? []) as FeeRule[]);
    } else if (chargesEmbeddedOnly) {
      setRules([]);
    } else {
      setRules([]);
    }

    const [sRes, cRes] = await Promise.all([
      supabase.from("students").select("id, full_name, classroom_id").eq("school_id", sId).order("full_name"),
      supabase.from("classrooms").select("id, name, academic_year_id, grade_level").eq("school_id", sId).order("name"),
    ]);
    setStudents(
      ((sRes.data ?? []) as Array<{ id: string; full_name: string; classroom_id?: string | null }>).map((s) => ({
        id: s.id,
        full_name: s.full_name,
        classroom_id: s.classroom_id ?? null,
      })),
    );
    setClassrooms((cRes.data ?? []) as ClassroomLite[]);

    const { data: payPrefsRow } = await supabase
      .from("school_payment_prefs")
      .select("guardian_payment_mode")
      .eq("school_id", sId)
      .maybeSingle();
    setGuardianPaymentMode(normalizeGuardianPaymentMode(payPrefsRow?.guardian_payment_mode));

    const studentIds = (sRes.data ?? []).map((s) => s.id);
    const scopedStudentIds =
      role === "TEACHER" && chargesEmbeddedOnly
        ? studentIds.filter((id) => homeroomStudentIds.includes(id))
        : isParent
          ? studentIds.filter((id) => childIds.includes(id))
          : studentIds;

    const restrictChargeQueriesToStudents =
      isParent || (role === "TEACHER" && chargesEmbeddedOnly);

    /** Propinas (lista + comprovativos) vs outras cobranças são páginas distintas: evita cargas duplicadas. */
    if (scopedStudentIds.length > 0) {
      if (tuitionOnly) {
        const { data: feesData } = await supabase
          .from("student_fees")
          .select("id, amount_due, due_date, is_paid, month_index, student_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name))")
          .in("student_id", scopedStudentIds)
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

        setAllActivityFees([]);
        setActivityPayments([]);
        setActivitiesList([]);
        setAllTransportFees([]);
        setTransportPayments([]);
        setRoutesList([]);
        setAllMealFees([]);
        setMealPayments([]);
        setMealProgramsList([]);
        setAllEnrollmentFees([]);
        setEnrollmentPayments([]);
        setAllEventFees([]);
        setEventPayments([]);
        setEventsList([]);
      } else if (activityChargesOnly) {
        setAllFees([]);
        setPayments([]);
        setAllTransportFees([]);
        setTransportPayments([]);
        setRoutesList([]);
        setAllMealFees([]);
        setMealPayments([]);
        setMealProgramsList([]);
        setAllEnrollmentFees([]);
        setEnrollmentPayments([]);
        setAllEventFees([]);
        setEventPayments([]);
        setEventsList([]);

        const [{ data: actFees }, { data: actsList }] = await Promise.all([
          (restrictChargeQueriesToStudents
            ? supabase
                .from("activity_fees")
                .select("id, amount_due, due_date, is_paid, month_index, student_id, activity_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), activity:extracurricular_activities(id, name, category)")
                .eq("school_id", sId)
                .in("student_id", scopedStudentIds)
                .order("due_date", { ascending: true })
            : supabase
                .from("activity_fees")
                .select("id, amount_due, due_date, is_paid, month_index, student_id, activity_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), activity:extracurricular_activities(id, name, category)")
                .eq("school_id", sId)
                .order("due_date", { ascending: true })
          ),
          supabase.from("extracurricular_activities").select("id, name").eq("school_id", sId).order("name"),
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
      } else if (transportChargesOnly) {
        setAllFees([]);
        setPayments([]);
        setAllActivityFees([]);
        setActivitiesList([]);
        setActivityPayments([]);
        setAllEnrollmentFees([]);
        setEnrollmentPayments([]);
        setAllMealFees([]);
        setMealPayments([]);
        setMealProgramsList([]);
        setAllEventFees([]);
        setEventPayments([]);
        setEventsList([]);
        const [{ data: trFees }, { data: rtsList }] = await Promise.all([
          (restrictChargeQueriesToStudents
            ? supabase
                .from("transport_fees")
                .select("id, amount_due, due_date, is_paid, month_index, student_id, route_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), route:transport_routes(id, name)")
                .eq("school_id", sId)
                .in("student_id", scopedStudentIds)
                .order("due_date", { ascending: true })
            : supabase
                .from("transport_fees")
                .select("id, amount_due, due_date, is_paid, month_index, student_id, route_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), route:transport_routes(id, name)")
                .eq("school_id", sId)
                .order("due_date", { ascending: true })
          ),
          supabase.from("transport_routes").select("id, name").eq("school_id", sId).order("name"),
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
      } else if (mealChargesOnly) {
        setAllFees([]);
        setPayments([]);
        setAllActivityFees([]);
        setActivitiesList([]);
        setActivityPayments([]);
        setAllTransportFees([]);
        setTransportPayments([]);
        setRoutesList([]);
        setAllEnrollmentFees([]);
        setEnrollmentPayments([]);
        setAllEventFees([]);
        setEventPayments([]);
        setEventsList([]);
        const [{ data: meFees }, { data: progs }] = await Promise.all([
          (restrictChargeQueriesToStudents
            ? supabase
                .from("meal_fees")
                .select("id, amount_due, due_date, is_paid, month_index, student_id, meal_program_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), meal_program:meal_programs(id, name)")
                .eq("school_id", sId)
                .in("student_id", scopedStudentIds)
                .order("due_date", { ascending: true })
            : supabase
                .from("meal_fees")
                .select("id, amount_due, due_date, is_paid, month_index, student_id, meal_program_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), meal_program:meal_programs(id, name)")
                .eq("school_id", sId)
                .order("due_date", { ascending: true })
          ),
          supabase.from("meal_programs").select("id, name").eq("school_id", sId).order("name"),
        ]);
        setAllMealFees((meFees ?? []) as unknown as MealFeeRow[]);
        setMealProgramsList((progs ?? []) as Array<{ id: string; name: string }>);
        const meFeeIds = (meFees ?? []).map((f: { id: string }) => f.id);
        if (meFeeIds.length > 0) {
          const { data: mePayRows } = await supabase
            .from("payments")
            .select("id, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, amount_paid, method, status, proof_url, payment_date, notes, rejection_reason, submitted_by")
            .in("meal_fee_id", meFeeIds)
            .order("payment_date", { ascending: false });
          setMealPayments((mePayRows ?? []) as PaymentListRow[]);
        } else {
          setMealPayments([]);
        }
      } else if (eventChargesOnly) {
        setAllFees([]);
        setPayments([]);
        setAllActivityFees([]);
        setActivitiesList([]);
        setActivityPayments([]);
        setAllTransportFees([]);
        setTransportPayments([]);
        setRoutesList([]);
        setAllMealFees([]);
        setMealPayments([]);
        setMealProgramsList([]);
        setAllEnrollmentFees([]);
        setEnrollmentPayments([]);

        const evSelect =
          "id, amount_due, due_date, is_paid, month_index, student_id, event_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), event:events(id, title, event_date)";
        const [{ data: evFees }, { data: evtsList }] = await Promise.all([
          (restrictChargeQueriesToStudents
            ? supabase.from("event_fees").select(evSelect).eq("school_id", sId).in("student_id", scopedStudentIds).order("due_date", { ascending: true })
            : supabase.from("event_fees").select(evSelect).eq("school_id", sId).order("due_date", { ascending: true })),
          supabase.from("events").select("id, title").eq("school_id", sId).order("event_date", { ascending: false }),
        ]);
        setAllEventFees((evFees ?? []) as unknown as EventFeeRow[]);
        setEventsList((evtsList ?? []) as Array<{ id: string; title: string }>);
        const evFeeIds = (evFees ?? []).map((f: { id: string }) => f.id);
        if (evFeeIds.length > 0) {
          const { data: evPayRows } = await supabase
            .from("payments")
            .select("id, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, event_fee_id, amount_paid, method, status, proof_url, payment_date, notes, rejection_reason, submitted_by")
            .in("event_fee_id", evFeeIds)
            .order("payment_date", { ascending: false });
          setEventPayments((evPayRows ?? []) as PaymentListRow[]);
        } else {
          setEventPayments([]);
        }
      } else if (enrollmentChargesOnly) {
        setAllFees([]);
        setPayments([]);
        setAllActivityFees([]);
        setActivitiesList([]);
        setActivityPayments([]);
        setAllTransportFees([]);
        setTransportPayments([]);
        setRoutesList([]);
        setAllMealFees([]);
        setMealPayments([]);
        setMealProgramsList([]);
        setAllEventFees([]);
        setEventPayments([]);
        setEventsList([]);

        const { data: enFees } = await (restrictChargeQueriesToStudents
          ? supabase
              .from("enrollment_fees")
              .select("id, amount_due, due_date, is_paid, fee_type, student_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), academic_year:academic_years(id, label)")
              .eq("school_id", sId)
              .in("student_id", scopedStudentIds)
              .order("due_date", { ascending: true })
          : supabase
              .from("enrollment_fees")
              .select("id, amount_due, due_date, is_paid, fee_type, student_id, enrollment_id, academic_year_id, student:students(id, full_name, parent_id, classroom_id, classroom:classrooms(id, name)), academic_year:academic_years(id, label)")
              .eq("school_id", sId)
              .order("due_date", { ascending: true })
        );
        setAllEnrollmentFees((enFees ?? []) as unknown as EnrollmentFeeRow[]);

        const enFeeIds = (enFees ?? []).map((f: { id: string }) => f.id);
        if (enFeeIds.length > 0) {
          const { data: enPayRows } = await supabase
            .from("payments")
            .select("id, student_fee_id, activity_fee_id, transport_fee_id, enrollment_fee_id, meal_fee_id, amount_paid, method, status, proof_url, payment_date, notes, rejection_reason, submitted_by")
            .in("enrollment_fee_id", enFeeIds)
            .order("payment_date", { ascending: false });
          setEnrollmentPayments((enPayRows ?? []) as PaymentListRow[]);
        } else {
          setEnrollmentPayments([]);
        }
      }
    } else {
      setAllFees([]);
      setPayments([]);
      setAllActivityFees([]);
      setActivitiesList([]);
      setActivityPayments([]);
      setAllTransportFees([]);
      setTransportPayments([]);
      setAllEnrollmentFees([]);
      setEnrollmentPayments([]);
      setRoutesList([]);
      setAllMealFees([]);
      setMealPayments([]);
      setMealProgramsList([]);
      setAllEventFees([]);
      setEventPayments([]);
      setEventsList([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (parentLoading) return;
    if (chargesEmbeddedOnly && role === "TEACHER" && homeroomStudentsLoading) return;
    void fetchAll();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [
    parentLoading,
    homeroomStudentsLoading,
    isParent,
    childIds.join(","),
    homeroomStudentIds.join(","),
    role,
    tuitionOnly,
    financePage,
  ]);

  /** Ano letivo global (header): alinha filtros aos separadores visíveis. */
  useEffect(() => {
    if (!globalAcademicYearId) return;
    setFeeYearFilter(globalAcademicYearId);
    if (tuitionOnly) return;
    if (activityChargesOnly) {
      setActYearFilter(globalAcademicYearId);
      return;
    }
    if (transportChargesOnly) {
      setTrYearFilter(globalAcademicYearId);
      return;
    }
    if (mealChargesOnly) {
      setMeYearFilter(globalAcademicYearId);
      return;
    }
    if (eventChargesOnly) {
      setEvYearFilter(globalAcademicYearId);
      return;
    }
    if (enrollmentChargesOnly) {
      setEnYearFilter(globalAcademicYearId);
      return;
    }
  }, [globalAcademicYearId, tuitionOnly, activityChargesOnly, transportChargesOnly, mealChargesOnly, eventChargesOnly, enrollmentChargesOnly]);

  // Lock classroom filter to parent's child classroom
  useEffect(() => {
    if (!isParent) return;
    if (parentClassroomIds.length > 0) {
      setFeeClassroomFilter(parentClassroomIds[0]);
    }
  }, [isParent, parentClassroomIds.join(",")]);

  // Fee rules
  const openNewRule = () => {
    setEditingRule(null);
    setRuleForm({
      target_scope: "grade_level",
      grade_level: "",
      classroom_ids: [],
      student_ids: [],
      monthly_amount: "0",
      recurrence: "monthly",
      due_day: "10",
      start_month: "9",
      end_month: "6",
      notes: "",
      generate_all_upfront: false,
    });
    setRuleDialog(true);
  };
  const openEditRule = (r: FeeRule) => {
    setEditingRule(r);
    const ts = (r.target_scope as FeeTargetScope) || "grade_level";
    setRuleForm({
      target_scope: ts,
      grade_level: r.grade_level ?? "",
      classroom_ids: (r.fee_rule_classrooms ?? []).map((x) => x.classroom_id),
      student_ids: (r.fee_rule_students ?? []).map((x) => x.student_id),
      monthly_amount: String(r.monthly_amount),
      recurrence: (r.recurrence as FeeRecurrence) || "monthly",
      due_day: String(r.due_day),
      start_month: String(r.start_month),
      end_month: String(r.end_month ?? r.start_month),
      notes: r.notes ?? "",
      generate_all_upfront: !!r.generate_all_upfront,
    });
    setRuleDialog(true);
  };
  const saveRule = async () => {
    if (!schoolId) return;
    const startMonth = Math.max(1, Math.min(12, Number(ruleForm.start_month) || 9));
    const endMonth = Math.max(1, Math.min(12, Number(ruleForm.end_month) || startMonth));
    const periods = countBillingPeriods(startMonth, endMonth, ruleForm.recurrence);
    if (ruleForm.target_scope === "grade_level" && !ruleForm.grade_level.trim()) {
      toast({ title: "Indica o nível de ensino", variant: "destructive" });
      return;
    }
    if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length === 0) {
      toast({ title: "Seleccione pelo menos uma turma", variant: "destructive" });
      return;
    }
    if (ruleForm.target_scope === "students" && ruleForm.student_ids.length === 0) {
      toast({ title: "Seleccione pelo menos um aluno", variant: "destructive" });
      return;
    }
    const payload = {
      school_id: schoolId,
      academic_year_id: activeYearId,
      target_scope: ruleForm.target_scope,
      grade_level:
        ruleForm.target_scope === "grade_level" ? ruleForm.grade_level.trim() : null,
      monthly_amount: Number(ruleForm.monthly_amount) || 0,
      due_day: Math.max(1, Math.min(28, Number(ruleForm.due_day) || 10)),
      months_count: Math.max(1, Math.min(36, periods)),
      start_month: startMonth,
      end_month: endMonth,
      recurrence: ruleForm.recurrence,
      generate_all_upfront: ruleForm.generate_all_upfront,
      notes: ruleForm.notes.trim() || null,
    };
    let ruleId = editingRule?.id ?? "";
    if (editingRule) {
      const { error } = await supabase.from("fee_rules").update(payload).eq("id", editingRule.id);
      if (error) {
        toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
        return;
      }
      ruleId = editingRule.id;
    } else {
      const { data: ins, error } = await supabase.from("fee_rules").insert(payload).select("id").single();
      if (error) {
        toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
        return;
      }
      ruleId = ins?.id ?? "";
    }
    if (!ruleId) {
      toast({ title: "Erro a guardar", description: "ID da regra em falta.", variant: "destructive" });
      return;
    }
    await supabase.from("fee_rule_classrooms").delete().eq("fee_rule_id", ruleId);
    await supabase.from("fee_rule_students").delete().eq("fee_rule_id", ruleId);
    if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length > 0) {
      const { error: ce } = await supabase.from("fee_rule_classrooms").insert(
        ruleForm.classroom_ids.map((cid) => ({ fee_rule_id: ruleId, classroom_id: cid })),
      );
      if (ce) {
        toast({ title: "Erro ao guardar turmas", description: ce.message, variant: "destructive" });
        return;
      }
    }
    if (ruleForm.target_scope === "students" && ruleForm.student_ids.length > 0) {
      const { error: se } = await supabase.from("fee_rule_students").insert(
        ruleForm.student_ids.map((sid) => ({ fee_rule_id: ruleId, student_id: sid })),
      );
      if (se) {
        toast({ title: "Erro ao guardar alunos", description: se.message, variant: "destructive" });
        return;
      }
    }
    toast({ title: editingRule ? "Regra actualizada" : "Regra criada" });
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
    toast({ title: "Geração concluída", description: `${total} cobrança(s) criada(s). ${skipped} aluno(s) ignorados (sem regra aplicável ou já gerado).` });
    await fetchAll();
  };

  const classroomsForRulePicker = useMemo(() => {
    if (!activeYearId) return classrooms;
    return classrooms.filter((c) => c.academic_year_id === activeYearId);
  }, [classrooms, activeYearId]);

  const openRuleDetail = useCallback(
    (r: FeeRule) => {
      setRuleDetailRule(r);
      const y =
        r.academic_year_id && years.some((x) => x.id === r.academic_year_id)
          ? r.academic_year_id
          : activeYearId;
      setRuleDetailYearId(y ?? years[0]?.id ?? null);
      setRuleDetailOpen(true);
    },
    [activeYearId, years],
  );

  const ruleDetailYearStart = useMemo(() => {
    if (!ruleDetailYearId) return null;
    const raw = years.find((x) => x.id === ruleDetailYearId)?.start_date;
    if (typeof raw === "string" && raw.trim().length >= 10) return raw.slice(0, 10);
    return null;
  }, [ruleDetailYearId, years]);

  const ruleDetailRows = useMemo(() => {
    if (!ruleDetailRule || !ruleDetailYearId || !ruleDetailYearStart) return [];
    const elig = studentsMatchingFeeRule(ruleDetailRule, ruleDetailYearId, students, classrooms);
    const rows: Array<{
      key: string;
      studentId: string;
      studentName: string;
      periodIndex: number;
      monthLabel: string;
      dueIso: string;
      fee: FeeListRow | null;
      baseEstimate: number;
    }> = [];
    const n = ruleDetailRule.months_count;
    for (const st of elig) {
      for (let p = 0; p < n; p++) {
        const dd = feeRuleDueDateForPeriodIndex(ruleDetailRule, ruleDetailYearStart, p);
        if (!dd) continue;
        const fee = findTuitionFeeForPeriod(allFees, st.id, ruleDetailYearId, dd.monthIndex, dd.dueIso);
        rows.push({
          key: `${st.id}-${p}`,
          studentId: st.id,
          studentName: st.full_name,
          periodIndex: p,
          monthLabel: `${monthNamesLong[dd.monthIndex - 1]} · P${p + 1}`,
          dueIso: dd.dueIso,
          fee,
          baseEstimate: Number(ruleDetailRule.monthly_amount) || 0,
        });
      }
    }
    rows.sort((a, b) => {
      if (!!a.fee !== !!b.fee) return a.fee ? -1 : 1;
      const cmp = a.studentName.localeCompare(b.studentName, "pt");
      if (cmp !== 0) return cmp;
      return a.periodIndex - b.periodIndex;
    });
    return rows;
  }, [ruleDetailRule, ruleDetailYearId, ruleDetailYearStart, students, classrooms, allFees, monthNamesLong]);

  const generateRulePeriodFee = async (studentId: string, periodIndex: number) => {
    if (!ruleDetailRule || !ruleDetailYearId || !schoolId) return;
    const k = `${studentId}-${periodIndex}`;
    setRuleDetailGeneratingKey(k);
    const { data, error } = await supabase.rpc("generate_student_fee_for_rule_period", {
      _student_id: studentId,
      _academic_year_id: ruleDetailYearId,
      _fee_rule_id: ruleDetailRule.id,
      _period_index: periodIndex,
    });
    setRuleDetailGeneratingKey(null);
    if (error) {
      toast({ title: "Erro ao gerar", description: error.message, variant: "destructive" });
      return;
    }
    const created = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(created) || created <= 0) {
      toast({
        title: "Não foi possível gerar",
        description:
          "Já existe propina neste período para o aluno, ou outra regra tem prioridade (ex.: específica por aluno) sobre esta.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Propina criada" });
    await fetchAll();
  };

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

  const validatedPaymentIdsForInvoiceFetch = useMemo(() => {
    const ids = new Set<string>();
    for (const p of payments) if (p.status === "validado") ids.add(p.id);
    for (const p of activityPayments) if (p.status === "validado") ids.add(p.id);
    for (const p of transportPayments) if (p.status === "validado") ids.add(p.id);
    for (const p of mealPayments) if (p.status === "validado") ids.add(p.id);
    for (const p of eventPayments) if (p.status === "validado") ids.add(p.id);
    for (const p of enrollmentPayments) if (p.status === "validado") ids.add(p.id);
    return [...ids].sort();
  }, [payments, activityPayments, transportPayments, mealPayments, eventPayments, enrollmentPayments]);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoicesForPayments() {
      if (!schoolId) {
        if (!cancelled) setInvoiceByPaymentId({});
        return;
      }
      const pidList = validatedPaymentIdsForInvoiceFetch;
      if (pidList.length === 0) {
        if (!cancelled) setInvoiceByPaymentId({});
        return;
      }

      const next: Record<string, { invoiceId: string; documentNumber: string }> = {};
      for (const slice of chunkBySize(pidList, 200)) {
        const { data, error } = await supabase
          .from("invoices")
          .select("id, payment_id, document_number, invoice_status")
          .eq("school_id", schoolId)
          .in("payment_id", slice);

        if (error) {
          if (!cancelled)
            toast({
              title: "Erro ao carregar faturas",
              description: error.message,
              variant: "destructive",
            });
          return;
        }
        for (const row of data ?? []) {
          const payId = row.payment_id as string | null;
          if (!payId?.trim()) continue;
          const st = String(row.invoice_status ?? "N").trim().toUpperCase();
          next[payId] = {
            invoiceId: row.id as string,
            documentNumber: String(row.document_number ?? "").trim(),
            invoiceStatus: st === "A" ? "A" : "N",
          };
        }
      }

      if (!cancelled) setInvoiceByPaymentId(next);
    }

    void loadInvoicesForPayments();
    return () => {
      cancelled = true;
    };
  }, [schoolId, validatedPaymentIdsForInvoiceFetch]);

  const pendingValidations = useMemo(() => {
    return allFees
      .map((f) => ({ fee: f, payment: latestPaymentByFee.get(f.id) }))
      .filter((x) => x.payment && x.payment.status === "pendente") as Array<{ fee: FeeListRow; payment: PaymentListRow }>;
  }, [allFees, latestPaymentByFee]);

  /** Gera FT (AGT) após validação; falhas não revertem o pagamento. Devolve resultado da Edge (invoice_id novo quando emitido). */
  const emitFtAfterValidation = async (
    paymentIds: string[],
  ): Promise<{ ok: boolean; results?: EmitFiscalInvoicesResult[]; message?: string }> => {
    const ids = [...new Set(paymentIds.filter(Boolean))];
    if (!ids.length) return { ok: true, results: [] };
    const fx = await invokeEmitFiscalInvoices(ids);
    const emitted = fx.results?.filter((r) => r.status === "emitted" && r.invoice_id?.trim()) ?? [];
    const skipped = fx.results?.filter((r) => r.status === "skipped") ?? [];
    const errored = fx.results?.filter((r) => r.status === "error") ?? [];

    if (emitted.length > 0) {
      setInvoiceByPaymentId((prev) => {
        const next = { ...prev };
        for (const r of emitted) {
          const pid = r.payment_id?.trim();
          const iid = r.invoice_id?.trim();
          if (!pid || !iid) continue;
          next[pid] = {
            invoiceId: iid,
            documentNumber: r.document_number?.trim() ?? "",
            invoiceStatus: "N",
          };
        }
        return next;
      });
    }

    const showFiscalFailureToast = () => {
      toast({
        title: "Fatura fiscal (AGT)",
        description: formatEmitFiscalInvoicesFailureDescription(fx.results, {
          includeSkipped: emitted.length === 0,
          topLevelMessage: fx.message,
        }),
        variant: "destructive",
      });
    };

    if (!fx.ok && !fx.results?.length) {
      showFiscalFailureToast();
      return fx;
    }

    if (errored.length > 0) {
      showFiscalFailureToast();
    } else if (skipped.length > 0 && emitted.length === 0) {
      showFiscalFailureToast();
    }

    if (emitted.length > 0) {
      toast({
        title: emitted.length > 1 ? "Faturas emitidas" : "Fatura emitida",
        description: (
          <div className="flex flex-col gap-2 pt-0.5">
            <p className="text-sm text-muted-foreground">Transfira o PDF (FACTURA‑RECIBO) para cada documento.</p>
            <ul className="list-none space-y-1.5 text-sm">
              {emitted.map((r) => (
                <li key={`${r.invoice_id}_${r.payment_id}`}>
                  <button
                    type="button"
                    className="block w-fit text-left font-medium text-primary underline underline-offset-2 hover:no-underline"
                    onClick={() => {
                      void (async () => {
                        const id = r.invoice_id?.trim();
                        if (!id) return;
                        try {
                          await downloadFiscalInvoicePdfById(id);
                          toast({
                            title: "PDF transferido",
                            description: r.document_number?.trim()
                              ? `FACTURA‑RECIBO ${r.document_number.trim()} guardada.`
                              : "Guarde ou partilhe o ficheiro conforme necessário.",
                          });
                        } catch (e: unknown) {
                          const msg = e instanceof Error ? e.message : String(e);
                          toast({ title: "Erro ao gerar PDF", description: msg, variant: "destructive" });
                        }
                      })();
                    }}
                  >
                    {r.document_number?.trim() || "Transferir PDF"} — FACTURA‑RECIBO
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ),
      });
    }
    return fx;
  };

  const finalizeStudentFeeValidation = async (fee: FeeListRow, payment: PaymentListRow, userId: string | null): Promise<string | null> => {
    if (!schoolId) return "Sem escola";
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) return payErr.message;
    const { error: feeErr } = await supabase.from("student_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) return feeErr.message;
    if (fee.student?.parent_id) {
      const monthLabel = fee.month_index ? monthNamesLong[fee.month_index - 1] : "";
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento validado — ${monthLabel}`.trim(),
        description: `O pagamento da propina de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    return null;
  };

  const finalizeActivityFeeValidation = async (fee: ActivityFeeRow, payment: PaymentListRow, userId: string | null): Promise<string | null> => {
    if (!schoolId) return "Sem escola";
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) return payErr.message;
    const { error: feeErr } = await supabase.from("activity_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) return feeErr.message;
    if (fee.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento validado — ${fee.activity?.name ?? "atividade"}`,
        description: `O pagamento da atividade ${fee.activity?.name ?? ""} de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    return null;
  };

  const finalizeTransportFeeValidation = async (fee: TransportFeeRow, payment: PaymentListRow, userId: string | null): Promise<string | null> => {
    if (!schoolId) return "Sem escola";
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) return payErr.message;
    const { error: feeErr } = await supabase.from("transport_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) return feeErr.message;
    if (fee.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de transporte validado`,
        description: `O pagamento do transporte (${fee.route?.name ?? "rota"}) de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    return null;
  };

  const finalizeMealFeeValidation = async (fee: MealFeeRow, payment: PaymentListRow, userId: string | null): Promise<string | null> => {
    if (!schoolId) return "Sem escola";
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) return payErr.message;
    const { error: feeErr } = await supabase.from("meal_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) return feeErr.message;
    if (fee.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de refeições validado`,
        description: `O pagamento do plano ${fee.meal_program?.name ?? "refeições"} de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    return null;
  };

  const finalizeEventFeeValidation = async (fee: EventFeeRow, payment: PaymentListRow, userId: string | null): Promise<string | null> => {
    if (!schoolId) return "Sem escola";
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) return payErr.message;
    const { error: feeErr } = await supabase.from("event_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) return feeErr.message;
    if (fee.student?.parent_id) {
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de evento validado`,
        description: `O pagamento do evento «${fee.event?.title ?? "evento"}» (${fee.student?.full_name ?? "aluno"}, ${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "https://www.edukamba.com/eventos?tab=pagamentos",
      });
    }
    return null;
  };

  const finalizeEnrollmentFeeValidation = async (fee: EnrollmentFeeRow, payment: PaymentListRow, userId: string | null): Promise<string | null> => {
    if (!schoolId) return "Sem escola";
    const { error: payErr } = await supabase
      .from("payments")
      .update({ status: "validado", validated_by: userId, validated_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", payment.id);
    if (payErr) return payErr.message;
    const { error: feeErr } = await supabase.from("enrollment_fees").update({ is_paid: true }).eq("id", fee.id);
    if (feeErr) return feeErr.message;
    if (fee.student?.parent_id) {
      const label = fee.fee_type === "RENEWAL" ? "renovação de matrícula" : "matrícula";
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de ${label} validado`,
        description: `O pagamento da ${label} de ${fee.student.full_name} (${fmtAOA(Number(payment.amount_paid))}) foi validado pela escola. Obrigado!`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    return null;
  };

  const setBulkActivityFeeChecked = (feeId: string, checked: boolean) => {
    setBulkSelectedActivityFeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(feeId);
      else next.delete(feeId);
      return next;
    });
  };

  const setBulkTransportFeeChecked = (feeId: string, checked: boolean) => {
    setBulkSelectedTransportFeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(feeId);
      else next.delete(feeId);
      return next;
    });
  };

  const setBulkMealFeeChecked = (feeId: string, checked: boolean) => {
    setBulkSelectedMealFeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(feeId);
      else next.delete(feeId);
      return next;
    });
  };

  const setBulkEventFeeChecked = (feeId: string, checked: boolean) => {
    setBulkSelectedEventFeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(feeId);
      else next.delete(feeId);
      return next;
    });
  };

  const setBulkEnrollmentFeeChecked = (feeId: string, checked: boolean) => {
    setBulkSelectedEnrollmentFeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(feeId);
      else next.delete(feeId);
      return next;
    });
  };

  const setBulkTuitionFeeChecked = (studentFeeId: string, checked: boolean) => {
    setBulkSelectedTuitionFeeIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(studentFeeId);
      else next.delete(studentFeeId);
      return next;
    });
  };

  const bulkValidateFees = async () => {
    if (!canValidatePaymentProofs) return;
    const targets = [...bulkSelectedTuitionFeeIds]
      .map((id) => allFees.find((f) => f.id === id))
      .filter((f): f is FeeListRow => !!f && !f.is_paid);
    if (!targets.length) {
      toast({
        title: "Nada a validar nas linhas seleccionadas",
        description: "Seleccione propinas não pagas para validação em lote (com ou sem comprovativo).",
        variant: "destructive",
      });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    setBulkValidating(true);
    let failed = 0;
    const emitIds: string[] = [];
    for (const fee of targets) {
      const pay = latestPaymentByFee.get(fee.id);
      if (pay && pay.status === "pendente") {
        const errMsg = await finalizeStudentFeeValidation(fee, pay, userId);
        if (errMsg) failed++;
        else emitIds.push(pay.id);
      } else {
        const ins = await insertStaffValidatedCharge("fee", fee, userId);
        if (ins.error) failed++;
        else if (ins.paymentId) emitIds.push(ins.paymentId);
      }
    }
    setBulkValidating(false);
    setBulkSelectedTuitionFeeIds(new Set());
    if (failed)
      toast({
        title: "Validação em lote concluída com erros",
        description: `${targets.length - failed} concluída(s), ${failed} falha(s).`,
        variant: "destructive",
      });
    else toast({ title: "Pagamentos validados", description: `${targets.length} cobrança(s) concluída(s).` });
    await emitFtAfterValidation(emitIds);
    await fetchAll();
  };

  const viewProof = async (path: string) => {
    try {
      await openFileUrl(path, "payment-proofs");
    } catch (e) {
      toast({
        title: "Erro a abrir comprovativo",
        description: e instanceof Error ? e.message : "Sem URL",
        variant: "destructive",
      });
    }
  };

  const validatePayment = async (fee: FeeListRow, payment: PaymentListRow) => {
    if (!schoolId || !canValidatePaymentProofs) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const errMsg = await finalizeStudentFeeValidation(fee, payment, userId);
    setValidatingId(null);
    if (errMsg) {
      toast({ title: "Erro a validar", description: errMsg, variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await emitFtAfterValidation([payment.id]);
    await fetchAll();
  };

  const confirmReject = async () => {
    if (!rejectDialog || !schoolId || !canValidatePaymentProofs) return;
    const payment = rejectDialog;
    const fee = payment.student_fee_id ? allFees.find((f) => f.id === payment.student_fee_id) : null;
    const actFee = payment.activity_fee_id ? allActivityFees.find((f) => f.id === payment.activity_fee_id) : null;
    const trFee = payment.transport_fee_id ? allTransportFees.find((f) => f.id === payment.transport_fee_id) : null;
    const meFee = payment.meal_fee_id ? allMealFees.find((f) => f.id === payment.meal_fee_id) : null;
    const evFee = payment.event_fee_id ? allEventFees.find((f) => f.id === payment.event_fee_id) : null;
    const enFee = payment.enrollment_fee_id ? allEnrollmentFees.find((f) => f.id === payment.enrollment_fee_id) : null;
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
      const monthLabel = fee.month_index ? monthNamesLong[fee.month_index - 1] : "";
      const followUp = usarAnexoEncarregado
        ? "Por favor reenvie o comprovativo correto."
        : "Para regularizar o pagamento, dirija-se à escola.";
      await supabase.from("notifications").insert({
        recipient_id: fee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento rejeitado — ${monthLabel}`.trim(),
        description: `O comprovativo de pagamento de ${fee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}. ` : ""}${followUp}`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    if (actFee?.student?.parent_id) {
      const followUp = usarAnexoEncarregado ? "Por favor reenvie o comprovativo correto." : "Para regularizar o pagamento, dirija-se à escola.";
      await supabase.from("notifications").insert({
        recipient_id: actFee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento rejeitado — ${actFee.activity?.name ?? "atividade"}`,
        description: `O comprovativo de pagamento da atividade ${actFee.activity?.name ?? ""} de ${actFee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}. ` : ""}${followUp}`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    if (trFee?.student?.parent_id) {
      const followUp = usarAnexoEncarregado ? "Por favor reenvie o comprovativo correto." : "Para regularizar o pagamento, dirija-se à escola.";
      await supabase.from("notifications").insert({
        recipient_id: trFee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de transporte rejeitado`,
        description: `O comprovativo de pagamento do transporte (${trFee.route?.name ?? "rota"}) de ${trFee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}. ` : ""}${followUp}`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    if (meFee?.student?.parent_id) {
      const followUp = usarAnexoEncarregado ? "Por favor reenvie o comprovativo correto." : "Para regularizar o pagamento, dirija-se à escola.";
      await supabase.from("notifications").insert({
        recipient_id: meFee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de refeições rejeitado`,
        description: `O comprovativo de pagamento do plano ${meFee.meal_program?.name ?? "refeições"} de ${meFee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}. ` : ""}${followUp}`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      });
    }
    if (evFee?.student?.parent_id) {
      const followUp = usarAnexoEncarregado ? "Por favor reenvie o comprovativo correto." : "Para regularizar o pagamento, dirija-se à escola.";
      await supabase.from("notifications").insert({
        recipient_id: evFee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de evento rejeitado`,
        description: `O comprovativo do evento «${evFee.event?.title ?? "evento"}» de ${evFee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}. ` : ""}${followUp}`,
        category: "pagamento",
        link: "https://www.edukamba.com/eventos?tab=pagamentos",
      });
    }
    if (enFee?.student?.parent_id) {
      const lbl = enFee.fee_type === "RENEWAL" ? "renovação de matrícula" : "matrícula";
      const followUp = usarAnexoEncarregado ? "Por favor reenvie o comprovativo correto." : "Para regularizar o pagamento, dirija-se à escola.";
      await supabase.from("notifications").insert({
        recipient_id: enFee.student.parent_id,
        school_id: schoolId,
        title: `Pagamento de ${lbl} rejeitado`,
        description: `O comprovativo do pagamento da ${lbl} de ${enFee.student.full_name} foi rejeitado. ${rejectReason ? `Motivo: ${rejectReason}. ` : ""}${followUp}`,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
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
    const monthLabel = fee.month_index ? monthNamesLong[fee.month_index - 1] : "";
    const title = `Lembrete de propina ${monthLabel}`.trim();
    const description = `A propina de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${new Date(fee.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`;
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title,
      description,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    });
    if (!error && (fee.student_id ?? fee.student?.id)) {
      void supabase.functions.invoke("send-cobrar-email", {
        body: { student_id: fee.student_id ?? fee.student?.id, title, description, link: `https://www.edukamba.com/pagamentos` },
      });
    }
    setRemindingFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado e ao aluno" });
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
      title: `Lembrete de propina ${f.month_index ? monthNamesLong[f.month_index - 1] : ""}`.trim(),
      description: `A propina de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${rows.length} lembrete(s) enviado(s)` });
  };

  /** Cobrar (lembrete + email) só para as propinas actualmente seleccionadas na lista. */
  const sendBulkRemindersForSelectedTuitionFees = async () => {
    if (!schoolId) return;
    const fees = [...bulkSelectedTuitionFeeIds]
      .map((id) => allFees.find((f) => f.id === id))
      .filter((f): f is FeeListRow => !!f && !f.is_paid && !!f.student?.parent_id);
    if (fees.length === 0) {
      toast({
        title: "Sem destinatários",
        description: "Seleccione propinas não pagas com encarregado associado.",
        variant: "destructive",
      });
      return;
    }
    setBulkRemindingTuition(true);
    const rows = fees.map((f) => {
      const monthLabel = f.month_index ? monthNamesLong[f.month_index - 1] : "";
      const title = `Lembrete de propina ${monthLabel}`.trim();
      const description = `A propina de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`;
      return {
        recipient_id: f.student!.parent_id!,
        school_id: schoolId,
        title,
        description,
        category: "pagamento",
        link: "https://www.edukamba.com/pagamentos",
      };
    });
    const { error } = await supabase.from("notifications").insert(rows);
    if (!error) {
      fees.forEach((f, i) => {
        const studentId = f.student_id ?? f.student?.id;
        if (studentId) {
          void supabase.functions.invoke("send-cobrar-email", {
            body: {
              student_id: studentId,
              title: rows[i].title,
              description: rows[i].description,
              link: "https://www.edukamba.com/pagamentos",
            },
          });
        }
      });
    }
    setBulkRemindingTuition(false);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${fees.length} cobrança(s) enviada(s)`, description: "Lembrete no portal e email quando configurado." });
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
    if (!schoolId || !canValidatePaymentProofs) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const errMsg = await finalizeActivityFeeValidation(fee, payment, userId);
    setValidatingId(null);
    if (errMsg) {
      toast({ title: "Erro a validar", description: errMsg, variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await emitFtAfterValidation([payment.id]);
    await fetchAll();
  };

  const bulkValidateActivityFeesList = async () => {
    if (!canValidatePaymentProofs) return;
    const targets = [...bulkSelectedActivityFeeIds]
      .map((id) => allActivityFees.find((f) => f.id === id))
      .filter((f): f is ActivityFeeRow => !!f && !f.is_paid);
    if (!targets.length) {
      toast({
        title: "Nada a validar nas linhas seleccionadas",
        description: "Seleccione cobranças extracurriculares não pagas (com ou sem comprovativo).",
        variant: "destructive",
      });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    setBulkValidating(true);
    let failed = 0;
    const emitIds: string[] = [];
    for (const fee of targets) {
      const pay = latestPaymentByActivityFee.get(fee.id);
      if (pay && pay.status === "pendente") {
        const errMsg = await finalizeActivityFeeValidation(fee, pay, userId);
        if (errMsg) failed++;
        else emitIds.push(pay.id);
      } else {
        const ins = await insertStaffValidatedCharge("activity", fee, userId);
        if (ins.error) failed++;
        else if (ins.paymentId) emitIds.push(ins.paymentId);
      }
    }
    setBulkValidating(false);
    setBulkSelectedActivityFeeIds(new Set());
    if (failed)
      toast({
        title: "Validação em lote concluída com erros",
        description: `${targets.length - failed} concluída(s), ${failed} falha(s).`,
        variant: "destructive",
      });
    else toast({ title: "Pagamentos validados", description: `${targets.length} cobrança(s) concluída(s).` });
    await emitFtAfterValidation(emitIds);
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
    const title = `Lembrete — ${fee.activity?.name ?? "Atividade"}`;
    const description = `A cobrança da atividade ${fee.activity?.name ?? ""} de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${new Date(fee.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`;
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title,
      description,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    });
    if (!error) {
      void supabase.functions.invoke("send-cobrar-email", {
        body: { student_id: fee.student_id, title, description, link: `https://www.edukamba.com/pagamentos` },
      });
    }
    setRemindingActFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado e ao aluno" });
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
      description: `A cobrança da atividade ${f.activity?.name ?? ""} de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
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
    if (!schoolId || !canValidatePaymentProofs) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const errMsg = await finalizeTransportFeeValidation(fee, payment, userId);
    setValidatingId(null);
    if (errMsg) {
      toast({ title: "Erro a validar", description: errMsg, variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await emitFtAfterValidation([payment.id]);
    await fetchAll();
  };

  const bulkValidateTransportFeesList = async () => {
    if (!canValidatePaymentProofs) return;
    const targets = [...bulkSelectedTransportFeeIds]
      .map((id) => allTransportFees.find((f) => f.id === id))
      .filter((f): f is TransportFeeRow => !!f && !f.is_paid);
    if (!targets.length) {
      toast({
        title: "Nada a validar nas linhas seleccionadas",
        description: "Seleccione mensalidades de transporte não pagas (com ou sem comprovativo).",
        variant: "destructive",
      });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    setBulkValidating(true);
    let failed = 0;
    const emitIds: string[] = [];
    for (const fee of targets) {
      const pay = latestPaymentByTransportFee.get(fee.id);
      if (pay && pay.status === "pendente") {
        const errMsg = await finalizeTransportFeeValidation(fee, pay, userId);
        if (errMsg) failed++;
        else emitIds.push(pay.id);
      } else {
        const ins = await insertStaffValidatedCharge("transport", fee, userId);
        if (ins.error) failed++;
        else if (ins.paymentId) emitIds.push(ins.paymentId);
      }
    }
    setBulkValidating(false);
    setBulkSelectedTransportFeeIds(new Set());
    if (failed)
      toast({
        title: "Validação em lote concluída com erros",
        description: `${targets.length - failed} concluída(s), ${failed} falha(s).`,
        variant: "destructive",
      });
    else toast({ title: "Pagamentos validados", description: `${targets.length} cobrança(s) concluída(s).` });
    await emitFtAfterValidation(emitIds);
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
    const title = `Lembrete — Transporte (${fee.route?.name ?? "rota"})`;
    const description = `A cobrança do transporte de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${new Date(fee.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`;
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title,
      description,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    });
    if (!error) {
      void supabase.functions.invoke("send-cobrar-email", {
        body: { student_id: fee.student_id, title, description, link: `https://www.edukamba.com/pagamentos` },
      });
    }
    setRemindingTrFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado e ao aluno" });
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
      description: `A cobrança do transporte de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${rows.length} lembrete(s) enviado(s)` });
  };

  // ===== Meal fees logic =====
  const filteredMealFees = useMemo(() => {
    const now = Date.now();
    const search = meSearch.trim().toLowerCase();
    return allMealFees.filter((f) => {
      if (meYearFilter !== "all" && f.academic_year_id !== meYearFilter) return false;
      if (meProgramFilter !== "all" && f.meal_program_id !== meProgramFilter) return false;
      if (meFilter === "paid" && !f.is_paid) return false;
      if (meFilter === "pending" && f.is_paid) return false;
      if (meFilter === "overdue" && (f.is_paid || new Date(f.due_date).getTime() >= now)) return false;
      if (
        search &&
        !(f.student?.full_name ?? "").toLowerCase().includes(search) &&
        !(f.meal_program?.name ?? "").toLowerCase().includes(search)
      )
        return false;
      return true;
    });
  }, [allMealFees, meFilter, meYearFilter, meProgramFilter, meSearch]);

  const mealFeeStats = useMemo(() => {
    const now = Date.now();
    let paid = 0, pending = 0, overdue = 0;
    allMealFees.forEach((f) => {
      if (f.is_paid) paid += Number(f.amount_due);
      else {
        pending += Number(f.amount_due);
        if (new Date(f.due_date).getTime() < now) overdue += Number(f.amount_due);
      }
    });
    return { paid, pending, overdue };
  }, [allMealFees]);

  const latestPaymentByMealFee = useMemo(() => {
    const map = new Map<string, PaymentListRow>();
    mealPayments.forEach((p) => {
      if (!p.meal_fee_id) return;
      if (!map.has(p.meal_fee_id)) map.set(p.meal_fee_id, p);
    });
    return map;
  }, [mealPayments]);

  const pendingMealValidations = useMemo(() => {
    return allMealFees
      .map((f) => ({ fee: f, payment: latestPaymentByMealFee.get(f.id) }))
      .filter((x) => x.payment && x.payment.status === "pendente") as Array<{ fee: MealFeeRow; payment: PaymentListRow }>;
  }, [allMealFees, latestPaymentByMealFee]);

  const validateMealPayment = async (fee: MealFeeRow, payment: PaymentListRow) => {
    if (!schoolId || !canValidatePaymentProofs) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const errMsg = await finalizeMealFeeValidation(fee, payment, userId);
    setValidatingId(null);
    if (errMsg) {
      toast({ title: "Erro a validar", description: errMsg, variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await emitFtAfterValidation([payment.id]);
    await fetchAll();
  };

  const bulkValidateMealFeesList = async () => {
    if (!canValidatePaymentProofs) return;
    const targets = [...bulkSelectedMealFeeIds]
      .map((id) => allMealFees.find((f) => f.id === id))
      .filter((f): f is MealFeeRow => !!f && !f.is_paid);
    if (!targets.length) {
      toast({
        title: "Nada a validar nas linhas seleccionadas",
        description: "Seleccione cobranças de refeições não pagas (com ou sem comprovativo).",
        variant: "destructive",
      });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    setBulkValidating(true);
    let failed = 0;
    const emitIds: string[] = [];
    for (const fee of targets) {
      const pay = latestPaymentByMealFee.get(fee.id);
      if (pay && pay.status === "pendente") {
        const errMsg = await finalizeMealFeeValidation(fee, pay, userId);
        if (errMsg) failed++;
        else emitIds.push(pay.id);
      } else {
        const ins = await insertStaffValidatedCharge("meal", fee, userId);
        if (ins.error) failed++;
        else if (ins.paymentId) emitIds.push(ins.paymentId);
      }
    }
    setBulkValidating(false);
    setBulkSelectedMealFeeIds(new Set());
    if (failed)
      toast({
        title: "Validação em lote concluída com erros",
        description: `${targets.length - failed} concluída(s), ${failed} falha(s).`,
        variant: "destructive",
      });
    else toast({ title: "Pagamentos validados", description: `${targets.length} cobrança(s) concluída(s).` });
    await emitFtAfterValidation(emitIds);
    await fetchAll();
  };

  const sendMealReminder = async (fee: MealFeeRow) => {
    if (!schoolId) return;
    const parentId = fee.student?.parent_id;
    if (!parentId) {
      toast({ title: "Aluno sem encarregado", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    setRemindingMeFeeId(fee.id);
    const title = `Lembrete — Refeições (${fee.meal_program?.name ?? "plano"})`;
    const description = `A cobrança de refeições (${fee.meal_program?.name ?? "plano"}) de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} venceu em ${new Date(fee.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`;
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title,
      description,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    });
    if (!error) {
      void supabase.functions.invoke("send-cobrar-email", {
        body: { student_id: fee.student_id, title, description, link: `https://www.edukamba.com/pagamentos` },
      });
    }
    setRemindingMeFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado e ao aluno" });
  };

  const sendMealBulkReminders = async () => {
    const targets = filteredMealFees.filter((f) => !f.is_paid && f.student?.parent_id);
    if (targets.length === 0) {
      toast({ title: "Sem destinatários", description: "Não há cobranças em dívida com encarregado associado." });
      return;
    }
    const rows = targets.map((f) => ({
      recipient_id: f.student!.parent_id!,
      school_id: schoolId!,
      title: `Lembrete — Refeições (${f.meal_program?.name ?? "plano"})`,
      description: `A cobrança de refeições de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${rows.length} lembrete(s) enviado(s)` });
  };

  // ===== Event fees logic =====
  const filteredEventFees = useMemo(() => {
    const now = Date.now();
    const search = evSearch.trim().toLowerCase();
    return allEventFees.filter((f) => {
      if (evYearFilter !== "all" && f.academic_year_id !== evYearFilter) return false;
      if (evEventFilter !== "all" && f.event_id !== evEventFilter) return false;
      if (evFilter === "paid" && !f.is_paid) return false;
      if (evFilter === "pending" && f.is_paid) return false;
      if (evFilter === "overdue" && (f.is_paid || new Date(f.due_date).getTime() >= now)) return false;
      if (
        search &&
        !(f.student?.full_name ?? "").toLowerCase().includes(search) &&
        !(f.event?.title ?? "").toLowerCase().includes(search)
      )
        return false;
      return true;
    });
  }, [allEventFees, evFilter, evYearFilter, evEventFilter, evSearch]);

  const eventFeeStats = useMemo(() => {
    const now = Date.now();
    let paid = 0, pending = 0, overdue = 0;
    allEventFees.forEach((f) => {
      if (f.is_paid) paid += Number(f.amount_due);
      else {
        pending += Number(f.amount_due);
        if (new Date(f.due_date).getTime() < now) overdue += Number(f.amount_due);
      }
    });
    return { paid, pending, overdue };
  }, [allEventFees]);

  const latestPaymentByEventFee = useMemo(() => {
    const map = new Map<string, PaymentListRow>();
    eventPayments.forEach((p) => {
      if (!p.event_fee_id) return;
      if (!map.has(p.event_fee_id)) map.set(p.event_fee_id, p);
    });
    return map;
  }, [eventPayments]);

  const pendingEventValidations = useMemo(() => {
    return allEventFees
      .map((f) => ({ fee: f, payment: latestPaymentByEventFee.get(f.id) }))
      .filter((x) => x.payment && x.payment.status === "pendente") as Array<{ fee: EventFeeRow; payment: PaymentListRow }>;
  }, [allEventFees, latestPaymentByEventFee]);

  const validateEventPayment = async (fee: EventFeeRow, payment: PaymentListRow) => {
    if (!schoolId || !canValidatePaymentProofs) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const errMsg = await finalizeEventFeeValidation(fee, payment, userId);
    setValidatingId(null);
    if (errMsg) {
      toast({ title: "Erro a validar", description: errMsg, variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await emitFtAfterValidation([payment.id]);
    await fetchAll();
  };

  const bulkValidateEventFeesList = async () => {
    if (!canValidatePaymentProofs) return;
    const targets = [...bulkSelectedEventFeeIds]
      .map((id) => allEventFees.find((f) => f.id === id))
      .filter((f): f is EventFeeRow => !!f && !f.is_paid);
    if (!targets.length) {
      toast({
        title: "Nada a validar nas linhas seleccionadas",
        description: "Seleccione cobranças de eventos não pagas (com ou sem comprovativo).",
        variant: "destructive",
      });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    setBulkValidating(true);
    let failed = 0;
    const emitIds: string[] = [];
    for (const fee of targets) {
      const pay = latestPaymentByEventFee.get(fee.id);
      if (pay && pay.status === "pendente") {
        const errMsg = await finalizeEventFeeValidation(fee, pay, userId);
        if (errMsg) failed++;
        else emitIds.push(pay.id);
      } else {
        const ins = await insertStaffValidatedCharge("event", fee, userId);
        if (ins.error) failed++;
        else if (ins.paymentId) emitIds.push(ins.paymentId);
      }
    }
    setBulkValidating(false);
    setBulkSelectedEventFeeIds(new Set());
    if (failed)
      toast({
        title: "Validação em lote concluída com erros",
        description: `${targets.length - failed} concluída(s), ${failed} falha(s).`,
        variant: "destructive",
      });
    else toast({ title: "Pagamentos validados", description: `${targets.length} cobrança(s) concluída(s).` });
    await emitFtAfterValidation(emitIds);
    await fetchAll();
  };

  const sendEventReminder = async (fee: EventFeeRow) => {
    if (!schoolId) return;
    const parentId = fee.student?.parent_id;
    if (!parentId) {
      toast({ title: "Aluno sem encarregado", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    setRemindingEvFeeId(fee.id);
    const title = `Lembrete — Evento (${fee.event?.title ?? "evento"})`;
    const description = `A cobrança do evento «${fee.event?.title ?? "evento"}» de ${fee.student?.full_name ?? "o aluno"} (${fmtAOA(Number(fee.amount_due))}) venceu em ${new Date(fee.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`;
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title,
      description,
      category: "pagamento",
      link: "https://www.edukamba.com/eventos?tab=pagamentos",
    });
    if (!error) {
      void supabase.functions.invoke("send-cobrar-email", {
        body: { student_id: fee.student_id, title, description, link: `https://www.edukamba.com/eventos?tab=pagamentos` },
      });
    }
    setRemindingEvFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado e ao aluno" });
  };

  const sendEventBulkReminders = async () => {
    const targets = filteredEventFees.filter((f) => !f.is_paid && f.student?.parent_id);
    if (targets.length === 0) {
      toast({ title: "Sem destinatários", description: "Não há cobranças em dívida com encarregado associado." });
      return;
    }
    const rows = targets.map((f) => ({
      recipient_id: f.student!.parent_id!,
      school_id: schoolId!,
      title: `Lembrete — Evento (${f.event?.title ?? "evento"})`,
      description: `A cobrança do evento «${f.event?.title ?? "evento"}» de ${f.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(f.amount_due))} venceu em ${new Date(f.due_date).toLocaleDateString(dateLocaleTag)}. Por favor regularize o pagamento.`,
      category: "pagamento",
      link: "https://www.edukamba.com/eventos?tab=pagamentos",
    }));
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) toast({ title: "Erro a enviar lembretes", description: error.message, variant: "destructive" });
    else toast({ title: `${rows.length} lembrete(s) enviado(s)` });
  };

  // ===== Enrollment fees helpers =====
  const filteredEnrollmentFees = useMemo(() => {
    const now = Date.now();
    const search = enSearch.trim().toLowerCase();
    return allEnrollmentFees.filter((f) => {
      if (enYearFilter !== "all" && f.academic_year_id !== enYearFilter) return false;
      if (enTypeFilter !== "all" && f.fee_type !== enTypeFilter) return false;
      if (enFilter === "paid" && !f.is_paid) return false;
      if (enFilter === "pending" && f.is_paid) return false;
      if (enFilter === "overdue" && (f.is_paid || new Date(f.due_date).getTime() >= now)) return false;
      if (search && !(f.student?.full_name ?? "").toLowerCase().includes(search)) return false;
      return true;
    });
  }, [allEnrollmentFees, enFilter, enYearFilter, enTypeFilter, enSearch]);

  const enrollmentFeeStats = useMemo(() => {
    const now = Date.now();
    let paid = 0, pending = 0, overdue = 0;
    allEnrollmentFees.forEach((f) => {
      if (f.is_paid) paid += Number(f.amount_due);
      else {
        pending += Number(f.amount_due);
        if (new Date(f.due_date).getTime() < now) overdue += Number(f.amount_due);
      }
    });
    return { paid, pending, overdue };
  }, [allEnrollmentFees]);

  const latestPaymentByEnrollmentFee = useMemo(() => {
    const map = new Map<string, PaymentListRow>();
    enrollmentPayments.forEach((p) => {
      if (!p.enrollment_fee_id) return;
      if (!map.has(p.enrollment_fee_id)) map.set(p.enrollment_fee_id, p);
    });
    return map;
  }, [enrollmentPayments]);

  const pendingEnrollmentValidations = useMemo(() => {
    return allEnrollmentFees
      .map((f) => ({ fee: f, payment: latestPaymentByEnrollmentFee.get(f.id) }))
      .filter((x) => x.payment && x.payment.status === "pendente") as Array<{ fee: EnrollmentFeeRow; payment: PaymentListRow }>;
  }, [allEnrollmentFees, latestPaymentByEnrollmentFee]);

  const validateEnrollmentPayment = async (fee: EnrollmentFeeRow, payment: PaymentListRow) => {
    if (!schoolId || !canValidatePaymentProofs) return;
    setValidatingId(payment.id);
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    const errMsg = await finalizeEnrollmentFeeValidation(fee, payment, userId);
    setValidatingId(null);
    if (errMsg) {
      toast({ title: "Erro a validar", description: errMsg, variant: "destructive" });
      return;
    }
    toast({ title: "Pagamento validado", description: "O encarregado foi notificado." });
    await emitFtAfterValidation([payment.id]);
    await fetchAll();
  };

  const bulkValidateEnrollmentFeesList = async () => {
    if (!canValidatePaymentProofs) return;
    const targets = [...bulkSelectedEnrollmentFeeIds]
      .map((id) => allEnrollmentFees.find((f) => f.id === id))
      .filter((f): f is EnrollmentFeeRow => !!f && !f.is_paid);
    if (!targets.length) {
      toast({
        title: "Nada a validar nas linhas seleccionadas",
        description: "Seleccione cobranças de matrícula não pagas (com ou sem comprovativo).",
        variant: "destructive",
      });
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;
    setBulkValidating(true);
    let failed = 0;
    const emitIds: string[] = [];
    for (const fee of targets) {
      const pay = latestPaymentByEnrollmentFee.get(fee.id);
      if (pay && pay.status === "pendente") {
        const errMsg = await finalizeEnrollmentFeeValidation(fee, pay, userId);
        if (errMsg) failed++;
        else emitIds.push(pay.id);
      } else {
        const ins = await insertStaffValidatedCharge("enrollment", fee, userId);
        if (ins.error) failed++;
        else if (ins.paymentId) emitIds.push(ins.paymentId);
      }
    }
    setBulkValidating(false);
    setBulkSelectedEnrollmentFeeIds(new Set());
    if (failed)
      toast({
        title: "Validação em lote concluída com erros",
        description: `${targets.length - failed} concluída(s), ${failed} falha(s).`,
        variant: "destructive",
      });
    else toast({ title: "Pagamentos validados", description: `${targets.length} cobrança(s) concluída(s).` });
    await emitFtAfterValidation(emitIds);
    await fetchAll();
  };

  /** Propinas não pagas com o filtro actual (checkboxes na lista de propinas). */
  const filteredUnpaidFeesForBulk = useMemo(() => filteredFees.filter((f) => !f.is_paid), [filteredFees]);

  const selectedTuitionFeesEligibleForRemind = useMemo(() => {
    return [...bulkSelectedTuitionFeeIds]
      .map((id) => allFees.find((f) => f.id === id))
      .filter((f): f is FeeListRow => !!f && !f.is_paid && !!f.student?.parent_id);
  }, [bulkSelectedTuitionFeeIds, allFees]);

  const filteredUnpaidActivityFeesForBulk = useMemo(() => filteredActivityFees.filter((f) => !f.is_paid), [filteredActivityFees]);

  const filteredUnpaidTransportFeesForBulk = useMemo(() => filteredTransportFees.filter((f) => !f.is_paid), [filteredTransportFees]);

  const filteredUnpaidMealFeesForBulk = useMemo(() => filteredMealFees.filter((f) => !f.is_paid), [filteredMealFees]);

  const filteredUnpaidEventFeesForBulk = useMemo(() => filteredEventFees.filter((f) => !f.is_paid), [filteredEventFees]);

  const filteredUnpaidEnrollmentFeesForBulk = useMemo(() => filteredEnrollmentFees.filter((f) => !f.is_paid), [filteredEnrollmentFees]);

  /** Propinas seleccionadas e não pagas → elegíveis para validação em lote. */
  const selectedTuitionFeesEligibleForBulkValidate = useMemo(() => {
    return [...bulkSelectedTuitionFeeIds]
      .map((id) => allFees.find((f) => f.id === id))
      .filter((f): f is FeeListRow => !!f && !f.is_paid);
  }, [bulkSelectedTuitionFeeIds, allFees]);

  const selectedActivityFeesEligibleForBulkValidate = useMemo(() => {
    return [...bulkSelectedActivityFeeIds]
      .map((id) => allActivityFees.find((f) => f.id === id))
      .filter((f): f is ActivityFeeRow => !!f && !f.is_paid);
  }, [bulkSelectedActivityFeeIds, allActivityFees]);

  const selectedTransportFeesEligibleForBulkValidate = useMemo(() => {
    return [...bulkSelectedTransportFeeIds]
      .map((id) => allTransportFees.find((f) => f.id === id))
      .filter((f): f is TransportFeeRow => !!f && !f.is_paid);
  }, [bulkSelectedTransportFeeIds, allTransportFees]);

  const selectedMealFeesEligibleForBulkValidate = useMemo(() => {
    return [...bulkSelectedMealFeeIds]
      .map((id) => allMealFees.find((f) => f.id === id))
      .filter((f): f is MealFeeRow => !!f && !f.is_paid);
  }, [bulkSelectedMealFeeIds, allMealFees]);

  const selectedEventFeesEligibleForBulkValidate = useMemo(() => {
    return [...bulkSelectedEventFeeIds]
      .map((id) => allEventFees.find((f) => f.id === id))
      .filter((f): f is EventFeeRow => !!f && !f.is_paid);
  }, [bulkSelectedEventFeeIds, allEventFees]);

  const selectedEnrollmentFeesEligibleForBulkValidate = useMemo(() => {
    return [...bulkSelectedEnrollmentFeeIds]
      .map((id) => allEnrollmentFees.find((f) => f.id === id))
      .filter((f): f is EnrollmentFeeRow => !!f && !f.is_paid);
  }, [bulkSelectedEnrollmentFeeIds, allEnrollmentFees]);

  const sendEnrollmentReminder = async (fee: EnrollmentFeeRow) => {
    if (!schoolId) return;
    const parentId = fee.student?.parent_id;
    if (!parentId) {
      toast({ title: "Aluno sem encarregado", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    setRemindingEnFeeId(fee.id);
    const label = fee.fee_type === "RENEWAL" ? "renovação de matrícula" : "matrícula";
    const title = `Lembrete — ${label}`;
    const description = `A ${label} de ${fee.student?.full_name ?? "o aluno"} no valor de ${fmtAOA(Number(fee.amount_due))} está por pagar (vencimento: ${new Date(fee.due_date).toLocaleDateString(dateLocaleTag)}).`;
    const { error } = await supabase.from("notifications").insert({
      recipient_id: parentId,
      school_id: schoolId,
      title,
      description,
      category: "pagamento",
      link: "https://www.edukamba.com/pagamentos",
    });
    if (!error) {
      void supabase.functions.invoke("send-cobrar-email", {
        body: { student_id: fee.student_id, title, description, link: `https://www.edukamba.com/pagamentos` },
      });
    }
    setRemindingEnFeeId(null);
    if (error) toast({ title: "Erro a enviar lembrete", description: error.message, variant: "destructive" });
    else toast({ title: "Lembrete enviado ao encarregado e ao aluno" });
  };

  const recordNeedsFile = isParent ? usarAnexoEncarregado : guardianPaymentMode === "proof_attachment";

  const downloadInvoicePdf = async (inv: { invoiceId: string; documentNumber: string }) => {
    setDownloadingInvoicePdfId(inv.invoiceId);
    try {
      await downloadFiscalInvoicePdfById(inv.invoiceId);
      toast({
        title: fiscalT("pdf_downloaded_title"),
        description: inv.documentNumber
          ? fiscalT("pdf_downloaded_desc", { document: inv.documentNumber })
          : fiscalT("pdf_downloaded_desc_generic"),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: fiscalT("pdf_error_title"), description: msg, variant: "destructive" });
    } finally {
      setDownloadingInvoicePdfId(null);
    }
  };

  const confirmCancelInvoice = async () => {
    if (!cancelInvoiceDialog) return;
    let reasonText: string;
    try {
      reasonText = resolveCancellationReasonText(cancelReasonCode, cancelReasonOther);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: fiscalT("cancel_error_title"), description: msg, variant: "destructive" });
      return;
    }
    setCancellingInvoiceId(cancelInvoiceDialog.invoiceId);
    const fx = await invokeCancelFiscalInvoice(cancelInvoiceDialog.invoiceId, reasonText);
    setCancellingInvoiceId(null);
    if (!fx.ok) {
      toast({
        title: fiscalT("cancel_error_title"),
        description: fx.message ?? fiscalT("cancel_error_generic"),
        variant: "destructive",
      });
      return;
    }
    setInvoiceByPaymentId((prev) => {
      const payId = cancelInvoiceDialog.paymentId;
      const cur = prev[payId];
      if (!cur) return prev;
      return { ...prev, [payId]: { ...cur, invoiceStatus: "A" as const } };
    });
    setCancelInvoiceDialog(null);
    setCancelReasonOther("");
    setCancelReasonCode("data_error_nif");
    toast({
      title: fiscalT("cancel_success_title"),
      description: fiscalT("cancel_success_desc", {
        document: fx.documentNumber ?? cancelInvoiceDialog.documentNumber,
      }),
    });
  };

  const confirmEmitCreditNote = async () => {
    if (!creditNoteDialog) return;
    let reasonText: string;
    try {
      reasonText = resolveCreditNoteReasonText(creditNoteReasonCode, creditNoteReasonOther);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: fiscalT("credit_note_error_title"), description: msg, variant: "destructive" });
      return;
    }
    
    const partialAmount = creditNotePartialAmount.trim() 
      ? parseFloat(creditNotePartialAmount.replace(/\./g, "").replace(",", "."))
      : undefined;
    
    if (partialAmount !== undefined && (isNaN(partialAmount) || partialAmount <= 0 || partialAmount > creditNoteDialog.grossTotal)) {
      toast({ 
        title: fiscalT("credit_note_error_title"), 
        description: "Valor parcial inválido. Deve ser maior que zero e menor que o total da fatura.", 
        variant: "destructive" 
      });
      return;
    }

    setEmittingCreditNoteId(creditNoteDialog.invoiceId);
    const fx = await invokeCreditNote(creditNoteDialog.invoiceId, reasonText, partialAmount);
    setEmittingCreditNoteId(null);
    
    if (!fx.ok) {
      toast({
        title: fiscalT("credit_note_error_title"),
        description: fx.message ?? fiscalT("credit_note_error_generic"),
        variant: "destructive",
      });
      return;
    }
    
    setCreditNoteDialog(null);
    setCreditNoteReasonOther("");
    setCreditNoteReasonCode("data_error");
    setCreditNotePartialAmount("");
    
    toast({
      title: fiscalT("credit_note_success_title"),
      description: fiscalT("credit_note_success_desc", {
        document: fx.documentNumber ?? "NC",
        source: creditNoteDialog.documentNumber,
      }),
    });

    // Download automático do PDF da NC
    if (fx.creditNoteId) {
      try {
        await downloadCreditNotePdfById(fx.creditNoteId);
      } catch {
        // Não bloqueia — NC já foi emitida com sucesso
      }
    }
  };

  /** Menu FT na lista quando a cobrança está paga, o pagamento validado e existir FT. */
  const invoiceActionsForValidatedPayment = (feeMarkedPaid: boolean, pay?: PaymentListRow) => {
    if (!feeMarkedPaid || !pay || pay.status !== "validado" || !pay.id?.trim()) return null;
    const inv = invoiceByPaymentId[pay.id];
    if (!inv?.invoiceId) return null;
    const busy = downloadingInvoicePdfId === inv.invoiceId;
    const isCancelled = inv.invoiceStatus === "A";
    const menuTitle = inv.documentNumber
      ? fiscalT("menu_title", { document: inv.documentNumber })
      : fiscalT("menu_title_generic");

    return (
      <div className="flex flex-col items-center gap-0.5">
        {isCancelled && (
          <Badge variant="outline" className="border-destructive text-destructive text-[10px] px-1 py-0">
            {fiscalT("badge_cancelled")}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-primary"
              disabled={busy || cancellingInvoiceId === inv.invoiceId}
              title={menuTitle}
            >
              {busy || cancellingInvoiceId === inv.invoiceId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreVertical className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              className="gap-2"
              onClick={() => void downloadInvoicePdf(inv)}
            >
              <FileDown className="h-4 w-4" />
              {fiscalT("action_download_pdf")}
            </DropdownMenuItem>
            {!isParent && canCancelInvoice && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  disabled={isCancelled}
                  onClick={() => {
                    if (isCancelled) return;
                    setCancelReasonCode("data_error_nif");
                    setCancelReasonOther("");
                    setCancelInvoiceDialog({
                      invoiceId: inv.invoiceId,
                      documentNumber: inv.documentNumber,
                      paymentId: pay.id,
                    });
                  }}
                >
                  <Ban className="h-4 w-4" />
                  {fiscalT("action_cancel_invoice")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  disabled={isCancelled}
                  onClick={() => {
                    if (isCancelled) return;
                    setCreditNoteReasonCode("data_error");
                    setCreditNoteReasonOther("");
                    setCreditNotePartialAmount("");
                    setCreditNoteDialog({
                      invoiceId: inv.invoiceId,
                      documentNumber: inv.documentNumber,
                      paymentId: pay.id,
                      grossTotal: pay.amount_paid || 0,
                    });
                  }}
                >
                  <Receipt className="h-4 w-4" />
                  {fiscalT("action_credit_note")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  if (parentLoading || (chargesEmbeddedOnly && role === "TEACHER" && homeroomStudentsLoading))
    return <PageLoadingSkeleton />;

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {tuitionOnly
                ? tuitionT("page_title")
                : embeddedVariantKey
                  ? embeddedT(`${embeddedVariantKey}_title`)
                  : "Pagamentos"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {tuitionOnly
                ? isParent
                  ? usarAnexoEncarregado
                    ? tuitionT("subtitle_parent_attachment")
                    : tuitionT("subtitle_parent_in_person")
                  : tuitionT("subtitle_staff")
                : embeddedVariantKey
                  ? isParent
                    ? embeddedT(`${embeddedVariantKey}_subtitle_parent`)
                    : embeddedT(`${embeddedVariantKey}_subtitle_staff`)
                  : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tuitionOnly && !isParent && (
              <Button onClick={() => setGenerateOpen(true)} className="gap-2">
                <PlayCircle className="h-4 w-4" /> {tuitionT("generate_year_button")}
              </Button>
            )}
            {isParent && (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <Link to="/propinas/historico">
                  <FileText className="h-4 w-4" />{" "}
                  {tuitionOnly ? tuitionT("history_invoices_link") : tPages("pagamentos.parent_history_invoices")}
                </Link>
              </Button>
            )}
          </div>
        </div>

        <Tabs defaultValue={tuitionOnly ? "fees" : enrollmentChargesOnly ? "enrollment-fees" : activityChargesOnly ? "activity-fees" : transportChargesOnly ? "transport-fees" : eventChargesOnly ? "event-fees" : "meal-fees"} className="w-full">
          <TabsList className={chargesEmbeddedOnly ? "sr-only" : undefined}>
            {tuitionOnly ? (
              <>
                {!isParent && <TabsTrigger value="rules">{tuitionT("tab_rules")}</TabsTrigger>}
                <TabsTrigger value="fees">{tuitionT("tab_fees")}</TabsTrigger>
              </>
            ) : (
              <>
                {enrollmentChargesOnly ? <TabsTrigger value="enrollment-fees">{embeddedT("tab_charges_list")}</TabsTrigger> : null}
                {activityChargesOnly ? <TabsTrigger value="activity-fees">{embeddedT("tab_charges_list")}</TabsTrigger> : null}
                {transportChargesOnly ? <TabsTrigger value="transport-fees">{embeddedT("tab_charges_list")}</TabsTrigger> : null}
                {mealChargesOnly ? <TabsTrigger value="meal-fees">{embeddedT("tab_charges_list")}</TabsTrigger> : null}
                {eventChargesOnly ? <TabsTrigger value="event-fees">{embeddedT("tab_charges_list")}</TabsTrigger> : null}
              </>
            )}
          </TabsList>

          {tuitionOnly && (
          <>
          {/* FEES TAB */}
          <TabsContent value="fees" className="space-y-4">
            {!isParent && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_total_received")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(feeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_outstanding")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(feeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_overdue_amount")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(feeStats.overdue)}</p></CardContent>
              </Card>
            </div>
            )}

            {!isParent && canValidatePaymentProofs && pendingValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <FileText className="h-4 w-4" /> {tuitionT("pending_proofs_title")}
                        <Badge variant="secondary">{pendingValidations.length}</Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{tuitionT("pending_proofs_hint")}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80 shrink-0"
                      disabled={bulkValidating || bulkRemindingTuition || pendingValidations.every((x) => !bulkSelectedTuitionFeeIds.has(x.fee.id))}
                      onClick={() => void bulkValidateFees()}
                    >
                      {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {tuitionT("bulk_validate_selected")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2 w-10 align-middle">
                            <Checkbox
                              disabled={bulkValidating || bulkRemindingTuition}
                              checked={pendingValidations.length > 0 && pendingValidations.every(({ fee }) => bulkSelectedTuitionFeeIds.has(fee.id))}
                              onCheckedChange={(v) => {
                                const checked = v === true;
                                setBulkSelectedTuitionFeeIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) pendingValidations.forEach(({ fee }) => next.add(fee.id));
                                  else pendingValidations.forEach(({ fee }) => next.delete(fee.id));
                                  return next;
                                });
                              }}
                              aria-label={tuitionT("select_all_aria")}
                            />
                          </th>
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{tuitionT("col_month")}</th>
                          <th className="py-2 px-2">{tuitionT("col_amount_paid")}</th>
                          <th className="py-2 px-2">{tuitionT("col_method")}</th>
                          <th className="py-2 px-2">{tuitionT("col_submitted")}</th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_actions_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 align-middle">
                              <Checkbox
                                disabled={bulkValidating || bulkRemindingTuition || validatingId === payment.id}
                                checked={bulkSelectedTuitionFeeIds.has(fee.id)}
                                onCheckedChange={(v) => setBulkTuitionFeeChecked(fee.id, v === true)}
                              />
                            </td>
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.month_index ? monthNamesLong[fee.month_index - 1] : "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString(dateLocaleTag) : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={bulkValidating || bulkRemindingTuition || validatingId === payment.id}
                                  onClick={() => validatePayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {tuitionT("validate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={bulkValidating || bulkRemindingTuition || validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
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
                  <CardTitle>{tuitionT("fees_list_title")}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{tuitionT("fees_list_hint")}</p>
                </div>
                {!isParent && (
                  <div className="flex flex-wrap items-center gap-2">
                    {canValidatePaymentProofs && filteredUnpaidFeesForBulk.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                        disabled={
                          bulkValidating ||
                          bulkRemindingTuition ||
                          selectedTuitionFeesEligibleForBulkValidate.length === 0
                        }
                        onClick={() => void bulkValidateFees()}
                      >
                        {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {tuitionT("bulk_validate_selected")}
                      </Button>
                    )}
                    {filteredFees.some((f) => !f.is_paid) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={
                          bulkRemindingTuition ||
                          bulkValidating ||
                          selectedTuitionFeesEligibleForRemind.length === 0
                        }
                        onClick={() => void sendBulkRemindersForSelectedTuitionFees()}
                      >
                        {bulkRemindingTuition ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-4 w-4" />}
                        {tuitionT("charge_selected")}
                      </Button>
                    )}
                    <Button
                      onClick={sendBulkReminders}
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={bulkRemindingTuition || bulkValidating}
                    >
                      <Bell className="h-4 w-4" /> {tuitionT("send_reminders_current_filter")}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder={tuitionT("search_student_placeholder")} value={feeSearch} onChange={(e) => setFeeSearch(e.target.value)} />
                  </div>
                  <Select value={feeFilter} onValueChange={(v) => setFeeFilter(v as typeof feeFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("filter_all")}</SelectItem>
                      <SelectItem value="pending">{tuitionT("filter_unpaid")}</SelectItem>
                      <SelectItem value="overdue">{tuitionT("filter_overdue")}</SelectItem>
                      <SelectItem value="paid">{tuitionT("filter_paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={feeYearFilter} onValueChange={setFeeYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={tuitionT("school_year_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("all_years")}</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={feeClassroomFilter} onValueChange={setFeeClassroomFilter} disabled={isParent}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={tuitionT("class_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      {!isParent && <SelectItem value="all">{tuitionT("all_classes")}</SelectItem>}
                      {(isParent
                        ? classrooms.filter((c) => parentClassroomIds.includes(c.id))
                        : classrooms
                      ).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">{tuitionT("no_fees_to_show")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          {!isParent && filteredFees.some((x) => !x.is_paid) && (
                            <th className="py-2 px-2 w-10 align-middle">
                              <Checkbox
                                disabled={bulkValidating || bulkRemindingTuition}
                                checked={
                                  filteredUnpaidFeesForBulk.length > 0 &&
                                  filteredUnpaidFeesForBulk.every((f) => bulkSelectedTuitionFeeIds.has(f.id))
                                }
                                onCheckedChange={(v) => {
                                  const checked = v === true;
                                  setBulkSelectedTuitionFeeIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      filteredUnpaidFeesForBulk.forEach((f) => next.add(f.id));
                                    } else {
                                      filteredUnpaidFeesForBulk.forEach((f) => next.delete(f.id));
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={tuitionT("select_all_unpaid_aria")}
                              />
                            </th>
                          )}
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{tuitionT("col_class")}</th>
                          <th className="py-2 px-2">{tuitionT("col_month")}</th>
                          <th className="py-2 px-2">{tuitionT("col_due")}</th>
                          <th className="py-2 px-2">{tuitionT("col_value")}</th>
                          <th className="py-2 px-2">{tuitionT("col_status")}</th>
                          <th className="py-2 px-2 text-center w-12" title="FACTURA‑RECIBO AGT">
                            {tuitionT("col_ft_abbr")}
                          </th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_action_right")}</th>
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
                              {!isParent && filteredFees.some((x) => !x.is_paid) && (
                                <td className="py-2 px-2 align-middle w-10">
                                  {!f.is_paid ? (
                                    <Checkbox
                                      disabled={bulkValidating || bulkRemindingTuition || (!!pay && validatingId === pay.id)}
                                      checked={bulkSelectedTuitionFeeIds.has(f.id)}
                                      onCheckedChange={(v) => setBulkTuitionFeeChecked(f.id, v === true)}
                                      title={embeddedT("bulk_row_include_hint")}
                                    />
                                  ) : null}
                                </td>
                              )}
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{f.student?.classroom?.name ?? "—"}</td>
                              <td className="py-2 px-2">{f.month_index ? monthNamesLong[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString(dateLocaleTag)}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">{tuitionT("status_paid")}</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">{tuitionT("status_pending_validation")}</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">{tuitionT("status_rejected")}</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">{tuitionT("status_overdue")}</Badge>
                                ) : (
                                  <Badge variant="secondary">{tuitionT("status_pending")}</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 align-middle text-center">{invoiceActionsForValidatedPayment(!!f.is_paid, pay)}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && !isParent && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                        </Button>
                                      )}
                                      {canValidatePaymentProofs && (
                                        <>
                                          <Button
                                            size="sm"
                                            className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                            disabled={bulkValidating || bulkRemindingTuition || validatingId === pay.id}
                                            onClick={() => validatePayment(f, pay)}
                                          >
                                            {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {tuitionT("validate")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1 text-destructive"
                                            disabled={bulkValidating || bulkRemindingTuition || validatingId === pay.id}
                                            onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {pendingValidation && pay && isParent && pay.proof_url && (
                                    <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                      <Eye className="h-3.5 w-3.5" /> {tuitionT("view_proof")}
                                    </Button>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      {(!isParent || usarAnexoEncarregado) && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForFee(f)}>
                                          <Upload className="h-3.5 w-3.5" /> {isParent ? tuitionT("attach_proof") : tuitionT("record_payment")}
                                        </Button>
                                      )}
                                      {isParent && !usarAnexoEncarregado && (
                                        <span className="rounded-md border border-muted bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                                          {tuitionT("in_person_payment_hint")}
                                        </span>
                                      )}
                                      {!isParent && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => sendReminder(f)} disabled={remindingFeeId === f.id || !f.student?.parent_id || bulkRemindingTuition}>
                                          {remindingFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                          {tuitionT("charge_single")}
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openDetailsForFee(f, pay)}>
                                    <FileText className="h-3.5 w-3.5" /> {embeddedT("view_details")}
                                  </Button>
                                  {!isParent && (
                                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openStatusChangeForFee(f, pay)}>
                                      <Pencil className="h-3.5 w-3.5" /> {embeddedT("change_status")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">{tuitionT("showing_200_of", { total: filteredFees.length })}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </>
          )}

          {activityChargesOnly && (
          <>
          {/* ACTIVITY FEES TAB (extracurriculares) */}
          <TabsContent value="activity-fees" className="space-y-4">
            {!isParent && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_total_received")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(activityFeeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_outstanding")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(activityFeeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_overdue_amount")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(activityFeeStats.overdue)}</p></CardContent>
              </Card>
            </div>
            )}

            {!isParent && canValidatePaymentProofs && pendingActivityValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <FileText className="h-4 w-4" /> {tuitionT("pending_proofs_title")}
                        <Badge variant="secondary">{pendingActivityValidations.length}</Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{embeddedT("activity_pending_proofs_hint")}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80 shrink-0"
                      disabled={bulkValidating || pendingActivityValidations.every((x) => !bulkSelectedActivityFeeIds.has(x.fee.id))}
                      onClick={() => void bulkValidateActivityFeesList()}
                    >
                      {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {tuitionT("bulk_validate_selected")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2 w-10 align-middle">
                            <Checkbox
                              disabled={bulkValidating}
                              checked={
                                pendingActivityValidations.length > 0 &&
                                pendingActivityValidations.every(({ fee }) => bulkSelectedActivityFeeIds.has(fee.id))
                              }
                              onCheckedChange={(v) => {
                                const checked = v === true;
                                setBulkSelectedActivityFeeIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) pendingActivityValidations.forEach(({ fee }) => next.add(fee.id));
                                  else pendingActivityValidations.forEach(({ fee }) => next.delete(fee.id));
                                  return next;
                                });
                              }}
                              aria-label={tuitionT("select_all_aria")}
                            />
                          </th>
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{embeddedT("col_activity")}</th>
                          <th className="py-2 px-2">{tuitionT("col_amount_paid")}</th>
                          <th className="py-2 px-2">{tuitionT("col_method")}</th>
                          <th className="py-2 px-2">{tuitionT("col_submitted")}</th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_actions_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingActivityValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 align-middle">
                              <Checkbox
                                disabled={bulkValidating || validatingId === payment.id}
                                checked={bulkSelectedActivityFeeIds.has(fee.id)}
                                onCheckedChange={(v) => setBulkActivityFeeChecked(fee.id, v === true)}
                              />
                            </td>
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.activity?.name ?? "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString(dateLocaleTag) : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => validateActivityPayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {tuitionT("validate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
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
                  <CardTitle>{embeddedT("activity_list_title")}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{embeddedT("activity_list_hint")}</p>
                </div>
                {!isParent && (
                  <div className="flex flex-wrap items-center gap-2">
                    {canValidatePaymentProofs && filteredUnpaidActivityFeesForBulk.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                        disabled={
                          bulkValidating ||
                          selectedActivityFeesEligibleForBulkValidate.length === 0
                        }
                        onClick={() => void bulkValidateActivityFeesList()}
                      >
                        {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {tuitionT("bulk_validate_selected")}
                      </Button>
                    )}
                    <Button onClick={sendActivityBulkReminders} size="sm" variant="outline" className="gap-2">
                      <Bell className="h-4 w-4" /> {tuitionT("send_reminders_current_filter")}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder={embeddedT("activity_search_placeholder")} value={actSearch} onChange={(e) => setActSearch(e.target.value)} />
                  </div>
                  <Select value={actFilter} onValueChange={(v) => setActFilter(v as typeof actFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("filter_all")}</SelectItem>
                      <SelectItem value="pending">{tuitionT("filter_unpaid")}</SelectItem>
                      <SelectItem value="overdue">{tuitionT("filter_overdue")}</SelectItem>
                      <SelectItem value="paid">{tuitionT("filter_paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={actYearFilter} onValueChange={setActYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={tuitionT("school_year_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("all_years")}</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={actActivityFilter} onValueChange={setActActivityFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={embeddedT("activity_filter_label")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{embeddedT("activity_filter_all")}</SelectItem>
                      {activitiesList.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredActivityFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">{tuitionT("no_fees_to_show")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          {!isParent && canValidatePaymentProofs && filteredUnpaidActivityFeesForBulk.length > 0 && (
                            <th className="py-2 px-2 w-10 align-middle">
                              <Checkbox
                                disabled={bulkValidating}
                                checked={
                                  filteredUnpaidActivityFeesForBulk.length > 0 &&
                                  filteredUnpaidActivityFeesForBulk.every((row) =>
                                    bulkSelectedActivityFeeIds.has(row.id),
                                  )
                                }
                                onCheckedChange={(v) => {
                                  const checked = v === true;
                                  setBulkSelectedActivityFeeIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      filteredUnpaidActivityFeesForBulk.forEach((row) =>
                                        next.add(row.id),
                                      );
                                    } else {
                                      filteredUnpaidActivityFeesForBulk.forEach((row) =>
                                        next.delete(row.id),
                                      );
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={tuitionT("select_all_unpaid_aria")}
                              />
                            </th>
                          )}
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{embeddedT("col_activity")}</th>
                          <th className="py-2 px-2">{tuitionT("col_month")}</th>
                          <th className="py-2 px-2">{tuitionT("col_due")}</th>
                          <th className="py-2 px-2">{tuitionT("col_value")}</th>
                          <th className="py-2 px-2">{tuitionT("col_status")}</th>
                          <th className="py-2 px-2 text-center w-12" title={embeddedT("col_ft_title")}>
                            {tuitionT("col_ft_abbr")}
                          </th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_action_right")}</th>
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
                              {!isParent && canValidatePaymentProofs && filteredUnpaidActivityFeesForBulk.length > 0 && (
                                <td className="py-2 px-2 align-middle w-10">
                                  {!f.is_paid ? (
                                    <Checkbox
                                      disabled={bulkValidating || (!!pay && validatingId === pay.id)}
                                      checked={bulkSelectedActivityFeeIds.has(f.id)}
                                      onCheckedChange={(v) => setBulkActivityFeeChecked(f.id, v === true)}
                                      title={embeddedT("bulk_row_include_hint")}
                                    />
                                  ) : null}
                                </td>
                              )}
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2">{f.activity?.name ?? "—"}</td>
                              <td className="py-2 px-2">{f.month_index ? monthNamesLong[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString(dateLocaleTag)}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">{tuitionT("status_paid")}</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">{tuitionT("status_pending_validation")}</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">{tuitionT("status_rejected")}</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">{tuitionT("status_overdue")}</Badge>
                                ) : (
                                  <Badge variant="secondary">{tuitionT("status_pending")}</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 align-middle text-center">{invoiceActionsForValidatedPayment(!!f.is_paid, pay)}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && !isParent && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                        </Button>
                                      )}
                                      {canValidatePaymentProofs && (
                                        <>
                                          <Button
                                            size="sm"
                                            className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => validateActivityPayment(f, pay)}
                                          >
                                            {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {tuitionT("validate")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1 text-destructive"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      {(!isParent || usarAnexoEncarregado) && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForActivity(f)}>
                                          <Upload className="h-3.5 w-3.5" /> {isParent ? tuitionT("attach_proof") : tuitionT("record_payment")}
                                        </Button>
                                      )}
                                      {isParent && !usarAnexoEncarregado && (
                                        <span className="rounded-md border border-muted bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                                          {tuitionT("in_person_payment_hint")}
                                        </span>
                                      )}
                                      {!isParent && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => sendActivityReminder(f)} disabled={remindingActFeeId === f.id || !f.student?.parent_id}>
                                          {remindingActFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                          {tuitionT("charge_single")}
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openDetailsForActivity(f, pay)}>
                                    <FileText className="h-3.5 w-3.5" /> {embeddedT("view_details")}
                                  </Button>
                                  {!isParent && (
                                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openStatusChangeForActivity(f, pay)}>
                                      <Pencil className="h-3.5 w-3.5" /> {embeddedT("change_status")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredActivityFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">{tuitionT("showing_200_of", { total: filteredActivityFees.length })}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </>
          )}

          {transportChargesOnly && (
          <>
          {/* TRANSPORT FEES TAB */}
          <TabsContent value="transport-fees" className="space-y-4">
            {!isParent && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_total_received")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(transportFeeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_outstanding")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(transportFeeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_overdue_amount")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(transportFeeStats.overdue)}</p></CardContent>
              </Card>
            </div>
            )}

            {!isParent && canValidatePaymentProofs && pendingTransportValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <FileText className="h-4 w-4" /> {tuitionT("pending_proofs_title")}
                        <Badge variant="secondary">{pendingTransportValidations.length}</Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{embeddedT("transport_pending_proofs_hint")}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80 shrink-0"
                      disabled={bulkValidating || pendingTransportValidations.every((x) => !bulkSelectedTransportFeeIds.has(x.fee.id))}
                      onClick={() => void bulkValidateTransportFeesList()}
                    >
                      {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {tuitionT("bulk_validate_selected")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2 w-10 align-middle">
                            <Checkbox
                              disabled={bulkValidating}
                              checked={
                                pendingTransportValidations.length > 0 &&
                                pendingTransportValidations.every(({ fee }) => bulkSelectedTransportFeeIds.has(fee.id))
                              }
                              onCheckedChange={(v) => {
                                const checked = v === true;
                                setBulkSelectedTransportFeeIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) pendingTransportValidations.forEach(({ fee }) => next.add(fee.id));
                                  else pendingTransportValidations.forEach(({ fee }) => next.delete(fee.id));
                                  return next;
                                });
                              }}
                              aria-label={tuitionT("select_all_aria")}
                            />
                          </th>
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{embeddedT("col_route")}</th>
                          <th className="py-2 px-2">{tuitionT("col_amount_paid")}</th>
                          <th className="py-2 px-2">{tuitionT("col_method")}</th>
                          <th className="py-2 px-2">{tuitionT("col_submitted")}</th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_actions_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingTransportValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 align-middle">
                              <Checkbox
                                disabled={bulkValidating || validatingId === payment.id}
                                checked={bulkSelectedTransportFeeIds.has(fee.id)}
                                onCheckedChange={(v) => setBulkTransportFeeChecked(fee.id, v === true)}
                              />
                            </td>
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.route?.name ?? "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString(dateLocaleTag) : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => validateTransportPayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {tuitionT("validate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
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
                  <CardTitle className="flex items-center gap-2"><Bus className="h-4 w-4" /> {embeddedT("transport_list_title")}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{embeddedT("transport_list_hint")}</p>
                </div>
                {!isParent && (
                  <div className="flex flex-wrap items-center gap-2">
                    {canValidatePaymentProofs && filteredUnpaidTransportFeesForBulk.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                        disabled={
                          bulkValidating ||
                          selectedTransportFeesEligibleForBulkValidate.length === 0
                        }
                        onClick={() => void bulkValidateTransportFeesList()}
                      >
                        {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {tuitionT("bulk_validate_selected")}
                      </Button>
                    )}
                    <Button onClick={sendTransportBulkReminders} size="sm" variant="outline" className="gap-2">
                      <Bell className="h-4 w-4" /> {tuitionT("send_reminders_current_filter")}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder={embeddedT("transport_search_placeholder")} value={trSearch} onChange={(e) => setTrSearch(e.target.value)} />
                  </div>
                  <Select value={trFilter} onValueChange={(v) => setTrFilter(v as typeof trFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("filter_all")}</SelectItem>
                      <SelectItem value="pending">{tuitionT("filter_unpaid")}</SelectItem>
                      <SelectItem value="overdue">{tuitionT("filter_overdue")}</SelectItem>
                      <SelectItem value="paid">{tuitionT("filter_paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={trYearFilter} onValueChange={setTrYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={tuitionT("school_year_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("all_years")}</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={trRouteFilter} onValueChange={setTrRouteFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={embeddedT("route_filter_label")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{embeddedT("route_filter_all")}</SelectItem>
                      {routesList.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredTransportFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">{tuitionT("no_fees_to_show")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          {!isParent && canValidatePaymentProofs && filteredUnpaidTransportFeesForBulk.length > 0 && (
                            <th className="py-2 px-2 w-10 align-middle">
                              <Checkbox
                                disabled={bulkValidating}
                                checked={
                                  filteredUnpaidTransportFeesForBulk.length > 0 &&
                                  filteredUnpaidTransportFeesForBulk.every((row) =>
                                    bulkSelectedTransportFeeIds.has(row.id),
                                  )
                                }
                                onCheckedChange={(v) => {
                                  const checked = v === true;
                                  setBulkSelectedTransportFeeIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      filteredUnpaidTransportFeesForBulk.forEach((row) =>
                                        next.add(row.id),
                                      );
                                    } else {
                                      filteredUnpaidTransportFeesForBulk.forEach((row) =>
                                        next.delete(row.id),
                                      );
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={tuitionT("select_all_unpaid_aria")}
                              />
                            </th>
                          )}
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{embeddedT("col_route")}</th>
                          <th className="py-2 px-2">{tuitionT("col_month")}</th>
                          <th className="py-2 px-2">{tuitionT("col_due")}</th>
                          <th className="py-2 px-2">{tuitionT("col_value")}</th>
                          <th className="py-2 px-2">{tuitionT("col_status")}</th>
                          <th className="py-2 px-2 text-center w-12" title={embeddedT("col_ft_title")}>
                            {tuitionT("col_ft_abbr")}
                          </th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_action_right")}</th>
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
                              {!isParent && canValidatePaymentProofs && filteredUnpaidTransportFeesForBulk.length > 0 && (
                                <td className="py-2 px-2 align-middle w-10">
                                  {!f.is_paid ? (
                                    <Checkbox
                                      disabled={bulkValidating || (!!pay && validatingId === pay.id)}
                                      checked={bulkSelectedTransportFeeIds.has(f.id)}
                                      onCheckedChange={(v) => setBulkTransportFeeChecked(f.id, v === true)}
                                      title={embeddedT("bulk_row_include_hint")}
                                    />
                                  ) : null}
                                </td>
                              )}
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2">{f.route?.name ?? "—"}</td>
                              <td className="py-2 px-2">{f.month_index ? monthNamesLong[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString(dateLocaleTag)}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">{tuitionT("status_paid")}</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">{tuitionT("status_pending_validation")}</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">{tuitionT("status_rejected")}</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">{tuitionT("status_overdue")}</Badge>
                                ) : (
                                  <Badge variant="secondary">{tuitionT("status_pending")}</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 align-middle text-center">{invoiceActionsForValidatedPayment(!!f.is_paid, pay)}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && !isParent && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                        </Button>
                                      )}
                                      {canValidatePaymentProofs && (
                                        <>
                                          <Button
                                            size="sm"
                                            className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => validateTransportPayment(f, pay)}
                                          >
                                            {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {tuitionT("validate")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1 text-destructive"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      {(!isParent || usarAnexoEncarregado) && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForTransport(f)}>
                                          <Upload className="h-3.5 w-3.5" /> {isParent ? tuitionT("attach_proof") : tuitionT("record_payment")}
                                        </Button>
                                      )}
                                      {isParent && !usarAnexoEncarregado && (
                                        <span className="rounded-md border border-muted bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                                          {tuitionT("in_person_payment_hint")}
                                        </span>
                                      )}
                                      {!isParent && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => sendTransportReminder(f)} disabled={remindingTrFeeId === f.id || !f.student?.parent_id}>
                                          {remindingTrFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                          {tuitionT("charge_single")}
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openDetailsForTransport(f, pay)}>
                                    <FileText className="h-3.5 w-3.5" /> {embeddedT("view_details")}
                                  </Button>
                                  {!isParent && (
                                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openStatusChangeForTransport(f, pay)}>
                                      <Pencil className="h-3.5 w-3.5" /> {embeddedT("change_status")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredTransportFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">{tuitionT("showing_200_of", { total: filteredTransportFees.length })}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </>
          )}

          {mealChargesOnly && (
          <>
          {/* MEAL FEES TAB */}
          <TabsContent value="meal-fees" className="space-y-4">
            {!isParent && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_total_received")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(mealFeeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_outstanding")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(mealFeeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_overdue_amount")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(mealFeeStats.overdue)}</p></CardContent>
              </Card>
            </div>
            )}

            {!isParent && canValidatePaymentProofs && pendingMealValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <FileText className="h-4 w-4" /> {tuitionT("pending_proofs_title")}
                        <Badge variant="secondary">{pendingMealValidations.length}</Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">{embeddedT("meal_pending_proofs_hint")}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80 shrink-0"
                      disabled={bulkValidating || pendingMealValidations.every((x) => !bulkSelectedMealFeeIds.has(x.fee.id))}
                      onClick={() => void bulkValidateMealFeesList()}
                    >
                      {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {tuitionT("bulk_validate_selected")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2 w-10 align-middle">
                            <Checkbox
                              disabled={bulkValidating}
                              checked={
                                pendingMealValidations.length > 0 &&
                                pendingMealValidations.every(({ fee }) => bulkSelectedMealFeeIds.has(fee.id))
                              }
                              onCheckedChange={(v) => {
                                const checked = v === true;
                                setBulkSelectedMealFeeIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) pendingMealValidations.forEach(({ fee }) => next.add(fee.id));
                                  else pendingMealValidations.forEach(({ fee }) => next.delete(fee.id));
                                  return next;
                                });
                              }}
                              aria-label={tuitionT("select_all_aria")}
                            />
                          </th>
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{embeddedT("col_plan")}</th>
                          <th className="py-2 px-2">{tuitionT("col_amount_paid")}</th>
                          <th className="py-2 px-2">{tuitionT("col_method")}</th>
                          <th className="py-2 px-2">{tuitionT("col_submitted")}</th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_actions_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingMealValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 align-middle">
                              <Checkbox
                                disabled={bulkValidating || validatingId === payment.id}
                                checked={bulkSelectedMealFeeIds.has(fee.id)}
                                onCheckedChange={(v) => setBulkMealFeeChecked(fee.id, v === true)}
                              />
                            </td>
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.meal_program?.name ?? "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString(dateLocaleTag) : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => validateMealPayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {tuitionT("validate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
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
                  <CardTitle className="flex items-center gap-2"><Utensils className="h-4 w-4" /> {embeddedT("meal_list_title")}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{embeddedT("meal_list_hint")}</p>
                </div>
                {!isParent && (
                  <div className="flex flex-wrap items-center gap-2">
                    {canValidatePaymentProofs && filteredUnpaidMealFeesForBulk.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                        disabled={
                          bulkValidating ||
                          selectedMealFeesEligibleForBulkValidate.length === 0
                        }
                        onClick={() => void bulkValidateMealFeesList()}
                      >
                        {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {tuitionT("bulk_validate_selected")}
                      </Button>
                    )}
                    <Button onClick={sendMealBulkReminders} size="sm" variant="outline" className="gap-2">
                      <Bell className="h-4 w-4" /> {tuitionT("send_reminders_current_filter")}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder={embeddedT("meal_search_placeholder")} value={meSearch} onChange={(e) => setMeSearch(e.target.value)} />
                  </div>
                  <Select value={meFilter} onValueChange={(v) => setMeFilter(v as typeof meFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("filter_all")}</SelectItem>
                      <SelectItem value="pending">{tuitionT("filter_unpaid")}</SelectItem>
                      <SelectItem value="overdue">{tuitionT("filter_overdue")}</SelectItem>
                      <SelectItem value="paid">{tuitionT("filter_paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={meYearFilter} onValueChange={setMeYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={tuitionT("school_year_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("all_years")}</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={meProgramFilter} onValueChange={setMeProgramFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={embeddedT("meal_filter_label")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{embeddedT("meal_filter_all")}</SelectItem>
                      {mealProgramsList.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredMealFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">{tuitionT("no_fees_to_show")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          {!isParent && canValidatePaymentProofs && filteredUnpaidMealFeesForBulk.length > 0 && (
                            <th className="py-2 px-2 w-10 align-middle">
                              <Checkbox
                                disabled={bulkValidating}
                                checked={
                                  filteredUnpaidMealFeesForBulk.length > 0 &&
                                  filteredUnpaidMealFeesForBulk.every((row) =>
                                    bulkSelectedMealFeeIds.has(row.id),
                                  )
                                }
                                onCheckedChange={(v) => {
                                  const checked = v === true;
                                  setBulkSelectedMealFeeIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      filteredUnpaidMealFeesForBulk.forEach((row) =>
                                        next.add(row.id),
                                      );
                                    } else {
                                      filteredUnpaidMealFeesForBulk.forEach((row) =>
                                        next.delete(row.id),
                                      );
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={tuitionT("select_all_unpaid_aria")}
                              />
                            </th>
                          )}
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">{embeddedT("col_plan")}</th>
                          <th className="py-2 px-2">{tuitionT("col_month")}</th>
                          <th className="py-2 px-2">{tuitionT("col_due")}</th>
                          <th className="py-2 px-2">{tuitionT("col_value")}</th>
                          <th className="py-2 px-2">{tuitionT("col_status")}</th>
                          <th className="py-2 px-2 text-center w-12" title={embeddedT("col_ft_title")}>
                            {tuitionT("col_ft_abbr")}
                          </th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_action_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMealFees.slice(0, 200).map((f) => {
                          const overdue = !f.is_paid && new Date(f.due_date).getTime() < Date.now();
                          const pay = latestPaymentByMealFee.get(f.id);
                          const pendingValidation = !!pay && pay.status === "pendente";
                          const rejected = !!pay && pay.status === "rejeitado";
                          return (
                            <tr key={f.id} className="border-b hover:bg-muted/30">
                              {!isParent && canValidatePaymentProofs && filteredUnpaidMealFeesForBulk.length > 0 && (
                                <td className="py-2 px-2 align-middle w-10">
                                  {!f.is_paid ? (
                                    <Checkbox
                                      disabled={bulkValidating || (!!pay && validatingId === pay.id)}
                                      checked={bulkSelectedMealFeeIds.has(f.id)}
                                      onCheckedChange={(v) => setBulkMealFeeChecked(f.id, v === true)}
                                      title={embeddedT("bulk_row_include_hint")}
                                    />
                                  ) : null}
                                </td>
                              )}
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2">{f.meal_program?.name ?? "—"}</td>
                              <td className="py-2 px-2">{f.month_index ? monthNamesLong[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString(dateLocaleTag)}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">{tuitionT("status_paid")}</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">{tuitionT("status_pending_validation")}</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">{tuitionT("status_rejected")}</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">{tuitionT("status_overdue")}</Badge>
                                ) : (
                                  <Badge variant="secondary">{tuitionT("status_pending")}</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 align-middle text-center">{invoiceActionsForValidatedPayment(!!f.is_paid, pay)}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && !isParent && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                        </Button>
                                      )}
                                      {canValidatePaymentProofs && (
                                        <>
                                          <Button
                                            size="sm"
                                            className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => validateMealPayment(f, pay)}
                                          >
                                            {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {tuitionT("validate")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1 text-destructive"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      {(!isParent || usarAnexoEncarregado) && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForMeal(f)}>
                                          <Upload className="h-3.5 w-3.5" /> {isParent ? tuitionT("attach_proof") : tuitionT("record_payment")}
                                        </Button>
                                      )}
                                      {isParent && !usarAnexoEncarregado && (
                                        <span className="rounded-md border border-muted bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                                          {tuitionT("in_person_payment_hint")}
                                        </span>
                                      )}
                                      {!isParent && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => sendMealReminder(f)} disabled={remindingMeFeeId === f.id || !f.student?.parent_id}>
                                          {remindingMeFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                          {tuitionT("charge_single")}
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openDetailsForMeal(f, pay)}>
                                    <FileText className="h-3.5 w-3.5" /> {embeddedT("view_details")}
                                  </Button>
                                  {!isParent && (
                                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openStatusChangeForMeal(f, pay)}>
                                      <Pencil className="h-3.5 w-3.5" /> {embeddedT("change_status")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredMealFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">{tuitionT("showing_200_of", { total: filteredMealFees.length })}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </>
          )}

          {eventChargesOnly && (
          <>
          {/* EVENT FEES TAB */}
          <TabsContent value="event-fees" className="space-y-4">
            {!isParent && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_total_received")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(eventFeeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_outstanding")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(eventFeeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_overdue_amount")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(eventFeeStats.overdue)}</p></CardContent>
              </Card>
            </div>
            )}

            {!isParent && canValidatePaymentProofs && pendingEventValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <FileText className="h-4 w-4" /> {tuitionT("pending_proofs_title")}
                        <Badge variant="secondary">{pendingEventValidations.length}</Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">Pagamentos relacionados com cobranças de eventos escolares.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80 shrink-0"
                      disabled={bulkValidating || pendingEventValidations.every((x) => !bulkSelectedEventFeeIds.has(x.fee.id))}
                      onClick={() => void bulkValidateEventFeesList()}
                    >
                      {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {tuitionT("bulk_validate_selected")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2 w-10 align-middle">
                            <Checkbox
                              disabled={bulkValidating}
                              checked={
                                pendingEventValidations.length > 0 &&
                                pendingEventValidations.every(({ fee }) => bulkSelectedEventFeeIds.has(fee.id))
                              }
                              onCheckedChange={(v) => {
                                const checked = v === true;
                                setBulkSelectedEventFeeIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) pendingEventValidations.forEach(({ fee }) => next.add(fee.id));
                                  else pendingEventValidations.forEach(({ fee }) => next.delete(fee.id));
                                  return next;
                                });
                              }}
                              aria-label={tuitionT("select_all_aria")}
                            />
                          </th>
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">Evento</th>
                          <th className="py-2 px-2">{tuitionT("col_amount_paid")}</th>
                          <th className="py-2 px-2">{tuitionT("col_method")}</th>
                          <th className="py-2 px-2">{tuitionT("col_submitted")}</th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_actions_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingEventValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 align-middle">
                              <Checkbox
                                disabled={bulkValidating || validatingId === payment.id}
                                checked={bulkSelectedEventFeeIds.has(fee.id)}
                                onCheckedChange={(v) => setBulkEventFeeChecked(fee.id, v === true)}
                              />
                            </td>
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.event?.title ?? "—"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString(dateLocaleTag) : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => validateEventPayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {tuitionT("validate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
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
                  <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Cobranças de eventos</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Cobranças geradas pelas regras de cada evento; pode enviar lembretes e validar pagamentos.</p>
                </div>
                {!isParent && (
                  <div className="flex flex-wrap items-center gap-2">
                    {canValidatePaymentProofs && filteredUnpaidEventFeesForBulk.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                        disabled={
                          bulkValidating ||
                          selectedEventFeesEligibleForBulkValidate.length === 0
                        }
                        onClick={() => void bulkValidateEventFeesList()}
                      >
                        {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {tuitionT("bulk_validate_selected")}
                      </Button>
                    )}
                    <Button onClick={sendEventBulkReminders} size="sm" variant="outline" className="gap-2">
                      <Bell className="h-4 w-4" /> {tuitionT("send_reminders_current_filter")}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Pesquisar aluno ou evento..." value={evSearch} onChange={(e) => setEvSearch(e.target.value)} />
                  </div>
                  <Select value={evFilter} onValueChange={(v) => setEvFilter(v as typeof evFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("filter_all")}</SelectItem>
                      <SelectItem value="pending">{tuitionT("filter_unpaid")}</SelectItem>
                      <SelectItem value="overdue">{tuitionT("filter_overdue")}</SelectItem>
                      <SelectItem value="paid">{tuitionT("filter_paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={evYearFilter} onValueChange={setEvYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={tuitionT("school_year_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("all_years")}</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={evEventFilter} onValueChange={setEvEventFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder="Evento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os eventos</SelectItem>
                      {eventsList.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredEventFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">{tuitionT("no_fees_to_show")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          {!isParent && canValidatePaymentProofs && filteredUnpaidEventFeesForBulk.length > 0 && (
                            <th className="py-2 px-2 w-10 align-middle">
                              <Checkbox
                                disabled={bulkValidating}
                                checked={
                                  filteredUnpaidEventFeesForBulk.length > 0 &&
                                  filteredUnpaidEventFeesForBulk.every((row) =>
                                    bulkSelectedEventFeeIds.has(row.id),
                                  )
                                }
                                onCheckedChange={(v) => {
                                  const checked = v === true;
                                  setBulkSelectedEventFeeIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      filteredUnpaidEventFeesForBulk.forEach((row) =>
                                        next.add(row.id),
                                      );
                                    } else {
                                      filteredUnpaidEventFeesForBulk.forEach((row) =>
                                        next.delete(row.id),
                                      );
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={tuitionT("select_all_unpaid_aria")}
                              />
                            </th>
                          )}
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">Evento</th>
                          <th className="py-2 px-2">{tuitionT("col_month")}</th>
                          <th className="py-2 px-2">{tuitionT("col_due")}</th>
                          <th className="py-2 px-2">{tuitionT("col_value")}</th>
                          <th className="py-2 px-2">{tuitionT("col_status")}</th>
                          <th className="py-2 px-2 text-center w-12" title={embeddedT("col_ft_title")}>
                            {tuitionT("col_ft_abbr")}
                          </th>
                          <th className="py-2 px-2 text-right">Acção</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEventFees.slice(0, 200).map((f) => {
                          const overdue = !f.is_paid && new Date(f.due_date).getTime() < Date.now();
                          const pay = latestPaymentByEventFee.get(f.id);
                          const pendingValidation = !!pay && pay.status === "pendente";
                          const rejected = !!pay && pay.status === "rejeitado";
                          return (
                            <tr key={f.id} className="border-b hover:bg-muted/30">
                              {!isParent && canValidatePaymentProofs && filteredUnpaidEventFeesForBulk.length > 0 && (
                                <td className="py-2 px-2 align-middle w-10">
                                  {!f.is_paid ? (
                                    <Checkbox
                                      disabled={bulkValidating || (!!pay && validatingId === pay.id)}
                                      checked={bulkSelectedEventFeeIds.has(f.id)}
                                      onCheckedChange={(v) => setBulkEventFeeChecked(f.id, v === true)}
                                      title={embeddedT("bulk_row_include_hint")}
                                    />
                                  ) : null}
                                </td>
                              )}
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2">
                                <span className="font-medium">{f.event?.title ?? "—"}</span>
                                {f.event?.event_date ? (
                                  <span className="block text-xs text-muted-foreground">
                                    {new Date(f.event.event_date + "T12:00:00").toLocaleDateString(dateLocaleTag)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-2 px-2">{f.month_index ? monthNamesLong[f.month_index - 1] : "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString(dateLocaleTag)}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">{tuitionT("status_paid")}</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">{tuitionT("status_pending_validation")}</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">{tuitionT("status_rejected")}</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">{tuitionT("status_overdue")}</Badge>
                                ) : (
                                  <Badge variant="secondary">{tuitionT("status_pending")}</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 align-middle text-center">{invoiceActionsForValidatedPayment(!!f.is_paid, pay)}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && !isParent && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                        </Button>
                                      )}
                                      {canValidatePaymentProofs && (
                                        <>
                                          <Button
                                            size="sm"
                                            className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => validateEventPayment(f, pay)}
                                          >
                                            {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {tuitionT("validate")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1 text-destructive"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      {(!isParent || usarAnexoEncarregado) && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForEvent(f)}>
                                          <Upload className="h-3.5 w-3.5" /> {isParent ? tuitionT("attach_proof") : tuitionT("record_payment")}
                                        </Button>
                                      )}
                                      {isParent && !usarAnexoEncarregado && (
                                        <span className="rounded-md border border-muted bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                                          {tuitionT("in_person_payment_hint")}
                                        </span>
                                      )}
                                      {!isParent && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => sendEventReminder(f)} disabled={remindingEvFeeId === f.id || !f.student?.parent_id}>
                                          {remindingEvFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                          {tuitionT("charge_single")}
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openDetailsForEvent(f, pay)}>
                                    <FileText className="h-3.5 w-3.5" /> {embeddedT("view_details")}
                                  </Button>
                                  {!isParent && (
                                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openStatusChangeForEvent(f, pay)}>
                                      <Pencil className="h-3.5 w-3.5" /> {embeddedT("change_status")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredEventFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">A mostrar 200 de {filteredEventFees.length}. Refina os filtros para ver as restantes.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </>
          )}

          {enrollmentChargesOnly && (
          <>
          {/* ENROLLMENT FEES TAB */}
          <TabsContent value="enrollment-fees" className="space-y-4">
            {!isParent && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_total_received")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-green-foreground">{fmtAOA(enrollmentFeeStats.paid)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_outstanding")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-pastel-yellow-foreground">{fmtAOA(enrollmentFeeStats.pending)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{tuitionT("kpi_overdue_amount")}</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-destructive">{fmtAOA(enrollmentFeeStats.overdue)}</p></CardContent>
              </Card>
            </div>
            )}

            {!isParent && canValidatePaymentProofs && pendingEnrollmentValidations.length > 0 && (
              <Card className="border-pastel-blue/60">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <FileText className="h-4 w-4" /> {tuitionT("pending_proofs_title")}
                        <Badge variant="secondary">{pendingEnrollmentValidations.length}</Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">Envios pelos encarregados relativos à matrícula ou renovação.</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80 shrink-0"
                      disabled={bulkValidating || pendingEnrollmentValidations.every((x) => !bulkSelectedEnrollmentFeeIds.has(x.fee.id))}
                      onClick={() => void bulkValidateEnrollmentFeesList()}
                    >
                      {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      {tuitionT("bulk_validate_selected")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2 w-10 align-middle">
                            <Checkbox
                              disabled={bulkValidating}
                              checked={
                                pendingEnrollmentValidations.length > 0 &&
                                pendingEnrollmentValidations.every(({ fee }) => bulkSelectedEnrollmentFeeIds.has(fee.id))
                              }
                              onCheckedChange={(v) => {
                                const checked = v === true;
                                setBulkSelectedEnrollmentFeeIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) pendingEnrollmentValidations.forEach(({ fee }) => next.add(fee.id));
                                  else pendingEnrollmentValidations.forEach(({ fee }) => next.delete(fee.id));
                                  return next;
                                });
                              }}
                              aria-label={tuitionT("select_all_aria")}
                            />
                          </th>
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">Tipo</th>
                          <th className="py-2 px-2">{tuitionT("col_amount_paid")}</th>
                          <th className="py-2 px-2">{tuitionT("col_method")}</th>
                          <th className="py-2 px-2">{tuitionT("col_submitted")}</th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_actions_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingEnrollmentValidations.map(({ fee, payment }) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 align-middle">
                              <Checkbox
                                disabled={bulkValidating || validatingId === payment.id}
                                checked={bulkSelectedEnrollmentFeeIds.has(fee.id)}
                                onCheckedChange={(v) => setBulkEnrollmentFeeChecked(fee.id, v === true)}
                              />
                            </td>
                            <td className="py-2 px-2 font-medium">{fee.student?.full_name ?? "—"}</td>
                            <td className="py-2 px-2">{fee.fee_type === "RENEWAL" ? "Renovação" : "Matrícula"}</td>
                            <td className="py-2 px-2 font-semibold">{fmtAOA(Number(payment.amount_paid))}</td>
                            <td className="py-2 px-2 capitalize text-muted-foreground">{payment.method ?? "—"}</td>
                            <td className="py-2 px-2 text-muted-foreground">{payment.payment_date ? new Date(payment.payment_date).toLocaleDateString(dateLocaleTag) : "—"}</td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                {payment.proof_url && (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(payment.proof_url!)}>
                                    <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => validateEnrollmentPayment(fee, payment)}
                                >
                                  {validatingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {tuitionT("validate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-destructive"
                                  disabled={bulkValidating || validatingId === payment.id}
                                  onClick={() => { setRejectDialog(payment); setRejectReason(""); }}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
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
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Custos de matrícula e renovação</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Custos únicos cobrados ao matricular um aluno ou ao renovar a matrícula num novo ano letivo.</p>
                </div>
                {!isParent && canValidatePaymentProofs && filteredUnpaidEnrollmentFeesForBulk.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80 shrink-0"
                    disabled={
                      bulkValidating ||
                      selectedEnrollmentFeesEligibleForBulkValidate.length === 0
                    }
                    onClick={() => void bulkValidateEnrollmentFeesList()}
                  >
                    {bulkValidating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {tuitionT("bulk_validate_selected")}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Pesquisar aluno..." value={enSearch} onChange={(e) => setEnSearch(e.target.value)} />
                  </div>
                  <Select value={enFilter} onValueChange={(v) => setEnFilter(v as typeof enFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("filter_all")}</SelectItem>
                      <SelectItem value="pending">{tuitionT("filter_unpaid")}</SelectItem>
                      <SelectItem value="overdue">{tuitionT("filter_overdue")}</SelectItem>
                      <SelectItem value="paid">{tuitionT("filter_paid")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={enYearFilter} onValueChange={setEnYearFilter}>
                    <SelectTrigger className="md:w-52"><SelectValue placeholder={tuitionT("school_year_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tuitionT("all_years")}</SelectItem>
                      {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={enTypeFilter} onValueChange={(v) => setEnTypeFilter(v as typeof enTypeFilter)}>
                    <SelectTrigger className="md:w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="NEW">Matrícula nova</SelectItem>
                      <SelectItem value="RENEWAL">Renovação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : filteredEnrollmentFees.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem custos de matrícula a apresentar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          {!isParent && canValidatePaymentProofs && filteredUnpaidEnrollmentFeesForBulk.length > 0 && (
                            <th className="py-2 px-2 w-10 align-middle">
                              <Checkbox
                                disabled={bulkValidating}
                                checked={
                                  filteredUnpaidEnrollmentFeesForBulk.length > 0 &&
                                  filteredUnpaidEnrollmentFeesForBulk.every((row) =>
                                    bulkSelectedEnrollmentFeeIds.has(row.id),
                                  )
                                }
                                onCheckedChange={(v) => {
                                  const checked = v === true;
                                  setBulkSelectedEnrollmentFeeIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) {
                                      filteredUnpaidEnrollmentFeesForBulk.forEach((row) =>
                                        next.add(row.id),
                                      );
                                    } else {
                                      filteredUnpaidEnrollmentFeesForBulk.forEach((row) =>
                                        next.delete(row.id),
                                      );
                                    }
                                    return next;
                                  });
                                }}
                                aria-label={tuitionT("select_all_unpaid_aria")}
                              />
                            </th>
                          )}
                          <th className="py-2 px-2">{tuitionT("col_student")}</th>
                          <th className="py-2 px-2">Tipo</th>
                          <th className="py-2 px-2">Ano letivo</th>
                          <th className="py-2 px-2">{tuitionT("col_due")}</th>
                          <th className="py-2 px-2">{tuitionT("col_value")}</th>
                          <th className="py-2 px-2">{tuitionT("col_status")}</th>
                          <th className="py-2 px-2 text-center w-12" title={embeddedT("col_ft_title")}>
                            {tuitionT("col_ft_abbr")}
                          </th>
                          <th className="py-2 px-2 text-right">{tuitionT("col_action_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEnrollmentFees.slice(0, 200).map((f) => {
                          const overdue = !f.is_paid && new Date(f.due_date).getTime() < Date.now();
                          const pay = latestPaymentByEnrollmentFee.get(f.id);
                          const pendingValidation = !!pay && pay.status === "pendente";
                          const rejected = !!pay && pay.status === "rejeitado";
                          return (
                            <tr key={f.id} className="border-b hover:bg-muted/30">
                              {!isParent && canValidatePaymentProofs && filteredUnpaidEnrollmentFeesForBulk.length > 0 && (
                                <td className="py-2 px-2 align-middle w-10">
                                  {!f.is_paid ? (
                                    <Checkbox
                                      disabled={bulkValidating || (!!pay && validatingId === pay.id)}
                                      checked={bulkSelectedEnrollmentFeeIds.has(f.id)}
                                      onCheckedChange={(v) => setBulkEnrollmentFeeChecked(f.id, v === true)}
                                      title={embeddedT("bulk_row_include_hint")}
                                    />
                                  ) : null}
                                </td>
                              )}
                              <td className="py-2 px-2 font-medium">{f.student?.full_name ?? "—"}</td>
                              <td className="py-2 px-2">{f.fee_type === "RENEWAL" ? "Renovação" : "Matrícula"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{f.academic_year?.label ?? "—"}</td>
                              <td className="py-2 px-2 text-muted-foreground">{new Date(f.due_date).toLocaleDateString(dateLocaleTag)}</td>
                              <td className="py-2 px-2 font-semibold">{fmtAOA(Number(f.amount_due))}</td>
                              <td className="py-2 px-2">
                                {f.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green">{tuitionT("status_paid")}</Badge>
                                ) : pendingValidation ? (
                                  <Badge className="bg-pastel-blue text-pastel-blue-foreground hover:bg-pastel-blue">{tuitionT("status_pending_validation")}</Badge>
                                ) : rejected ? (
                                  <Badge variant="outline" className="border-destructive text-destructive">{tuitionT("status_rejected")}</Badge>
                                ) : overdue ? (
                                  <Badge variant="destructive">{tuitionT("status_overdue")}</Badge>
                                ) : (
                                  <Badge variant="secondary">{tuitionT("status_pending")}</Badge>
                                )}
                              </td>
                              <td className="py-2 px-2 align-middle text-center">{invoiceActionsForValidatedPayment(!!f.is_paid, pay)}</td>
                              <td className="py-2 px-2 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {pendingValidation && pay && !isParent && (
                                    <>
                                      {pay.proof_url && (
                                        <Button size="sm" variant="outline" className="gap-1" onClick={() => viewProof(pay.proof_url!)}>
                                          <Eye className="h-3.5 w-3.5" /> {tuitionT("view")}
                                        </Button>
                                      )}
                                      {canValidatePaymentProofs && (
                                        <>
                                          <Button
                                            size="sm"
                                            className="gap-1 bg-pastel-green text-pastel-green-foreground hover:bg-pastel-green/80"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => validateEnrollmentPayment(f, pay)}
                                          >
                                            {validatingId === pay.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            {tuitionT("validate")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="gap-1 text-destructive"
                                            disabled={bulkValidating || validatingId === pay.id}
                                            onClick={() => { setRejectDialog(pay); setRejectReason(""); }}
                                          >
                                            <XCircle className="h-3.5 w-3.5" /> {tuitionT("reject")}
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}
                                  {!f.is_paid && !pendingValidation && (
                                    <>
                                      {(!isParent || usarAnexoEncarregado) && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => openRecordForEnrollment(f)}>
                                          <Upload className="h-3.5 w-3.5" /> {isParent ? tuitionT("attach_proof") : tuitionT("record_payment")}
                                        </Button>
                                      )}
                                      {isParent && !usarAnexoEncarregado && (
                                        <span className="rounded-md border border-muted bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
                                          {tuitionT("in_person_payment_hint")}
                                        </span>
                                      )}
                                      {!isParent && (
                                        <Button size="sm" variant="outline" className="gap-2" onClick={() => sendEnrollmentReminder(f)} disabled={remindingEnFeeId === f.id || !f.student?.parent_id}>
                                          {remindingEnFeeId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                                          {tuitionT("charge_single")}
                                        </Button>
                                      )}
                                    </>
                                  )}
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openDetailsForEnrollment(f, pay)}>
                                    <FileText className="h-3.5 w-3.5" /> {embeddedT("view_details")}
                                  </Button>
                                  {!isParent && (
                                    <Button size="sm" variant="outline" className="gap-1" onClick={() => openStatusChangeForEnrollment(f, pay)}>
                                      <Pencil className="h-3.5 w-3.5" /> {embeddedT("change_status")}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredEnrollmentFees.length > 200 && (
                      <p className="text-xs text-muted-foreground text-center py-3">A mostrar 200 de {filteredEnrollmentFees.length}. Refina os filtros para ver os restantes.</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          </>
          )}

          {/* RULES TAB */}
          {tuitionOnly && !isParent && (
          <TabsContent value="rules" className="space-y-4">
            <Card className="border-border/80 shadow-card">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>{tuitionT("rules_title")}</CardTitle>
                  <p className="text-sm text-muted-foreground max-w-xl">
                    {tuitionT("rules_intro")}
                  </p>
                </div>
                <Button onClick={openNewRule} size="sm" className="gap-2 shrink-0">
                  <Plus className="h-4 w-4" /> {tuitionT("new_rule")}
                </Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : rules.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">{tuitionT("no_rules")}</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border bg-muted/20">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-card text-left text-muted-foreground">
                          <th className="py-3 px-3 font-medium">{tuitionT("tbl_target")}</th>
                          <th className="py-3 px-3 font-medium">{tuitionT("tbl_recurrence")}</th>
                          <th className="py-3 px-3 font-medium">{tuitionT("tbl_value")}</th>
                          <th className="py-3 px-3 font-medium">{tuitionT("tbl_due")}</th>
                          <th className="py-3 px-3 font-medium">{tuitionT("tbl_period")}</th>
                          <th className="py-3 px-3 font-medium">{tuitionT("tbl_all_at_once")}</th>
                          <th className="py-3 px-3 text-right font-medium">{tuitionT("tbl_actions_right")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rules.map((r) => (
                          <tr key={r.id} className="border-b border-border/60 bg-card hover:bg-muted/40">
                            <td className="py-2.5 px-3 font-medium">{formatFeeRuleTarget(r, tuitionT)}</td>
                            <td className="py-2.5 px-3">{formatRecurrenceLabel(r.recurrence, recurrenceLabels)}</td>
                            <td className="py-2.5 px-3">{fmtAOA(Number(r.monthly_amount))}</td>
                            <td className="py-2.5 px-3 whitespace-nowrap">{tuitionT("due_day_short", { day: r.due_day })}</td>
                            <td className="py-2.5 px-3 text-muted-foreground">
                              {monthNamesLong[r.start_month - 1]}
                              {r.end_month != null ? `${tuitionT("arrow_range")}${monthNamesLong[r.end_month - 1]}` : ""}
                              <span className="text-xs"> · {tuitionT("period_count", { count: r.months_count })}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              {r.generate_all_upfront ? (
                                <Badge className="bg-pastel-blue text-pastel-blue-foreground">{tuitionT("yes")}</Badge>
                              ) : (
                                <Badge variant="secondary">{tuitionT("no")}</Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button size="icon" variant="ghost" onClick={() => openRuleDetail(r)} aria-label={tuitionT("aria_details")}><Eye className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => openEditRule(r)} aria-label={tuitionT("aria_edit")}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteRule(r.id)} aria-label={tuitionT("aria_delete")}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          )}
        </Tabs>
      </div>

      {tuitionOnly && (
      <>
      {/* RULE DIALOG */}
      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? tuitionT("rule_dialog_edit_title") : tuitionT("rule_dialog_new_title")}</DialogTitle>
            <DialogDescription>
              {tuitionT("rule_dialog_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tuitionT("target_section")}</Label>
              <Select
                value={ruleForm.target_scope}
                onValueChange={(v) =>
                  setRuleForm((f) => ({ ...f, target_scope: v as FeeTargetScope }))
                }
              >
                <SelectTrigger className="mt-2 bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="grade_level">{tuitionT("target_grade_level")}</SelectItem>
                  <SelectItem value="classrooms">{tuitionT("target_classrooms")}</SelectItem>
                  <SelectItem value="students">{tuitionT("target_students")}</SelectItem>
                </SelectContent>
              </Select>

              {ruleForm.target_scope === "grade_level" && (
                <div className="mt-3 grid gap-2">
                  <Label>{tuitionT("grade_level_label")}</Label>
                  <Select
                    value={ruleForm.grade_level}
                    onValueChange={(v) => setRuleForm((f) => ({ ...f, grade_level: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder={tuitionT("select_level_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      {GRADE_LEVELS.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {ruleForm.target_scope === "classrooms" && (
                <div className="mt-3 grid gap-2">
                  <Label>{activeYearId ? tuitionT("classrooms_active_year") : tuitionT("target_classrooms")}</Label>
                  <ScrollArea className="h-36 rounded-md border border-border bg-card px-2 py-2">
                    {classroomsForRulePicker.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">{tuitionT("no_classes_for_year")}</p>
                    ) : (
                      <div className="space-y-2 pr-2">
                        {classroomsForRulePicker.map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={ruleForm.classroom_ids.includes(c.id)}
                              onCheckedChange={(checked) => {
                                const on = checked === true;
                                setRuleForm((f) => ({
                                  ...f,
                                  classroom_ids: on
                                    ? [...f.classroom_ids, c.id]
                                    : f.classroom_ids.filter((id) => id !== c.id),
                                }));
                              }}
                            />
                            <span>{c.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground">{tuitionT("classes_selected_suffix", { count: ruleForm.classroom_ids.length })}</p>
                </div>
              )}

              {ruleForm.target_scope === "students" && (
                <div className="mt-3 grid gap-2">
                  <Label>{tuitionT("students_label")}</Label>
                  <ScrollArea className="h-36 rounded-md border border-border bg-card px-2 py-2">
                    <div className="space-y-2 pr-2">
                      {students.map((s) => (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={ruleForm.student_ids.includes(s.id)}
                            onCheckedChange={(checked) => {
                              const on = checked === true;
                              setRuleForm((f) => ({
                                ...f,
                                student_ids: on
                                  ? [...f.student_ids, s.id]
                                  : f.student_ids.filter((id) => id !== s.id),
                              }));
                            }}
                          />
                          <span>{s.full_name}</span>
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground">{tuitionT("students_selected_suffix", { count: ruleForm.student_ids.length })}</p>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>{tuitionT("payment_recurrence_label")}</Label>
              <Select
                value={ruleForm.recurrence}
                onValueChange={(v) => setRuleForm((f) => ({ ...f, recurrence: v as FeeRecurrence }))}
              >
                <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(recurrenceLabels) as FeeRecurrence[]).map((k) => (
                    <SelectItem key={k} value={k}>{recurrenceLabels[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {tuitionT("recurrence_help")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label>{tuitionT("amount_per_period_label")}</Label>
              <Input
                type="number"
                min="0"
                className="bg-card"
                value={ruleForm.monthly_amount}
                onChange={(e) => setRuleForm({ ...ruleForm, monthly_amount: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>{tuitionT("due_day_label")}</Label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  className="bg-card"
                  value={ruleForm.due_day}
                  onChange={(e) => setRuleForm({ ...ruleForm, due_day: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{tuitionT("start_month_label")}</Label>
                <Select value={ruleForm.start_month} onValueChange={(v) => setRuleForm({ ...ruleForm, start_month: v })}>
                  <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNamesLong.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{tuitionT("end_month_label")}</Label>
                <Select value={ruleForm.end_month} onValueChange={(v) => setRuleForm({ ...ruleForm, end_month: v })}>
                  <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthNamesLong.map((m, i) => (
                      <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="gen-all" className="text-sm font-normal leading-tight">
                  {tuitionT("switch_generate_all_upfront")}
                </Label>
                <Switch
                  id="gen-all"
                  checked={ruleForm.generate_all_upfront}
                  onCheckedChange={(v) => setRuleForm((f) => ({ ...f, generate_all_upfront: v }))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {tuitionT("switch_generate_all_hint")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label>{tuitionT("notes_optional")}</Label>
              <Input
                className="bg-card"
                value={ruleForm.notes}
                onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setRuleDialog(false)}>{tuitionT("cancel")}</Button>
            <Button type="button" onClick={() => void saveRule()}>{tuitionT("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REGRA: detalhes + propinas geradas / previstas */}
      <Dialog
        open={ruleDetailOpen}
        onOpenChange={(o) => {
          setRuleDetailOpen(o);
          if (!o) {
            setRuleDetailRule(null);
            setRuleDetailYearId(null);
            setRuleDetailGeneratingKey(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle>{tuitionT("rule_detail_title")}</DialogTitle>
            <DialogDescription>
              {tuitionT("rule_detail_desc")}
            </DialogDescription>
          </DialogHeader>
          {ruleDetailRule ? (
            <div className="grid min-h-0 flex-1 gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-muted/25 p-3 text-sm">
                <div className="min-w-[200px] space-y-1">
                  <p className="font-medium text-foreground">{tuitionT("detail_target_prefix", { target: formatFeeRuleTarget(ruleDetailRule, tuitionT) })}</p>
                  <p className="text-muted-foreground">
                    {tuitionT("detail_recurrence_amount_due", {
                      recurrence: formatRecurrenceLabel(ruleDetailRule.recurrence, recurrenceLabels),
                      amount: fmtAOA(Number(ruleDetailRule.monthly_amount)),
                      due: tuitionT("due_day_short", { day: ruleDetailRule.due_day }),
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {tuitionT("detail_calendar_line", {
                      start: monthNamesLong[ruleDetailRule.start_month - 1],
                      end: ruleDetailRule.end_month != null ? `${tuitionT("arrow_range")}${monthNamesLong[ruleDetailRule.end_month - 1]}` : "",
                      periods: tuitionT("period_count", { count: ruleDetailRule.months_count }),
                    })}
                  </p>
                  <p className="text-muted-foreground">
                    {tuitionT("detail_all_upfront", {
                      value: ruleDetailRule.generate_all_upfront ? tuitionT("yes") : tuitionT("no"),
                    })}
                  </p>
                </div>
                <div className="grid min-w-[220px] gap-1.5">
                  <Label className="text-xs">{tuitionT("school_year_label")}</Label>
                  <Select value={ruleDetailYearId ?? ""} onValueChange={(v) => setRuleDetailYearId(v)}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder={tuitionT("school_year_placeholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.label}
                          {y.is_active ? tuitionT("active_suffix") : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!ruleDetailYearStart ? (
                <p className="text-sm text-destructive">
                  {tuitionT("year_has_no_start_error")}
                </p>
              ) : ruleDetailRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {tuitionT("rule_detail_empty")}
                </p>
              ) : (
                <ScrollArea className="max-h-[min(420px,calc(85vh-14rem))] rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                        <th className="px-3 py-2.5 font-medium">{tuitionT("detail_tbl_student")}</th>
                        <th className="px-3 py-2.5 font-medium">{tuitionT("detail_tbl_period")}</th>
                        <th className="px-3 py-2.5 font-medium whitespace-nowrap">{tuitionT("detail_tbl_due")}</th>
                        <th className="px-3 py-2.5 font-medium">{tuitionT("detail_tbl_amount")}</th>
                        <th className="px-3 py-2.5 font-medium">{tuitionT("detail_tbl_state")}</th>
                        <th className="px-3 py-2.5 text-right font-medium">{tuitionT("detail_tbl_action_right")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ruleDetailRows.map((row) => {
                        const genKey = `${row.studentId}-${row.periodIndex}`;
                        const busy = ruleDetailGeneratingKey === genKey;
                        return (
                          <tr key={row.key} className="border-b border-border/60 bg-card">
                            <td className="px-3 py-2 font-medium">{row.studentName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.monthLabel}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                              {new Date(`${row.dueIso}T12:00:00`).toLocaleDateString(dateLocaleTag)}
                            </td>
                            <td className="px-3 py-2">
                              {row.fee ? (
                                <span className="font-semibold">{fmtAOA(Number(row.fee.amount_due))}</span>
                              ) : (
                                <span className="text-muted-foreground">
                                  {fmtAOA(row.baseEstimate)}
                                  <span className="mt-0.5 block text-[10px] font-normal leading-tight">
                                    {tuitionT("detail_estimate_hint")}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row.fee ? (
                                row.fee.is_paid ? (
                                  <Badge className="bg-pastel-green text-pastel-green-foreground">{tuitionT("status_paid")}</Badge>
                                ) : (
                                  <Badge variant="secondary">{tuitionT("badge_generated")}</Badge>
                                )
                              ) : (
                                <Badge variant="outline">{tuitionT("badge_pending_generate")}</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {!row.fee ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  disabled={busy}
                                  onClick={() => void generateRulePeriodFee(row.studentId, row.periodIndex)}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <PlayCircle className="h-3.5 w-3.5" />
                                  )}
                                  {tuitionT("generate_one")}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setRuleDetailOpen(false)}>
              {tuitionT("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
      )}

      {tuitionOnly && (
      <>
      {/* GENERATE DIALOG */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tuitionT("generate_dialog_title")}</DialogTitle>
            <DialogDescription>
              {tuitionT("generate_dialog_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{tuitionT("school_year_label")}</Label>
              <Select value={generateYearId} onValueChange={setGenerateYearId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.label}
                      {y.is_active ? tuitionT("year_option_active_suffix") : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>
              {tuitionT("cancel")}
            </Button>
            <Button onClick={runGeneration} disabled={generating || !generateYearId}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              {tuitionT("generate_fees_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATIONS */}
      <AlertDialog open={!!deleteRule} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tuitionT("delete_rule_title")}</AlertDialogTitle>
            <AlertDialogDescription>{tuitionT("delete_rule_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tuitionT("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRule}>{tuitionT("delete_confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
      )}

      <Dialog open={!!rejectDialog} onOpenChange={(o) => { if (!o) { setRejectDialog(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar comprovativo</DialogTitle>
            <DialogDescription>
              {usarAnexoEncarregado ? "Indique o motivo. O encarregado será orientado conforme o modo de cobrança da escola." : "Indique o motivo da rejeição. O encarregado será notificado."}
            </DialogDescription>
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
            <DialogTitle>{recordNeedsFile ? (isParent ? "Anexar comprovativo" : "Registar pagamento") : "Registar pagamento presencial"}</DialogTitle>
            <DialogDescription>
              {!recordNeedsFile && !isParent
                ? "Registe o valor recebido nas instalações da escola. Não é obrigatório anexar ficheiro; o valor ficará válido ao guardar."
                : recordDialog?.kind === "fee"
                ? `Propina — ${recordDialog.fee.student?.full_name ?? ""}. ${recordNeedsFile ? "Anexe o comprovativo quando o modo da escola o exija." : ""} ${isParent ? "Ficará pendente até a escola validar." : "Será marcado como pago e validado, e o encarregado pode ver na app."}`
                : recordDialog?.kind === "activity"
                ? `Atividade ${recordDialog.fee.activity?.name ?? ""} (${recordDialog.fee.student?.full_name ?? ""}). ${isParent ? "Fica à espera da validação." : recordNeedsFile ? "Comprovativo opcional apenas se anexado." : "Registo direto pela equipa financeira da escola."}`
                : recordDialog?.kind === "transport"
                ? `Transporte (${recordDialog.fee.route?.name ?? ""}) — ${recordDialog.fee.student?.full_name ?? ""}. ${isParent ? "Fica à espera da validação." : recordNeedsFile ? "Envie imagem apenas se disponível." : "Valor recebido presencialmente."}`
                : recordDialog?.kind === "meal"
                ? `Refeições (${recordDialog.fee.meal_program?.name ?? ""}) — ${recordDialog.fee.student?.full_name ?? ""}. ${isParent ? "Fica à espera da validação." : recordNeedsFile ? "Associe um comprovativo se existir." : "Valor recebido presencialmente."}`
                : recordDialog?.kind === "event"
                ? `Evento «${recordDialog.fee.event?.title ?? ""}» — ${recordDialog.fee.student?.full_name ?? ""}. ${isParent ? "Fica à espera da validação." : recordNeedsFile ? "Associe um comprovativo se existir." : "Valor recebido presencialmente."}`
                : recordDialog?.kind === "enrollment"
                ? `${recordDialog.fee.fee_type === "RENEWAL" ? "Renovação de matrícula" : "Matrícula"} — ${recordDialog.fee.student?.full_name ?? ""}. ${isParent ? "À espera de validação pela escola." : recordNeedsFile ? "Associe um comprovativo digital se existir." : "Pagamento físico apenas."}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {recordNeedsFile && (
              <div className="grid gap-2">
                <Label htmlFor="record-file">Comprovativo (PDF ou imagem)</Label>
                <Input id="record-file" type="file" accept="image/*,application/pdf" onChange={(e) => setRecordFile(e.target.files?.[0] ?? null)} />
              </div>
            )}
            {!recordNeedsFile && !isParent && (
              <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Esta escola permite registar valores recebidos presencialmente sem obrigar ao envio digital do comprovativo.
              </p>
            )}
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
            <Button onClick={submitStaffPayment} disabled={recordUploading || (recordNeedsFile && !recordFile)} className="gap-2">
              {recordUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isParent ? "Submeter para validação" : "Registar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cancelInvoiceDialog}
        onOpenChange={(o) => {
          if (!o && !cancellingInvoiceId) {
            setCancelInvoiceDialog(null);
            setCancelReasonOther("");
            setCancelReasonCode("data_error_nif");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fiscalT("cancel_dialog_title")}</DialogTitle>
            <DialogDescription>
              {cancelInvoiceDialog?.documentNumber
                ? fiscalT("cancel_dialog_desc", { document: cancelInvoiceDialog.documentNumber })
                : fiscalT("cancel_dialog_desc_generic")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{fiscalT("cancel_reason_label")}</Label>
              <Select
                value={cancelReasonCode}
                onValueChange={(v) => setCancelReasonCode(v as FiscalCancellationReasonCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FISCAL_CANCELLATION_REASON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {fiscalT(`cancel_reason_${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cancelReasonCode === "other" && (
              <div className="grid gap-2">
                <Label htmlFor="cancel-reason-other">{fiscalT("cancel_reason_other_label")}</Label>
                <Textarea
                  id="cancel-reason-other"
                  rows={3}
                  value={cancelReasonOther}
                  onChange={(e) => setCancelReasonOther(e.target.value)}
                  placeholder={fiscalT("cancel_reason_other_placeholder")}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">{fiscalT("cancel_dialog_hint")}</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!cancellingInvoiceId}
              onClick={() => setCancelInvoiceDialog(null)}
            >
              {fiscalT("cancel_dialog_abort")}
            </Button>
            <Button
              variant="destructive"
              disabled={!!cancellingInvoiceId}
              onClick={() => void confirmCancelInvoice()}
            >
              {cancellingInvoiceId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Ban className="h-4 w-4 mr-2" />
              )}
              {fiscalT("cancel_dialog_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CREDIT NOTE DIALOG */}
      <Dialog
        open={!!creditNoteDialog}
        onOpenChange={(o) => {
          if (!o && !emittingCreditNoteId) {
            setCreditNoteDialog(null);
            setCreditNoteReasonOther("");
            setCreditNoteReasonCode("data_error");
            setCreditNotePartialAmount("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fiscalT("credit_note_dialog_title")}</DialogTitle>
            <DialogDescription>
              {creditNoteDialog?.documentNumber
                ? fiscalT("credit_note_dialog_desc", { document: creditNoteDialog.documentNumber })
                : fiscalT("credit_note_dialog_desc_generic")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{fiscalT("credit_note_reason_label")}</Label>
              <Select
                value={creditNoteReasonCode}
                onValueChange={(v) => setCreditNoteReasonCode(v as CreditNoteReasonCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDIT_NOTE_REASON_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {fiscalT(`credit_note_reason_${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {creditNoteReasonCode === "other" && (
              <div className="grid gap-2">
                <Label htmlFor="credit-note-reason-other">{fiscalT("credit_note_reason_other_label")}</Label>
                <Textarea
                  id="credit-note-reason-other"
                  rows={3}
                  value={creditNoteReasonOther}
                  onChange={(e) => setCreditNoteReasonOther(e.target.value)}
                  placeholder={fiscalT("credit_note_reason_other_placeholder")}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="credit-note-partial">{fiscalT("credit_note_partial_label")}</Label>
              <Input
                id="credit-note-partial"
                type="text"
                value={creditNotePartialAmount}
                onChange={(e) => setCreditNotePartialAmount(e.target.value)}
                placeholder={creditNoteDialog ? fmtAOA(creditNoteDialog.grossTotal) : ""}
              />
              <p className="text-xs text-muted-foreground">{fiscalT("credit_note_partial_hint")}</p>
            </div>
            <p className="text-xs text-muted-foreground">{fiscalT("credit_note_dialog_hint")}</p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!emittingCreditNoteId}
              onClick={() => setCreditNoteDialog(null)}
            >
              {fiscalT("credit_note_dialog_abort")}
            </Button>
            <Button
              disabled={!!emittingCreditNoteId}
              onClick={() => void confirmEmitCreditNote()}
            >
              {emittingCreditNoteId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Receipt className="h-4 w-4 mr-2" />
              )}
              {fiscalT("credit_note_dialog_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* STATUS CHANGE DIALOG */}
      <Dialog open={!!statusChangeDialog} onOpenChange={(o) => { if (!o && !statusChanging) setStatusChangeDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar estado do pagamento</DialogTitle>
            <DialogDescription>
              Altere o estado do pagamento de {statusChangeDialog?.fee.student?.full_name ?? "—"}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Novo estado</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="unpaid">Pendente</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {statusChangeDialog && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                  <div><strong>Aluno:</strong> {statusChangeDialog.fee.student?.full_name ?? "—"}</div>
                  <div><strong>Estado atual:</strong> {statusChangeDialog.fee.is_paid ? "Pago" : "Pendente"}</div>
                  <div><strong>Valor:</strong> {fmtAOA(Number(statusChangeDialog.fee.amount_due))}</div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChangeDialog(null)} disabled={statusChanging}>
              Cancelar
            </Button>
            <Button onClick={submitStatusChange} disabled={statusChanging} className="gap-2">
              {statusChanging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Alterar estado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PAYMENT DETAILS DIALOG */}
      <Dialog open={!!detailsDialog} onOpenChange={(o) => { if (!o) setDetailsDialog(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do pagamento</DialogTitle>
            <DialogDescription>
              Informações completas sobre o pagamento de {detailsDialog?.fee.student?.full_name ?? "—"}.
            </DialogDescription>
          </DialogHeader>
          {detailsDialog && (
            <div className="grid gap-4">
              {/* Informações do Aluno */}
              <div className="grid gap-2">
                <h3 className="font-medium text-sm">Informações do Aluno</h3>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                  <div><strong>Nome:</strong> {detailsDialog.fee.student?.full_name ?? "—"}</div>
                  {detailsDialog.fee.student?.classroom?.name && (
                    <div><strong>Turma:</strong> {detailsDialog.fee.student.classroom.name}</div>
                  )}
                </div>
              </div>

              {/* Informações da Cobrança */}
              <div className="grid gap-2">
                <h3 className="font-medium text-sm">Informações da Cobrança</h3>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                  <div><strong>Valor:</strong> {fmtAOA(Number(detailsDialog.fee.amount_due))}</div>
                  <div><strong>Data de vencimento:</strong> {new Date(detailsDialog.fee.due_date).toLocaleDateString(dateLocaleTag)}</div>
                  <div><strong>Estado do pagamento:</strong> 
                    {detailsDialog.fee.is_paid ? (
                      <Badge className="ml-2 bg-pastel-green text-pastel-green-foreground">Pago</Badge>
                    ) : (
                      <Badge className="ml-2 variant-secondary">Pendente</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Informações do Pagamento (se houver) */}
              {detailsDialog.payment && (
                <div className="grid gap-2">
                  <h3 className="font-medium text-sm">Informações do Pagamento</h3>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                    <div><strong>Valor pago:</strong> {fmtAOA(Number(detailsDialog.payment.amount_paid))}</div>
                    <div><strong>Método:</strong> {detailsDialog.payment.method ?? "—"}</div>
                    <div><strong>Data:</strong> {detailsDialog.payment.payment_date ? new Date(detailsDialog.payment.payment_date).toLocaleDateString(dateLocaleTag) : "—"}</div>
                    <div><strong>Status:</strong> 
                      <Badge className="ml-2" variant={
                        detailsDialog.payment.status === "validado" ? "default" :
                        detailsDialog.payment.status === "rejeitado" ? "destructive" :
                        "secondary"
                      }>
                        {detailsDialog.payment.status === "validado" ? "Validado" :
                         detailsDialog.payment.status === "rejeitado" ? "Rejeitado" :
                         "Pendente"}
                      </Badge>
                    </div>
                    {detailsDialog.payment.notes && (
                      <div><strong>Notas:</strong> {detailsDialog.payment.notes}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialog(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};


