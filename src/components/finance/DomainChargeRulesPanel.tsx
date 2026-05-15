import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { canValidateSchoolPaymentProofs } from "@/lib/schoolStaffRoles";

const MONTH_NAMES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type FeeRecurrence = "monthly" | "quarterly" | "semester" | "yearly";
type ChargeTargetScope = "all_enrolled" | "classrooms" | "students";

const RECURRENCE_LABELS: Record<FeeRecurrence, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semester: "Semestral",
  yearly: "Anual",
};

function recurrenceStepMonths(r: FeeRecurrence): number {
  if (r === "quarterly") return 3;
  if (r === "semester") return 6;
  if (r === "yearly") return 12;
  return 1;
}

function countBillingPeriods(startMonth: number, endMonth: number, recurrence: FeeRecurrence): number {
  const step = recurrenceStepMonths(recurrence);
  let m = startMonth;
  for (let c = 1; c < 48; c++) {
    if (m === endMonth) return c;
    m = ((m - 1 + step) % 12) + 1;
  }
  return 1;
}

type AcademicYear = { id: string; label: string; is_active: boolean | null };
type StudentLite = { id: string; full_name: string; classroom_id: string | null };
type ClassroomLite = { id: string; name: string; academic_year_id?: string | null };

type ActivityRuleRow = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  activity_id: string;
  target_scope: string;
  monthly_amount: number;
  due_day: number;
  months_count: number;
  start_month: number;
  end_month: number | null;
  recurrence: string;
  generate_all_upfront: boolean;
  notes: string | null;
  activity_charge_rule_classrooms?: { classroom_id: string }[] | null;
  activity_charge_rule_students?: { student_id: string }[] | null;
};

type TransportRuleRow = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  route_id: string;
  target_scope: string;
  monthly_amount: number;
  due_day: number;
  months_count: number;
  start_month: number;
  end_month: number | null;
  recurrence: string;
  generate_all_upfront: boolean;
  notes: string | null;
  transport_charge_rule_classrooms?: { classroom_id: string }[] | null;
  transport_charge_rule_students?: { student_id: string }[] | null;
};

type MealRuleRow = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  meal_program_id: string;
  target_scope: string;
  monthly_amount: number;
  due_day: number;
  months_count: number;
  start_month: number;
  end_month: number | null;
  recurrence: string;
  generate_all_upfront: boolean;
  notes: string | null;
  meal_charge_rule_classrooms?: { classroom_id: string }[] | null;
  meal_charge_rule_students?: { student_id: string }[] | null;
};

type EventRuleRow = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  event_id: string;
  target_scope: string;
  monthly_amount: number;
  due_day: number;
  months_count: number;
  start_month: number;
  end_month: number | null;
  recurrence: string;
  generate_all_upfront: boolean;
  notes: string | null;
  event_charge_rule_classrooms?: { classroom_id: string }[] | null;
  event_charge_rule_students?: { student_id: string }[] | null;
};

type RuleRow = ActivityRuleRow | TransportRuleRow | MealRuleRow | EventRuleRow;

function formatTarget(r: RuleRow): string {
  const ts = r.target_scope || "all_enrolled";
  if (ts === "students") {
    let n =
      "activity_id" in r
        ? r.activity_charge_rule_students?.length
        : "route_id" in r
          ? r.transport_charge_rule_students?.length
          : "meal_program_id" in r
            ? r.meal_charge_rule_students?.length
            : r.event_charge_rule_students?.length;
    return `${n ?? 0} aluno(s)`;
  }
  if (ts === "classrooms") {
    let n =
      "activity_id" in r
        ? r.activity_charge_rule_classrooms?.length
        : "route_id" in r
          ? r.transport_charge_rule_classrooms?.length
          : "meal_program_id" in r
            ? r.meal_charge_rule_classrooms?.length
            : r.event_charge_rule_classrooms?.length;
    return `${n ?? 0} turma(s)`;
  }
  return "Todos os inscritos";
}

