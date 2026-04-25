import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Filter,
  Plus,
  Search,
  Package,
  Boxes,
  ClipboardList,
  Check,
  X,
  AlertTriangle,
  Pencil,
  Trash2,
  MoreHorizontal,
  BookOpen,
  Beaker,
  Palette,
  Dumbbell,
  Laptop,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

/* ====================== Types ====================== */
type Category = "papelaria" | "laboratorio" | "artes" | "desporto" | "tecnologia";
type Status = "pendente" | "aprovado" | "rejeitado" | "entregue";

type StockItem = {
  id: string;
  name: string;
  category: Category;
  sku: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  location: string;
};

type MaterialRequest = {
  id: string;
  itemName: string;
  category: Category;
  quantity: number;
  teacher: string;
  recipient: string; // educador
  student: string;
  reason: string;
  submittedAt: string;
  status: Status;
};

/* ====================== Meta ====================== */
const categoryMeta: Record<Category, { label: string; color: string; icon: typeof BookOpen }> = {
  papelaria: { label: "Papelaria", color: "bg-pastel-blue text-pastel-blue-foreground", icon: BookOpen },
  laboratorio: { label: "Laboratório", color: "bg-pastel-green text-pastel-green-foreground", icon: Beaker },
  artes: { label: "Artes", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Palette },
  desporto: { label: "Desporto", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Dumbbell },
  tecnologia: { label: "Tecnologia", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Laptop },
};

const statusMeta: Record<Status, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  aprovado: { label: "Aprovado", color: "bg-pastel-green text-pastel-green-foreground" },
  rejeitado: { label: "Rejeitado", color: "bg-pastel-pink text-pastel-pink-foreground" },
  entregue: { label: "Entregue", color: "bg-pastel-blue text-pastel-blue-foreground" },
};

/* ====================== Mock Data ====================== */
const seedStock: StockItem[] = [
  { id: "s1", name: "Cadernos A4", category: "papelaria", sku: "PAP-001", quantity: 240, minQuantity: 50, unit: "un", location: "Armazém A · Prateleira 2" },
  { id: "s2", name: "Canetas esferográficas (azul)", category: "papelaria", sku: "PAP-002", quantity: 35, minQuantity: 80, unit: "un", location: "Armazém A · Prateleira 1" },
  { id: "s3", name: "Tubos de ensaio", category: "laboratorio", sku: "LAB-014", quantity: 120, minQuantity: 30, unit: "un", location: "Laboratório · Armário 3" },
  { id: "s4", name: "Microscópios", category: "laboratorio", sku: "LAB-005", quantity: 8, minQuantity: 5, unit: "un", location: "Laboratório · Sala 02" },
  { id: "s5", name: "Tintas acrílicas", category: "artes", sku: "ART-009", quantity: 18, minQuantity: 25, unit: "frascos", location: "Sala de Artes" },
  { id: "s6", name: "Pincéis (kit)", category: "artes", sku: "ART-011", quantity: 42, minQuantity: 20, unit: "kits", location: "Sala de Artes" },
  { id: "s7", name: "Bolas de futebol", category: "desporto", sku: "DES-001", quantity: 14, minQuantity: 6, unit: "un", location: "Pavilhão · Arrecadação" },
  { id: "s8", name: "Cordas de saltar", category: "desporto", sku: "DES-007", quantity: 4, minQuantity: 15, unit: "un", location: "Pavilhão · Arrecadação" },
  { id: "s9", name: "Tablets educativos", category: "tecnologia", sku: "TEC-022", quantity: 26, minQuantity: 10, unit: "un", location: "Sala de Informática" },
  { id: "s10", name: "Cabos HDMI", category: "tecnologia", sku: "TEC-031", quantity: 12, minQuantity: 8, unit: "un", location: "Armazém Tec." },
];

