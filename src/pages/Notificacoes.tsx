import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Bell,
  Search,
  CheckCheck,
  Trash2,
  Archive,
  Inbox,
  GraduationCap,
  Receipt,
  CalendarCheck,
  MessageSquare,
  AlertCircle,
  Check,
  Filter,
  ArchiveRestore,
  Dot,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "academico" | "administrativo" | "evento" | "mensagem" | "sistema";
type Status = "unread" | "read" | "archived";

type Notification = {
  id: string;
  category: Category;
  title: string;
  description: string;
  time: string;
  status: Status;
  actor?: string;
  created_at?: string;
};

const categoryMeta: Record<Category, { label: string; icon: typeof Bell; bg: string; text: string }> = {
  academico: { label: "Académico", icon: GraduationCap, bg: "bg-pastel-blue", text: "text-pastel-blue-foreground" },
  administrativo: { label: "Administrativo", icon: Receipt, bg: "bg-pastel-yellow", text: "text-pastel-yellow-foreground" },
  evento: { label: "Evento", icon: CalendarCheck, bg: "bg-pastel-green", text: "text-pastel-green-foreground" },
  mensagem: { label: "Mensagem", icon: MessageSquare, bg: "bg-pastel-lilac", text: "text-pastel-lilac-foreground" },
  sistema: { label: "Sistema", icon: Bell, bg: "bg-pastel-pink", text: "text-pastel-pink-foreground" },
};

const formatRelative = (iso: string): string => {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "agora mesmo";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  return date.toLocaleDateString("pt-PT");
};

const allowedCategories: Category[] = ["academico", "administrativo", "evento", "mensagem", "sistema"];
const allowedStatuses: Status[] = ["unread", "read", "archived"];

type FilterTab = "todas" | "nao_lidas" | "arquivadas";

