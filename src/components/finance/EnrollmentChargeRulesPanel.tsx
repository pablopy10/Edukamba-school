import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Pencil, Plus, Trash2, Users, Eye } from "lucide-react";
import { canValidateSchoolPaymentProofs } from "@/lib/schoolStaffRoles";
import { sendNotificationWithPush } from "@/lib/notifications/sendNotificationWithPush";

type ChargeTargetScope = "all_enrolled" | "classrooms" | "students";

type AcademicYear = { id: string; label: string; is_active: boolean | null };
type StudentLite = { id: string; full_name: string; classroom_id: string | null };
type ClassroomLite = { id: string; name: string; academic_year_id?: string | null };

export type EnrollmentRuleRow = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  target_scope: string;
  amount_new: number;
  amount_renewal: number;
  due_offset_days: number;
  notes: string | null;
  enrollment_charge_rule_classrooms?: { classroom_id: string }[] | null;
  enrollment_charge_rule_students?: { student_id: string }[] | null;
};

type Props = {
  schoolId: string | null;
  role: string | null;
};

function formatTarget(r: EnrollmentRuleRow): string {
  const ts = r.target_scope || "all_enrolled";
  if (ts === "students") return `${r.enrollment_charge_rule_students?.length ?? 0} aluno(s)`;
  if (ts === "classrooms") return `${r.enrollment_charge_rule_classrooms?.length ?? 0} turma(s)`;
  return "Todos os alunos (matrícula no ano)";
}

