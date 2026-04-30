import { useEffect, useMemo, useState } from "react";
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
import { showPageKpiCards, isNativeMobileApp, NATIVE_MOBILE_FAB_BUTTON_CLASSNAME } from "@/lib/nativeApp";

type Reason = "doenca" | "ferias" | "pessoal" | "luto" | "formacao" | "outro";
type StatusDB = "PENDING" | "APPROVED" | "REJECTED";

const reasonMeta: Record<Reason, { label: string; color: string; icon: typeof Stethoscope }> = {
  doenca: { label: "Doença", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Stethoscope },
  ferias: { label: "Férias", color: "bg-pastel-blue text-pastel-blue-foreground", icon: Plane },
  pessoal: { label: "Pessoal", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Briefcase },
  luto: { label: "Luto", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: HeartPulse },
  formacao: { label: "Formação", color: "bg-pastel-green text-pastel-green-foreground", icon: FileText },
  outro: { label: "Outro", color: "bg-muted text-foreground", icon: FileText },
};

const statusMeta: Record<StatusDB, { label: string; color: string }> = {
  PENDING: { label: "Pendente", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  APPROVED: { label: "Aprovado", color: "bg-pastel-green text-pastel-green-foreground" },
  REJECTED: { label: "Rejeitado", color: "bg-pastel-pink text-pastel-pink-foreground" },
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

const formatDateLong = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });

const daysBetween = (a: string, b: string) => {
  const d1 = new Date(a + "T00:00:00").getTime();
  const d2 = new Date(b + "T00:00:00").getTime();
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
};

type Row = AbsenceRecord & {
  profile?: { id: string; full_name: string; role: string | null } | null;
};

