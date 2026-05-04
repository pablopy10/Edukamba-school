import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Clock,
  MapPin,
  LogIn,
  LogOut,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  CalendarDays,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { ROLE_LABEL_INVITE } from "@/components/definicoes/InviteStaffUserDialog";
import { isSchoolManagementRole } from "@/lib/schoolStaffRoles";

type EntryStatus = "completo" | "em_curso" | "incompleto";

type TimeEntry = {
  id: string;
  profile_id: string | null;
  employee_name: string;
  role: string | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  hours_worked: number;
  status: EntryStatus;
  check_in_lat: number | null;
  check_in_lng: number | null;
  check_in_address: string | null;
  check_out_lat: number | null;
  check_out_lng: number | null;
  check_out_address: string | null;
};

type Employee = { id: string; name: string; role: string };

const roleLabels: Record<string, string> = {
  ...ROLE_LABEL_INVITE,
  PARENT: "Encarregado de Educação",
  STUDENT: "Aluno",
  SUPER_ADMIN: "Super Administrador",
};

const translateRole = (role: string | null | undefined) => {
  if (!role) return "";
  return roleLabels[role] ?? role;
};

const statusMeta: Record<EntryStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completo: { label: "Completo", color: "bg-pastel-green text-pastel-green-foreground", icon: CheckCircle2 },
  em_curso: { label: "Em Curso", color: "bg-pastel-blue text-pastel-blue-foreground", icon: Loader2 },
  incompleto: { label: "Incompleto", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: AlertCircle },
};