const Notificacoes = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("todas");
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 2200);
  };

  const loadNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      showToast("error", "Erro ao carregar notificações.");
      setItems([]);
    } else {
      const mapped: Notification[] = (data ?? []).map((n: any) => ({
        id: n.id,
        category: (allowedCategories.includes(n.category) ? n.category : "sistema") as Category,
        title: n.title,
        description: n.description ?? "",
        time: formatRelative(n.created_at),
        status: (allowedStatuses.includes(n.status) ? n.status : "unread") as Status,
        actor: n.actor_name ?? undefined,
        created_at: n.created_at,
      }));
      setItems(mapped);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    loadNotifications();

    // Realtime updates for this user's notifications
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${user.id}`,
        },
        () => loadNotifications(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = useMemo(() => {
    return items
      .filter((n) => {
        if (tab === "nao_lidas") return n.status === "unread";
        if (tab === "arquivadas") return n.status === "archived";
        return n.status !== "archived";
      })
      .filter((n) => (category === "all" ? true : n.category === category))
      .filter((n) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          n.title.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          (n.actor?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [items, tab, category, search]);

  const counts = useMemo(() => {
    const total = items.length;
    const unread = items.filter((i) => i.status === "unread").length;
    const archived = items.filter((i) => i.status === "archived").length;
    return { total, unread, archived };
  }, [items]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((n) => selected.includes(n.id));
  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelected((prev) => prev.filter((id) => !filtered.some((n) => n.id === id)));
    else setSelected((prev) => Array.from(new Set([...prev, ...filtered.map((n) => n.id)])));
  };

  const updateStatus = async (ids: string[], status: Status) => {
    if (ids.length === 0) return;
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, status } : n)));
    setSelected([]);
    const { error } = await supabase
      .from("notifications")
      .update({ status })
      .in("id", ids);
    if (error) {
      showToast("error", "Erro ao actualizar notificações.");
      loadNotifications();
    } else {
      showToast("success", `${ids.length} notificação(ões) actualizada(s).`);
    }
  };

  const markRead = (ids: string[], status: Status = "read") => updateStatus(ids, status);
  const archive = (ids: string[]) => updateStatus(ids, "archived");
  const restore = (ids: string[]) => updateStatus(ids, "read");

  const remove = async (ids: string[]) => {
    if (ids.length === 0) return;
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
    setSelected([]);
    const { error } = await supabase.from("notifications").delete().in("id", ids);
    if (error) {
      showToast("error", "Erro ao eliminar notificações.");
      loadNotifications();
    } else {
      showToast("success", `${ids.length} notificação(ões) eliminada(s).`);
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: "todas", label: "Caixa de entrada", count: items.filter((i) => i.status !== "archived").length },
    { id: "nao_lidas", label: "Não lidas", count: counts.unread },
    { id: "arquivadas", label: "Arquivadas", count: counts.archived },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Notificações</h1>
            <p className="text-sm text-muted-foreground">Centraliza alertas académicos, administrativos, eventos e mensagens da escola.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar notificação..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button
              onClick={() => markRead(items.filter((i) => i.status === "unread").map((i) => i.id))}
              className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent"
            >
              <CheckCheck className="h-4 w-4" strokeWidth={1.75} /> Marcar todas como lidas
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-blue px-3 py-1 text-xs font-medium text-pastel-blue-foreground">Total</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.total}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-yellow px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">Não lidas</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.unread}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-green px-3 py-1 text-xs font-medium text-pastel-green-foreground">Lidas</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.total - counts.unread - counts.archived}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-pink px-3 py-1 text-xs font-medium text-pastel-pink-foreground">Arquivadas</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.archived}</p>
          </div>
        </div>

        {/* Tabs + category filter */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-card md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSelected([]); }}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-[var(--transition-smooth)]",
                  tab === t.id ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Inbox className="h-4 w-4" strokeWidth={1.75} />
                {t.label}
                <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tab === t.id ? "bg-card/70 text-pastel-blue-foreground" : "bg-muted text-muted-foreground")}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-2">
            <Filter className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | "all")}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
            >
              <option value="all">Todas as categorias</option>
              {(Object.keys(categoryMeta) as Category[]).map((k) => (
                <option key={k} value={k}>{categoryMeta[k].label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk bar */}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pastel-blue/40 p-3 shadow-card">
            <div className="flex items-center gap-2 px-2 text-sm font-medium text-pastel-blue-foreground">
              <CheckCheck className="h-4 w-4" strokeWidth={1.75} />
              {selected.length} seleccionada(s)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => markRead(selected, "read")} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                <Check className="h-3.5 w-3.5" strokeWidth={2} /> Marcar como lida
              </button>
              <button onClick={() => markRead(selected, "unread")} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                <Dot className="h-4 w-4" strokeWidth={2} /> Marcar como não lida
              </button>
              {tab !== "arquivadas" ? (
                <button onClick={() => archive(selected)} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                  <Archive className="h-3.5 w-3.5" strokeWidth={2} /> Arquivar
                </button>
              ) : (
                <button onClick={() => restore(selected)} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                  <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={2} /> Restaurar
                </button>
              )}
              <button onClick={() => remove(selected)} className="flex h-9 items-center gap-2 rounded-full bg-pastel-pink px-3 text-xs font-medium text-pastel-pink-foreground shadow-soft hover:opacity-90">
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} /> Eliminar
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-3">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-border accent-[hsl(var(--pastel-blue-foreground))]"
              aria-label="Seleccionar todas"
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "notificação" : "notificações"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bell className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <p className="text-sm font-medium text-foreground">Sem notificações</p>
              <p className="text-xs text-muted-foreground">Quando houver novidades, aparecem aqui.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((n) => {
                const meta = categoryMeta[n.category];
                const Icon = meta.icon;
                const isUnread = n.status === "unread";
                const isSelected = selected.includes(n.id);
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40",
                      isUnread && "bg-pastel-blue/15",
                      isSelected && "bg-pastel-blue/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(n.id)}
                      className="mt-1.5 h-4 w-4 shrink-0 rounded border-border accent-[hsl(var(--pastel-blue-foreground))]"
                      aria-label={`Seleccionar ${n.title}`}
                    />
                    <span className={cn("relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.bg, meta.text)}>
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                      {isUnread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-sidebar-ring" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={cn("text-sm text-foreground", isUnread ? "font-semibold" : "font-medium")}>{n.title}</h3>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.bg, meta.text)}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{n.description}</p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{n.time}{n.actor ? ` · ${n.actor}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {isUnread ? (
                        <button onClick={() => markRead([n.id], "read")} title="Marcar como lida" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Check className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      ) : (
                        <button onClick={() => markRead([n.id], "unread")} title="Marcar como não lida" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Dot className="h-5 w-5" strokeWidth={2} />
                        </button>
                      )}
                      {n.status === "archived" ? (
                        <button onClick={() => restore([n.id])} title="Restaurar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <ArchiveRestore className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      ) : (
                        <button onClick={() => archive([n.id])} title="Arquivar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Archive className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                      <button onClick={() => remove([n.id])} title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink hover:text-pastel-pink-foreground">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-card",
            toast.kind === "success" ? "bg-pastel-green text-pastel-green-foreground" : "bg-pastel-pink text-pastel-pink-foreground",
          )}>
            {toast.kind === "success" ? <Check className="h-4 w-4" strokeWidth={2} /> : <AlertCircle className="h-4 w-4" strokeWidth={2} />}
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Notificacoes;