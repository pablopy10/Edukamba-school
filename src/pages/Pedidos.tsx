import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dateLocaleTag } from "@/lib/i18nDateLocale";
import {
  Plus, Search, Check, X, Clock, CalendarDays, FileText, Stethoscope, Plane, Briefcase, HeartPulse, Pencil, Trash2, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AbsenceFormDialog, type AbsenceRecord } from "@/components/pedidos/AbsenceFormDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { NativeMobileFabPortal } from "@/components/dashboard/NativeMobileFabPortal";
import { showPageKpiCards, isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";

type Reason = "doenca" | "ferias" | "pessoal" | "luto" | "formacao" | "outro";
type StatusDB = "PENDING" | "APPROVED" | "REJECTED";

const reasonMeta: Record<Reason, { color: string; icon: typeof Stethoscope }> = {
  doenca: { color: "bg-pastel-pink text-pastel-pink-foreground", icon: Stethoscope },
  ferias: { color: "bg-pastel-blue text-pastel-blue-foreground", icon: Plane },
  pessoal: { color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Briefcase },
  luto: { color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: HeartPulse },
  formacao: { color: "bg-pastel-green text-pastel-green-foreground", icon: FileText },
  outro: { color: "bg-muted text-foreground", icon: FileText },
};

const statusMeta: Record<StatusDB, { color: string }> = {
  PENDING: { color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  APPROVED: { color: "bg-pastel-green text-pastel-green-foreground" },
  REJECTED: { color: "bg-pastel-pink text-pastel-pink-foreground" },
};

const avatarColors = [
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-lilac text-pastel-lilac-foreground",
  "bg-pastel-pink text-pastel-pink-foreground",
  "bg-pastel-green text-pastel-green-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
];

const initials = (name?: string | null) =>
  (name || "??").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

const daysBetween = (a: string, b: string) => {
  const d1 = new Date(a + "T00:00:00").getTime();
  const d2 = new Date(b + "T00:00:00").getTime();
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
};

type Row = AbsenceRecord & {
  profile?: { id: string; full_name: string; role: string | null } | null;
};

const Pedidos = () => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "pedidos" });
  const formatDateLong = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(dateLocaleTag(i18n.language), {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const profileRoleLabel = (role: string | null | undefined) => {
    if (!role?.trim()) return "";
    const k = role.trim().toUpperCase();
    return t(`profile_roles.${k}`, { defaultValue: role });
  };
  const native = isNativeMobileApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusDB | "all">("all");
  const [reasonFilter, setReasonFilter] = useState<Reason | "all">("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const isAdmin = role != null && (role === "SUPER_ADMIN" || isSchoolManagementRole(role));
  const isTeacher = role === "TEACHER";

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, support_context_school_id, role")
      .eq("id", user.id)
      .maybeSingle();
    const sid = effectiveSchoolIdFromProfile(profile);
    setSchoolId(sid);
    setRole(profile?.role ?? null);
    return sid ?? null;
  };

  const loadAll = async () => {
    setLoading(true);
    const sid = await loadProfile();
    if (!sid) { setLoading(false); return; }

    const [{ data: absences, error: aErr }, { data: staffData }] = await Promise.all([
      supabase
        .from("staff_absences")
        .select("id, profile_id, requester_id, school_id, reason, description, start_date, end_date, status")
        .order("start_date", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("school_id", sid)
        .order("full_name"),
    ]);

    if (aErr) {
      toast({ title: t("toast_load_error"), description: aErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const profilesById = new Map((staffData || []).map((p) => [p.id, p]));
    const list: Row[] = (absences || []).map((a) => ({
      ...(a as AbsenceRecord),
      profile: a.profile_id ? (profilesById.get(a.profile_id) as any) ?? null : null,
    }));
    setRows(list);
    setStaff((staffData || []).map((p) => ({ id: p.id, full_name: p.full_name })));
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (isTeacher && r.requester_id !== userId) return false;
      if (statusFilter !== "all" && (r.status as StatusDB) !== statusFilter) return false;
      if (reasonFilter !== "all" && r.reason !== reasonFilter) return false;
      if (dateFrom && r.end_date < dateFrom) return false;
      if (dateTo && r.start_date > dateTo) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${r.profile?.full_name ?? ""} ${r.description ?? ""} ${r.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, reasonFilter, dateFrom, dateTo, search, isTeacher, userId]);

  const stats = useMemo(() => ({
    total: filtered.length,
    pendentes: filtered.filter((r) => r.status === "PENDING").length,
    aprovados: filtered.filter((r) => r.status === "APPROVED").length,
    rejeitados: filtered.filter((r) => r.status === "REJECTED").length,
  }), [filtered]);

  const updateStatus = async (id: string, status: StatusDB) => {
    const { error } = await supabase
      .from("staff_absences")
      .update({ status, decided_by: userId, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: t("toast_error"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "APPROVED" ? t("toast_approved") : t("toast_rejected") });
    loadAll();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    if (isTeacher && confirmDelete.requester_id !== userId) return;
    const { error } = await supabase.from("staff_absences").delete().eq("id", confirmDelete.id);
    if (error) {
      toast({ title: t("toast_remove_error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("toast_removed") });
      loadAll();
    }
    setConfirmDelete(null);
  };

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && "relative pb-28")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {!native && (
          <button
            onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            {t("new_request")}
          </button>
          )}
        </div>

        {/* Stats */}
        {showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: t("stat_total"), value: stats.total, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: t("stat_pending"), value: stats.pendentes, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: t("stat_approved"), value: stats.aprovados, color: "bg-pastel-green text-pastel-green-foreground" },
            { label: t("stat_rejected"), value: stats.rejeitados, color: "bg-pastel-pink text-pastel-pink-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>{s.label}</span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("search_placeholder")}
                className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t("date_from")}</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
                <span>{t("date_to")}</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs underline">{t("clear_dates")}</button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t("filter_status")}</span>
              {(["all", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    statusFilter === s
                      ? cn(s === "all" ? "bg-muted text-foreground" : statusMeta[s].color, "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card")
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {s === "all" ? t("all") : t(`statuses.${s}`)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-4">
              <span className="text-xs font-medium text-muted-foreground">{t("filter_reason")}</span>
              <button
                onClick={() => setReasonFilter("all")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  reasonFilter === "all" ? "bg-muted text-foreground ring-2 ring-foreground/20 ring-offset-2 ring-offset-card" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >{t("all")}</button>
              {(Object.keys(reasonMeta) as Reason[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setReasonFilter(r)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    reasonFilter === r ? cn(reasonMeta[r].color, "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card") : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >{t(`reasons.${r}`)}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-bold text-foreground">{t("table_title")}</h2>
            <span className="text-xs text-muted-foreground">{t("results_count", { count: filtered.length })}</span>
          </div>
          <div className="overflow-x-auto">
            {native ? (
              <div className="flex flex-col gap-3 p-4">
                {loading && (
                  <p className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</p>
                )}
                {!loading && filtered.map((r, idx) => {
                  const meta = reasonMeta[(r.reason as Reason) ?? "outro"];
                  const Icon = meta.icon;
                  const status = (r.status as StatusDB) ?? "PENDING";
                  const name = r.profile?.full_name ?? t("em_dash");
                  const isOwner = r.requester_id === userId;
                  const canEditRow = isAdmin || (isOwner && status === "PENDING");
                  const canDeleteRow = isAdmin || (isOwner && status === "PENDING");
                  const showInlineOwnerActions =
                    native && r.requester_id === userId && canEditRow && canDeleteRow;
                  return (
                    <div key={r.id} className="rounded-xl border border-border bg-background p-4 shadow-soft">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold", avatarColors[idx % avatarColors.length])}>
                            {initials(name)}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">{name}</p>
                            <p className="text-xs text-muted-foreground">{profileRoleLabel(r.profile?.role)}</p>
                          </div>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", statusMeta[status].color)}>
                          {t(`statuses.${status}`)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", meta.color)}>
                          <Icon className="h-3 w-3" />{t(`reasons.${(r.reason as Reason) ?? "outro"}`)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-1 text-sm">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {formatDateLong(r.start_date)} – {formatDateLong(r.end_date)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {(() => {
                            const n = daysBetween(r.start_date, r.end_date);
                            return t(n === 1 ? "days_one" : "days_other", { count: n });
                          })()}
                        </span>
                      </div>
                      {r.description ? (
                        <p className="mt-3 text-sm text-muted-foreground">{r.description}</p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {isAdmin && status === "PENDING" && (
                          <>
                            <button
                              type="button"
                              onClick={() => updateStatus(r.id, "APPROVED")}
                              className="inline-flex h-9 items-center gap-1 rounded-full bg-pastel-green px-3 text-xs font-semibold text-pastel-green-foreground transition-opacity hover:opacity-90"
                            ><Check className="h-3.5 w-3.5" />{t("approve")}</button>
                            <button
                              type="button"
                              onClick={() => updateStatus(r.id, "REJECTED")}
                              className="inline-flex h-9 items-center gap-1 rounded-full bg-pastel-pink px-3 text-xs font-semibold text-pastel-pink-foreground transition-opacity hover:opacity-90"
                            ><X className="h-3.5 w-3.5" />{t("reject")}</button>
                          </>
                        )}
                        {showInlineOwnerActions && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(r);
                                setDialogOpen(true);
                              }}
                              className="inline-flex h-9 items-center gap-1 rounded-full bg-muted px-3 text-xs font-semibold text-foreground transition-opacity hover:bg-accent"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {t("edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(r)}
                              className="inline-flex h-9 items-center gap-1 rounded-full bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-opacity hover:bg-destructive/25"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("remove")}
                            </button>
                          </>
                        )}
                        {(canEditRow || canDeleteRow) && !showInlineOwnerActions && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEditRow && (
                                <DropdownMenuItem onClick={() => { setEditing(r); setDialogOpen(true); }}>
                                  <Pencil className="mr-2 h-4 w-4" />{t("edit")}
                                </DropdownMenuItem>
                              )}
                              {isAdmin && status !== "PENDING" && (
                                <DropdownMenuItem onClick={() => updateStatus(r.id, "PENDING")}>
                                  <Clock className="mr-2 h-4 w-4" />{t("mark_pending")}
                                </DropdownMenuItem>
                              )}
                              {canDeleteRow && (
                                <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(r)}>
                                  <Trash2 className="mr-2 h-4 w-4" />{t("remove")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <p className="py-12 text-center text-sm text-muted-foreground">{t("empty")}</p>
                )}
              </div>
            ) : (
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">{t("col_staff")}</th>
                  <th className="px-6 py-3">{t("col_reason")}</th>
                  <th className="px-6 py-3">{t("col_period")}</th>
                  <th className="px-6 py-3">{t("col_description")}</th>
                  <th className="px-6 py-3">{t("col_status")}</th>
                  <th className="px-6 py-3 text-right">{t("col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">{t("loading")}</td></tr>
                )}
                {!loading && filtered.map((r, idx) => {
                  const meta = reasonMeta[(r.reason as Reason) ?? "outro"];
                  const Icon = meta.icon;
                  const status = (r.status as StatusDB) ?? "PENDING";
                  const name = r.profile?.full_name ?? t("em_dash");
                  const isOwner = r.requester_id === userId;
                  const canEdit = isAdmin || (isOwner && status === "PENDING");
                  const canDelete = isAdmin || (isOwner && status === "PENDING");
                  return (
                    <tr key={r.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold", avatarColors[idx % avatarColors.length])}>
                            {initials(name)}
                          </span>
                          <div>
                            <p className="font-semibold text-foreground">{name}</p>
                            <p className="text-xs text-muted-foreground">{profileRoleLabel(r.profile?.role)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", meta.color)}>
                          <Icon className="h-3 w-3" />{t(`reasons.${(r.reason as Reason) ?? "outro"}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            {formatDateLong(r.start_date)} – {formatDateLong(r.end_date)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                          {(() => {
                            const n = daysBetween(r.start_date, r.end_date);
                            return t(n === 1 ? "days_one" : "days_other", { count: n });
                          })()}
                        </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-[260px]">
                        <p className="truncate text-muted-foreground" title={r.description ?? ""}>{r.description || t("em_dash")}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusMeta[status].color)}>
                          {t(`statuses.${status}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {isAdmin && status === "PENDING" && (
                            <>
                              <button
                                onClick={() => updateStatus(r.id, "APPROVED")}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-green px-3 text-xs font-semibold text-pastel-green-foreground transition-opacity hover:opacity-90"
                              ><Check className="h-3.5 w-3.5" />{t("approve")}</button>
                              <button
                                onClick={() => updateStatus(r.id, "REJECTED")}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-pink px-3 text-xs font-semibold text-pastel-pink-foreground transition-opacity hover:opacity-90"
                              ><X className="h-3.5 w-3.5" />{t("reject")}</button>
                            </>
                          )}
                          {(canEdit || canDelete) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => { setEditing(r); setDialogOpen(true); }}>
                                    <Pencil className="mr-2 h-4 w-4" />{t("edit")}
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && status !== "PENDING" && (
                                  <DropdownMenuItem onClick={() => updateStatus(r.id, "PENDING")}>
                                    <Clock className="mr-2 h-4 w-4" />{t("mark_pending")}
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(r)}>
                                    <Trash2 className="mr-2 h-4 w-4" />{t("remove")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">{t("empty")}</td></tr>
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>

      {native && (
        <NativeMobileFabPortal>
          <Button
            type="button"
            size="icon"
            className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
            aria-label={t("fab_aria")}
            onClick={() => { setEditing(null); setDialogOpen(true); }}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </NativeMobileFabPortal>
      )}

      <AbsenceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={loadAll}
        schoolId={schoolId}
        currentUserId={userId}
        isAdmin={isAdmin}
        staff={staff}
        initial={editing}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirm_delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm_delete_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("remove")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Pedidos;