function formatRecurrenceLabel(r: string | undefined): string {
  const k = (r as FeeRecurrence) || "monthly";
  return RECURRENCE_LABELS[k] ?? String(r ?? "");
}

type Props = {
  variant: "activity" | "transport" | "meal" | "event";
  schoolId: string | null;
  role: string | null;
};

export function DomainChargeRulesPanel({ variant, schoolId, role }: Props) {
  const canManage = canValidateSchoolPaymentProofs(role);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomLite[]>([]);
  const [activities, setActivities] = useState<Array<{ id: string; name: string }>>([]);
  const [routes, setRoutes] = useState<Array<{ id: string; name: string }>>([]);
  const [mealPrograms, setMealPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [schoolEvents, setSchoolEvents] = useState<Array<{ id: string; name: string }>>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
  const [ruleForm, setRuleForm] = useState({
    entity_id: "",
    target_scope: "all_enrolled" as ChargeTargetScope,
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

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const yRes = await supabase.from("academic_years").select("id, label, is_active").eq("school_id", schoolId).order("start_date", { ascending: true });
    const yList = (yRes.data ?? []) as AcademicYear[];
    setYears(yList);
    const active = yList.find((y) => y.is_active) ?? yList[0];
    setActiveYearId(active?.id ?? null);

    const [sRes, cRes] = await Promise.all([
      supabase.from("students").select("id, full_name, classroom_id").eq("school_id", schoolId).order("full_name"),
      supabase.from("classrooms").select("id, name, academic_year_id").eq("school_id", schoolId).order("name"),
    ]);
    setStudents(((sRes.data ?? []) as StudentLite[]).map((s) => ({ ...s, classroom_id: s.classroom_id ?? null })));
    setClassrooms((cRes.data ?? []) as ClassroomLite[]);

    if (variant === "activity") {
      const [{ data: acts }, rRes] = await Promise.all([
        supabase.from("extracurricular_activities").select("id, name").eq("school_id", schoolId).order("name"),
        supabase
          .from("activity_charge_rules")
          .select("*, activity_charge_rule_classrooms(classroom_id), activity_charge_rule_students(student_id)")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false }),
      ]);
      setActivities((acts ?? []) as Array<{ id: string; name: string }>);
      setRules((rRes.data ?? []) as ActivityRuleRow[]);
    } else if (variant === "transport") {
      const [{ data: rts }, rRes] = await Promise.all([
        supabase.from("transport_routes").select("id, name").eq("school_id", schoolId).order("name"),
        supabase
          .from("transport_charge_rules")
          .select("*, transport_charge_rule_classrooms(classroom_id), transport_charge_rule_students(student_id)")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false }),
      ]);
      setRoutes((rts ?? []) as Array<{ id: string; name: string }>);
      setRules((rRes.data ?? []) as TransportRuleRow[]);
    } else if (variant === "event") {
      const [{ data: evRows }, rRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, event_date")
          .eq("school_id", schoolId)
          .order("event_date", { ascending: false })
          .limit(300),
        supabase
          .from("event_charge_rules")
          .select("*, event_charge_rule_classrooms(classroom_id), event_charge_rule_students(student_id)")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false }),
      ]);
      const evList = ((evRows ?? []) as Array<{ id: string; title: string; event_date: string }>).map((e) => ({
        id: e.id,
        name: `${e.title?.trim() || "Evento"} (${String(e.event_date ?? "").slice(0, 10)})`,
      }));
      setSchoolEvents(evList);
      setRules((rRes.data ?? []) as EventRuleRow[]);
    } else {
      const [{ data: progs }, rRes] = await Promise.all([
        supabase.from("meal_programs").select("id, name").eq("school_id", schoolId).order("name"),
        supabase
          .from("meal_charge_rules")
          .select("*, meal_charge_rule_classrooms(classroom_id), meal_charge_rule_students(student_id)")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false }),
      ]);
      setMealPrograms((progs ?? []) as Array<{ id: string; name: string }>);
      setRules((rRes.data ?? []) as MealRuleRow[]);
    }
    setLoading(false);
  }, [schoolId, variant]);

  useEffect(() => {
    void load();
  }, [load]);

  const classroomsForYear = useMemo(() => {
    if (!activeYearId) return classrooms;
    return classrooms.filter((c) => c.academic_year_id === activeYearId);
  }, [classrooms, activeYearId]);

  const openNew = () => {
    setEditingRule(null);
    setRuleForm({
      entity_id: "",
      target_scope: "all_enrolled",
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

  const openEdit = (r: RuleRow) => {
    setEditingRule(r);
    const ts = (r.target_scope as ChargeTargetScope) || "all_enrolled";
    let entityId = "";
    let classroomIds: string[] = [];
    let studentIds: string[] = [];
    if ("activity_id" in r) {
      entityId = r.activity_id;
      classroomIds = (r.activity_charge_rule_classrooms ?? []).map((x) => x.classroom_id);
      studentIds = (r.activity_charge_rule_students ?? []).map((x) => x.student_id);
    } else if ("route_id" in r) {
      entityId = r.route_id;
      classroomIds = (r.transport_charge_rule_classrooms ?? []).map((x) => x.classroom_id);
      studentIds = (r.transport_charge_rule_students ?? []).map((x) => x.student_id);
    } else if ("meal_program_id" in r) {
      entityId = r.meal_program_id;
      classroomIds = (r.meal_charge_rule_classrooms ?? []).map((x) => x.classroom_id);
      studentIds = (r.meal_charge_rule_students ?? []).map((x) => x.student_id);
    } else if ("event_id" in r) {
      entityId = r.event_id;
      classroomIds = (r.event_charge_rule_classrooms ?? []).map((x) => x.classroom_id);
      studentIds = (r.event_charge_rule_students ?? []).map((x) => x.student_id);
    }
    setRuleForm({
      entity_id: entityId,
      target_scope: ts,
      classroom_ids: classroomIds,
      student_ids: studentIds,
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
    if (!ruleForm.entity_id.trim()) {
      toast({
        title:
          variant === "activity"
            ? "Seleccione uma atividade"
            : variant === "transport"
              ? "Seleccione uma rota"
              : variant === "event"
                ? "Seleccione um evento"
                : "Seleccione um plano de refeições",
        variant: "destructive",
      });
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
    const base = {
      school_id: schoolId,
      academic_year_id: activeYearId,
      target_scope: ruleForm.target_scope,
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
    if (variant === "activity") {
      const payload = { ...base, activity_id: ruleForm.entity_id };
      if (editingRule && "activity_id" in editingRule) {
        const { error } = await supabase.from("activity_charge_rules").update(payload).eq("id", editingRule.id);
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = editingRule.id;
      } else {
        const { data: ins, error } = await supabase.from("activity_charge_rules").insert(payload).select("id").single();
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = ins?.id ?? "";
      }
      await supabase.from("activity_charge_rule_classrooms").delete().eq("charge_rule_id", ruleId);
      await supabase.from("activity_charge_rule_students").delete().eq("charge_rule_id", ruleId);
      if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length > 0) {
        const { error: ce } = await supabase
          .from("activity_charge_rule_classrooms")
          .insert(ruleForm.classroom_ids.map((cid) => ({ charge_rule_id: ruleId, classroom_id: cid })));
        if (ce) {
          toast({ title: "Erro ao guardar turmas", description: ce.message, variant: "destructive" });
          return;
        }
      }
      if (ruleForm.target_scope === "students" && ruleForm.student_ids.length > 0) {
        const { error: se } = await supabase
          .from("activity_charge_rule_students")
          .insert(ruleForm.student_ids.map((sid) => ({ charge_rule_id: ruleId, student_id: sid })));
        if (se) {
          toast({ title: "Erro ao guardar alunos", description: se.message, variant: "destructive" });
          return;
        }
      }
    } else if (variant === "transport") {
      const payload = { ...base, route_id: ruleForm.entity_id };
      if (editingRule && "route_id" in editingRule) {
        const { error } = await supabase.from("transport_charge_rules").update(payload).eq("id", editingRule.id);
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = editingRule.id;
      } else {
        const { data: ins, error } = await supabase.from("transport_charge_rules").insert(payload).select("id").single();
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = ins?.id ?? "";
      }
      await supabase.from("transport_charge_rule_classrooms").delete().eq("charge_rule_id", ruleId);
      await supabase.from("transport_charge_rule_students").delete().eq("charge_rule_id", ruleId);
      if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length > 0) {
        const { error: ce } = await supabase
          .from("transport_charge_rule_classrooms")
          .insert(ruleForm.classroom_ids.map((cid) => ({ charge_rule_id: ruleId, classroom_id: cid })));
        if (ce) {
          toast({ title: "Erro ao guardar turmas", description: ce.message, variant: "destructive" });
          return;
        }
      }
      if (ruleForm.target_scope === "students" && ruleForm.student_ids.length > 0) {
        const { error: se } = await supabase
          .from("transport_charge_rule_students")
          .insert(ruleForm.student_ids.map((sid) => ({ charge_rule_id: ruleId, student_id: sid })));
        if (se) {
          toast({ title: "Erro ao guardar alunos", description: se.message, variant: "destructive" });
          return;
        }
      }
    } else if (variant === "event") {
      const payload = { ...base, event_id: ruleForm.entity_id };
      if (editingRule && "event_id" in editingRule) {
        const { error } = await supabase.from("event_charge_rules").update(payload).eq("id", editingRule.id);
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = editingRule.id;
      } else {
        const { data: ins, error } = await supabase.from("event_charge_rules").insert(payload).select("id").single();
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = ins?.id ?? "";
      }
      await supabase.from("event_charge_rule_classrooms").delete().eq("charge_rule_id", ruleId);
      await supabase.from("event_charge_rule_students").delete().eq("charge_rule_id", ruleId);
      if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length > 0) {
        const { error: ce } = await supabase
          .from("event_charge_rule_classrooms")
          .insert(ruleForm.classroom_ids.map((cid) => ({ charge_rule_id: ruleId, classroom_id: cid })));
        if (ce) {
          toast({ title: "Erro ao guardar turmas", description: ce.message, variant: "destructive" });
          return;
        }
      }
      if (ruleForm.target_scope === "students" && ruleForm.student_ids.length > 0) {
        const { error: se } = await supabase
          .from("event_charge_rule_students")
          .insert(ruleForm.student_ids.map((sid) => ({ charge_rule_id: ruleId, student_id: sid })));
        if (se) {
          toast({ title: "Erro ao guardar alunos", description: se.message, variant: "destructive" });
          return;
        }
      }
    } else {
      const payload = { ...base, meal_program_id: ruleForm.entity_id };
      if (editingRule && "meal_program_id" in editingRule) {
        const { error } = await supabase.from("meal_charge_rules").update(payload).eq("id", editingRule.id);
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = editingRule.id;
      } else {
        const { data: ins, error } = await supabase.from("meal_charge_rules").insert(payload).select("id").single();
        if (error) {
          toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
          return;
        }
        ruleId = ins?.id ?? "";
      }
      await supabase.from("meal_charge_rule_classrooms").delete().eq("charge_rule_id", ruleId);
      await supabase.from("meal_charge_rule_students").delete().eq("charge_rule_id", ruleId);
      if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length > 0) {
        const { error: ce } = await supabase
          .from("meal_charge_rule_classrooms")
          .insert(ruleForm.classroom_ids.map((cid) => ({ charge_rule_id: ruleId, classroom_id: cid })));
        if (ce) {
          toast({ title: "Erro ao guardar turmas", description: ce.message, variant: "destructive" });
          return;
        }
      }
      if (ruleForm.target_scope === "students" && ruleForm.student_ids.length > 0) {
        const { error: se } = await supabase
          .from("meal_charge_rule_students")
          .insert(ruleForm.student_ids.map((sid) => ({ charge_rule_id: ruleId, student_id: sid })));
        if (se) {
          toast({ title: "Erro ao guardar alunos", description: se.message, variant: "destructive" });
          return;
        }
      }
    }

    toast({ title: editingRule ? "Regra actualizada" : "Regra criada" });
    setRuleDialog(false);
    await load();
  };

  const confirmDelete = async () => {
    if (!deleteRule) return;
    const t =
      variant === "activity"
        ? "activity_charge_rules"
        : variant === "transport"
          ? "transport_charge_rules"
          : variant === "event"
            ? "event_charge_rules"
            : "meal_charge_rules";
    const { error } = await supabase.from(t).delete().eq("id", deleteRule);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Regra apagada" });
    setDeleteRule(null);
    await load();
  };

  const entityLabel =
    variant === "activity"
      ? "Atividade"
      : variant === "transport"
        ? "Rota"
        : variant === "event"
          ? "Evento"
          : "Plano de refeições";
  const options = variant === "activity" ? activities : variant === "transport" ? routes : variant === "event" ? schoolEvents : mealPrograms;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Regras de cobranças</CardTitle>
            <CardDescription>
              {variant === "activity"
                ? "Valor por período, recorrência e alvo (todos os inscritos, turmas ou alunos). Ao guardar uma inscrição, as mensalidades passam a seguir estas regras quando aplicáveis; caso contrário mantém-se o valor configurado na atividade."
                : variant === "transport"
                  ? "Valor por período, recorrência e alvo. Quando há regra aplicável à inscrição, as mensalidades seguem estas definições; caso contrário usa-se o valor da rota ou o override por aluno."
                  : variant === "event"
                    ? "Valor de cobrança por aluno (uma parcela) com alvo dentro do público do evento. Depois de guardar a regra, as cobranças são criadas/atualizadas automaticamente conforme turmas ou alunos escolhidos."
                    : "Valor por período, recorrência e alvo. Se existir regra para o plano e o aluno, as cobranças seguem estas definições; caso contrário usa-se o valor por omissão do plano ou o valor manual na inscrição."}
            </CardDescription>
          </div>
          {canManage && (
            <Button type="button" onClick={openNew} className="gap-2 shrink-0" disabled={options.length === 0}>
              <Plus className="h-4 w-4" /> Nova regra
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma regra definida ainda.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="p-3">{entityLabel}</th>
                    <th className="p-3">Alvo</th>
                    <th className="p-3">Valor / período</th>
                    <th className="p-3">Recorrência</th>
                    <th className="p-3">Ano letivo</th>
                    {canManage && <th className="p-3 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => {
                    const eid =
                      "activity_id" in r
                        ? r.activity_id
                        : "route_id" in r
                          ? r.route_id
                          : "meal_program_id" in r
                            ? r.meal_program_id
                            : r.event_id;
                    const ename =
                      variant === "activity"
                        ? activities.find((x) => x.id === eid)?.name ?? "—"
                        : variant === "transport"
                          ? routes.find((x) => x.id === eid)?.name ?? "—"
                          : variant === "event"
                            ? schoolEvents.find((x) => x.id === eid)?.name ?? "—"
                            : mealPrograms.find((x) => x.id === eid)?.name ?? "—";
                    const yr = r.academic_year_id ? years.find((y) => y.id === r.academic_year_id)?.label : null;
                    return (
                      <tr key={r.id} className="border-t border-border">
                        <td className="p-3 font-medium">{ename}</td>
                        <td className="p-3">{formatTarget(r)}</td>
                        <td className="p-3">{Number(r.monthly_amount ?? 0).toLocaleString("pt-PT")} Kz</td>
                        <td className="p-3">
                          <Badge variant="secondary">{formatRecurrenceLabel(r.recurrence)}</Badge>
                          {r.generate_all_upfront && (
                            <span className="ml-2 text-xs text-muted-foreground">· tudo gerado já</span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{yr ?? "(activo)"}</td>
                        {canManage && (
                          <td className="p-3 text-right">
                            <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteRule(r.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Editar regra" : "Nova regra"}</DialogTitle>
            <DialogDescription>Defina o valor por período de cobrança e a recorrência (como nas propinas).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>{entityLabel}</Label>
              <Select value={ruleForm.entity_id} onValueChange={(v) => setRuleForm((f) => ({ ...f, entity_id: v }))}>
                <SelectTrigger><SelectValue placeholder={`Escolher ${entityLabel.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Alvo da cobrança</Label>
              <Select value={ruleForm.target_scope} onValueChange={(v) => setRuleForm((f) => ({ ...f, target_scope: v as ChargeTargetScope }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_enrolled">Todos os alunos inscritos</SelectItem>
                  <SelectItem value="classrooms">Turmas específicas</SelectItem>
                  <SelectItem value="students">Alunos específicos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ruleForm.target_scope === "classrooms" && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-2"><Users className="h-4 w-4" /> Turmas</Label>
                <ScrollArea className="h-40 rounded-md border border-border p-3">
                  {classroomsForYear.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1">
                      <Checkbox
                        checked={ruleForm.classroom_ids.includes(c.id)}
                        onCheckedChange={(v) =>
                          setRuleForm((f) => ({
                            ...f,
                            classroom_ids: v
                              ? [...f.classroom_ids, c.id]
                              : f.classroom_ids.filter((x) => x !== c.id),
                          }))
                        }
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                </ScrollArea>
              </div>
            )}

            {ruleForm.target_scope === "students" && (
              <div className="grid gap-2">
                <Label>Alunos</Label>
                <ScrollArea className="h-40 rounded-md border border-border p-3">
                  {students.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 py-1">
                      <Checkbox
                        checked={ruleForm.student_ids.includes(s.id)}
                        onCheckedChange={(v) =>
                          setRuleForm((f) => ({
                            ...f,
                            student_ids: v ? [...f.student_ids, s.id] : f.student_ids.filter((x) => x !== s.id),
                          }))
                        }
                      />
                      <span className="text-sm">{s.full_name}</span>
                    </label>
                  ))}
                </ScrollArea>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Valor por período (Kz)</Label>
                <Input type="number" min={0} value={ruleForm.monthly_amount} onChange={(e) => setRuleForm((f) => ({ ...f, monthly_amount: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Dia limite</Label>
                <Input type="number" min={1} max={28} value={ruleForm.due_day} onChange={(e) => setRuleForm((f) => ({ ...f, due_day: e.target.value }))} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Recorrência</Label>
              <Select value={ruleForm.recurrence} onValueChange={(v) => setRuleForm((f) => ({ ...f, recurrence: v as FeeRecurrence }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECURRENCE_LABELS) as FeeRecurrence[]).map((k) => (
                    <SelectItem key={k} value={k}>{RECURRENCE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Mês início período</Label>
                <Select value={ruleForm.start_month} onValueChange={(v) => setRuleForm((f) => ({ ...f, start_month: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES_PT.map((label, idx) => {
                      const v = String(idx + 1);
                      return <SelectItem key={v} value={v}>{label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Mês fim período</Label>
                <Select value={ruleForm.end_month} onValueChange={(v) => setRuleForm((f) => ({ ...f, end_month: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES_PT.map((label, idx) => {
                      const v = String(idx + 1);
                      return <SelectItem key={v} value={v}>{label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O número de cobranças é calculado entre o mês início e fim de acordo com a recorrência (como nas propinas).
            </p>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm font-medium">Gerar todas as parcelas já</Label>
                <p className="text-xs text-muted-foreground">Equivalente à opção das propinas: cria todos os períodos de uma vez.</p>
              </div>
              <Switch checked={ruleForm.generate_all_upfront} onCheckedChange={(v) => setRuleForm((f) => ({ ...f, generate_all_upfront: v }))} />
            </div>

            <div className="grid gap-2">
              <Label>Notas (opcional)</Label>
              <Textarea rows={2} value={ruleForm.notes} onChange={(e) => setRuleForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setRuleDialog(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void saveRule()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRule} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar regra?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não remove cobranças já geradas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