const Pedidos = () => {
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

  const isAdmin = role === "ADMIN";
  const isTeacher = role === "TEACHER";

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_id, role")
      .eq("id", user.id)
      .maybeSingle();
    setSchoolId(profile?.school_id ?? null);
    setRole(profile?.role ?? null);
    return profile?.school_id ?? null;
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
      toast({ title: "Erro a carregar pedidos", description: aErr.message, variant: "destructive" });
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
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "APPROVED" ? "Pedido aprovado" : "Pedido rejeitado" });
    loadAll();
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    if (isTeacher && confirmDelete.requester_id !== userId) return;
    const { error } = await supabase.from("staff_absences").delete().eq("id", confirmDelete.id);
    if (error) {
      toast({ title: "Erro a remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Pedido removido" });
      loadAll();
    }
    setConfirmDelete(null);
  };

  return (
    <>
      <div className={cn("flex flex-col gap-6", native && "relative pb-28")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Pedidos de Ausência</h1>
            <p className="text-sm text-muted-foreground">Crie, aprove e gira pedidos da sua equipa.</p>
          </div>
          {!native && (
          <button
            onClick={() => { setEditing(null); setDialogOpen(true); }}
            className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            Novo Pedido
          </button>
          )}
        </div>

        {/* Stats */}
        {showPageKpiCards() && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: "Pendentes", value: stats.pendentes, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Aprovados", value: stats.aprovados, color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Rejeitados", value: stats.rejeitados, color: "bg-pastel-pink text-pastel-pink-foreground" },
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
                placeholder="Pesquisar funcionário ou descrição..."
                className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>De</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
                <span>até</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
                {(dateFrom || dateTo) && (
                  <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-xs underline">limpar</button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Estado:</span>
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
                  {s === "all" ? "Todos" : statusMeta[s].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-4">
              <span className="text-xs font-medium text-muted-foreground">Motivo:</span>
              <button
                onClick={() => setReasonFilter("all")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  reasonFilter === "all" ? "bg-muted text-foreground ring-2 ring-foreground/20 ring-offset-2 ring-offset-card" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >Todos</button>
              {(Object.keys(reasonMeta) as Reason[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setReasonFilter(r)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                    reasonFilter === r ? cn(reasonMeta[r].color, "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card") : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >{reasonMeta[r].label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-bold text-foreground">Pedidos</h2>
            <span className="text-xs text-muted-foreground">{filtered.length} resultado(s)</span>
          </div>
          <div className="overflow-x-auto">
            {native ? (
              <div className="flex flex-col gap-3 p-4">
                {loading && (
                  <p className="py-12 text-center text-sm text-muted-foreground">A carregar...</p>
                )}
                {!loading && filtered.map((r, idx) => {
                  const meta = reasonMeta[(r.reason as Reason) ?? "outro"];
                  const Icon = meta.icon;
                  const status = (r.status as StatusDB) ?? "PENDING";
                  const name = r.profile?.full_name ?? "—";
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
                            <p className="text-xs text-muted-foreground">{r.profile?.role ?? ""}</p>
                          </div>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", statusMeta[status].color)}>
                          {statusMeta[status].label}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", meta.color)}>
                          <Icon className="h-3 w-3" />{meta.label}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-1 text-sm">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {formatDateLong(r.start_date)} – {formatDateLong(r.end_date)}
                        </span>
                        <span className="text-xs text-muted-foreground">{daysBetween(r.start_date, r.end_date)} dia(s)</span>
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
                            ><Check className="h-3.5 w-3.5" />Aprovar</button>
                            <button
                              type="button"
                              onClick={() => updateStatus(r.id, "REJECTED")}
                              className="inline-flex h-9 items-center gap-1 rounded-full bg-pastel-pink px-3 text-xs font-semibold text-pastel-pink-foreground transition-opacity hover:opacity-90"
                            ><X className="h-3.5 w-3.5" />Rejeitar</button>
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
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(r)}
                              className="inline-flex h-9 items-center gap-1 rounded-full bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-opacity hover:bg-destructive/25"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remover
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
                                  <Pencil className="mr-2 h-4 w-4" />Editar
                                </DropdownMenuItem>
                              )}
                              {isAdmin && status !== "PENDING" && (
                                <DropdownMenuItem onClick={() => updateStatus(r.id, "PENDING")}>
                                  <Clock className="mr-2 h-4 w-4" />Marcar como pendente
                                </DropdownMenuItem>
                              )}
                              {canDeleteRow && (
                                <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(r)}>
                                  <Trash2 className="mr-2 h-4 w-4" />Remover
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
                  <p className="py-12 text-center text-sm text-muted-foreground">Sem pedidos para os filtros aplicados.</p>
                )}
              </div>
            ) : (
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Funcionário</th>
                  <th className="px-6 py-3">Motivo</th>
                  <th className="px-6 py-3">Período</th>
                  <th className="px-6 py-3">Descrição</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">A carregar...</td></tr>
                )}
                {!loading && filtered.map((r, idx) => {
                  const meta = reasonMeta[(r.reason as Reason) ?? "outro"];
                  const Icon = meta.icon;
                  const status = (r.status as StatusDB) ?? "PENDING";
                  const name = r.profile?.full_name ?? "—";
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
                            <p className="text-xs text-muted-foreground">{r.profile?.role ?? ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", meta.color)}>
                          <Icon className="h-3 w-3" />{meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            {formatDateLong(r.start_date)} – {formatDateLong(r.end_date)}
                          </span>
                          <span className="text-xs text-muted-foreground">{daysBetween(r.start_date, r.end_date)} dia(s)</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-[260px]">
                        <p className="truncate text-muted-foreground" title={r.description ?? ""}>{r.description || "—"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusMeta[status].color)}>
                          {statusMeta[status].label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {isAdmin && status === "PENDING" && (
                            <>
                              <button
                                onClick={() => updateStatus(r.id, "APPROVED")}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-green px-3 text-xs font-semibold text-pastel-green-foreground transition-opacity hover:opacity-90"
                              ><Check className="h-3.5 w-3.5" />Aprovar</button>
                              <button
                                onClick={() => updateStatus(r.id, "REJECTED")}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-pink px-3 text-xs font-semibold text-pastel-pink-foreground transition-opacity hover:opacity-90"
                              ><X className="h-3.5 w-3.5" />Rejeitar</button>
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
                                    <Pencil className="mr-2 h-4 w-4" />Editar
                                  </DropdownMenuItem>
                                )}
                                {isAdmin && status !== "PENDING" && (
                                  <DropdownMenuItem onClick={() => updateStatus(r.id, "PENDING")}>
                                    <Clock className="mr-2 h-4 w-4" />Marcar como pendente
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(r)}>
                                    <Trash2 className="mr-2 h-4 w-4" />Remover
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
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-muted-foreground">Sem pedidos para os filtros aplicados.</td></tr>
                )}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>

      {native && (
        <Button
          type="button"
          size="icon"
          className={NATIVE_MOBILE_FAB_BUTTON_CLASSNAME}
          aria-label="Novo pedido"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
        >
          <Plus className="h-6 w-6" />
        </Button>
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
            <AlertDialogTitle>Remover pedido?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser anulada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Pedidos;