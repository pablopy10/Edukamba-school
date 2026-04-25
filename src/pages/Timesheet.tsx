import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Search,
  Filter,
  Clock,
  MapPin,
  LogIn,
  LogOut,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Users,
  CalendarDays,
  Navigation,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EntryStatus = "completo" | "em_curso" | "incompleto";

type TimeEntry = {
  id: string;
  employeeName: string;
  role: string;
  date: string; // yyyy-mm-dd
  checkIn: string | null; // HH:mm
  checkOut: string | null;
  hoursWorked: number;
  status: EntryStatus;
  checkInLocation: { lat: number; lng: number; address: string } | null;
  checkOutLocation: { lat: number; lng: number; address: string } | null;
};

const employees = [
  { name: "Mariana Costa", role: "Professora" },
  { name: "Ricardo Alves", role: "Professor" },
  { name: "Helena Rodrigues", role: "Professora" },
  { name: "André Ferreira", role: "Coordenador TIC" },
  { name: "Teresa Pinto", role: "Bibliotecária" },
  { name: "Vasco Lima", role: "Professor" },
  { name: "Sandra Moreira", role: "Auxiliar" },
];

const initialEntries: TimeEntry[] = [
  {
    id: "t1",
    employeeName: "Mariana Costa",
    role: "Professora",
    date: "2026-04-25",
    checkIn: "07:55",
    checkOut: "16:10",
    hoursWorked: 8.25,
    status: "completo",
    checkInLocation: { lat: -8.8390, lng: 13.2894, address: "Escola EduKamba — Entrada Principal" },
    checkOutLocation: { lat: -8.8392, lng: 13.2896, address: "Escola EduKamba — Portão Sul" },
  },
  {
    id: "t2",
    employeeName: "Ricardo Alves",
    role: "Professor",
    date: "2026-04-25",
    checkIn: "08:02",
    checkOut: "15:45",
    hoursWorked: 7.72,
    status: "completo",
    checkInLocation: { lat: -8.8391, lng: 13.2895, address: "Escola EduKamba — Pavilhão" },
    checkOutLocation: { lat: -8.8391, lng: 13.2895, address: "Escola EduKamba — Pavilhão" },
  },
  {
    id: "t3",
    employeeName: "Helena Rodrigues",
    role: "Professora",
    date: "2026-04-25",
    checkIn: "08:15",
    checkOut: null,
    hoursWorked: 0,
    status: "em_curso",
    checkInLocation: { lat: -8.8389, lng: 13.2893, address: "Escola EduKamba — Sala de Artes" },
    checkOutLocation: null,
  },
  {
    id: "t4",
    employeeName: "André Ferreira",
    role: "Coordenador TIC",
    date: "2026-04-25",
    checkIn: "07:48",
    checkOut: "17:00",
    hoursWorked: 9.2,
    status: "completo",
    checkInLocation: { lat: -8.8390, lng: 13.2894, address: "Escola EduKamba — Lab. TIC" },
    checkOutLocation: { lat: -8.8390, lng: 13.2894, address: "Escola EduKamba — Lab. TIC" },
  },
  {
    id: "t5",
    employeeName: "Teresa Pinto",
    role: "Bibliotecária",
    date: "2026-04-24",
    checkIn: "08:30",
    checkOut: "13:00",
    hoursWorked: 4.5,
    status: "incompleto",
    checkInLocation: { lat: -8.8388, lng: 13.2892, address: "Escola EduKamba — Biblioteca" },
    checkOutLocation: { lat: -8.8388, lng: 13.2892, address: "Escola EduKamba — Biblioteca" },
  },
  {
    id: "t6",
    employeeName: "Vasco Lima",
    role: "Professor",
    date: "2026-04-24",
    checkIn: "08:05",
    checkOut: "16:20",
    hoursWorked: 8.25,
    status: "completo",
    checkInLocation: { lat: -8.8390, lng: 13.2894, address: "Escola EduKamba — Auditório" },
    checkOutLocation: { lat: -8.8390, lng: 13.2894, address: "Escola EduKamba — Auditório" },
  },
  {
    id: "t7",
    employeeName: "Sandra Moreira",
    role: "Auxiliar",
    date: "2026-04-25",
    checkIn: "07:30",
    checkOut: null,
    hoursWorked: 0,
    status: "em_curso",
    checkInLocation: { lat: -8.8391, lng: 13.2895, address: "Escola EduKamba — Receção" },
    checkOutLocation: null,
  },
];

