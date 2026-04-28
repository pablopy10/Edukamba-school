import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Plus, Search, Boxes, ClipboardList, Check, AlertTriangle, Pencil, Trash2, ListChecks,
  BookOpen, Beaker, Palette, Dumbbell, Laptop, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MaterialFormDialog, type MaterialRow } from "@/components/material/MaterialFormDialog";
import { MaterialRequestFormDialog, type RequestRow } from "@/components/material/MaterialRequestFormDialog";
import { useParentChildren } from "@/hooks/useParentChildren";
import { useTeacherClassrooms } from "@/hooks/useTeacherClassrooms";

type Category = "papelaria" | "laboratorio" | "artes" | "desporto" | "tecnologia";

const categoryMeta: Record<string, { label: string; color: string; icon: typeof BookOpen }> = {
  papelaria: { label: "Papelaria", color: "bg-pastel-blue text-pastel-blue-foreground", icon: BookOpen },
  laboratorio: { label: "Laboratório", color: "bg-pastel-green text-pastel-green-foreground", icon: Beaker },
  artes: { label: "Artes", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Palette },
  desporto: { label: "Desporto", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Dumbbell },
  tecnologia: { label: "Tecnologia", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Laptop },
};
const catFallback = { label: "Outro", color: "bg-muted text-foreground", icon: Package };
const meta = (c: string) => categoryMeta[c] ?? catFallback;

type DeliveryRow = {
  id: string;
  request_id: string;
  student_id: string;
  brought: boolean;
};

type DeliveryFilter = "all" | "pendente" | "completo";

type Tab = "stock" | "pedidos";

