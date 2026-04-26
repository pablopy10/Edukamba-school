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
import { Loader2, Plus, Pencil, Trash2, Wallet, Users, Percent, PlayCircle } from "lucide-react";
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

    const [yRes, rRes, fRes, dRes, sRes] = await Promise.all([
      supabase.from("academic_years").select("id, label, is_active").eq("school_id", sId).order("start_date", { ascending: false }),
      supabase.from("fee_rules").select("*").eq("school_id", sId).order("grade_level"),
      supabase.from("family_discount_rules").select("*").eq("school_id", sId).order("sibling_position"),
      supabase.from("student_discounts").select("*, student:students(full_name)").eq("school_id", sId).order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name").eq("school_id", sId).order("full_name"),
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
            <TabsTrigger value="family">Descontos por irmão</TabsTrigger>
            <TabsTrigger value="overrides">Descontos por aluno</TabsTrigger>
          </TabsList>

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
                  <CardTitle>Desconto automático por irmão</CardTitle>
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
                          <th className="py-2 px-2">Posição do irmão</th>
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
              <Label>A partir do … irmão</Label>
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
    </DashboardLayout>
  );
};

export default Pagamentos;