const statusMeta: Record<EntryStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  completo: { label: "Completo", color: "bg-pastel-green text-pastel-green-foreground", icon: CheckCircle2 },
  em_curso: { label: "Em Curso", color: "bg-pastel-blue text-pastel-blue-foreground", icon: Loader2 },
  incompleto: { label: "Incompleto", color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: AlertCircle },
};

const Timesheet = () => {
  const [entries, setEntries] = useState<TimeEntry[]>(initialEntries);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EntryStatus | "todos">("todos");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [selectedEntry, setSelectedEntry] = useState<TimeEntry | null>(null);
  const [registering, setRegistering] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(employees[0].name);
  const [registerType, setRegisterType] = useState<"in" | "out">("in");
  const [gpsStatus, setGpsStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchSearch =
        !search ||
        e.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        e.role.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "todos" || e.status === statusFilter;
      const matchDate = !dateFilter || e.date === dateFilter;
      return matchSearch && matchStatus && matchDate;
    });
  }, [entries, search, statusFilter, dateFilter]);

  const stats = useMemo(() => {
    const totalHours = entries.reduce((s, e) => s + e.hoursWorked, 0);
    const today = new Date().toISOString().split("T")[0];
    const todayEntries = entries.filter((e) => e.date === "2026-04-25" || e.date === today);
    const inProgress = entries.filter((e) => e.status === "em_curso").length;
    const completed = entries.filter((e) => e.status === "completo").length;
    return { totalHours, todayCount: todayEntries.length, inProgress, completed };
  }, [entries]);

  const captureGps = () => {
    setGpsStatus("loading");
    if (!navigator.geolocation) {
      // fallback mock
      setTimeout(() => {
        setCurrentCoords({ lat: -8.8390, lng: 13.2894 });
        setGpsStatus("success");
      }, 800);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("success");
      },
      () => {
        // permission denied — fallback
        setCurrentCoords({ lat: -8.8390, lng: 13.2894 });
        setGpsStatus("success");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submitRegister = () => {
    if (!currentCoords) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const date = now.toISOString().split("T")[0];
    const employee = employees.find((e) => e.name === selectedEmployee)!;
    const location = {
      lat: currentCoords.lat,
      lng: currentCoords.lng,
      address: "Localização capturada via GPS",
    };

    if (registerType === "in") {
      const newEntry: TimeEntry = {
        id: `t${Date.now()}`,
        employeeName: employee.name,
        role: employee.role,
        date,
        checkIn: time,
        checkOut: null,
        hoursWorked: 0,
        status: "em_curso",
        checkInLocation: location,
        checkOutLocation: null,
      };
      setEntries((prev) => [newEntry, ...prev]);
    } else {
      setEntries((prev) =>
        prev.map((e) => {
          if (e.employeeName === employee.name && e.status === "em_curso" && e.checkIn) {
            const [hIn, mIn] = e.checkIn.split(":").map(Number);
            const minutes = now.getHours() * 60 + now.getMinutes() - (hIn * 60 + mIn);
            const hours = Math.max(0, minutes / 60);
            return {
              ...e,
              checkOut: time,
              checkOutLocation: location,
              hoursWorked: Math.round(hours * 100) / 100,
              status: hours >= 6 ? "completo" : "incompleto",
            };
          }
          return e;
        }),
      );
    }

    setRegistering(false);
    setGpsStatus("idle");
    setCurrentCoords(null);
  };

  const exportCsv = () => {
    const header = "Funcionário;Função;Data;Entrada;Saída;Horas;Status;Lat Entrada;Lng Entrada;Lat Saída;Lng Saída\n";
    const rows = filtered
      .map((e) =>
        [
          e.employeeName,
          e.role,
          e.date,
          e.checkIn ?? "",
          e.checkOut ?? "",
          e.hoursWorked,
          statusMeta[e.status].label,
          e.checkInLocation?.lat ?? "",
          e.checkInLocation?.lng ?? "",
          e.checkOutLocation?.lat ?? "",
          e.checkOutLocation?.lng ?? "",
        ].join(";"),
      )
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
    <DashboardLayout>
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
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
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
                  <th className="px-4 py-3 text-left font-semibold">Localização</th>
                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const meta = statusMeta[e.status];
                  const Icon = meta.icon;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelectedEntry(e)}
                      className="cursor-pointer border-t border-border hover:bg-muted/40 transition-[var(--transition-smooth)]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-pastel-lilac text-pastel-lilac-foreground text-xs font-bold">
                            {e.employeeName
                              .split(" ")
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join("")}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{e.employeeName}</p>
                            <p className="text-xs text-muted-foreground">{e.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">{e.date}</td>
                      <td className="px-4 py-3">
                        {e.checkIn ? (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <LogIn className="h-3.5 w-3.5 text-pastel-green-foreground" />
                            {e.checkIn}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {e.checkOut ? (
                          <span className="inline-flex items-center gap-1 font-medium text-foreground">
                            <LogOut className="h-3.5 w-3.5 text-pastel-pink-foreground" />
                            {e.checkOut}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {e.hoursWorked > 0 ? `${e.hoursWorked.toFixed(2)}h` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {e.checkInLocation ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            {e.checkInLocation.lat.toFixed(4)}, {e.checkInLocation.lng.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", meta.color)}>
                          <Icon className={cn("h-3 w-3", e.status === "em_curso" && "animate-spin")} />
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
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
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {employees.map((e) => (
                    <option key={e.name} value={e.name}>
                      {e.name} — {e.role}
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
                  className="flex-1 rounded-xl bg-secondary py-2.5 text-sm font-semibold text-foreground hover:opacity-90"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitRegister}
                  disabled={!currentCoords}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
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
                {selectedEntry.employeeName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-foreground">{selectedEntry.employeeName}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedEntry.role} · {selectedEntry.date}
                </p>
              </div>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", statusMeta[selectedEntry.status].color)}>
                {statusMeta[selectedEntry.status].label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pb-4">
              <div className="rounded-xl bg-pastel-green/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pastel-green-foreground">Entrada</p>
                <p className="mt-1 text-lg font-bold text-foreground">{selectedEntry.checkIn ?? "—"}</p>
              </div>
              <div className="rounded-xl bg-pastel-pink/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pastel-pink-foreground">Saída</p>
                <p className="mt-1 text-lg font-bold text-foreground">{selectedEntry.checkOut ?? "—"}</p>
              </div>
              <div className="col-span-2 rounded-xl bg-pastel-blue/30 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-pastel-blue-foreground">Horas Trabalhadas</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {selectedEntry.hoursWorked > 0 ? `${selectedEntry.hoursWorked.toFixed(2)} h` : "Em curso"}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {selectedEntry.checkInLocation && (
                <LocationCard title="Localização de Entrada" location={selectedEntry.checkInLocation} tone="green" />
              )}
              {selectedEntry.checkOutLocation && (
                <LocationCard title="Localização de Saída" location={selectedEntry.checkOutLocation} tone="pink" />
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
    </DashboardLayout>
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
  location,
  tone,
}: {
  title: string;
  location: { lat: number; lng: number; address: string };
  tone: "green" | "pink";
}) => {
  const mapsUrl = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center gap-2 pb-1.5">
        <MapPin className={cn("h-4 w-4", tone === "green" ? "text-pastel-green-foreground" : "text-pastel-pink-foreground")} />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <p className="text-sm font-medium text-foreground">{location.address}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
        {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
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
