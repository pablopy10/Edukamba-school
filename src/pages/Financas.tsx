import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, AlertCircle, RefreshCw, Repeat, Power, FileSpreadsheet } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isNativeMobileApp } from "@/lib/nativeApp";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from "recharts";
import { useUserRole } from "@/hooks/useUserRole";
import { isSchoolManagementOrTeacher } from "@/lib/schoolStaffRoles";
import {
  enrichErpPaymentsWithStudentNames,
  fetchValidatedPaymentsForErpYear,
  resolveStudentsForPayments,
  runErpExcelExport,
  type ErpPaymentExportRow,
} from "@/lib/erpExport";

type Expense = {
  id: string;
  category_id: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  notes: string | null;
  receipt_url: string | null;
  category?: { name: string; color: string | null } | null;
};
type Category = { id: string; name: string; color: string | null };

type RecurringFrequency = "mensal" | "trimestral" | "semestral" | "anual";
type RecurringExpense = {
  id: string;
  category_id: string | null;
  description: string;
  amount: number;
  frequency: RecurringFrequency;
  start_date: string;
  end_date: string | null;
  payment_method: string | null;
  notes: string | null;
  is_active: boolean;
  category?: { name: string; color: string | null } | null;
};
const FREQ_LABEL: Record<RecurringFrequency, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const monthShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

