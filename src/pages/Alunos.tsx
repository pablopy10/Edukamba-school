import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Filter, Plus, MoreHorizontal, Mail, Phone, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

type Student = {
  id: string;
  name: string;
  email: string;
  studentId: string;
  class: string;
  dob: string;
  phone: string;
  initials: string;
  avatarColor: "lilac" | "blue" | "yellow" | "green" | "pink";
};

const students: Student[] = [
  { id: "1", name: "Sara Miller", email: "smiller@edukamba.edu", studentId: "2016-01-001", class: "10A", dob: "18/04/2008", phone: "(244) 923 101 010", initials: "SM", avatarColor: "pink" },
  { id: "2", name: "Ethan Brown", email: "ebrown@edukamba.edu", studentId: "2014-02-002", class: "12", dob: "22/07/2006", phone: "(244) 923 202 020", initials: "EB", avatarColor: "blue" },
  { id: "3", name: "Olivia Smith", email: "osmith@edukamba.edu", studentId: "2017-03-003", class: "9B", dob: "29/09/2010", phone: "(244) 923 303 030", initials: "OS", avatarColor: "yellow" },
  { id: "4", name: "Lucas Johnson", email: "ljohnson@edukamba.edu", studentId: "2015-01-004", class: "11A", dob: "03/11/2009", phone: "(244) 923 404 040", initials: "LJ", avatarColor: "green" },
  { id: "5", name: "Mia Williams", email: "mwilliams@edukamba.edu", studentId: "2018-02-005", class: "8B", dob: "19/01/2007", phone: "(244) 923 505 050", initials: "MW", avatarColor: "lilac" },
  { id: "6", name: "Noah Davis", email: "ndavis@edukamba.edu", studentId: "2015-03-006", class: "9C", dob: "05/05/2010", phone: "(244) 923 606 060", initials: "ND", avatarColor: "pink" },
  { id: "7", name: "Emma Wilson", email: "ewilson@edukamba.edu", studentId: "2019-01-007", class: "7C", dob: "20/02/2007", phone: "(244) 923 707 070", initials: "EW", avatarColor: "blue" },
  { id: "8", name: "Liam Thompson", email: "lthomps@edukamba.edu", studentId: "2017-02-008", class: "10B", dob: "28/08/2011", phone: "(244) 923 808 080", initials: "LT", avatarColor: "yellow" },
  { id: "9", name: "Ava Garcia", email: "agarcia@edukamba.edu", studentId: "2016-03-009", class: "11A", dob: "15/03/2009", phone: "(244) 923 909 090", initials: "AG", avatarColor: "green" },
  { id: "10", name: "Mateus Silva", email: "msilva@edukamba.edu", studentId: "2019-01-010", class: "7B", dob: "12/12/2008", phone: "(244) 923 111 222", initials: "MS", avatarColor: "lilac" },
];

const avatarStyles: Record<Student["avatarColor"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const Alunos = () => {
  const [selected, setSelected] = useState<string[]>(["2", "3"]);
  const [search, setSearch] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = selected.length === students.length;
  const toggleAll = () => setSelected(allSelected ? [] : students.map((s) => s.id));

  const filtered = students.filter((s) =>
    [s.name, s.email, s.studentId, s.class].some((f) => f.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Alunos</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão e acompanhe todos os alunos da escola.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar por nome..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo Aluno
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Alunos", value: "1.284", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Alunos Activos", value: "1.198", color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Novos este mês", value: "47", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Inactivos", value: "86", color: "bg-pastel-pink text-pastel-pink-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-card p-5 shadow-card">
              <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", stat.color)}>
                {stat.label}
              </span>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="text-lg font-bold text-foreground">Lista de Alunos</h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{selected.length} selecionados</span>
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
                  <th className="py-4 pr-4 font-semibold">Nome do Aluno</th>
                  <th className="py-4 pr-4 font-semibold">ID Aluno</th>
                  <th className="py-4 pr-4 font-semibold">Turma</th>
                  <th className="py-4 pr-4 font-semibold">Data Nasc.</th>
                  <th className="py-4 pr-4 font-semibold">Telefone</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const isSelected = selected.includes(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(s.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[s.avatarColor])}>
                            {s.initials}
                          </div>
                          <div>
                            <Link to={`/alunos/${s.id}`} className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline">
                              {s.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{s.studentId}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{s.class}</span>
                      </td>
                      <td className="py-4 pr-4 text-muted-foreground">{s.dob}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{s.phone}</span>
                      </td>
                      <td className="py-4 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button title="Email" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-blue/40 hover:text-pastel-blue-foreground">
                            <Mail className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button title="Telefone" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pastel-green/40 hover:text-pastel-green-foreground">
                            <Phone className="h-4 w-4" strokeWidth={1.75} />
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

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              A mostrar 1–{filtered.length} de {students.length} alunos
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

export default Alunos;