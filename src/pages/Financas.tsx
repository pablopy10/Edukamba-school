import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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
import { Loader2, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, AlertCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from "recharts";

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

const monthShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const fmtAOA = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "AOA", maximumFractionDigits: 0 }).format(n || 0);

const Financas = () => {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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

    const [eRes, cRes, fRes] = await Promise.all([
      supabase.from("expenses").select("*, category:expense_categories(name, color)")
        .eq("school_id", sId).gte("expense_date", yearStart).lte("expense_date", yearEnd)
        .order("expense_date", { ascending: false }),
      supabase.from("expense_categories").select("*").eq("school_id", sId).order("name"),
      supabase.from("student_fees").select("amount_due, due_date, is_paid")
        .gte("due_date", yearStart).lte("due_date", yearEnd),
    ]);

    if (eRes.error) toast({ title: "Erro a carregar despesas", description: eRes.error.message, variant: "destructive" });
    setExpenses((eRes.data ?? []) as Expense[]);
    setCategories((cRes.data ?? []) as Category[]);

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

  const downloadReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast({ title: "Erro", description: error?.message, variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <DashboardLayout>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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
          <TabsList>
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
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
    </DashboardLayout>
  );
};

export default Financas;