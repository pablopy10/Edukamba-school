import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { useUserRole } from "@/hooks/useUserRole";
import { isSchoolManagementRole, isSchoolSettingsAdmin } from "@/lib/schoolStaffRoles";
import type { GuardianPaymentMode } from "@/lib/guardianPayment";
import { normalizeGuardianPaymentMode } from "@/lib/guardianPayment";

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

type StudentLite = { id: string; full_name: string };

const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

/** Cobrança aos encarregados (app) + descontos por familiar e por aluno — migrado de Pagamentos. */
export function BillingEncargadosDiscountsPanel({ schoolId }: { schoolId: string | null }) {
  const { role } = useUserRole();
  const { selectedYearId } = useAcademicYear();
  const canEditSchoolPaymentPrefs = isSchoolManagementRole(role) || isSchoolSettingsAdmin(role);

  const [guardianPaymentMode, setGuardianPaymentMode] = useState<GuardianPaymentMode>("proof_attachment");
  const [bankIbanDraft, setBankIbanDraft] = useState("");
  const [savingPaymentPrefs, setSavingPaymentPrefs] = useState(false);

  const [familyRules, setFamilyRules] = useState<FamilyRule[]>([]);
  const [discounts, setDiscounts] = useState<StudentDiscount[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(false);

  const [familyDialog, setFamilyDialog] = useState(false);
  const [editingFamily, setEditingFamily] = useState<FamilyRule | null>(null);
  const [familyForm, setFamilyForm] = useState({ sibling_position: "2", discount_percentage: "10" });
  const [deleteFamily, setDeleteFamily] = useState<string | null>(null);

  const [discountDialog, setDiscountDialog] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<StudentDiscount | null>(null);
  const [discountForm, setDiscountForm] = useState({
    student_id: "",
    discount_percentage: "",
    discount_fixed_amount: "",
    reason: "",
  });
  const [deleteDiscount, setDeleteDiscount] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    const [{ data: payPrefsRow }, fRes, dRes, sRes] = await Promise.all([
      supabase.from("school_payment_prefs").select("guardian_payment_mode, bank_iban").eq("school_id", schoolId).maybeSingle(),
      supabase.from("family_discount_rules").select("*").eq("school_id", schoolId).order("sibling_position"),
      supabase.from("student_discounts").select("*, student:students(full_name)").eq("school_id", schoolId).order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name").eq("school_id", schoolId).order("full_name"),
    ]);
    setGuardianPaymentMode(normalizeGuardianPaymentMode(payPrefsRow?.guardian_payment_mode));
    setBankIbanDraft(payPrefsRow?.bank_iban ?? "");
    setFamilyRules((fRes.data ?? []) as FamilyRule[]);
    setDiscounts((dRes.data ?? []) as StudentDiscount[]);
    setStudents((sRes.data ?? []) as StudentLite[]);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSchoolPaymentPrefs = async () => {
    if (!schoolId || !canEditSchoolPaymentPrefs) return;
    setSavingPaymentPrefs(true);
    const { error } = await supabase.from("school_payment_prefs").upsert(
      {
        school_id: schoolId,
        guardian_payment_mode: guardianPaymentMode,
        bank_iban: bankIbanDraft.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id" },
    );
    setSavingPaymentPrefs(false);
    if (error) {
      toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Preferências de cobrança guardadas" });
  };

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
    if (error) {
      toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingFamily ? "Regra atualizada" : "Regra criada" });
    setFamilyDialog(false);
    void load();
  };
  const confirmDeleteFamily = async () => {
    if (!deleteFamily) return;
    const { error } = await supabase.from("family_discount_rules").delete().eq("id", deleteFamily);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Regra apagada" });
    setDeleteFamily(null);
    void load();
  };

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
    if (!selectedYearId) {
      toast({
        title: "Ano letivo em falta",
        description: "Seleccione o ano letivo activo no cabeçalho da app antes de criar um desconto.",
        variant: "destructive",
      });
      return;
    }
    if (!discountForm.student_id) {
      toast({ title: "Selecciona um aluno", variant: "destructive" });
      return;
    }
    const pct = discountForm.discount_percentage ? Number(discountForm.discount_percentage) : null;
    const fixed = discountForm.discount_fixed_amount ? Number(discountForm.discount_fixed_amount) : null;
    if (pct == null && fixed == null) {
      toast({ title: "Indica uma percentagem ou um valor fixo", variant: "destructive" });
      return;
    }
    const payload = {
      school_id: schoolId,
      student_id: discountForm.student_id,
      academic_year_id: selectedYearId,
      discount_percentage: pct,
      discount_fixed_amount: fixed,
      reason: discountForm.reason.trim() || null,
      is_active: true,
    };
    const { error } = editingDiscount
      ? await supabase.from("student_discounts").update(payload).eq("id", editingDiscount.id)
      : await supabase.from("student_discounts").insert(payload);
    if (error) {
      toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingDiscount ? "Desconto atualizado" : "Desconto criado" });
    setDiscountDialog(false);
    void load();
  };
  const confirmDeleteDiscount = async () => {
    if (!deleteDiscount) return;
    const { error } = await supabase.from("student_discounts").delete().eq("id", deleteDiscount);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Desconto removido" });
    setDeleteDiscount(null);
    void load();
  };

  if (!schoolId) return null;

  return (
    <div className="flex flex-col gap-6">
      {canEditSchoolPaymentPrefs && (
        <Card className="border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cobrança aos encarregados</CardTitle>
            <p className="text-sm text-muted-foreground">
              Defina como os encarregados interagem com os pagamentos na plataforma. Com comprovativo, o IBAN da escola aparece nos emails de lembrete.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:gap-x-4 lg:gap-x-6">
              <div className="flex min-w-[14rem] max-w-full flex-col gap-2 md:w-auto md:max-w-[20rem]">
                <Label htmlFor="def-pay-mode">Modo de cobrança</Label>
                <Select value={guardianPaymentMode} onValueChange={(v) => setGuardianPaymentMode(v as GuardianPaymentMode)}>
                  <SelectTrigger id="def-pay-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proof_attachment">
                      Comprovativo na app / transferência (IBAN + validação pela escola)
                    </SelectItem>
                    <SelectItem value="in_person">
                      Pagamento presencial na escola (sem envio de ficheiros pelos encarregados)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 md:min-w-[12rem]">
                <Label htmlFor="def-school-iban">IBAN da escola</Label>
                <Input
                  id="def-school-iban"
                  value={bankIbanDraft}
                  onChange={(e) => setBankIbanDraft(e.target.value)}
                  placeholder="Ex.: AO06 ..."
                  disabled={guardianPaymentMode !== "proof_attachment"}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-10 w-full shrink-0 md:w-auto"
                onClick={() => void saveSchoolPaymentPrefs()}
                disabled={savingPaymentPrefs}
              >
                {savingPaymentPrefs ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar definições
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Aparece no email quando está activo o modo com comprovativo. Opcional mas fortemente recomendado.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="family" className="w-full">
        <TabsList>
          <TabsTrigger value="family">Descontos por familiar</TabsTrigger>
          <TabsTrigger value="overrides">Descontos por aluno</TabsTrigger>
        </TabsList>
        <TabsContent value="family" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Desconto automático por familiar</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quando um educador tem vários filhos na escola, aplica-se um desconto.
                </p>
              </div>
              <Button type="button" onClick={openNewFamily} size="sm" className="gap-2">
                <Plus className="h-4 w-4" /> Nova regra
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : familyRules.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">Sem regras definidas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2">Posição do familiar</th>
                        <th className="px-2 py-2">Desconto</th>
                        <th className="px-2 py-2 text-right">Acções</th>
                      </tr>
                    </thead>
                    <tbody>
                      {familyRules.map((f) => (
                        <tr key={f.id} className="border-b hover:bg-muted/30">
                          <td className="px-2 py-2 font-medium">{f.sibling_position}º filho ou superior</td>
                          <td className="px-2 py-2">
                            <Badge variant="secondary">{f.discount_percentage}%</Badge>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Button size="icon" variant="ghost" type="button" onClick={() => openEditFamily(f)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" type="button" onClick={() => setDeleteFamily(f.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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

        <TabsContent value="overrides" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Descontos manuais por aluno</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Sobrepõe a regra automática em casos especiais.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ano letivo do desconto: usa o ano seleccionado no cabeçalho da app{selectedYearId ? "" : " (nenhum seleccionado)"}.
                </p>
              </div>
              <Button type="button" onClick={openNewDiscount} size="sm" className="gap-2" disabled={!selectedYearId}>
                <Plus className="h-4 w-4" /> Novo desconto
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : discounts.length === 0 ? (
                <p className="py-10 text-center text-muted-foreground">Sem descontos manuais.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2">Aluno</th>
                        <th className="px-2 py-2">Desconto</th>
                        <th className="px-2 py-2">Motivo</th>
                        <th className="px-2 py-2 text-right">Acções</th>
                      </tr>
                    </thead>
                    <tbody>
                      {discounts.map((d) => (
                        <tr key={d.id} className="border-b hover:bg-muted/30">
                          <td className="px-2 py-2 font-medium">{d.student?.full_name ?? "—"}</td>
                          <td className="px-2 py-2">
                            {d.discount_percentage != null ? `${d.discount_percentage}%` : null}
                            {d.discount_fixed_amount != null ? fmtAOA(Number(d.discount_fixed_amount)) : null}
                          </td>
                          <td className="px-2 py-2 text-muted-foreground">{d.reason ?? "—"}</td>
                          <td className="px-2 py-2 text-right">
                            <Button size="icon" variant="ghost" type="button" onClick={() => openEditDiscount(d)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" type="button" onClick={() => setDeleteDiscount(d.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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

      <Dialog open={familyDialog} onOpenChange={setFamilyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFamily ? "Editar regra" : "Nova regra de família"}</DialogTitle>
            <DialogDescription>Aplica-se a alunos com o mesmo educador.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>A partir do … familiar</Label>
              <Input
                type="number"
                min={2}
                max={10}
                value={familyForm.sibling_position}
                onChange={(e) => setFamilyForm({ ...familyForm, sibling_position: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                2 = aplicar ao 2º filho em diante; 3 = só ao 3º em diante; etc.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Desconto (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={familyForm.discount_percentage}
                onChange={(e) => setFamilyForm({ ...familyForm, discount_percentage: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setFamilyDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void saveFamily()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discountDialog} onOpenChange={setDiscountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDiscount ? "Editar desconto" : "Novo desconto manual"}</DialogTitle>
            <DialogDescription>Sobrepõe a regra automática para um aluno específico.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Aluno</Label>
              <Select
                value={discountForm.student_id}
                onValueChange={(v) => setDiscountForm({ ...discountForm, student_id: v })}
                disabled={!!editingDiscount}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona um aluno" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Desconto %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={discountForm.discount_percentage}
                  onChange={(e) =>
                    setDiscountForm({
                      ...discountForm,
                      discount_percentage: e.target.value,
                      discount_fixed_amount: "",
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Ou valor fixo</Label>
                <Input
                  type="number"
                  min={0}
                  value={discountForm.discount_fixed_amount}
                  onChange={(e) =>
                    setDiscountForm({
                      ...discountForm,
                      discount_fixed_amount: e.target.value,
                      discount_percentage: "",
                    })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Motivo</Label>
              <Input
                value={discountForm.reason}
                onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })}
                placeholder="Ex.: bolsa de mérito"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setDiscountDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void saveDiscount()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteFamily} onOpenChange={(o) => !o && setDeleteFamily(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar regra?</AlertDialogTitle>
            <AlertDialogDescription>Esta acção não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteFamily()}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteDiscount} onOpenChange={(o) => !o && setDeleteDiscount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover desconto?</AlertDialogTitle>
            <AlertDialogDescription>Esta acção não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteDiscount()}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
