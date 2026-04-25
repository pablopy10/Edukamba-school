import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { CalendarDays, ChevronDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "present" | "absent" | "none";

type StudentRow = {
  id: string;
  name: string;
  attendance: Status[];
};

const days = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const weekendIdx = new Set<number>([5, 6, 12, 13]); // dias 13, 14, 20, 21 (sáb/dom)

const buildRow = (id: string, name: string, absentDays: number[]): StudentRow => ({
  id,
  name,
  attendance: days.map((d, i) => {
    if (weekendIdx.has(i)) return "none";
    return absentDays.includes(d) ? "absent" : "present";
  }),
});

const students: StudentRow[] = [
  buildRow("1", "Lucas Johnson", [9, 16]),
  buildRow("2", "Emily Peterson", [17]),
  buildRow("3", "Michael Brown", [11, 16]),
  buildRow("4", "Hannah White", [9, 18]),
  buildRow("5", "Oliver Martinez", []),
  buildRow("6", "Isabella Garcia", [12]),
  buildRow("7", "Ethan Lee", [15, 17]),
  buildRow("8", "Sophia Wilson", [8]),
  buildRow("9", "Mason Clark", [10, 19]),
  buildRow("10", "Ava Rodriguez", [11]),
  buildRow("11", "Logan Hall", [16]),
  buildRow("12", "Mia Allen", [9, 12]),
];

const FilterChip = ({ icon: Icon, label }: { icon?: React.ElementType; label: string }) => (
  <button className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
    {Icon && <Icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />}
    {label}
    <ChevronDown className="h-4 w-4 text-muted-foreground" />
  </button>
);

const StatusCell = ({ status }: { status: Status }) => {
  if (status === "none") {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <span
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full text-white shadow-soft",
        status === "present" ? "bg-pastel-blue text-pastel-blue-foreground" : "bg-destructive",
      )}
    >
      {status === "present" ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
};

const Presencas = () => {
  const [month] = useState("Abril 2025");
  const [week] = useState("Semana 2-3");
  const [klass] = useState("Turma 11º A");

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Presenças</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acompanhe a frequência diária dos alunos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FilterChip icon={CalendarDays} label={month} />
            <FilterChip label={week} />
            <FilterChip label={klass} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-pastel-blue p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-blue-foreground/80">Total de Alunos</p>
            <p className="mt-2 text-3xl font-bold text-pastel-blue-foreground">{students.length}</p>
          </div>
          <div className="rounded-2xl bg-pastel-green p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-green-foreground/80">Presenças</p>
            <p className="mt-2 text-3xl font-bold text-pastel-green-foreground">
              {students.reduce((acc, s) => acc + s.attendance.filter((a) => a === "present").length, 0)}
            </p>
          </div>
          <div className="rounded-2xl bg-pastel-pink p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-pink-foreground/80">Faltas</p>
            <p className="mt-2 text-3xl font-bold text-pastel-pink-foreground">
              {students.reduce((acc, s) => acc + s.attendance.filter((a) => a === "absent").length, 0)}
            </p>
          </div>
          <div className="rounded-2xl bg-pastel-yellow p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-pastel-yellow-foreground/80">Taxa Presença</p>
            <p className="mt-2 text-3xl font-bold text-pastel-yellow-foreground">
              {(() => {
                const total = students.reduce((acc, s) => acc + s.attendance.filter((a) => a !== "none").length, 0);
                const present = students.reduce((acc, s) => acc + s.attendance.filter((a) => a === "present").length, 0);
                return total ? Math.round((present / total) * 100) : 0;
              })()}
              %
            </p>
          </div>
        </div>

        {/* Attendance table */}
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-pastel-blue/30">
                  <th className="sticky left-0 z-10 min-w-[200px] bg-pastel-blue/30 px-6 py-4 text-left text-sm font-semibold text-foreground">
                    Nome do Aluno
                  </th>
                  {days.map((d, i) => (
                    <th
                      key={d}
                      className={cn(
                        "px-3 py-4 text-center text-sm font-semibold",
                        weekendIdx.has(i) ? "text-muted-foreground/60" : "text-foreground",
                      )}
                    >
                      {String(d).padStart(2, "0")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-t border-border transition-colors hover:bg-accent/40">
                    <td className="sticky left-0 z-10 bg-card px-6 py-4 text-sm font-medium text-foreground">
                      {s.name}
                    </td>
                    {s.attendance.map((status, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-3 py-4 text-center",
                          weekendIdx.has(i) && "bg-muted/40",
                        )}
                      >
                        <div className="flex justify-center">
                          <StatusCell status={status} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            Presente
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white">
              <X className="h-3.5 w-3.5" strokeWidth={3} />
            </span>
            Falta
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base">—</span>
            Fim de semana / Sem registo
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Presencas;