const seedRequests: MaterialRequest[] = [
  { id: "r1", itemName: "Cadernos A4", category: "papelaria", quantity: 2, teacher: "Carla Mendes", recipient: "Sr. António Silva", student: "Mateus Silva (10º A)", reason: "Substituição de material extraviado.", submittedAt: "2026-04-24", status: "pendente" },
  { id: "r2", itemName: "Tintas acrílicas", category: "artes", quantity: 1, teacher: "Sofia Almeida", recipient: "Sra. Helena Costa", student: "Beatriz Costa (8º B)", reason: "Projeto de arte final.", submittedAt: "2026-04-23", status: "aprovado" },
  { id: "r3", itemName: "Tubos de ensaio", category: "laboratorio", quantity: 4, teacher: "Tiago Ferreira", recipient: "Sr. João Pinto", student: "Rui Pinto (11º A)", reason: "Trabalho prático de Química.", submittedAt: "2026-04-22", status: "entregue" },
  { id: "r4", itemName: "Cordas de saltar", category: "desporto", quantity: 1, teacher: "Pedro Lima", recipient: "Sra. Marta Sousa", student: "Inês Sousa (7º C)", reason: "Atividade extracurricular.", submittedAt: "2026-04-21", status: "rejeitado" },
  { id: "r5", itemName: "Tablets educativos", category: "tecnologia", quantity: 1, teacher: "Bruno Santos", recipient: "Sr. Carlos Nunes", student: "Diogo Nunes (12º B)", reason: "Aluno sem equipamento próprio.", submittedAt: "2026-04-20", status: "pendente" },
  { id: "r6", itemName: "Pincéis (kit)", category: "artes", quantity: 1, teacher: "Sofia Almeida", recipient: "Sra. Ana Ribeiro", student: "Tomás Ribeiro (9º C)", reason: "Aulas de pintura.", submittedAt: "2026-04-19", status: "pendente" },
];

/* ====================== Component ====================== */
type Tab = "stock" | "pedidos";

