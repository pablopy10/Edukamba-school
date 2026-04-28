import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Plus, Search, Boxes, ClipboardList, Check, X, AlertTriangle, Pencil, Trash2,
  BookOpen, Beaker, Palette, Dumbbell, Laptop, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { MaterialFormDialog, type MaterialRow } from "@/components/material/MaterialFormDialog";
import { MaterialRequestFormDialog, type RequestRow } from "@/components/material/MaterialRequestFormDialog";

type Category = "papelaria" | "laboratorio" | "artes" | "desporto" | "tecnologia";
type Status = "pendente" | "aprovado" | "rejeitado" | "entregue";

const categoryMeta: Record<string, { label: string; color: string; icon: typeof BookOpen }> = {
  papelaria: { label: "Papelaria", color: "bg-pastel-blue text-pastel-blue-foreground", icon: BookOpen },
  laboratorio: { label: "Laboratório", color: "bg-pastel-green text-pastel-green-foreground", icon: Beaker },
  artes: { label: "Artes", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Palette },
  desporto: { label: "Desporto", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Dumbbell },
  tecnologia: { label: "Tecnologia", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Laptop },
};
const catFallback = { label: "Outro", color: "bg-muted text-foreground", icon: Package };
const meta = (c: string) => categoryMeta[c] ?? catFallback;

const statusMeta: Record<Status, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  aprovado: { label: "Aprovado", color: "bg-pastel-green text-pastel-green-foreground" },
  rejeitado: { label: "Rejeitado", color: "bg-pastel-pink text-pastel-pink-foreground" },
  entregue: { label: "Entregue", color: "bg-pastel-blue text-pastel-blue-foreground" },
};

type Tab = "stock" | "pedidos";

