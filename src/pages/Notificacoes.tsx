import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import { isNativeMobileApp } from "@/lib/nativeApp";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";

type Category = "academico" | "administrativo" | "evento" | "mensagem" | "sistema";
type Status = "unread" | "read" | "archived";

type Notification = {
  id: string;
  category: Category;
  title: string;
  description: string;
  status: Status;
  actor?: string;
  created_at: string;
};

const allowedCategories: Category[] = ["academico", "administrativo", "evento", "mensagem", "sistema"];
const allowedStatuses: Status[] = ["unread", "read", "archived"];

type FilterTab = "todas" | "nao_lidas" | "arquivadas";

const Notificacoes = () => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "notificacoes" });
  const { t: tShared } = useTranslation("pages", { keyPrefix: "shared" });
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>("todas");
  const [category, setCategory] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  const categoryMeta: Record<Category, { label: string; icon: typeof Bell; bg: string; text: string }> = useMemo(
    () => ({
      academico: { label: t("cat_academico"), icon: GraduationCap, bg: "bg-pastel-blue", text: "text-pastel-blue-foreground" },
      administrativo: { label: t("cat_administrativo"), icon: Receipt, bg: "bg-pastel-yellow", text: "text-pastel-yellow-foreground" },
      evento: { label: t("cat_evento"), icon: CalendarCheck, bg: "bg-pastel-green", text: "text-pastel-green-foreground" },
      mensagem: { label: t("cat_mensagem"), icon: MessageSquare, bg: "bg-pastel-lilac", text: "text-pastel-lilac-foreground" },
      sistema: { label: t("cat_sistema"), icon: Bell, bg: "bg-pastel-pink", text: "text-pastel-pink-foreground" },
    }),
    [t],
  );

  const formatNotifRelative = useCallback(
    (iso: string): string => {
      if (!iso) return "";
      const date = new Date(iso);
      const localeTag = intlLocaleTagFromLng(i18n.language);
      const diffMs = Date.now() - date.getTime();
      const sec = Math.floor(diffMs / 1000);
      if (sec < 60) return tShared("relative_just_now");
      const min = Math.floor(sec / 60);
      if (min < 60) return tShared("relative_minutes", { count: min });
      const h = Math.floor(min / 60);
      if (h < 24) return tShared("relative_hours", { count: h });
      const d = Math.floor(h / 24);
      if (d === 1) return tShared("relative_yesterday");
      if (d < 30) return tShared("relative_days", { count: d });
      return date.toLocaleDateString(localeTag);
    },
    [tShared, i18n.language],
  );

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
      showToast("error", t("err_load"));
      setItems([]);
    } else {
      const mapped: Notification[] = (data ?? []).map((n: any) => ({
        id: n.id,
        category: (allowedCategories.includes(n.category) ? n.category : "sistema") as Category,
        title: n.title,
        description: n.description ?? "",
        status: (allowedStatuses.includes(n.status) ? n.status : "unread") as Status,
        actor: n.actor_name ?? undefined,
        created_at: n.created_at ?? "",
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
      showToast("error", t("err_update"));
      loadNotifications();
    } else {
      window.dispatchEvent(new Event("notifications_updated"));
      showToast("success", t("toast_updated", { count: ids.length }));
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
      showToast("error", t("err_delete"));
      loadNotifications();
    } else {
      window.dispatchEvent(new Event("notifications_updated"));
      showToast("success", t("toast_deleted", { count: ids.length }));
    }
  };

  const tabs: { id: FilterTab; label: string; count: number }[] = useMemo(
    () => [
      { id: "todas", label: t("tab_inbox"), count: items.filter((i) => i.status !== "archived").length },
      { id: "nao_lidas", label: t("tab_unread"), count: counts.unread },
      { id: "arquivadas", label: t("tab_archived"), count: counts.archived },
    ],
    [t, items, counts.unread, counts.archived],
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder={t("search_placeholder")}
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {!isNativeMobileApp() && (
              <button
                onClick={() => markRead(items.filter((i) => i.status === "unread").map((i) => i.id))}
                className="hidden h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent sm:flex"
              >
                <CheckCheck className="h-4 w-4" strokeWidth={1.75} /> {t("mark_all_read")}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-blue px-3 py-1 text-xs font-medium text-pastel-blue-foreground">{t("kpi_total")}</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.total}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-yellow px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">{t("kpi_unread")}</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.unread}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-green px-3 py-1 text-xs font-medium text-pastel-green-foreground">{t("kpi_read")}</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.total - counts.unread - counts.archived}</p>
          </div>
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <span className="inline-block rounded-full bg-pastel-pink px-3 py-1 text-xs font-medium text-pastel-pink-foreground">{t("kpi_archived")}</span>
            <p className="mt-3 text-3xl font-bold text-foreground">{counts.archived}</p>
          </div>
        </div>

        {/* Tabs + category filter */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-card md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tabRow) => (
              <button
                key={tabRow.id}
                onClick={() => { setTab(tabRow.id); setSelected([]); }}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-[var(--transition-smooth)]",
                  tab === tabRow.id ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Inbox className="h-4 w-4" strokeWidth={1.75} />
                {tabRow.label}
                <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", tab === tabRow.id ? "bg-card/70 text-pastel-blue-foreground" : "bg-muted text-muted-foreground")}>
                  {tabRow.count}
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
              <option value="all">{t("filter_categories")}</option>
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
              {t("bulk_selected", { count: selected.length })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => markRead(selected, "read")} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                <Check className="h-3.5 w-3.5" strokeWidth={2} /> {t("mark_read")}
              </button>
              <button onClick={() => markRead(selected, "unread")} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                <Dot className="h-4 w-4" strokeWidth={2} /> {t("mark_unread")}
              </button>
              {tab !== "arquivadas" ? (
                <button onClick={() => archive(selected)} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                  <Archive className="h-3.5 w-3.5" strokeWidth={2} /> {t("archive")}
                </button>
              ) : (
                <button onClick={() => restore(selected)} className="flex h-9 items-center gap-2 rounded-full bg-card px-3 text-xs font-medium text-foreground shadow-soft hover:bg-accent">
                  <ArchiveRestore className="h-3.5 w-3.5" strokeWidth={2} /> {t("restore")}
                </button>
              )}
              <button onClick={() => remove(selected)} className="flex h-9 items-center gap-2 rounded-full bg-pastel-pink px-3 text-xs font-medium text-pastel-pink-foreground shadow-soft hover:opacity-90">
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2} /> {t("delete")}
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
              aria-label={t("select_all_aria")}
            />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("list_count", { count: filtered.length })}
            </span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground animate-pulse">
                <Bell className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <p className="text-sm font-medium text-foreground">{t("loading")}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bell className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <p className="text-sm font-medium text-foreground">{t("empty_title")}</p>
              <p className="text-xs text-muted-foreground">{t("empty_hint")}</p>
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
                    onClick={() => {
                      if (n.status === "unread") markRead([n.id], "read");
                    }}
                    className={cn(
                      "group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40",
                      isUnread && "cursor-pointer",
                      isUnread && "bg-pastel-blue/15",
                      isSelected && "bg-pastel-blue/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(n.id)}
                      className="mt-1.5 h-4 w-4 shrink-0 rounded border-border accent-[hsl(var(--pastel-blue-foreground))]"
                      aria-label={t("row_select_aria", { title: n.title })}
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
                      <p className="mt-1.5 text-[11px] text-muted-foreground">{formatNotifRelative(n.created_at)}{n.actor ? ` · ${n.actor}` : ""}</p>
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      {isUnread ? (
                        <button onClick={() => markRead([n.id], "read")} title={t("row_mark_read")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Check className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      ) : (
                        <button onClick={() => markRead([n.id], "unread")} title={t("row_mark_unread")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Dot className="h-5 w-5" strokeWidth={2} />
                        </button>
                      )}
                      {n.status === "archived" ? (
                        <button onClick={() => restore([n.id])} title={t("row_restore")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <ArchiveRestore className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      ) : (
                        <button onClick={() => archive([n.id])} title={t("row_archive")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
                          <Archive className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                      <button onClick={() => remove([n.id])} title={t("row_delete")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink hover:text-pastel-pink-foreground">
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
    </>
  );
};

export default Notificacoes;