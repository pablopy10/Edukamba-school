import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Filter, Plus, MoreHorizontal, FileText, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type EnrollmentStatus = "Confirmada" | "Pendente" | "Cancelada";

type Enrollment = {
  id: string;
  studentName: string;
  studentEmail: string;
  enrollmentId: string;
  course: string;
  class: string;
  date: string;
  status: EnrollmentStatus;
  initials: string;
  avatarColor: "lilac" | "blue" | "yellow" | "green" | "pink";
};

const enrollments: Enrollment[] = [
  { id: "1", studentName: "Sara Miller", studentEmail: "smiller@edukamba.edu", enrollmentId: "MAT-2025-001", course: "Ciências", class: "10A", date: "05/09/2025", status: "Confirmada", initials: "SM", avatarColor: "pink" },
  { id: "2", studentName: "Ethan Brown", studentEmail: "ebrown@edukamba.edu", enrollmentId: "MAT-2025-002", course: "Letras", class: "12", date: "06/09/2025", status: "Pendente", initials: "EB", avatarColor: "blue" },
  { id: "3", studentName: "Olivia Smith", studentEmail: "osmith@edukamba.edu", enrollmentId: "MAT-2025-003", course: "Económicas", class: "9B", date: "06/09/2025", status: "Confirmada", initials: "OS", avatarColor: "yellow" },
  { id: "4", studentName: "Lucas Johnson", studentEmail: "ljohnson@edukamba.edu", enrollmentId: "MAT-2025-004", course: "Ciências", class: "11A", date: "07/09/2025", status: "Cancelada", initials: "LJ", avatarColor: "green" },
  { id: "5", studentName: "Mia Williams", studentEmail: "mwilliams@edukamba.edu", enrollmentId: "MAT-2025-005", course: "Artes", class: "8B", date: "08/09/2025", status: "Confirmada", initials: "MW", avatarColor: "lilac" },
  { id: "6", studentName: "Noah Davis", studentEmail: "ndavis@edukamba.edu", enrollmentId: "MAT-2025-006", course: "Letras", class: "9C", date: "09/09/2025", status: "Pendente", initials: "ND", avatarColor: "pink" },
  { id: "7", studentName: "Emma Wilson", studentEmail: "ewilson@edukamba.edu", enrollmentId: "MAT-2025-007", course: "Ciências", class: "7C", date: "10/09/2025", status: "Confirmada", initials: "EW", avatarColor: "blue" },
  { id: "8", studentName: "Liam Thompson", studentEmail: "lthomps@edukamba.edu", enrollmentId: "MAT-2025-008", course: "Económicas", class: "10B", date: "11/09/2025", status: "Confirmada", initials: "LT", avatarColor: "yellow" },
  { id: "9", studentName: "Ava Garcia", studentEmail: "agarcia@edukamba.edu", enrollmentId: "MAT-2025-009", course: "Artes", class: "11A", date: "12/09/2025", status: "Pendente", initials: "AG", avatarColor: "green" },
  { id: "10", studentName: "Mateus Silva", studentEmail: "msilva@edukamba.edu", enrollmentId: "MAT-2025-010", course: "Ciências", class: "7B", date: "13/09/2025", status: "Confirmada", initials: "MS", avatarColor: "lilac" },
];

const avatarStyles: Record<Enrollment["avatarColor"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const statusStyles: Record<EnrollmentStatus, string> = {
  Confirmada: "bg-pastel-green text-pastel-green-foreground",
  Pendente: "bg-pastel-yellow text-pastel-yellow-foreground",
  Cancelada: "bg-pastel-pink text-pastel-pink-foreground",
};

const Matriculas = () => {
  const [selected, setSelected] = useState<string[]>(["2"]);
  const [search, setSearch] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = selected.length === enrollments.length;
  const toggleAll = () => setSelected(allSelected ? [] : enrollments.map((e) => e.id));

  const filtered = enrollments.filter((e) =>
    [e.studentName, e.studentEmail, e.enrollmentId, e.course, e.class].some((f) =>
      f.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Matrículas</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão das matrículas dos alunos da escola.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar matrícula..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Nova Matrícula
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Matrículas", value: "1.342", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Confirmadas", value: "1.198", color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Pendentes", value: "98", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Canceladas", value: "46", color: "bg-pastel-pink text-pastel-pink-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">Lista de Matrículas</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionadas</span>
                <button className="rounded-full bg-pastel-pink px-3 py-1.5 text-xs font-medium text-pastel-pink-foreground">
                  Eliminar
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                  <th className="w-12 py-4 pl-5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                    />
                  </th>
                  <th className="py-4 pr-4 font-semibold">Aluno</th>
                  <th className="py-4 pr-4 font-semibold">ID Matrícula</th>
                  <th className="py-4 pr-4 font-semibold">Curso</th>
                  <th className="py-4 pr-4 font-semibold">Turma</th>
                  <th className="py-4 pr-4 font-semibold">Data</th>
                  <th className="py-4 pr-4 font-semibold">Estado</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const isSelected = selected.includes(e.id);
                  return (
                    <tr
                      key={e.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(e.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[e.avatarColor])}>
                            {e.initials}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{e.studentName}</p>
                            <p className="text-xs text-muted-foreground">{e.studentEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{e.enrollmentId}</td>
                      <td className="py-4 pr-4 text-foreground">{e.course}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{e.class}</span>
                      </td>
                      <td className="py-4 pr-4 text-muted-foreground">{e.date}</td>
                      <td className="py-4 pr-4">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium", statusStyles[e.status])}>
                          <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                          {e.status}
                        </span>
                      </td>
                      <td className="py-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button title="Documento" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/40 hover:text-pastel-blue-foreground">
                            <FileText className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button title="Editar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground">
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button title="Eliminar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground">
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button title="Mais" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted">
                            <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              A mostrar 1–{filtered.length} de {enrollments.length} matrículas
            </p>
            <div className="flex items-center gap-2">
              <button className="h-9 rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent">Anterior</button>
              {[1, 2, 3, 4].map((p) => (
                <button
                  key={p}
                  className={cn(
                    "h-9 w-9 rounded-full text-xs font-semibold transition-colors",
                    p === 1
                      ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p}
                </button>
              ))}
              <button className="h-9 rounded-full border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-accent">Seguinte</button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Matriculas;