const Material = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("stock");
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  const [stock, setStock] = useState<MaterialRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; full_name: string; classroom_id: string | null }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>("all");
  const [stockLowOnly, setStockLowOnly] = useState(false);
  const [stockLocation, setStockLocation] = useState<string>("all");

  const [reqStatusFilter, setReqStatusFilter] = useState<string>("all");
  const [reqTeacherFilter, setReqTeacherFilter] = useState<string>("all");

  // Dialog state
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialRow | null>(null);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [editingRequest, setEditingRequest] = useState<RequestRow | null>(null);

  const isAdmin = userRole === "ADMIN";
  const canRequest = userRole === "ADMIN" || userRole === "TEACHER";

  const loadAll = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.school_id) {
      setLoading(false);
      return;
    }
    setSchoolId(profile.school_id);
    setUserRole(profile.role);
    setUserName(profile.full_name ?? "");

    const [m, r, c, s] = await Promise.all([
      supabase.from("materials").select("*").eq("school_id", profile.school_id).order("name"),
      supabase.from("material_requests").select("*").eq("school_id", profile.school_id).order("created_at", { ascending: false }),
      supabase.from("classrooms").select("id, name").eq("school_id", profile.school_id).order("name"),
      supabase.from("students").select("id, full_name, classroom_id").eq("school_id", profile.school_id).order("full_name"),
    ]);
    setStock((m.data as MaterialRow[]) ?? []);
    setRequests((r.data as RequestRow[]) ?? []);
    setClassrooms(c.data ?? []);
    setStudents(s.data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id]);

  // Derive teacher list from existing requests
  useEffect(() => {
    const map = new Map<string, string>();
    requests.forEach((r) => {
      if (r.requester_id && r.teacher_name) map.set(r.requester_id, r.teacher_name);
    });
    setTeachers(Array.from(map.entries()).map(([id, name]) => ({ id, name })));
  }, [requests]);

  const locations = useMemo(() => {
    const set = new Set<string>();
    stock.forEach((s) => { if (s.location) set.add(s.location); });
    return Array.from(set).sort();
  }, [stock]);

  const stats = useMemo(() => ({
    totalItens: stock.reduce((a, s) => a + (s.quantity || 0), 0),
    baixoStock: stock.filter((s) => s.quantity < s.min_quantity).length,
    pendentes: requests.filter((r) => r.status === "pendente").length,
    entregues: requests.filter((r) => r.status === "entregue").length,
  }), [stock, requests]);

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stock.filter((s) => {
      if (stockCategoryFilter !== "all" && s.category !== stockCategoryFilter) return false;
      if (stockLowOnly && !(s.quantity < s.min_quantity)) return false;
      if (stockLocation !== "all" && s.location !== stockLocation) return false;
      if (q && !(s.name.toLowerCase().includes(q) || (s.sku ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [stock, search, stockCategoryFilter, stockLowOnly, stockLocation]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (reqStatusFilter !== "all" && r.status !== reqStatusFilter) return false;
      if (reqTeacherFilter !== "all" && r.requester_id !== reqTeacherFilter) return false;
      if (q) {
        const studentName = students.find((s) => s.id === r.student_id)?.full_name ?? "";
        const className = classrooms.find((c) => c.id === r.classroom_id)?.name ?? "";
        const blob = `${r.item_name} ${r.teacher_name ?? ""} ${r.recipient ?? ""} ${studentName} ${className} ${r.description ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [requests, search, reqStatusFilter, reqTeacherFilter, students, classrooms]);

  const removeMaterial = async (id: string) => {
    if (!confirm("Remover este material?")) return;
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Material removido" });
    loadAll();
  };

  const updateRequestStatus = async (id: string, status: Status) => {
    const { error } = await supabase
      .from("material_requests")
      .update({ status, decided_by: user?.id ?? null, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: `Pedido ${statusMeta[status].label.toLowerCase()}` });
    loadAll();
  };

  const removeRequest = async (id: string) => {
    if (!confirm("Remover este pedido?")) return;
    const { error } = await supabase.from("material_requests").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Pedido removido" });
    loadAll();
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Material</h1>
            <p className="text-sm text-muted-foreground">
              Gerir stock da escola e pedidos de material para encarregados de educação.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
              <button onClick={() => setTab("stock")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "stock" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Boxes className="h-4 w-4" strokeWidth={1.75} /> Stock
              </button>
              <button onClick={() => setTab("pedidos")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "pedidos" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                <ClipboardList className="h-4 w-4" strokeWidth={1.75} /> Pedidos
              </button>
            </div>
            {tab === "stock" && isAdmin && (
              <button onClick={() => { setEditingMaterial(null); setShowMaterialDialog(true); }} className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Plus className="h-4 w-4" strokeWidth={2.25} /> Novo Material
              </button>
            )}
            {tab === "pedidos" && canRequest && (
              <button onClick={() => { setEditingRequest(null); setShowRequestDialog(true); }} className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Plus className="h-4 w-4" strokeWidth={2.25} /> Novo Pedido
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Itens em Stock", value: stats.totalItens, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Stock Baixo", value: stats.baixoStock, color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: "Pedidos ativos", value: stats.pedidosAtivos, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Materiais entregues", value: stats.entregasMarcadas, color: "bg-pastel-green text-pastel-green-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>{s.label}</span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === "stock" ? "Pesquisar material ou SKU..." : "Pesquisar pedido, professor ou aluno..."}
                className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
              />
            </div>

            {tab === "stock" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={stockCategoryFilter} onValueChange={setStockCategoryFilter}>
                  <SelectTrigger className="h-10 w-44 rounded-full"><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {Object.keys(categoryMeta).map((c) => <SelectItem key={c} value={c}>{categoryMeta[c].label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={stockLocation} onValueChange={setStockLocation}>
                  <SelectTrigger className="h-10 w-48 rounded-full"><SelectValue placeholder="Localização" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as localizações</SelectItem>
                    {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => setStockLowOnly((v) => !v)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                    stockLowOnly
                      ? "border-transparent bg-pastel-pink text-pastel-pink-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.75} /> Stock baixo
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={reqStatusFilter} onValueChange={setReqStatusFilter}>
                  <SelectTrigger className="h-10 w-40 rounded-full"><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estados</SelectItem>
                    {(Object.keys(statusMeta) as Status[]).map((s) => <SelectItem key={s} value={s}>{statusMeta[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={reqTeacherFilter} onValueChange={setReqTeacherFilter}>
                  <SelectTrigger className="h-10 w-56 rounded-full"><SelectValue placeholder="Professor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os professores</SelectItem>
                    {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-card p-10 text-center text-muted-foreground shadow-card">A carregar...</div>
        ) : tab === "stock" ? (
          <StockTable
            items={filteredStock}
            isAdmin={isAdmin}
            onEdit={(m) => { setEditingMaterial(m); setShowMaterialDialog(true); }}
            onRemove={removeMaterial}
          />
        ) : (
          <RequestsTable
            requests={filteredRequests}
            classrooms={classrooms}
            students={students}
            isAdmin={isAdmin}
            currentUserId={user?.id ?? null}
            onEdit={(r) => { setEditingRequest(r); setShowRequestDialog(true); }}
            onRemove={removeRequest}
            onUpdateStatus={updateRequestStatus}
          />
        )}
      </div>

      <MaterialFormDialog
        open={showMaterialDialog}
        onOpenChange={setShowMaterialDialog}
        schoolId={schoolId}
        material={editingMaterial}
        onSaved={loadAll}
      />
      <MaterialRequestFormDialog
        open={showRequestDialog}
        onOpenChange={setShowRequestDialog}
        schoolId={schoolId}
        userId={user?.id ?? null}
        userName={userName}
        request={editingRequest}
        classrooms={classrooms}
        students={students}
        onSaved={loadAll}
      />
    </DashboardLayout>
  );
};

/* ====================== Stock Table ====================== */
const StockTable = ({
  items, isAdmin, onEdit, onRemove,
}: {
  items: MaterialRow[];
  isAdmin: boolean;
  onEdit: (m: MaterialRow) => void;
  onRemove: (id: string) => void;
}) => {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Stock de Materiais</h2>
        <span className="text-xs text-muted-foreground">{items.length} item(ns)</span>
      </div>
      {items.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Sem materiais.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3">Material</th>
                <th className="px-6 py-3">Categoria</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3 text-right">Quantidade</th>
                <th className="px-6 py-3">Localização</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const m = meta(s.category);
                const Icon = m.icon;
                const low = s.quantity < s.min_quantity;
                return (
                  <tr key={s.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", m.color)}>
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground">Mín. {s.min_quantity} {s.unit}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", m.color)}>{m.label}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{s.sku ?? "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {low && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-pastel-pink px-2 py-0.5 text-[10px] font-semibold text-pastel-pink-foreground">
                            <AlertTriangle className="h-3 w-3" strokeWidth={2} /> Baixo
                          </span>
                        )}
                        <span className="font-bold text-foreground">{s.quantity}</span>
                        <span className="text-xs text-muted-foreground">{s.unit}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{s.location ?? "—"}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && (
                          <>
                            <button onClick={() => onEdit(s)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Editar">
                              <Pencil className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                            <button onClick={() => onRemove(s.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground" title="Remover">
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ====================== Requests Table ====================== */
const RequestsTable = ({
  requests, classrooms, students, isAdmin, currentUserId, onEdit, onRemove, onUpdateStatus,
}: {
  requests: RequestRow[];
  classrooms: { id: string; name: string }[];
  students: { id: string; full_name: string; classroom_id: string | null }[];
  isAdmin: boolean;
  currentUserId: string | null;
  onEdit: (r: RequestRow) => void;
  onRemove: (id: string) => void;
  onUpdateStatus: (id: string, status: Status) => void;
}) => {
  const classroomName = (id: string | null) => classrooms.find((c) => c.id === id)?.name ?? "—";
  const studentName = (id: string | null) => students.find((s) => s.id === id)?.full_name ?? null;

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Pedidos de Material</h2>
        <span className="text-xs text-muted-foreground">{requests.length} pedido(s)</span>
      </div>
      {requests.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Sem pedidos.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-3">Material</th>
                <th className="px-6 py-3">Professor</th>
                <th className="px-6 py-3">Destino</th>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3">Educador</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const m = meta(r.category);
                const Icon = m.icon;
                const st = statusMeta[(r.status as Status)] ?? statusMeta.pendente;
                const sName = studentName(r.student_id);
                const canEdit = isAdmin || (r.requester_id === currentUserId && r.status === "pendente");
                return (
                  <tr key={r.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30 align-top">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", m.color)}>
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <div>
                          <p className="font-semibold text-foreground">{r.item_name}</p>
                          <p className="text-xs text-muted-foreground">Qtd: {r.quantity}</p>
                          {r.description && (
                            <p className="mt-1 max-w-xs text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-foreground">{r.teacher_name ?? "—"}</td>
                    <td className="px-6 py-4">
                      {sName ? (
                        <div>
                          <p className="text-foreground">{sName}</p>
                          <p className="text-xs text-muted-foreground">Aluno · {classroomName(r.classroom_id)}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-foreground">{classroomName(r.classroom_id)}</p>
                          <p className="text-xs text-muted-foreground">Turma inteira</p>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-foreground">
                      {r.needed_date
                        ? new Date(r.needed_date).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{r.recipient ?? "—"}</td>
                    <td className="px-6 py-4">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", st.color)}>{st.label}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {isAdmin && r.status === "pendente" && (
                          <>
                            <button onClick={() => onUpdateStatus(r.id, "aprovado")} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-green hover:text-pastel-green-foreground" title="Aprovar">
                              <Check className="h-4 w-4" strokeWidth={2} />
                            </button>
                            <button onClick={() => onUpdateStatus(r.id, "rejeitado")} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground" title="Rejeitar">
                              <X className="h-4 w-4" strokeWidth={2} />
                            </button>
                          </>
                        )}
                        {isAdmin && r.status === "aprovado" && (
                          <button onClick={() => onUpdateStatus(r.id, "entregue")} className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-blue px-3 text-xs font-medium text-pastel-blue-foreground" title="Marcar como entregue">
                            <Check className="h-3 w-3" strokeWidth={2} /> Entregar
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => onEdit(r)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Editar">
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => onRemove(r.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground" title="Remover">
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Material;