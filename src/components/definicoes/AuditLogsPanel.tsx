import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search, RefreshCw, ChevronLeft, ChevronRight, Eye, CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

type AuditLog = {
  id: string;
  user_id: string | null;
  user_full_name: string | null;
  school_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_data: any;
  new_data: any;
  ip_address: string | null;
  created_at: string;
};

const PAGE_SIZE = 25;

const TABLE_LABELS: Record<string, string> = {
  students: "Alunos",
  teachers: "Professores",
  guardians: "Encarregados",
  classrooms: "Turmas",
  courses: "Cursos",
  subjects: "Disciplinas",
  enrollments: "Matrículas",
  academic_years: "Anos lectivos",
  academic_terms: "Períodos",
  schedules: "Horários",
  time_slots: "Blocos horários",
  assessments: "Avaliações",
  grades: "Notas",
  attendance: "Presenças",
  events: "Eventos",
  extracurricular_activities: "Actividades extracurriculares",
  extracurricular_enrollments: "Inscrições extracurriculares",
  payments: "Pagamentos",
  student_fees: "Mensalidades",
  fee_rules: "Regras de propinas",
  fee_categories: "Categorias de propinas",
  family_discount_rules: "Descontos por familiar",
  activity_fees: "Taxas de actividades",
  transport_fees: "Taxas de transporte",
  expenses: "Despesas",
  recurring_expenses: "Despesas recorrentes",
  expense_categories: "Categorias de despesa",
  materials: "Materiais",
  material_requests: "Pedidos de material",
  transport_routes: "Rotas de transporte",
  transport_stops: "Paragens de transporte",
  transport_enrollments: "Inscrições em transporte",
  school_settings: "Definições da escola",
  schools: "Escola",
};

const ACTION_LABELS: Record<string, { label: string; cls: string }> = {
  INSERT: { label: "Criação", cls: "bg-pastel-green text-pastel-green-foreground" },
  UPDATE: { label: "Alteração", cls: "bg-pastel-blue text-pastel-blue-foreground" },
  DELETE: { label: "Eliminação", cls: "bg-pastel-pink text-pastel-pink-foreground" },
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const diffSummary = (oldData: any, newData: any) => {
  if (!oldData && newData) return `${Object.keys(newData).length} campos definidos`;
  if (oldData && !newData) return `Registo eliminado`;
  if (!oldData || !newData) return "—";
  const changed: string[] = [];
  for (const k of Object.keys(newData)) {
    if (k === "updated_at") continue;
    if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) {
      changed.push(k);
    }
  }
  if (changed.length === 0) return "Sem alterações relevantes";
  return changed.slice(0, 3).join(", ") + (changed.length > 3 ? ` +${changed.length - 3}` : "");
};

export const AuditLogsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (tableFilter !== "all") q = q.eq("table_name", tableFilter);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (search.trim()) q = q.ilike("user_full_name", `%${search.trim()}%`);
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        q = q.gte("created_at", from.toISOString());
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        q = q.lte("created_at", to.toISOString());
      }

      const { data, count, error } = await q;
      if (error) throw error;
      setLogs((data ?? []) as AuditLog[]);
      setTotal(count ?? 0);
    } catch (e) {
      console.error("Failed to load audit logs", e);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tableFilter, actionFilter, dateFrom, dateTo]);

  const tableOptions = useMemo(() => {
    const set = new Set<string>(Object.keys(TABLE_LABELS));
    logs.forEach((l) => set.add(l.table_name));
    return Array.from(set).sort();
  }, [logs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Logs de auditoria</h2>
            <p className="text-sm text-muted-foreground">
              Histórico de criação, alteração e eliminação de dados em toda a escola. Os registos são guardados durante 12 meses.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(0);
                    fetchLogs();
                  }
                }}
                placeholder="Procurar por nome do utilizador..."
                className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <Select value={tableFilter} onValueChange={(v) => { setPage(0); setTableFilter(v); }}>
              <SelectTrigger className="h-10 w-[200px] rounded-xl">
                <SelectValue placeholder="Tabela" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as tabelas</SelectItem>
                {tableOptions.map((t) => (
                  <SelectItem key={t} value={t}>{TABLE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={actionFilter} onValueChange={(v) => { setPage(0); setActionFilter(v); }}>
              <SelectTrigger className="h-10 w-[160px] rounded-xl">
                <SelectValue placeholder="Acção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as acções</SelectItem>
                <SelectItem value="INSERT">Criação</SelectItem>
                <SelectItem value="UPDATE">Alteração</SelectItem>
                <SelectItem value="DELETE">Eliminação</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: pt }) : "Data inicial"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={(d) => { setPage(0); setDateFrom(d); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="h-4 w-4" />
                  {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: pt }) : "Data final"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={(d) => { setPage(0); setDateTo(d); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setPage(0); setDateFrom(undefined); setDateTo(undefined); }}
                className="flex h-10 items-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
                title="Limpar datas"
              >
                <X className="h-4 w-4" /> Limpar datas
              </button>
            )}

            <button
              onClick={() => { setPage(0); fetchLogs(); }}
              className="flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" /> Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Sem registos para os filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                  <th className="py-4 pl-5 pr-4 font-semibold">Data/Hora</th>
                  <th className="py-4 pr-4 font-semibold">Utilizador</th>
                  <th className="py-4 pr-4 font-semibold">Acção</th>
                  <th className="py-4 pr-4 font-semibold">Tabela</th>
                  <th className="py-4 pr-4 font-semibold">Resumo</th>
                  <th className="py-4 pr-5 font-semibold text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const meta = ACTION_LABELS[log.action] ?? { label: log.action, cls: "bg-muted text-muted-foreground" };
                  return (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="py-3.5 pl-5 pr-4 text-muted-foreground whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                      <td className="py-3.5 pr-4 font-medium text-foreground">{log.user_full_name ?? "Sistema"}</td>
                      <td className="py-3.5 pr-4">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", meta.cls)}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4 text-foreground">{TABLE_LABELS[log.table_name] ?? log.table_name}</td>
                      <td className="py-3.5 pr-4 text-muted-foreground">{diffSummary(log.old_data, log.new_data)}</td>
                      <td className="py-3.5 pr-5 text-right">
                        <button
                          onClick={() => setSelected(log)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
                        >
                          <Eye className="h-3.5 w-3.5" /> Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted-foreground">
          <span>{total} registo{total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs">Página {page + 1} de {totalPages}</span>
            <button
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages || loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do registo</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Data/Hora</p>
                  <p className="font-medium text-foreground">{formatDateTime(selected.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Utilizador</p>
                  <p className="font-medium text-foreground">{selected.user_full_name ?? "Sistema"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Acção</p>
                  <p className="font-medium text-foreground">{ACTION_LABELS[selected.action]?.label ?? selected.action}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Tabela</p>
                  <p className="font-medium text-foreground">{TABLE_LABELS[selected.table_name] ?? selected.table_name}</p>
                </div>
                {selected.record_id && (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold text-muted-foreground">ID do registo</p>
                    <p className="font-mono text-xs text-foreground break-all">{selected.record_id}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Antes</p>
                  <pre className="max-h-[40vh] overflow-auto rounded-xl bg-muted p-3 text-xs">
                    {selected.old_data ? JSON.stringify(selected.old_data, null, 2) : "—"}
                  </pre>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Depois</p>
                  <pre className="max-h-[40vh] overflow-auto rounded-xl bg-muted p-3 text-xs">
                    {selected.new_data ? JSON.stringify(selected.new_data, null, 2) : "—"}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
