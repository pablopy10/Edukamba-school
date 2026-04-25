import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Filter,
  Plus,
  Search,
  Check,
  X,
  Clock,
  CalendarDays,
  FileText,
  Stethoscope,
  Plane,
  Briefcase,
  HeartPulse,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type LeaveType = "doenca" | "ferias" | "pessoal" | "luto" | "formacao";
type Status = "pendente" | "aprovado" | "rejeitado";

type LeaveRequest = {
  id: string;
  employee: string;
  role: string;
  avatarColor: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  submittedAt: string;
  status: Status;
};

const typeMeta: Record<LeaveType, { label: string; color: string; icon: typeof Stethoscope }> = {
  doenca: { label: "Doença", color: "bg-pastel-pink text-pastel-pink-foreground", icon: Stethoscope },
  ferias: { label: "Férias", color: "bg-pastel-blue text-pastel-blue-foreground", icon: Plane },
  pessoal: { label: "Pessoal", color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Briefcase },
  luto: { label: "Luto", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: HeartPulse },
  formacao: { label: "Formação", color: "bg-pastel-green text-pastel-green-foreground", icon: FileText },
};

const statusMeta: Record<Status, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
  aprovado: { label: "Aprovado", color: "bg-pastel-green text-pastel-green-foreground" },
  rejeitado: { label: "Rejeitado", color: "bg-pastel-pink text-pastel-pink-foreground" },
};

const avatarColors = [
  "bg-pastel-blue text-pastel-blue-foreground",
  "bg-pastel-lilac text-pastel-lilac-foreground",
  "bg-pastel-pink text-pastel-pink-foreground",
  "bg-pastel-green text-pastel-green-foreground",
  "bg-pastel-yellow text-pastel-yellow-foreground",
];

const initials = (name: string) =>
  name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

const seed: LeaveRequest[] = [
  { id: "1", employee: "Carla Mendes", role: "Professora — Matemática", avatarColor: avatarColors[0], type: "doenca", startDate: "2026-04-28", endDate: "2026-04-30", days: 3, reason: "Atestado médico em anexo.", submittedAt: "2026-04-25", status: "pendente" },
  { id: "2", employee: "Marta Dias", role: "Professora — Português", avatarColor: avatarColors[1], type: "ferias", startDate: "2026-05-12", endDate: "2026-05-19", days: 6, reason: "Férias programadas.", submittedAt: "2026-04-20", status: "pendente" },
  { id: "3", employee: "Rui Pereira", role: "Professor — Física", avatarColor: avatarColors[2], type: "formacao", startDate: "2026-05-05", endDate: "2026-05-06", days: 2, reason: "Workshop de Robótica Educativa.", submittedAt: "2026-04-22", status: "aprovado" },
  { id: "4", employee: "Helena Costa", role: "Professora — História", avatarColor: avatarColors[3], type: "pessoal", startDate: "2026-05-02", endDate: "2026-05-02", days: 1, reason: "Assunto pessoal urgente.", submittedAt: "2026-04-23", status: "rejeitado" },
  { id: "5", employee: "Pedro Lima", role: "Professor — Geografia", avatarColor: avatarColors[4], type: "luto", startDate: "2026-04-26", endDate: "2026-04-29", days: 4, reason: "Falecimento de familiar direto.", submittedAt: "2026-04-25", status: "aprovado" },
  { id: "6", employee: "Sofia Almeida", role: "Professora — Inglês", avatarColor: avatarColors[0], type: "doenca", startDate: "2026-04-27", endDate: "2026-04-27", days: 1, reason: "Consulta médica.", submittedAt: "2026-04-24", status: "pendente" },
  { id: "7", employee: "Tiago Ferreira", role: "Professor — Química", avatarColor: avatarColors[1], type: "formacao", startDate: "2026-05-15", endDate: "2026-05-16", days: 2, reason: "Conferência de Ciências.", submittedAt: "2026-04-21", status: "pendente" },
  { id: "8", employee: "Bruno Santos", role: "Professor — Filosofia", avatarColor: avatarColors[2], type: "ferias", startDate: "2026-06-01", endDate: "2026-06-10", days: 8, reason: "Férias de verão.", submittedAt: "2026-04-18", status: "aprovado" },
];