export function EnrollmentChargeRulesPanel({ schoolId, role }: Props) {
  const canManage = canValidateSchoolPaymentProofs(role);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [classrooms, setClassrooms] = useState<ClassroomLite[]>([]);
  const [rules, setRules] = useState<EnrollmentRuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<EnrollmentRuleRow | null>(null);
  const [ruleForm, setRuleForm] = useState({
    target_scope: "all_enrolled" as ChargeTargetScope,
    classroom_ids: [] as string[],
    student_ids: [] as string[],
    amount_new: "0",
    amount_renewal: "0",
    due_offset_days: "15",
    notes: "",
  });
  const [deleteRule, setDeleteRule] = useState<string | null>(null);
  const [feesDetailRule, setFeesDetailRule] = useState<EnrollmentRuleRow | null>(null);
  const [feesDetailData, setFeesDetailData] = useState<Array<{ id: string; student_name: string; amount_due: number; due_date: string; is_paid: boolean }>>([]);
  const [feesDetailLoading, setFeesDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const yRes = await supabase
      .from("academic_years")
      .select("id, label, is_active")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: true });
    const yList = (yRes.data ?? []) as AcademicYear[];
    setYears(yList);
    const active = yList.find((y) => y.is_active) ?? yList[0];
    setActiveYearId(active?.id ?? null);

    const [sRes, cRes, rRes] = await Promise.all([
      supabase.from("students").select("id, full_name, classroom_id").eq("school_id", schoolId).order("full_name"),
      supabase.from("classrooms").select("id, name, academic_year_id").eq("school_id", schoolId).order("name"),
      supabase
        .from("enrollment_charge_rules")
        .select("*, enrollment_charge_rule_classrooms(classroom_id), enrollment_charge_rule_students(student_id)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false }),
    ]);

    setStudents(((sRes.data ?? []) as StudentLite[]).map((s) => ({ ...s, classroom_id: s.classroom_id ?? null })));
    setClassrooms((cRes.data ?? []) as ClassroomLite[]);
    setRules((rRes.data ?? []) as EnrollmentRuleRow[]);
    setLoading(false);
  }, [schoolId]);

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
      target_scope: "all_enrolled",
      classroom_ids: [],
      student_ids: [],
      amount_new: "0",
      amount_renewal: "0",
      due_offset_days: "15",
      notes: "",
    });
    setRuleDialog(true);
  };

  const openEdit = (r: EnrollmentRuleRow) => {
    setEditingRule(r);
    const ts = (r.target_scope as ChargeTargetScope) || "all_enrolled";
    setRuleForm({
      target_scope: ts,
      classroom_ids: (r.enrollment_charge_rule_classrooms ?? []).map((x) => x.classroom_id),
      student_ids: (r.enrollment_charge_rule_students ?? []).map((x) => x.student_id),
      amount_new: String(r.amount_new ?? 0),
      amount_renewal: String(r.amount_renewal ?? 0),
      due_offset_days: String(Math.max(0, Math.min(365, Number(r.due_offset_days) || 15))),
      notes: r.notes ?? "",
    });
    setRuleDialog(true);
  };

  const saveRule = async () => {
    if (!schoolId) return;
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
      amount_new: Math.max(0, Number(ruleForm.amount_new) || 0),
      amount_renewal: Math.max(0, Number(ruleForm.amount_renewal) || 0),
      due_offset_days: Math.max(0, Math.min(365, Number(ruleForm.due_offset_days) || 15)),
      notes: ruleForm.notes.trim() || null,
    };

    let ruleId = editingRule?.id ?? "";
    if (editingRule) {
      const { error } = await supabase.from("enrollment_charge_rules").update(base).eq("id", editingRule.id);
      if (error) {
        toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
        return;
      }
      ruleId = editingRule.id;
    } else {
      const { data: ins, error } = await supabase.from("enrollment_charge_rules").insert(base).select("id").single();
      if (error) {
        toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
        return;
      }
      ruleId = ins?.id ?? "";
    }

    await supabase.from("enrollment_charge_rule_classrooms").delete().eq("charge_rule_id", ruleId);
    await supabase.from("enrollment_charge_rule_students").delete().eq("charge_rule_id", ruleId);
    if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length > 0) {
      const { error: ce } = await supabase
        .from("enrollment_charge_rule_classrooms")
        .insert(ruleForm.classroom_ids.map((cid) => ({ charge_rule_id: ruleId, classroom_id: cid })));
      if (ce) {
        toast({ title: "Erro ao guardar turmas", description: ce.message, variant: "destructive" });
        return;
      }
    }
    if (ruleForm.target_scope === "students" && ruleForm.student_ids.length > 0) {
      const { error: se } = await supabase
        .from("enrollment_charge_rule_students")
        .insert(ruleForm.student_ids.map((sid) => ({ charge_rule_id: ruleId, student_id: sid })));
      if (se) {
        toast({ title: "Erro ao guardar alunos", description: se.message, variant: "destructive" });
        return;
      }
    }

    toast({ title: editingRule ? "Regra actualizada" : "Regra criada" });
    setRuleDialog(false);

    // Gerar cobranças de matrícula automaticamente para os alunos abrangidos
    let targetStudentIds: string[] = [];
    if (ruleForm.target_scope === "students" && ruleForm.student_ids.length > 0) {
      targetStudentIds = ruleForm.student_ids;
    } else if (ruleForm.target_scope === "classrooms" && ruleForm.classroom_ids.length > 0) {
      const { data: classStudents } = await supabase
        .from("students")
        .select("id")
        .in("classroom_id", ruleForm.classroom_ids);
      targetStudentIds = (classStudents ?? []).map(s => s.id);
    } else if (ruleForm.target_scope === "all_enrolled") {
      const { data: allStudents } = await supabase
        .from("students")
        .select("id")
        .eq("school_id", schoolId);
      targetStudentIds = (allStudents ?? []).map(s => s.id);
    }

    if (targetStudentIds.length > 0) {
      const amount = Number(base.amount_new) || 0;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (base.due_offset_days || 15));
      const dueDateStr = dueDate.toISOString().slice(0, 10);
      let generated = 0;

      for (const studentId of targetStudentIds) {
        // Verificar se já existe cobrança para este aluno/ano
        const { count } = await supabase
          .from("enrollment_fees")
          .select("id", { count: "exact", head: true })
          .eq("student_id", studentId)
          .eq("school_id", schoolId)
          .eq("academic_year_id", activeYearId ?? "");
        if ((count ?? 0) > 0) continue;

        // Criar cobrança
        const { error: feeErr } = await supabase.from("enrollment_fees").insert({
          student_id: studentId,
          school_id: schoolId,
          academic_year_id: activeYearId,
          fee_type: "NEW",
          amount_due: amount,
          due_date: dueDateStr,
          is_paid: false,
        });
        if (feeErr) continue;
        generated++;

        // Notificar encarregado
        const { data: student } = await supabase
          .from("students")
          .select("full_name, parent_id")
          .eq("id", studentId)
          .maybeSingle();
        if (student?.parent_id) {
          await sendNotificationWithPush({
            recipient_id: student.parent_id,
            school_id: schoolId,
            title: "Nova cobrança de matrícula",
            description: `Foi gerada uma cobrança de matrícula para ${student.full_name ?? "o aluno"} no valor de ${amount.toLocaleString("pt-AO")} Kz (vencimento: ${new Date(dueDateStr).toLocaleDateString("pt-PT")}).`,
            category: "pagamento",
            link: "https://www.edukamba.com/pagamentos",
          });
        }
      }

      if (generated > 0) {
        toast({ title: "Cobranças geradas", description: `${generated} cobrança(s) de matrícula criada(s) e encarregados notificados.` });
      }
    }

    await load();
  };

  const confirmDelete = async () => {
    if (!deleteRule) return;
    const { error } = await supabase.from("enrollment_charge_rules").delete().eq("id", deleteRule);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Regra apagada" });
    setDeleteRule(null);
    await load();
  };

  const openFeesDetail = async (rule: EnrollmentRuleRow) => {
    setFeesDetailRule(rule);
    setFeesDetailLoading(true);
    setFeesDetailData([]);

    // Determinar alunos abrangidos pela regra
    let studentIds: string[] = [];
    if (rule.target_scope === "students" && rule.enrollment_charge_rule_students?.length) {
      studentIds = rule.enrollment_charge_rule_students.map(s => s.student_id);
    } else if (rule.target_scope === "classrooms" && rule.enrollment_charge_rule_classrooms?.length) {
      const cids = rule.enrollment_charge_rule_classrooms.map(c => c.classroom_id);
      const { data } = await supabase.from("students").select("id").in("classroom_id", cids);
      studentIds = (data ?? []).map(s => s.id);
    } else {
      const { data } = await supabase.from("students").select("id").eq("school_id", schoolId);
      studentIds = (data ?? []).map(s => s.id);
    }

    if (studentIds.length > 0) {
      const { data: fees } = await supabase
        .from("enrollment_fees")
        .select("id, amount_due, due_date, is_paid, student:students(full_name)")
        .eq("school_id", schoolId)
        .eq("academic_year_id", rule.academic_year_id ?? "")
        .in("student_id", studentIds)
        .order("due_date", { ascending: true });

      setFeesDetailData((fees ?? []).map(f => ({
        id: f.id,
        student_name: (f.student as unknown as { full_name: string })?.full_name ?? "—",
        amount_due: Number(f.amount_due),
        due_date: f.due_date,
        is_paid: f.is_paid,
      })));
    }
    setFeesDetailLoading(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Regras de cobrança</CardTitle>
            <CardDescription>
              Taxa única quando a matrícula fica <strong>Confirmada</strong>: valores para primeira matrícula e para
              renovação, prazo em dias após activação da matrícula, e público-alvo por ano letivo. Se não existir regra
              aplicável ao aluno, usam‑se os valores globais definidos nas definições da escola (&quot;Propinas /
              valores de matrícula&quot;).
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={activeYearId ?? ""} onValueChange={(v) => setActiveYearId(v || null)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Ano letivo" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y.id} value={y.id}>
                    {y.label}
                    {y.is_active ? " · activo" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage && (
              <Button type="button" onClick={openNew} className="gap-2 shrink-0" disabled={!activeYearId}>
                <Plus className="h-4 w-4" /> Nova regra
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!activeYearId ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem anos letivos na escola.</p>
          ) : loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma regra definida para este período.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="p-3">Alvo</th>
                    <th className="p-3">Matrícula nova</th>
                    <th className="p-3">Renovação</th>
                    <th className="p-3">Prazo (dias)</th>
                    <th className="p-3">Ano letivo</th>
                    {canManage && <th className="p-3 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {rules
                    .filter((r) => r.academic_year_id === activeYearId)
                    .map((r) => {
                      const yr = r.academic_year_id ? years.find((y) => y.id === r.academic_year_id)?.label : null;
                      return (
                        <tr key={r.id} className="border-t border-border">
                          <td className="p-3">{formatTarget(r)}</td>
                          <td className="p-3">{Number(r.amount_new ?? 0).toLocaleString("pt-PT")} Kz</td>
                          <td className="p-3">{Number(r.amount_renewal ?? 0).toLocaleString("pt-PT")} Kz</td>
                          <td className="p-3">
                            <Badge variant="secondary">{r.due_offset_days ?? 15} dias</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground">{yr ?? "—"}</td>
                          {canManage && (
                            <td className="p-3 text-right">
                              <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => openFeesDetail(r)} title="Ver cobranças">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => openEdit(r)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => setDeleteRule(r.id)}
                              >
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
            <DialogDescription>Válida para matrículas confirmadas neste ano letivo (selecionado acima).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Alvo da cobrança</Label>
              <Select
                value={ruleForm.target_scope}
                onValueChange={(v) => setRuleForm((f) => ({ ...f, target_scope: v as ChargeTargetScope }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_enrolled">Todos os alunos (matrícula neste ano)</SelectItem>
                  <SelectItem value="classrooms">Turmas específicas</SelectItem>
                  <SelectItem value="students">Alunos específicos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ruleForm.target_scope === "classrooms" && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> Turmas (ano seleccionado no cartão acima)
                </Label>
                <ScrollArea className="h-40 rounded-md border border-border p-3">
                  {classroomsForYear.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1">
                      <Checkbox
                        checked={ruleForm.classroom_ids.includes(c.id)}
                        onCheckedChange={(v) =>
                          setRuleForm((f) => ({
                            ...f,
                            classroom_ids: v ? [...f.classroom_ids, c.id] : f.classroom_ids.filter((x) => x !== c.id),
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
                <Label>Primeira matrícula (Kz)</Label>
                <Input
                  type="number"
                  min={0}
                  value={ruleForm.amount_new}
                  onChange={(e) => setRuleForm((f) => ({ ...f, amount_new: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Renovação (Kz)</Label>
                <Input
                  type="number"
                  min={0}
                  value={ruleForm.amount_renewal}
                  onChange={(e) => setRuleForm((f) => ({ ...f, amount_renewal: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Prazo após confirmar matrícula (dias)</Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={ruleForm.due_offset_days}
                onChange={(e) => setRuleForm((f) => ({ ...f, due_offset_days: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Data de vencimento = dia da activação como Confirmada + estes dias.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={ruleForm.notes} onChange={(e) => setRuleForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRuleDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void saveRule()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRule} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar regra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção não afecta taxas já geradas; apenas futuras matrículas confirmadas deixam de usar esta regra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} className="bg-destructive text-destructive-foreground">
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: cobranças geradas para esta regra */}
      <Dialog open={!!feesDetailRule} onOpenChange={(o) => !o && setFeesDetailRule(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cobranças de matrícula</DialogTitle>
            <DialogDescription>
              Regra: {feesDetailRule ? formatTarget(feesDetailRule) : ""} — {feesDetailData.length} cobrança(s)
            </DialogDescription>
          </DialogHeader>
          {feesDetailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : feesDetailData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma cobrança gerada ainda para esta regra.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="p-2.5">Aluno</th>
                    <th className="p-2.5">Valor</th>
                    <th className="p-2.5">Vencimento</th>
                    <th className="p-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {feesDetailData.map((f) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="p-2.5 font-medium">{f.student_name}</td>
                      <td className="p-2.5">{f.amount_due.toLocaleString("pt-PT")} Kz</td>
                      <td className="p-2.5 text-muted-foreground">{new Date(f.due_date).toLocaleDateString("pt-PT")}</td>
                      <td className="p-2.5">
                        {f.is_paid ? (
                          <Badge className="bg-green-100 text-green-700">Pago</Badge>
                        ) : (
                          <Badge variant="secondary">Pendente</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeesDetailRule(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