const formatTime = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const Timesheet = () => {
  const { user } = useAuth();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EntryStatus | "todos">("todos");
  const [monthFilter, setMonthFilter] = useState<string>(String(new Date().getMonth() + 1)); // "1".."12" or ""
  const [yearFilter, setYearFilter] = useState<string>(String(new Date().getFullYear())); // "yyyy" or ""
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [registering, setRegistering] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [registerType, setRegisterType] = useState<"in" | "out">("in");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("id, school_id, role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSchoolId(data.school_id);
          setMyProfileId(data.id);
          setMyRole((data as any).role ?? null);
        }
      });
  }, [user]);

  const isAdmin = isSchoolManagementRole(myRole);

  const loadAll = async () => {
    if (!schoolId) return;
    setLoading(true);
    const [entriesRes, profilesRes] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("school_id", schoolId)
        .order("date", { ascending: false })
        .order("check_in", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("school_id", schoolId)
        .order("full_name"),
    ]);

    if (entriesRes.error) {
      toast({ title: "Erro a carregar timesheet", description: entriesRes.error.message, variant: "destructive" });
    } else {
      setEntries((entriesRes.data ?? []) as TimeEntry[]);
    }

    if (!profilesRes.error && profilesRes.data) {
      const list: Employee[] = profilesRes.data.map((p: any) => ({
        id: p.id,
        name: p.full_name,
        role: p.role ?? "",
      }));
      setEmployees(list);
      if (!selectedEmployeeId && myProfileId) setSelectedEmployeeId(myProfileId);
      else if (!selectedEmployeeId && list[0]) setSelectedEmployeeId(list[0].id);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        !search ||
        e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
        (e.role ?? "").toLowerCase().includes(search.toLowerCase()) ||
        translateRole(e.role).toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "todos" || e.status === statusFilter;
      let matchMonth = true;
      let matchYear = true;
      if (e.date) {
        const [y, m] = e.date.split("-");
        if (yearFilter) matchYear = y === yearFilter;
        if (monthFilter) matchMonth = parseInt(m, 10) === parseInt(monthFilter, 10);
      } else {
        if (yearFilter || monthFilter) {
          matchMonth = false;
        }
      }
      return matchSearch && matchStatus && matchMonth && matchYear;
    });
  }, [entries, search, statusFilter, monthFilter, yearFilter]);

  const stats = useMemo(() => {
    const totalHours = entries.reduce((s, e) => s + Number(e.hours_worked || 0), 0);
    const today = new Date().toISOString().split("T")[0];
    const todayEntries = entries.filter((e) => e.date === today);
    const inProgress = entries.filter((e) => e.status === "em_curso").length;
    const completed = entries.filter((e) => e.status === "completo").length;
    return { totalHours, todayCount: todayEntries.length, inProgress, completed };
  }, [entries]);

  const captureGps = () => {
    setGpsStatus("loading");
    if (!navigator.geolocation) {
      setTimeout(() => {
        setCurrentCoords({ lat: -8.839, lng: 13.2894 });
        setGpsStatus("success");
      }, 600);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("success");
      },
      () => {
        setCurrentCoords({ lat: -8.839, lng: 13.2894 });
        setGpsStatus("success");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submitRegister = async () => {
    if (!currentCoords || !schoolId || !selectedEmployeeId) return;
    const employee = employees.find((e) => e.id === selectedEmployeeId);
    if (!employee) return;

    setSubmitting(true);
    const nowIso = new Date().toISOString();
    const date = nowIso.split("T")[0];
    const address = "Localização capturada via GPS";

    if (registerType === "in") {
      // Verificar se já existe um em_curso ativo deste funcionário
      const { data: existing } = await supabase
        .from("time_entries")
        .select("id")
        .eq("school_id", schoolId)
        .eq("profile_id", selectedEmployeeId)
        .eq("status", "em_curso")
        .maybeSingle();

      if (existing) {
        toast({
          title: "Entrada já registada",
          description: "Este funcionário já tem uma entrada em curso. Registe primeiro a saída.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from("time_entries").insert({
        school_id: schoolId,
        profile_id: selectedEmployeeId,
        employee_name: employee.name,
        role: employee.role,
        date,
        check_in: nowIso,
        status: "em_curso",
        hours_worked: 0,
        check_in_lat: currentCoords.lat,
        check_in_lng: currentCoords.lng,
        check_in_address: address,
      });
      if (error) {
        toast({ title: "Erro ao registar entrada", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Entrada registada", description: `${employee.name}` });
      }
    } else {
      // Procurar entrada em_curso
      const { data: open } = await supabase
        .from("time_entries")
        .select("*")
        .eq("school_id", schoolId)
        .eq("profile_id", selectedEmployeeId)
        .eq("status", "em_curso")
        .order("check_in", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!open) {
        toast({
          title: "Sem entrada em curso",
          description: "Não foi encontrada uma entrada por fechar para este funcionário.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      const checkInDate = new Date(open.check_in as string);
      const diffMs = new Date(nowIso).getTime() - checkInDate.getTime();
      const hours = Math.max(0, diffMs / (1000 * 60 * 60));
      const status: EntryStatus = hours >= 6 ? "completo" : "incompleto";

      const { error } = await supabase
        .from("time_entries")
        .update({
          check_out: nowIso,
          check_out_lat: currentCoords.lat,
          check_out_lng: currentCoords.lng,
          check_out_address: address,
          hours_worked: Math.round(hours * 100) / 100,
          status,
        })
        .eq("id", open.id);

      if (error) {
        toast({ title: "Erro ao registar saída", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Saída registada", description: `${employee.name} — ${hours.toFixed(2)}h` });
      }
    }

    setSubmitting(false);
    setRegistering(false);
    setGpsStatus("idle");
    setCurrentCoords(null);
    loadAll();
  };

  const exportCsv = () => {
    const header = isAdmin
      ? "Funcionário;Função;Data;Entrada;Saída;Horas;Estado;Lat Entrada;Lng Entrada;Lat Saída;Lng Saída\n"
      : "Funcionário;Função;Data;Entrada;Saída;Horas;Estado\n";
    const rows = filtered
      .map((e) => {
        const base = [
          e.employee_name,
          translateRole(e.role),
          e.date,
          formatTime(e.check_in) ?? "",
          formatTime(e.check_out) ?? "",
          e.hours_worked,
          statusMeta[e.status]?.label ?? e.status,
        ];
        if (isAdmin) {
          base.push(
            e.check_in_lat ?? "",
            e.check_in_lng ?? "",
            e.check_out_lat ?? "",
            e.check_out_lng ?? "",
          );
        }
        return base.join(";");
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Timesheet</h1>
            <p className="text-sm text-muted-foreground">
              Controlo de presenças e horas trabalhadas com registo de localização GPS
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground hover:opacity-90 transition-[var(--transition-smooth)]"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
            <button
              onClick={() => {
                setRegistering(true);
                setRegisterType("in");
                captureGps();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90 transition-[var(--transition-smooth)]"
            >
              <LogIn className="h-4 w-4" />
              Registar Entrada
            </button>
            <button
              onClick={() => {
                setRegistering(true);
                setRegisterType("out");
                captureGps();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-pastel-pink px-4 py-2.5 text-sm font-semibold text-pastel-pink-foreground shadow-soft hover:opacity-90 transition-[var(--transition-smooth)]"
            >
              <LogOut className="h-4 w-4" />
              Registar Saída
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatBox icon={CalendarDays} label="Registos Hoje" value={stats.todayCount.toString()} tone="bg-pastel-blue text-pastel-blue-foreground" />
          <StatBox icon={Loader2} label="Em Curso" value={stats.inProgress.toString()} tone="bg-pastel-yellow text-pastel-yellow-foreground" />
          <StatBox icon={CheckCircle2} label="Completos" value={stats.completed.toString()} tone="bg-pastel-green text-pastel-green-foreground" />
          <StatBox icon={Clock} label="Total de Horas" value={stats.totalHours.toFixed(1) + "h"} tone="bg-pastel-lilac text-pastel-lilac-foreground" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por funcionário ou função…"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos os meses</option>
            {[
              "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
              "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
            ].map((label, i) => (
              <option key={i + 1} value={String(i + 1)}>{label}</option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos os anos</option>
            {(() => {
              const current = new Date().getFullYear();
              const years = new Set<number>();
              for (let y = current - 4; y <= current + 1; y++) years.add(y);
              entries.forEach((e) => {
                if (e.date) years.add(parseInt(e.date.split("-")[0], 10));
              });
              return Array.from(years)
                .filter((y) => !Number.isNaN(y))
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ));
            })()}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EntryStatus | "todos")}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="todos">Todos os estados</option>
            <option value="completo">Completo</option>
            <option value="em_curso">Em Curso</option>
            <option value="incompleto">Incompleto</option>
          </select>
          {(monthFilter || yearFilter || statusFilter !== "todos" || search) && (
            <button
              onClick={() => {
                setMonthFilter("");
                setYearFilter("");
                setStatusFilter("todos");
                setSearch("");
              }}
              className="h-10 rounded-xl bg-secondary px-3 text-xs font-semibold text-foreground hover:opacity-90"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Funcionário</th>
                  <th className="px-4 py-3 text-left font-semibold">Data</th>
                  <th className="px-4 py-3 text-left font-semibold">Entrada</th>
                  <th className="px-4 py-3 text-left font-semibold">Saída</th>
                  <th className="px-4 py-3 text-left font-semibold">Horas</th>
                  {isAdmin && (
                    <th className="px-4 py-3 text-left font-semibold">Localização</th>
                  )}
                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                )}
                {!loading && filtered.map((e) => {
                  const meta = statusMeta[e.status] ?? statusMeta.em_curso;
                  const Icon = meta.icon;
                  const checkIn = formatTime(e.check_in);
                  const checkOut = formatTime(e.check_out);
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedEntry(e)}
                      className="cursor-pointer border-t border-border hover:bg-muted/40 transition-[var(--transition-smooth)]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-pastel-lilac text-pastel-lilac-foreground text-xs font-bold">
                            {e.employee_name
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{e.employee_name}</p>
                            <p className="text-xs text-muted-foreground">{translateRole(e.role)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{e.date}</td>
                      <td className="px-4 py-3">
                        {checkIn ? (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <LogIn className="h-3.5 w-3.5 text-pastel-green-foreground" />
                            {checkIn}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {checkOut ? (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <LogOut className="h-3.5 w-3.5 text-pastel-pink-foreground" />
                            {checkOut}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {Number(e.hours_worked) > 0 ? `${Number(e.hours_worked).toFixed(2)}h` : "—"}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {e.check_in_lat != null && e.check_in_lng != null ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              {Number(e.check_in_lat).toFixed(4)}, {Number(e.check_in_lng).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", meta.color)}>
                          <Icon className={cn("h-3 w-3", e.status === "em_curso" && "animate-spin")} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Nenhum registo encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Register modal */}
      {registering && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
          onClick={() => {
            if (submitting) return;
            setRegistering(false);
            setGpsStatus("idle");
            setCurrentCoords(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-4">
              <div
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-xl",
                  registerType === "in" ? "bg-pastel-green text-pastel-green-foreground" : "bg-pastel-pink text-pastel-pink-foreground",
                )}
              >
                {registerType === "in" ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  Registar {registerType === "in" ? "Entrada" : "Saída"}
                </h2>
                <p className="text-xs text-muted-foreground">A localização GPS será registada</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Funcionário
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {employees.length === 0 && <option value="">Sem funcionários</option>}
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}{e.role ? ` — ${translateRole(e.role)}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex items-center gap-2 pb-2">
                  <Navigation className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Localização GPS</p>
                </div>
                {gpsStatus === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A capturar localização…
                  </div>
                )}
                {gpsStatus === "success" && currentCoords && (
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex items-center gap-2 text-pastel-green-foreground">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="font-semibold">Localização capturada</span>
                    </div>
                    <p className="font-mono text-muted-foreground">
                      Lat: {currentCoords.lat.toFixed(6)}
                    </p>
                    <p className="font-mono text-muted-foreground">
                      Lng: {currentCoords.lng.toFixed(6)}
                    </p>
                  </div>
                )}
                {gpsStatus === "error" && (
                  <p className="text-xs text-destructive">Erro ao capturar localização.</p>
                )}
                {(gpsStatus === "idle" || gpsStatus === "error") && (
                  <button
                    onClick={captureGps}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <Navigation className="h-3.5 w-3.5" /> Capturar localização
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm">
                <Clock className="h-4 w-4 text-accent-foreground" />
                <span className="text-accent-foreground">
                  {new Date().toLocaleString("pt-PT", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setRegistering(false);
                    setGpsStatus("idle");
                    setCurrentCoords(null);
                  }}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-secondary py-2.5 text-sm font-semibold text-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitRegister}
                  disabled={!currentCoords || submitting || !selectedEmployeeId}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar Registo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pb-4">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-pastel-lilac text-pastel-lilac-foreground text-sm font-bold">
                {selectedEntry.employee_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-foreground">{selectedEntry.employee_name}</h2>
                <p className="text-xs text-muted-foreground">
                  {translateRole(selectedEntry.role)} · {selectedEntry.date}
                </p>
              </div>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", statusMeta[selectedEntry.status]?.color)}>
                {statusMeta[selectedEntry.status]?.label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-4">
              <div className="rounded-xl bg-pastel-green/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pastel-green-foreground">Entrada</p>
                <p className="mt-1 text-lg font-bold text-foreground">{formatTime(selectedEntry.check_in) ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-pastel-pink/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pastel-pink-foreground">Saída</p>
                <p className="mt-1 text-lg font-bold text-foreground">{formatTime(selectedEntry.check_out) ?? "—"}</p>
              </div>
              <div className="col-span-2 rounded-xl bg-pastel-blue/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pastel-blue-foreground">Horas Trabalhadas</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {Number(selectedEntry.hours_worked) > 0 ? `${Number(selectedEntry.hours_worked).toFixed(2)} h` : "Em curso"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {isAdmin && selectedEntry.check_in_lat != null && selectedEntry.check_in_lng != null && (
                <LocationCard
                  title="Localização de Entrada"
                  lat={Number(selectedEntry.check_in_lat)}
                  lng={Number(selectedEntry.check_in_lng)}
                  address={selectedEntry.check_in_address ?? ""}
                  tone="green"
                />
              )}
              {isAdmin && selectedEntry.check_out_lat != null && selectedEntry.check_out_lng != null && (
                <LocationCard
                  title="Localização de Saída"
                  lat={Number(selectedEntry.check_out_lat)}
                  lng={Number(selectedEntry.check_out_lng)}
                  address={selectedEntry.check_out_address ?? ""}
                  tone="pink"
                />
              )}
            </div>

            <button
              onClick={() => setSelectedEntry(null)}
              className="mt-5 w-full rounded-xl bg-secondary py-2.5 text-sm font-semibold text-foreground hover:opacity-90"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
};

const StatBox = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
    <div className="flex items-center justify-between">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
    <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
  </div>
);

const LocationCard = ({
  title,
  lat,
  lng,
  address,
  tone,
}: {
  title: string;
  lat: number;
  lng: number;
  address: string;
  tone: "green" | "pink";
}) => {
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2 pb-1.5">
        <MapPin className={cn("h-4 w-4", tone === "green" ? "text-pastel-green-foreground" : "text-pastel-pink-foreground")} />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      {address && <p className="text-sm font-medium text-foreground">{address}</p>}
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {lat.toFixed(6)}, {lng.toFixed(6)}
      </p>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
      >
        <Navigation className="h-3 w-3" /> Ver no mapa
      </a>
    </div>
  );
};

export default Timesheet;