const Material = () => {
  const [tab, setTab] = useState<Tab>("stock");
  const [stock, setStock] = useState<StockItem[]>(seedStock);
  const [requests, setRequests] = useState<MaterialRequest[]>(seedRequests);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");
  const [showAdd, setShowAdd] = useState(false);

  const stats = useMemo(() => {
    const totalItens = stock.reduce((acc, s) => acc + s.quantity, 0);
    const baixoStock = stock.filter((s) => s.quantity < s.minQuantity).length;
    const pendentes = requests.filter((r) => r.status === "pendente").length;
    const entregues = requests.filter((r) => r.status === "entregue").length;
    return { totalItens, baixoStock, pendentes, entregues };
  }, [stock, requests]);

  const filteredStock = useMemo(() => {
    return stock.filter((s) => {
      const matchesCat = categoryFilter === "all" || s.category === categoryFilter;
      const q = search.trim().toLowerCase();
      const matchesQ = !q || s.name.toLowerCase().includes(q) || s.sku.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [stock, categoryFilter, search]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchesCat = categoryFilter === "all" || r.category === categoryFilter;
      const q = search.trim().toLowerCase();
      const matchesQ =
        !q ||
        r.itemName.toLowerCase().includes(q) ||
        r.teacher.toLowerCase().includes(q) ||
        r.student.toLowerCase().includes(q) ||
        r.recipient.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [requests, categoryFilter, search]);

  const updateRequestStatus = (id: string, status: Status) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast({
      title: `Pedido ${statusMeta[status].label.toLowerCase()}`,
      description: "O educador será notificado.",
    });
  };

  const removeStock = (id: string) => {
    setStock((prev) => prev.filter((s) => s.id !== id));
    toast({ title: "Item removido do stock" });
  };

  const addStockItem = (item: Omit<StockItem, "id">) => {
    setStock((prev) => [{ ...item, id: `s${Date.now()}` }, ...prev]);
    toast({ title: "Material adicionado ao stock" });
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
              <button
                onClick={() => setTab("stock")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  tab === "stock"
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Boxes className="h-4 w-4" strokeWidth={1.75} />
                Stock
              </button>
              <button
                onClick={() => setTab("pedidos")}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  tab === "pedidos"
                    ? "bg-pastel-blue text-pastel-blue-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ClipboardList className="h-4 w-4" strokeWidth={1.75} />
                Pedidos
              </button>
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              {tab === "stock" ? "Novo Material" : "Novo Pedido"}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Itens em Stock", value: stats.totalItens, color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Stock Baixo", value: stats.baixoStock, color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: "Pedidos Pendentes", value: stats.pendentes, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Pedidos Entregues", value: stats.entregues, color: "bg-pastel-green text-pastel-green-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>
                {s.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search + chips */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tab === "stock" ? "Pesquisar material ou SKU..." : "Pesquisar pedido, professor ou aluno..."}
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCategoryFilter("all")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                categoryFilter === "all"
                  ? "bg-muted text-foreground ring-2 ring-foreground/20 ring-offset-2 ring-offset-card"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              Todas
            </button>
            {(Object.keys(categoryMeta) as Category[]).map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  categoryFilter === c
                    ? cn(categoryMeta[c].color, "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card")
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {categoryMeta[c].label}
              </button>
            ))}
          </div>
        </div>

        {tab === "stock" ? (
          <StockTable items={filteredStock} onRemove={removeStock} />
        ) : (
          <RequestsTable requests={filteredRequests} onUpdate={updateRequestStatus} />
        )}
      </div>

      {showAdd && tab === "stock" && (
        <AddStockDialog
          onClose={() => setShowAdd(false)}
          onSave={(item) => {
            addStockItem(item);
            setShowAdd(false);
          }}
        />
      )}
      {showAdd && tab === "pedidos" && (
        <NewRequestDialog
          onClose={() => setShowAdd(false)}
          onSave={(req) => {
            setRequests((prev) => [{ ...req, id: `r${Date.now()}`, status: "pendente", submittedAt: new Date().toISOString().slice(0, 10) }, ...prev]);
            toast({ title: "Pedido enviado", description: "Aguarda aprovação do administrador." });
            setShowAdd(false);
          }}
        />
      )}
    </DashboardLayout>
  );
};

/* ====================== Stock Table ====================== */
const StockTable = ({ items, onRemove }: { items: StockItem[]; onRemove: (id: string) => void }) => {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Stock de Materiais</h2>
        <span className="text-xs text-muted-foreground">{items.length} item(ns)</span>
      </div>
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
              const Icon = categoryMeta[s.category].icon;
              const low = s.quantity < s.minQuantity;
              return (
                <tr key={s.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", categoryMeta[s.category].color)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">Mín. {s.minQuantity} {s.unit}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-medium", categoryMeta[s.category].color)}>
                      {categoryMeta[s.category].label}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{s.sku}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {low && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pastel-pink px-2 py-0.5 text-[10px] font-semibold text-pastel-pink-foreground">
                          <AlertTriangle className="h-3 w-3" strokeWidth={2} />
                          Baixo
                        </span>
                      )}
                      <span className="font-bold text-foreground">{s.quantity}</span>
                      <span className="text-xs text-muted-foreground">{s.unit}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{s.location}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      <button
                        onClick={() => onRemove(s.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink hover:text-pastel-pink-foreground"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  Sem materiais para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ====================== Requests Table ====================== */
const RequestsTable = ({
  requests,
  onUpdate,
}: {
  requests: MaterialRequest[];
  onUpdate: (id: string, status: Status) => void;
}) => {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">Pedidos de Material</h2>
        <span className="text-xs text-muted-foreground">{requests.length} pedido(s)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-6 py-3">Material</th>
              <th className="px-6 py-3 text-right">Qtd.</th>
              <th className="px-6 py-3">Professor</th>
              <th className="px-6 py-3">Aluno · Educador</th>
              <th className="px-6 py-3">Motivo</th>
              <th className="px-6 py-3">Estado</th>
              <th className="px-6 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const Icon = categoryMeta[r.category].icon;
              return (
                <tr key={r.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", categoryMeta[r.category].color)}>
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{r.itemName}</p>
                        <p className="text-xs text-muted-foreground">{categoryMeta[r.category].label}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-foreground">{r.quantity}</td>
                  <td className="px-6 py-4 text-muted-foreground">{r.teacher}</td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-foreground">{r.student}</p>
                    <p className="text-xs text-muted-foreground">{r.recipient}</p>
                  </td>
                  <td className="px-6 py-4 max-w-[240px]">
                    <p className="truncate text-muted-foreground" title={r.reason}>{r.reason}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusMeta[r.status].color)}>
                      {statusMeta[r.status].label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {r.status === "pendente" && (
                        <>
                          <button
                            onClick={() => onUpdate(r.id, "aprovado")}
                            className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-green px-3 text-xs font-semibold text-pastel-green-foreground transition-opacity hover:opacity-90"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Aprovar
                          </button>
                          <button
                            onClick={() => onUpdate(r.id, "rejeitado")}
                            className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-pink px-3 text-xs font-semibold text-pastel-pink-foreground transition-opacity hover:opacity-90"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                            Rejeitar
                          </button>
                        </>
                      )}
                      {r.status === "aprovado" && (
                        <button
                          onClick={() => onUpdate(r.id, "entregue")}
                          className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-blue px-3 text-xs font-semibold text-pastel-blue-foreground transition-opacity hover:opacity-90"
                        >
                          <Package className="h-3.5 w-3.5" strokeWidth={2.25} />
                          Marcar Entregue
                        </button>
                      )}
                      {(r.status === "rejeitado" || r.status === "entregue") && (
                        <button className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  Sem pedidos para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ====================== Dialogs ====================== */
const Backdrop = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-card">
      {children}
    </div>
  </div>
);

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40";

const AddStockDialog = ({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (item: Omit<StockItem, "id">) => void;
}) => {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("papelaria");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [minQuantity, setMinQuantity] = useState("0");
  const [unit, setUnit] = useState("un");
  const [location, setLocation] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      category,
      sku: sku.trim() || `SKU-${Date.now().toString().slice(-5)}`,
      quantity: Number(quantity) || 0,
      minQuantity: Number(minQuantity) || 0,
      unit: unit.trim() || "un",
      location: location.trim() || "Armazém",
    });
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Novo Material</h3>
        <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted">
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex: Cadernos A4" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Categoria</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputClass}>
            {(Object.keys(categoryMeta) as Category[]).map((c) => (
              <option key={c} value={c}>{categoryMeta[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">SKU</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} placeholder="PAP-001" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Quantidade</label>
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Qtd. Mínima</label>
          <input type="number" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Unidade</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} placeholder="un" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Localização</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="Armazém A" />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-10 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent">
          Cancelar
        </button>
        <button onClick={submit} className="h-10 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground hover:opacity-90">
          Adicionar
        </button>
      </div>
    </Backdrop>
  );
};

const NewRequestDialog = ({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (req: Omit<MaterialRequest, "id" | "status" | "submittedAt">) => void;
}) => {
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState<Category>("papelaria");
  const [quantity, setQuantity] = useState("1");
  const [teacher, setTeacher] = useState("");
  const [recipient, setRecipient] = useState("");
  const [student, setStudent] = useState("");
  const [reason, setReason] = useState("");

  const submit = () => {
    if (!itemName.trim() || !teacher.trim() || !student.trim()) return;
    onSave({
      itemName: itemName.trim(),
      category,
      quantity: Number(quantity) || 1,
      teacher: teacher.trim(),
      recipient: recipient.trim() || "—",
      student: student.trim(),
      reason: reason.trim() || "—",
    });
  };

  return (
    <Backdrop onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Novo Pedido de Material</h3>
        <button onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted">
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Material</label>
          <input value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputClass} placeholder="Ex: Cadernos A4" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Categoria</label>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputClass}>
            {(Object.keys(categoryMeta) as Category[]).map((c) => (
              <option key={c} value={c}>{categoryMeta[c].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Quantidade</label>
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Professor</label>
          <input value={teacher} onChange={(e) => setTeacher(e.target.value)} className={inputClass} placeholder="Nome do professor" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Aluno</label>
          <input value={student} onChange={(e) => setStudent(e.target.value)} className={inputClass} placeholder="Nome do aluno" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Encarregado de Educação</label>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} className={inputClass} placeholder="Nome do educador" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Motivo</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputClass, "h-20 py-2")} placeholder="Justificação do pedido..." />
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="h-10 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent">
          Cancelar
        </button>
        <button onClick={submit} className="h-10 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground hover:opacity-90">
          Enviar Pedido
        </button>
      </div>
    </Backdrop>
  );
};

export default Material;