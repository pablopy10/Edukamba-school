import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Filter, Plus, MoreHorizontal, Mail, Phone, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

type Teacher = {
  id: string;
  name: string;
  email: string;
  teacherId: string;
  subject: string;
  hireDate: string;
  phone: string;
  initials: string;
  avatarColor: "lilac" | "blue" | "yellow" | "green" | "pink";
};

const teachers: Teacher[] = [
  { id: "1", name: "Carla Mendes", email: "cmendes@edukamba.edu", teacherId: "PROF-2016-001", subject: "Matemática", hireDate: "12/03/2016", phone: "(244) 924 101 010", initials: "CM", avatarColor: "pink" },
  { id: "2", name: "Tiago Ferreira", email: "tferreira@edukamba.edu", teacherId: "PROF-2014-002", subject: "Física", hireDate: "01/09/2014", phone: "(244) 924 202 020", initials: "TF", avatarColor: "blue" },
  { id: "3", name: "Helena Costa", email: "hcosta@edukamba.edu", teacherId: "PROF-2017-003", subject: "Português", hireDate: "23/01/2017", phone: "(244) 924 303 030", initials: "HC", avatarColor: "yellow" },
  { id: "4", name: "Rui Pereira", email: "rpereira@edukamba.edu", teacherId: "PROF-2015-004", subject: "Química", hireDate: "10/06/2015", phone: "(244) 924 404 040", initials: "RP", avatarColor: "green" },
  { id: "5", name: "Sofia Almeida", email: "salmeida@edukamba.edu", teacherId: "PROF-2018-005", subject: "Biologia", hireDate: "05/02/2018", phone: "(244) 924 505 050", initials: "SA", avatarColor: "lilac" },
  { id: "6", name: "Bruno Santos", email: "bsantos@edukamba.edu", teacherId: "PROF-2015-006", subject: "História", hireDate: "18/08/2015", phone: "(244) 924 606 060", initials: "BS", avatarColor: "pink" },
  { id: "7", name: "Inês Rocha", email: "irocha@edukamba.edu", teacherId: "PROF-2019-007", subject: "Geografia", hireDate: "14/04/2019", phone: "(244) 924 707 070", initials: "IR", avatarColor: "blue" },
  { id: "8", name: "Pedro Lima", email: "plima@edukamba.edu", teacherId: "PROF-2017-008", subject: "Ed. Física", hireDate: "30/10/2017", phone: "(244) 924 808 080", initials: "PL", avatarColor: "yellow" },
  { id: "9", name: "Marta Dias", email: "mdias@edukamba.edu", teacherId: "PROF-2016-009", subject: "Inglês", hireDate: "07/07/2016", phone: "(244) 924 909 090", initials: "MD", avatarColor: "green" },
  { id: "10", name: "André Nunes", email: "anunes@edukamba.edu", teacherId: "PROF-2019-010", subject: "Informática", hireDate: "21/11/2019", phone: "(244) 924 111 222", initials: "AN", avatarColor: "lilac" },
];

const avatarStyles: Record<Teacher["avatarColor"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const Professores = () => {
  const [selected, setSelected] = useState<string[]>(["2", "3"]);
  const [search, setSearch] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = selected.length === teachers.length;
  const toggleAll = () => setSelected(allSelected ? [] : teachers.map((t) => t.id));

  const filtered = teachers.filter((t) =>
    [t.name, t.email, t.teacherId, t.subject].some((f) => f.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Professores</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão e acompanhe todos os professores da escola.</p>
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
              Novo Professor
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Professores", value: "184", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Professores Activos", value: "172", color: "bg-pastel-green text-pastel-green-foreground" },
            { label: "Novos este mês", value: "6", color: "bg-pastel-yellow text-pastel-yellow-foreground" },
            { label: "Inactivos", value: "12", color: "bg-pastel-pink text-pastel-pink-foreground" },
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
            <h2 className="text-lg font-bold text-foreground">Lista de Professores</h2>
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
                  <th className="py-4 pr-4 font-semibold">Nome do Professor</th>
                  <th className="py-4 pr-4 font-semibold">ID Professor</th>
                  <th className="py-4 pr-4 font-semibold">Disciplina</th>
                  <th className="py-4 pr-4 font-semibold">Data Admissão</th>
                  <th className="py-4 pr-4 font-semibold">Telefone</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const isSelected = selected.includes(t.id);
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(t.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[t.avatarColor])}>
                            {t.initials}
                          </div>
                          <div>
                            <Link to={`/professores/${t.id}`} className="font-semibold text-foreground transition-colors hover:text-pastel-blue-foreground hover:underline">
                              {t.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{t.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{t.teacherId}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{t.subject}</span>
                      </td>
                      <td className="py-4 pr-4 text-muted-foreground">{t.hireDate}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{t.phone}</span>
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
              A mostrar 1–{filtered.length} de {teachers.length} professores
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

export default Professores;