type StatusFilter = Status | "all";

const formatDateLong = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
};

const Pedidos = () => {
  const [requests, setRequests] = useState<LeaveRequest[]>(seed);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.employee.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [requests, statusFilter, search]);

  const stats = useMemo(() => {
    return {
      total: requests.length,
      pendentes: requests.filter((r) => r.status === "pendente").length,
      aprovados: requests.filter((r) => r.status === "aprovado").length,
      rejeitados: requests.filter((r) => r.status === "rejeitado").length,
    };
  }, [requests]);

  const updateStatus = (id: string, status: Status) => {
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast({
      title: status === "aprovado" ? "Pedido aprovado" : "Pedido rejeitado",
      description: "O funcionário será notificado.",
    });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Pedidos de Ausência</h1>
            <p className="text-sm text-muted-foreground">
              Aprove ou rejeite pedidos submetidos pelos funcionários.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo Pedido
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, color: "bg-pastel-lilac text-pastel-lilac-foreground" },
            { label: "Pendentes", value: stats.pendentes, color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Aprovados", value: stats.aprovados, color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Rejeitados", value: stats.rejeitados, color: "bg-pastel-pink text-pastel-pink-foreground" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", s.color)}>
                {s.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search + status chips */}
        <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar funcionário ou motivo..."
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "pendente", "aprovado", "rejeitado"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  statusFilter === s
                    ? cn(
                        s === "all" ? "bg-muted text-foreground" : statusMeta[s].color,
                        "ring-2 ring-foreground/20 ring-offset-2 ring-offset-card",
                      )
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "all" ? "Todos" : statusMeta[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-base font-bold text-foreground">Pedidos</h2>
            <span className="text-xs text-muted-foreground">{filtered.length} resultado(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">Funcionário</th>
                  <th className="px-6 py-3">Tipo</th>
                  <th className="px-6 py-3">Período</th>
                  <th className="px-6 py-3">Motivo</th>
                  <th className="px-6 py-3">Submetido</th>
                  <th className="px-6 py-3">Estado</th>
                  <th className="px-6 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const Icon = typeMeta[r.type].icon;
                  return (
                    <tr key={r.id} className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold", r.avatarColor)}>
                            {initials(r.employee)}
                          </span>
                          <div>
                            <p className="font-semibold text-foreground">{r.employee}</p>
                            <p className="text-xs text-muted-foreground">{r.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", typeMeta[r.type].color)}>
                          <Icon className="h-3 w-3" strokeWidth={2} />
                          {typeMeta[r.type].label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" strokeWidth={1.75} />
                            {formatDateLong(r.startDate)} – {formatDateLong(r.endDate)}
                          </span>
                          <span className="text-xs text-muted-foreground">{r.days} dia(s)</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 max-w-[260px]">
                        <p className="truncate text-muted-foreground" title={r.reason}>{r.reason}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" strokeWidth={1.75} />
                          {formatDateLong(r.submittedAt)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", statusMeta[r.status].color)}>
                          {statusMeta[r.status].label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {r.status === "pendente" ? (
                            <>
                              <button
                                onClick={() => updateStatus(r.id, "aprovado")}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-green px-3 text-xs font-semibold text-pastel-green-foreground transition-opacity hover:opacity-90"
                              >
                                <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                                Aprovar
                              </button>
                              <button
                                onClick={() => updateStatus(r.id, "rejeitado")}
                                className="inline-flex h-8 items-center gap-1 rounded-full bg-pastel-pink px-3 text-xs font-semibold text-pastel-pink-foreground transition-opacity hover:opacity-90"
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                                Rejeitar
                              </button>
                            </>
                          ) : (
                            <button className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
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
      </div>
    </DashboardLayout>
  );
};

export default Pedidos;