const Material = () => {
  const { user } = useAuth();
  const { isParent, childIds, classroomIds, selectedChild } = useParentChildren();
  const { isTeacher, classroomIds: teacherClassroomIds, loading: teacherLoading } = useTeacherClassrooms();
  const [tab, setTab] = useState<Tab>("stock");
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  const [stock, setStock] = useState<MaterialRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [classrooms, setClassrooms] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<{ id: string; full_name: string; classroom_id: string | null }[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; name: string }[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [stockCategoryFilter, setStockCategoryFilter] = useState<string>("all");
  const [stockLowOnly, setStockLowOnly] = useState(false);
  const [stockLocation, setStockLocation] = useState<string>("all");

  const [reqDeliveryFilter, setReqDeliveryFilter] = useState<DeliveryFilter>("all");
  const [reqTeacherFilter, setReqTeacherFilter] = useState<string>("all");

  // Dialog state
  const [showMaterialDialog, setShowMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialRow | null>(null);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [editingRequest, setEditingRequest] = useState<RequestRow | null>(null);
  const [deliveryDialog, setDeliveryDialog] = useState<RequestRow | null>(null);

  const isAdmin = userRole === "ADMIN";
  const canMarkDeliveries = userRole === "ADMIN" || userRole === "TEACHER";
  const canRequest = userRole === "ADMIN" || userRole === "TEACHER";

  // Parents never see stock; force them onto the requests tab.
  useEffect(() => {
    if (isParent && tab !== "pedidos") setTab("pedidos");
  }, [isParent, tab]);

  // Teachers also never see stock; force them onto the requests tab.
  useEffect(() => {
    if (isTeacher && tab !== "pedidos") setTab("pedidos");
  }, [isTeacher, tab]);

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

    const [m, r, c, s, d] = await Promise.all([
      supabase.from("materials").select("*").eq("school_id", profile.school_id).order("name"),
      supabase.from("material_requests").select("*").eq("school_id", profile.school_id).order("created_at", { ascending: false }),
      supabase.from("classrooms").select("id, name").eq("school_id", profile.school_id).order("name"),
      supabase.from("students").select("id, full_name, classroom_id").eq("school_id", profile.school_id).order("full_name"),
      supabase.from("material_request_deliveries").select("id, request_id, student_id, brought").eq("school_id", profile.school_id),
    ]);
    setStock((m.data as MaterialRow[]) ?? []);
    setRequests((r.data as RequestRow[]) ?? []);
    setClassrooms(c.data ?? []);
    setStudents(s.data ?? []);
    setDeliveries(((d.data ?? []) as DeliveryRow[]));
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id]);

  // For teachers, restrict the classroom list and student list to the classes they teach.
  const visibleClassrooms = useMemo(() => {
    if (!isTeacher) return classrooms;
    return classrooms.filter((c) => teacherClassroomIds.includes(c.id));
  }, [classrooms, isTeacher, teacherClassroomIds]);
  const visibleStudents = useMemo(() => {
    if (!isTeacher) return students;
    return students.filter((s) => s.classroom_id && teacherClassroomIds.includes(s.classroom_id));
  }, [students, isTeacher, teacherClassroomIds]);

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

  // For parent stats we count only requests scoped to their selected child.
  const parentScopedRequests = useMemo(() => {
    if (!isParent) return requests;
    const childSet = new Set(childIds);
    const classSet = new Set(classroomIds);
    return requests.filter((r) => {
      const targetsChild = r.student_id ? childSet.has(r.student_id) : false;
      const targetsClass = !r.student_id && r.classroom_id ? classSet.has(r.classroom_id) : false;
      return targetsChild || targetsClass;
    });
  }, [requests, isParent, childIds, classroomIds]);

  const stats = useMemo(() => {
    const reqList = isParent ? parentScopedRequests : requests;
    const reqIds = new Set(reqList.map((r) => r.id));
    const childSet = new Set(childIds);
    const relevantDeliveries = isParent
      ? deliveries.filter((d) => reqIds.has(d.request_id) && childSet.has(d.student_id))
      : deliveries;
    return {
      totalItens: stock.reduce((a, s) => a + (s.quantity || 0), 0),
      baixoStock: stock.filter((s) => s.quantity < s.min_quantity).length,
      pedidosAtivos: reqList.length,
      entregasMarcadas: relevantDeliveries.filter((d) => d.brought).length,
    };
  }, [stock, requests, deliveries, isParent, parentScopedRequests, childIds]);

  // Compute target students for a request and delivery progress.
  const targetStudentsFor = (r: RequestRow) => {
    if (r.student_id) return students.filter((s) => s.id === r.student_id);
    if (r.classroom_id) return students.filter((s) => s.classroom_id === r.classroom_id);
    return [] as typeof students;
  };
  const progressFor = (r: RequestRow) => {
    const target = targetStudentsFor(r);
    const total = target.length;
    const broughtIds = new Set(
      deliveries.filter((d) => d.request_id === r.id && d.brought).map((d) => d.student_id),
    );
    const brought = target.filter((s) => broughtIds.has(s.id)).length;
    return { brought, total };
  };

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
      // Parents only see requests targeting their selected child or its classroom.
      if (isParent) {
        const childSet = new Set(childIds);
        const classSet = new Set(classroomIds);
        const targetsChild = r.student_id ? childSet.has(r.student_id) : false;
        const targetsClass = !r.student_id && r.classroom_id ? classSet.has(r.classroom_id) : false;
        if (!targetsChild && !targetsClass) return false;
      }
      // Teachers only see their own requests.
      if (isTeacher && r.requester_id !== user?.id) return false;
      if (reqDeliveryFilter !== "all") {
        const { brought, total } = progressFor(r);
        const isComplete = total > 0 && brought === total;
        if (reqDeliveryFilter === "completo" && !isComplete) return false;
        if (reqDeliveryFilter === "pendente" && isComplete) return false;
      }
      if (reqTeacherFilter !== "all" && r.requester_id !== reqTeacherFilter) return false;
      if (q) {
        const studentName = students.find((s) => s.id === r.student_id)?.full_name ?? "";
        const className = classrooms.find((c) => c.id === r.classroom_id)?.name ?? "";
        const blob = `${r.item_name} ${r.teacher_name ?? ""} ${r.recipient ?? ""} ${studentName} ${className} ${r.description ?? ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [requests, search, reqDeliveryFilter, reqTeacherFilter, students, classrooms, deliveries, isParent, childIds, classroomIds, isTeacher, user?.id]);

  const removeMaterial = async (id: string) => {
    if (!confirm("Remover este material?")) return;
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Material removido" });
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
              {isParent
                ? `Pedidos de material${selectedChild ? ` para ${selectedChild.full_name}` : ""}.`
                : "Gerir stock da escola e pedidos de material para encarregados de educação."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {!isParent && !isTeacher && (
            <div className="inline-flex h-11 items-center rounded-full border border-border bg-card p-1 shadow-soft">
              <button onClick={() => setTab("stock")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "stock" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                <Boxes className="h-4 w-4" strokeWidth={1.75} /> Stock
              </button>
              <button onClick={() => setTab("pedidos")} className={cn("flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors", tab === "pedidos" ? "bg-pastel-blue text-pastel-blue-foreground" : "text-muted-foreground hover:text-foreground")}>
                <ClipboardList className="h-4 w-4" strokeWidth={1.75} /> Pedidos
              </button>
            </div>
            )}
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
        <div className={cn("grid gap-4", isParent ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-4")}>
          {(isParent
            ? [
                { label: "Pedidos ativos", value: stats.pedidosAtivos, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
                { label: "Materiais entregues", value: stats.entregasMarcadas, color: "bg-pastel-green text-pastel-green-foreground" },
              ]
            : [
                { label: "Itens em Stock", value: stats.totalItens, color: "bg-pastel-blue text-pastel-blue-foreground" },
                { label: "Stock Baixo", value: stats.baixoStock, color: "bg-pastel-pink text-pastel-pink-foreground" },
                { label: "Pedidos ativos", value: stats.pedidosAtivos, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
                { label: "Materiais entregues", value: stats.entregasMarcadas, color: "bg-pastel-green text-pastel-green-foreground" },
              ]
          ).map((s) => (
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
                <Select value={reqDeliveryFilter} onValueChange={(v) => setReqDeliveryFilter(v as DeliveryFilter)}>
                  <SelectTrigger className="h-10 w-44 rounded-full"><SelectValue placeholder="Entregas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as entregas</SelectItem>
                    <SelectItem value="pendente">Por completar</SelectItem>
                    <SelectItem value="completo">Concluídas</SelectItem>
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
            canMarkDeliveries={canMarkDeliveries}
            progressFor={progressFor}
            onEdit={(r) => { setEditingRequest(r); setShowRequestDialog(true); }}
            onRemove={removeRequest}
            onMarkDeliveries={(r) => setDeliveryDialog(r)}
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
        classrooms={visibleClassrooms}
        students={visibleStudents}
        onSaved={loadAll}
      />
      <DeliveryDialog
        request={deliveryDialog}
        targetStudents={deliveryDialog ? targetStudentsFor(deliveryDialog) : []}
        deliveries={deliveries.filter((d) => deliveryDialog && d.request_id === deliveryDialog.id)}
        schoolId={schoolId}
        userId={user?.id ?? null}
        onClose={() => setDeliveryDialog(null)}
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
  requests, classrooms, students, isAdmin, currentUserId, canMarkDeliveries, progressFor, onEdit, onRemove, onMarkDeliveries,
}: {
  requests: RequestRow[];
  classrooms: { id: string; name: string }[];
  students: { id: string; full_name: string; classroom_id: string | null }[];
  isAdmin: boolean;
  currentUserId: string | null;
  canMarkDeliveries: boolean;
  progressFor: (r: RequestRow) => { brought: number; total: number };
  onEdit: (r: RequestRow) => void;
  onRemove: (id: string) => void;
  onMarkDeliveries: (r: RequestRow) => void;
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
                <th className="px-6 py-3">Entregas</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const m = meta(r.category);
                const Icon = m.icon;
                const sName = studentName(r.student_id);
                const canEdit = isAdmin || r.requester_id === currentUserId;
                const { brought, total } = progressFor(r);
                const complete = total > 0 && brought === total;
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
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
                            complete
                              ? "bg-pastel-green text-pastel-green-foreground"
                              : brought > 0
                                ? "bg-pastel-yellow text-pastel-yellow-foreground"
                                : "bg-muted text-foreground",
                          )}
                        >
                          {complete && <Check className="h-3 w-3" strokeWidth={2.25} />}
                          {brought} / {total}
                        </span>
                        <span className="text-xs text-muted-foreground">trouxeram</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {canMarkDeliveries && total > 0 && (
                          <button
                            onClick={() => onMarkDeliveries(r)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-pastel-blue px-3 text-xs font-semibold text-pastel-blue-foreground transition-colors hover:opacity-90"
                            title="Marcar entregas"
                          >
                            <ListChecks className="h-3.5 w-3.5" strokeWidth={2} /> Marcar
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

/* ====================== Delivery Dialog ====================== */
const DeliveryDialog = ({
  request, targetStudents, deliveries, schoolId, userId, onClose, onSaved,
}: {
  request: RequestRow | null;
  targetStudents: { id: string; full_name: string; classroom_id: string | null }[];
  deliveries: DeliveryRow[];
  schoolId: string | null;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!request) return;
    const initial: Record<string, boolean> = {};
    targetStudents.forEach((s) => {
      const d = deliveries.find((x) => x.student_id === s.id);
      initial[s.id] = d?.brought ?? false;
    });
    setMarks(initial);
    setSearch("");
  }, [request?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!request) return null;

  const filtered = targetStudents
    .filter((s) => !search.trim() || s.full_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { numeric: true, sensitivity: "base" }));

  const toggleAll = (value: boolean) => {
    const next: Record<string, boolean> = { ...marks };
    filtered.forEach((s) => { next[s.id] = value; });
    setMarks(next);
  };

  const broughtCount = Object.values(marks).filter(Boolean).length;

  const save = async () => {
    if (!schoolId || !userId) return;
    setSaving(true);
    const now = new Date().toISOString();
    const payload = targetStudents.map((s) => ({
      request_id: request.id,
      student_id: s.id,
      school_id: schoolId,
      brought: !!marks[s.id],
      marked_by: userId,
      marked_at: now,
    }));
    const { error } = await supabase
      .from("material_request_deliveries")
      .upsert(payload, { onConflict: "request_id,student_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Entregas atualizadas" });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marcar entregas — {request.item_name}</DialogTitle>
          <DialogDescription>
            Marque os alunos que trouxeram o material. {broughtCount} de {targetStudents.length} marcados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Pesquisar aluno..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(true)}>Todos</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => toggleAll(false)}>Nenhum</Button>
        </div>

        <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Sem alunos.</p>
          ) : (
            filtered.map((s) => {
              const checked = !!marks[s.id];
              return (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/50"
                >
                  <span className="text-sm text-foreground">{s.full_name}</span>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-xs", checked ? "text-pastel-green-foreground" : "text-muted-foreground")}>
                      {checked ? "Trouxe" : "Não trouxe"}
                    </span>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => setMarks((m) => ({ ...m, [s.id]: !!v }))}
                    />
                  </div>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "A guardar..." : "Guardar entregas"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};