const Financas = () => {
  const native = isNativeMobileApp();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [revenueByMonth, setRevenueByMonth] = useState<Record<number, number>>({});
  const [overdueAmount, setOverdueAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const [expDialog, setExpDialog] = useState(false);
  const [editingExp, setEditingExp] = useState<Expense | null>(null);
  const [expForm, setExpForm] = useState({
    description: "",
    amount: "0",
    expense_date: new Date().toISOString().slice(0, 10),
    category_id: "",
    payment_method: "",
    notes: "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [catDialog, setCatDialog] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: "", color: "#6366f1" });

  const [deleteExp, setDeleteExp] = useState<string | null>(null);
  const [deleteCat, setDeleteCat] = useState<string | null>(null);

  // Recurring expense state
  const [recDialog, setRecDialog] = useState(false);
  const [editingRec, setEditingRec] = useState<RecurringExpense | null>(null);
  const [recForm, setRecForm] = useState({
    description: "",
    amount: "0",
    frequency: "mensal" as RecurringFrequency,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    category_id: "",
    payment_method: "",
    notes: "",
    is_active: true,
  });
  const [deleteRec, setDeleteRec] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const { role } = useUserRole();
  const staffCanExportErp = isSchoolManagementOrTeacher(role);

  type ErpPaymentLine = ErpPaymentExportRow & { studentName: string };

  const [erpPaymentLines, setErpPaymentLines] = useState<ErpPaymentLine[]>([]);
  const [erpLoading, setErpLoading] = useState(false);
  const [erpExportFilter, setErpExportFilter] = useState<"all" | "pending" | "exported">("all");
  const [erpExporting, setErpExporting] = useState(false);

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

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [eRes, cRes, fRes, rRes] = await Promise.all([
      supabase.from("expenses").select("*, category:expense_categories(name, color)")
        .eq("school_id", sId).gte("expense_date", yearStart).lte("expense_date", yearEnd)
        .order("expense_date", { ascending: true }),
      supabase.from("expense_categories").select("*").eq("school_id", sId).order("name"),
      supabase.from("student_fees").select("amount_due, due_date, is_paid")
        .gte("due_date", yearStart).lte("due_date", yearEnd),
      (supabase as any).from("recurring_expenses")
        .select("*, category:expense_categories(name, color)")
        .eq("school_id", sId)
        .order("created_at", { ascending: false }),
    ]);

    if (eRes.error) toast({ title: "Erro a carregar despesas", description: eRes.error.message, variant: "destructive" });
    setExpenses((eRes.data ?? []) as Expense[]);
    setCategories((cRes.data ?? []) as Category[]);
    setRecurring(((rRes as any)?.data ?? []) as RecurringExpense[]);

    // Receitas (apenas propinas pagas) por mês + overdue
    const revMap: Record<number, number> = {};
    let overdue = 0;
    const today = new Date().toISOString().slice(0, 10);
    (fRes.data ?? []).forEach((f: { amount_due: number; due_date: string; is_paid: boolean | null }) => {
      const m = new Date(f.due_date).getMonth();
      if (f.is_paid) {
        revMap[m] = (revMap[m] ?? 0) + Number(f.amount_due);
      } else if (f.due_date < today) {
        overdue += Number(f.amount_due);
      }
    });
    setRevenueByMonth(revMap);
    setOverdueAmount(overdue);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [year]);

  const loadErpPayments = useCallback(async () => {
    if (!schoolId || !staffCanExportErp || native) {
      setErpPaymentLines([]);
      return;
    }
    setErpLoading(true);
    const { data, error } = await fetchValidatedPaymentsForErpYear(supabase, schoolId, year);
    if (error) {
      toast({ title: "Erro a carregar pagamentos", description: error.message, variant: "destructive" });
      setErpLoading(false);
      return;
    }
    const rows = data ?? [];
    const studentMap = await resolveStudentsForPayments(supabase, rows);
    setErpPaymentLines(enrichErpPaymentsWithStudentNames(rows, studentMap));
    setErpLoading(false);
  }, [schoolId, year, staffCanExportErp, native]);

  useEffect(() => {
    loadErpPayments();
  }, [loadErpPayments]);

  const filteredErpPayments = useMemo(() => {
    if (erpExportFilter === "pending") {
      return erpPaymentLines.filter((p) => !p.erp_exported_at);
    }
    if (erpExportFilter === "exported") {
      return erpPaymentLines.filter((p) => !!p.erp_exported_at);
    }
    return erpPaymentLines;
  }, [erpPaymentLines, erpExportFilter]);

  const exportPaymentsToErp = async () => {
    if (!schoolId || filteredErpPayments.length === 0) {
      toast({ title: "Nada a exportar", description: "Não há pagamentos validados no filtro seleccionado.", variant: "destructive" });
      return;
    }
    setErpExporting(true);
    const paymentsPayload = filteredErpPayments.map(({ studentName: _, ...row }) => row);
    const result = await runErpExcelExport({
      supabase,
      schoolId,
      payments: paymentsPayload,
      filenameYearSegment: year,
      markAsExported: true,
    });
    setErpExporting(false);
    if (result.empty) {
      toast({ title: "Nada a exportar", variant: "destructive" });
      return;
    }
    if (result.exportMarkedError) {
      toast({ title: "Ficheiro gerado; erro ao marcar exportação", description: result.exportMarkedError, variant: "destructive" });
      await loadErpPayments();
      return;
    }
    toast({
      title: "Exportação concluída",
      description: `${result.count} linha(s). Os registos foram marcados como exportados.`,
    });
    await loadErpPayments();
  };

  const expByMonth = useMemo(() => {
    const map: Record<number, number> = {};
    expenses.forEach((e) => {
      const m = new Date(e.expense_date).getMonth();
      map[m] = (map[m] ?? 0) + Number(e.amount);
    });
    return map;
  }, [expenses]);

  const chartData = useMemo(() => {
    return monthShort.map((label, i) => {
      const receita = revenueByMonth[i] ?? 0;
      const despesa = expByMonth[i] ?? 0;
      return { mes: label, Receitas: receita, Despesas: despesa, Lucro: receita - despesa };
    });
  }, [revenueByMonth, expByMonth]);

  const totals = useMemo(() => {
    const totalRev = Object.values(revenueByMonth).reduce((s, v) => s + v, 0);
    const totalExp = Object.values(expByMonth).reduce((s, v) => s + v, 0);
    return { totalRev, totalExp, profit: totalRev - totalExp };
  }, [revenueByMonth, expByMonth]);

  // Expense CRUD
  const openNewExp = () => {
    setEditingExp(null);
    setExpForm({
      description: "",
      amount: "0",
      expense_date: new Date().toISOString().slice(0, 10),
      category_id: "",
      payment_method: "",
      notes: "",
    });
    setReceiptFile(null);
    setExpDialog(true);
  };
  const openEditExp = (e: Expense) => {
    setEditingExp(e);
    setExpForm({
      description: e.description,
      amount: String(e.amount),
      expense_date: e.expense_date,
      category_id: e.category_id ?? "",
      payment_method: e.payment_method ?? "",
      notes: e.notes ?? "",
    });
    setReceiptFile(null);
    setExpDialog(true);
  };
  const saveExp = async () => {
    if (!schoolId) return;
    if (!expForm.description.trim()) { toast({ title: "Descrição obrigatória", variant: "destructive" }); return; }

    let receiptUrl: string | undefined;
    if (receiptFile) {
      const ext = receiptFile.name.split(".").pop();
      const path = `${schoolId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("expense-receipts").upload(path, receiptFile);
      if (upErr) { toast({ title: "Erro a carregar comprovativo", description: upErr.message, variant: "destructive" }); return; }
      receiptUrl = path;
    }

    const basePayload = {
      school_id: schoolId,
      description: expForm.description.trim(),
      amount: Number(expForm.amount) || 0,
      expense_date: expForm.expense_date,
      category_id: expForm.category_id || null,
      payment_method: expForm.payment_method.trim() || null,
      notes: expForm.notes.trim() || null,
      ...(receiptUrl !== undefined ? { receipt_url: receiptUrl } : {}),
    };

    let error;
    if (editingExp) {
      ({ error } = await supabase.from("expenses").update(basePayload).eq("id", editingExp.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error } = await supabase.from("expenses").insert({ ...basePayload, created_by: user?.id ?? null }));
    }
    if (error) { toast({ title: "Erro a guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingExp ? "Despesa atualizada" : "Despesa criada" });
    setExpDialog(false);
    fetchAll();
  };
  const confirmDeleteExp = async () => {
    if (!deleteExp) return;
    const { error } = await supabase.from("expenses").delete().eq("id", deleteExp);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Despesa apagada" });
    setDeleteExp(null);
    fetchAll();
  };

  // Category CRUD
  const openNewCat = () => { setEditingCat(null); setCatForm({ name: "", color: "#6366f1" }); setCatDialog(true); };
  const openEditCat = (c: Category) => { setEditingCat(c); setCatForm({ name: c.name, color: c.color ?? "#6366f1" }); setCatDialog(true); };
  const saveCat = async () => {
    if (!schoolId || !catForm.name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const payload = { school_id: schoolId, name: catForm.name.trim(), color: catForm.color };
    const { error } = editingCat
      ? await supabase.from("expense_categories").update(payload).eq("id", editingCat.id)
      : await supabase.from("expense_categories").insert(payload);
    if (error) { toast({ title: "Erro a guardar", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingCat ? "Categoria atualizada" : "Categoria criada" });
    setCatDialog(false);
    fetchAll();
  };
  const confirmDeleteCat = async () => {
    if (!deleteCat) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", deleteCat);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Categoria apagada" });
    setDeleteCat(null);
    fetchAll();
  };

  // Recurring expense CRUD
  const openNewRec = () => {
    setEditingRec(null);
    setRecForm({
      description: "",
      amount: "0",
      frequency: "mensal",
      start_date: new Date().toISOString().slice(0, 10),
      end_date: "",
      category_id: "",
      payment_method: "",
      notes: "",
      is_active: true,
    });
    setRecDialog(true);
  };
  const openEditRec = (r: RecurringExpense) => {
    setEditingRec(r);
    setRecForm({
      description: r.description,
      amount: String(r.amount),
      frequency: r.frequency,
      start_date: r.start_date,
      end_date: r.end_date ?? "",
      category_id: r.category_id ?? "",
      payment_method: r.payment_method ?? "",
      notes: r.notes ?? "",
      is_active: r.is_active,
    });
    setRecDialog(true);
  };
  const saveRec = async () => {
    if (!schoolId) return;
    if (!recForm.description.trim()) { toast({ title: "Descrição obrigatória", variant: "destructive" }); return; }
    const payload: Record<string, unknown> = {
      school_id: schoolId,
      description: recForm.description.trim(),
      amount: Number(recForm.amount) || 0,
      frequency: recForm.frequency,
      start_date: recForm.start_date,
      end_date: recForm.end_date || null,
      category_id: recForm.category_id || null,
      payment_method: recForm.payment_method.trim() || null,
      notes: recForm.notes.trim() || null,
      is_active: recForm.is_active,
    };
    let savedId: string | null = editingRec?.id ?? null;
    if (editingRec) {
      const { error } = await (supabase as any).from("recurring_expenses").update(payload).eq("id", editingRec.id);
      if (error) { toast({ title: "Erro a guardar", description: error.message, variant: "destructive" }); return; }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any).from("recurring_expenses")
        .insert({ ...payload, created_by: user?.id ?? null })
        .select("id")
        .single();
      if (error) { toast({ title: "Erro a guardar", description: error.message, variant: "destructive" }); return; }
      savedId = data?.id ?? null;
    }
    // Gerar automaticamente as ocorrências até final do ano em curso (+12 meses)
    if (savedId && recForm.is_active) {
      await (supabase as any).rpc("generate_recurring_expense_occurrences", { _recurring_id: savedId });
    }
    toast({ title: editingRec ? "Recorrência atualizada" : "Recorrência criada", description: "Despesas geradas automaticamente." });
    setRecDialog(false);
    fetchAll();
  };
  const confirmDeleteRec = async () => {
    if (!deleteRec) return;
    const { error } = await (supabase as any).from("recurring_expenses").delete().eq("id", deleteRec);
    if (error) toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });
    else toast({ title: "Recorrência apagada", description: "Despesas já lançadas foram mantidas." });
    setDeleteRec(null);
    fetchAll();
  };
  const toggleRecActive = async (r: RecurringExpense) => {
    const { error } = await (supabase as any).from("recurring_expenses")
      .update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: r.is_active ? "Recorrência pausada" : "Recorrência ativada" });
    fetchAll();
  };
  const generateNow = async (r: RecurringExpense) => {
    setGeneratingId(r.id);
    const { data, error } = await (supabase as any).rpc("generate_recurring_expense_occurrences", { _recurring_id: r.id });
    setGeneratingId(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Ocorrências geradas", description: `${data ?? 0} novas despesas lançadas.` });
    fetchAll();
  };

  const downloadReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast({ title: "Erro", description: error?.message, variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Finanças</h1>
            <p className="text-sm text-muted-foreground">Despesas, receitas e indicadores financeiros.</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Ano:</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[year + 1, year, year - 1, year - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPIs */}
        <div className={cn(native ? "grid grid-cols-2 gap-4" : "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4")}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Receita total</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmtAOA(totals.totalRev)}</p>
              <p className="text-xs text-muted-foreground">propinas pagas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Despesa total</CardTitle>
              <TrendingDown className="h-4 w-4 text-rose-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmtAOA(totals.totalExp)}</p>
              <p className="text-xs text-muted-foreground">{expenses.length} registos</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lucro líquido</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${totals.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtAOA(totals.profit)}</p>
              <p className="text-xs text-muted-foreground">no ano</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Propinas em atraso</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{fmtAOA(overdueAmount)}</p>
              <p className="text-xs text-muted-foreground">por cobrar</p>
            </CardContent>
          </Card>
        </div>

        {/* CHARTS */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Receitas vs Despesas (mensal)</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mes" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip formatter={(v: number) => fmtAOA(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="Receitas" fill="hsl(142 71% 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Despesas" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Lucro líquido anual</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="mes" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip formatter={(v: number) => fmtAOA(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="Lucro" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="expenses" className="w-full">
          <TabsList className="flex h-auto flex-wrap gap-1">
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
            <TabsTrigger value="recurring">Recorrentes</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
            {staffCanExportErp && !native && (
              <TabsTrigger value="erp-payments" className="gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" /> Pagamentos ERP
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="expenses" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Registo de despesas</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{year}</p>
                </div>
                <Button onClick={openNewExp} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova despesa</Button>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : expenses.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem despesas registadas neste ano.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Data</th>
                          <th className="py-2 px-2">Descrição</th>
                          <th className="py-2 px-2">Categoria</th>
                          <th className="py-2 px-2">Valor</th>
                          <th className="py-2 px-2">Comprovativo</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((e) => (
                          <tr key={e.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2">{new Date(e.expense_date).toLocaleDateString("pt-PT")}</td>
                            <td className="py-2 px-2 font-medium">{e.description}</td>
                            <td className="py-2 px-2">
                              {e.category ? (
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                  <span className="h-2 w-2 rounded-full" style={{ background: e.category.color ?? "#6366f1" }} />
                                  {e.category.name}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 px-2 font-semibold text-rose-600">{fmtAOA(Number(e.amount))}</td>
                            <td className="py-2 px-2">
                              {e.receipt_url ? (
                                <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => downloadReceipt(e.receipt_url!)}>Ver</Button>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 px-2 text-right">
                              <Button size="icon" variant="ghost" onClick={() => openEditExp(e)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteExp(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

          <TabsContent value="recurring" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Repeat className="h-5 w-5" /> Despesas recorrentes</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Salários, combustível, rendas, etc. Geram lançamentos automáticos contados no lucro.
                  </p>
                </div>
                <Button onClick={openNewRec} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova recorrência</Button>
              </CardHeader>
              <CardContent>
                {recurring.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem despesas recorrentes. Cria a primeira.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 px-2">Descrição</th>
                          <th className="py-2 px-2">Categoria</th>
                          <th className="py-2 px-2">Frequência</th>
                          <th className="py-2 px-2">Valor</th>
                          <th className="py-2 px-2">Início</th>
                          <th className="py-2 px-2">Fim</th>
                          <th className="py-2 px-2">Estado</th>
                          <th className="py-2 px-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recurring.map((r) => (
                          <tr key={r.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 px-2 font-medium">{r.description}</td>
                            <td className="py-2 px-2">
                              {r.category ? (
                                <span className="inline-flex items-center gap-1.5 text-xs">
                                  <span className="h-2 w-2 rounded-full" style={{ background: r.category.color ?? "#6366f1" }} />
                                  {r.category.name}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-2 px-2">
                              <Badge variant="secondary">{FREQ_LABEL[r.frequency]}</Badge>
                            </td>
                            <td className="py-2 px-2 font-semibold text-rose-600">{fmtAOA(Number(r.amount))}</td>
                            <td className="py-2 px-2">{new Date(r.start_date).toLocaleDateString("pt-PT")}</td>
                            <td className="py-2 px-2">{r.end_date ? new Date(r.end_date).toLocaleDateString("pt-PT") : <span className="text-muted-foreground">indefinido</span>}</td>
                            <td className="py-2 px-2">
                              <Badge variant={r.is_active ? "default" : "outline"}>{r.is_active ? "Ativa" : "Pausada"}</Badge>
                            </td>
                            <td className="py-2 px-2 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Gerar ocorrências em falta"
                                onClick={() => generateNow(r)}
                                disabled={generatingId === r.id}
                              >
                                {generatingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                              </Button>
                              <Button size="icon" variant="ghost" title={r.is_active ? "Pausar" : "Ativar"} onClick={() => toggleRecActive(r)}>
                                <Power className={`h-4 w-4 ${r.is_active ? "text-emerald-600" : "text-muted-foreground"}`} />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => openEditRec(r)}><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setDeleteRec(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

          <TabsContent value="categories" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Categorias de despesas</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Ex: Salários, Materiais, Manutenção</p>
                </div>
                <Button onClick={openNewCat} size="sm" className="gap-2"><Plus className="h-4 w-4" /> Nova categoria</Button>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">Sem categorias. Cria a primeira.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {categories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-3">
                          <span className="h-4 w-4 rounded-full" style={{ background: c.color ?? "#6366f1" }} />
                          <span className="font-medium">{c.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEditCat(c)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteCat(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {staffCanExportErp && !native && (
            <TabsContent value="erp-payments" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Exportação para ERP</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Lista pagamentos validados no ano seleccionado ({year}). Os valores no Excel são números e datas em formato ISO (YYYY-MM-DD), sem formatação extra.
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Configure os nomes das colunas em{" "}
                      <Link to="/pagamentos" className="font-medium text-primary underline-offset-4 hover:underline">
                        Pagamentos → Exportação ERP
                      </Link>
                      .
                    </p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <Select value={erpExportFilter} onValueChange={(v) => setErpExportFilter(v as typeof erpExportFilter)}>
                      <SelectTrigger className="w-full sm:w-[220px]">
                        <SelectValue placeholder="Filtro" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os pagamentos</SelectItem>
                        <SelectItem value="pending">Ainda não exportados</SelectItem>
                        <SelectItem value="exported">Já exportados</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={erpExporting || filteredErpPayments.length === 0}
                      onClick={exportPaymentsToErp}
                    >
                      {erpExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                      Exportar para ERP
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {erpLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredErpPayments.length === 0 ? (
                    <p className="py-10 text-center text-muted-foreground">
                      Nenhum pagamento validado corresponde ao filtro neste ano.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-2 px-2">Data</th>
                            <th className="py-2 px-2">Aluno</th>
                            <th className="py-2 px-2">Valor</th>
                            <th className="py-2 px-2">Método</th>
                            <th className="py-2 px-2">Status de exportação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredErpPayments.map((p) => (
                            <tr key={p.id} className="border-b hover:bg-muted/30">
                              <td className="py-2 px-2 whitespace-nowrap font-mono text-xs">
                                {p.payment_date ? p.payment_date.slice(0, 10) : "—"}
                              </td>
                              <td className="py-2 px-2 font-medium">{p.studentName}</td>
                              <td className="py-2 px-2">{fmtAOA(Number(p.amount_paid))}</td>
                              <td className="py-2 px-2">{p.method ?? "—"}</td>
                              <td className="py-2 px-2">
                                {p.erp_exported_at ? (
                                  <Badge variant="secondary" className="font-normal">
                                    Exportado em{" "}
                                    {new Date(p.erp_exported_at).toLocaleString("pt-PT", {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                    })}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
                                    Pendente
                                  </Badge>
                                )}
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

      {/* EXPENSE DIALOG */}
      <Dialog open={expDialog} onOpenChange={setExpDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExp ? "Editar despesa" : "Nova despesa"}</DialogTitle>
            <DialogDescription>Regista uma despesa da escola.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valor (AOA)</Label>
                <Input type="number" min="0" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Data</Label>
                <Input type="date" value={expForm.expense_date} onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={expForm.category_id || "_none"} onValueChange={(v) => setExpForm({ ...expForm, category_id: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem categoria</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Método de pagamento</Label>
                <Input value={expForm.payment_method} onChange={(e) => setExpForm({ ...expForm, payment_method: e.target.value })} placeholder="Ex: Transferência" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={expForm.notes} onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Comprovativo (opcional)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
              {editingExp?.receipt_url && !receiptFile && (
                <p className="text-xs text-muted-foreground">Comprovativo existente será mantido.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpDialog(false)}>Cancelar</Button>
            <Button onClick={saveExp}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CATEGORY DIALOG */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nome</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="Ex: Salários" />
            </div>
            <div className="grid gap-2">
              <Label>Cor</Label>
              <Input type="color" value={catForm.color} onChange={(e) => setCatForm({ ...catForm, color: e.target.value })} className="h-10 w-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>Cancelar</Button>
            <Button onClick={saveCat}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteExp} onOpenChange={(o) => !o && setDeleteExp(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar despesa?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteExp}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteCat} onOpenChange={(o) => !o && setDeleteCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar categoria?</AlertDialogTitle>
            <AlertDialogDescription>As despesas existentes ficarão sem categoria.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCat}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RECURRING DIALOG */}
      <Dialog open={recDialog} onOpenChange={setRecDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRec ? "Editar recorrência" : "Nova despesa recorrente"}</DialogTitle>
            <DialogDescription>
              As ocorrências são geradas automaticamente como despesas, contando para o lucro mensal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Input
                value={recForm.description}
                onChange={(e) => setRecForm({ ...recForm, description: e.target.value })}
                placeholder="Ex: Salário do João, Combustível do gerador"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Valor (AOA)</Label>
                <Input type="number" min="0" value={recForm.amount}
                  onChange={(e) => setRecForm({ ...recForm, amount: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Frequência</Label>
                <Select value={recForm.frequency} onValueChange={(v) => setRecForm({ ...recForm, frequency: v as RecurringFrequency })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Início</Label>
                <Input type="date" value={recForm.start_date}
                  onChange={(e) => setRecForm({ ...recForm, start_date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Fim (opcional)</Label>
                <Input type="date" value={recForm.end_date}
                  onChange={(e) => setRecForm({ ...recForm, end_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={recForm.category_id || "_none"} onValueChange={(v) => setRecForm({ ...recForm, category_id: v === "_none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Sem categoria</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Método de pagamento</Label>
                <Input value={recForm.payment_method}
                  onChange={(e) => setRecForm({ ...recForm, payment_method: e.target.value })}
                  placeholder="Ex: Transferência" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={recForm.notes}
                onChange={(e) => setRecForm({ ...recForm, notes: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Recorrência ativa</p>
                <p className="text-xs text-muted-foreground">Quando ativa, gera novas ocorrências automaticamente.</p>
              </div>
              <Switch checked={recForm.is_active} onCheckedChange={(v) => setRecForm({ ...recForm, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecDialog(false)}>Cancelar</Button>
            <Button onClick={saveRec}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteRec} onOpenChange={(o) => !o && setDeleteRec(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar despesa recorrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Os lançamentos já criados nas despesas serão mantidos. Deixarão apenas de ser geradas novas ocorrências.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRec}>Apagar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Financas;