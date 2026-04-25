import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Search, Filter, Plus, MoreHorizontal, Mail, Phone, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Relationship = "Pai" | "Mãe" | "Tio(a)" | "Tutor(a)" | "Avô/Avó";

type Guardian = {
  id: string;
  name: string;
  email: string;
  guardianId: string;
  student: string;
  studentClass: string;
  relationship: Relationship;
  occupation: string;
  phone: string;
  initials: string;
  avatarColor: "lilac" | "blue" | "yellow" | "green" | "pink";
};

const guardians: Guardian[] = [
  { id: "1", name: "João Miller", email: "jmiller@gmail.com", guardianId: "EDU-2025-001", student: "Sara Miller", studentClass: "10º A", relationship: "Pai", occupation: "Engenheiro", phone: "(244) 925 101 010", initials: "JM", avatarColor: "blue" },
  { id: "2", name: "Patrícia Brown", email: "pbrown@gmail.com", guardianId: "EDU-2025-002", student: "Ethan Brown", studentClass: "12º B", relationship: "Mãe", occupation: "Médica", phone: "(244) 925 202 020", initials: "PB", avatarColor: "pink" },
  { id: "3", name: "Ricardo Smith", email: "rsmith@gmail.com", guardianId: "EDU-2025-003", student: "Olivia Smith", studentClass: "9º B", relationship: "Pai", occupation: "Advogado", phone: "(244) 925 303 030", initials: "RS", avatarColor: "yellow" },
  { id: "4", name: "Fátima Johnson", email: "fjohnson@gmail.com", guardianId: "EDU-2025-004", student: "Lucas Johnson", studentClass: "11º A", relationship: "Mãe", occupation: "Professora", phone: "(244) 925 404 040", initials: "FJ", avatarColor: "green" },
  { id: "5", name: "Hugo Williams", email: "hwilliams@gmail.com", guardianId: "EDU-2025-005", student: "Mia Williams", studentClass: "8º B", relationship: "Tutor(a)", occupation: "Empresário", phone: "(244) 925 505 050", initials: "HW", avatarColor: "lilac" },
  { id: "6", name: "Carla Davis", email: "cdavis@gmail.com", guardianId: "EDU-2025-006", student: "Noah Davis", studentClass: "9º C", relationship: "Mãe", occupation: "Contabilista", phone: "(244) 925 606 060", initials: "CD", avatarColor: "pink" },
  { id: "7", name: "Manuel Wilson", email: "mwilson@gmail.com", guardianId: "EDU-2025-007", student: "Emma Wilson", studentClass: "7º C", relationship: "Pai", occupation: "Arquitecto", phone: "(244) 925 707 070", initials: "MW", avatarColor: "blue" },
  { id: "8", name: "Luísa Thompson", email: "lthompson@gmail.com", guardianId: "EDU-2025-008", student: "Liam Thompson", studentClass: "10º B", relationship: "Avô/Avó", occupation: "Reformada", phone: "(244) 925 808 080", initials: "LT", avatarColor: "yellow" },
  { id: "9", name: "Carlos Garcia", email: "cgarcia@gmail.com", guardianId: "EDU-2025-009", student: "Ava Garcia", studentClass: "11º A", relationship: "Tio(a)", occupation: "Comerciante", phone: "(244) 925 909 090", initials: "CG", avatarColor: "green" },
  { id: "10", name: "Beatriz Silva", email: "bsilva@gmail.com", guardianId: "EDU-2025-010", student: "Mateus Silva", studentClass: "7º B", relationship: "Mãe", occupation: "Enfermeira", phone: "(244) 925 111 222", initials: "BS", avatarColor: "lilac" },
];

const avatarStyles: Record<Guardian["avatarColor"], string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

const relationshipStyles: Record<Relationship, string> = {
  Pai: "bg-pastel-blue text-pastel-blue-foreground",
  Mãe: "bg-pastel-pink text-pastel-pink-foreground",
  "Tio(a)": "bg-pastel-yellow text-pastel-yellow-foreground",
  "Tutor(a)": "bg-pastel-lilac text-pastel-lilac-foreground",
  "Avô/Avó": "bg-pastel-green text-pastel-green-foreground",
};

const Educadores = () => {
  const [selected, setSelected] = useState<string[]>(["2"]);
  const [search, setSearch] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const allSelected = selected.length === guardians.length;
  const toggleAll = () => setSelected(allSelected ? [] : guardians.map((g) => g.id));

  const filtered = guardians.filter((g) =>
    [g.name, g.email, g.guardianId, g.student, g.studentClass].some((f) =>
      f.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Educadores</h1>
            <p className="text-sm text-muted-foreground">Faça a gestão dos encarregados de educação dos alunos.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Pesquisar educador..."
                className="h-11 w-72 rounded-full border border-border bg-card pl-11 pr-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
              <Filter className="h-4 w-4" strokeWidth={1.75} />
              Filtrar
            </button>
            <button className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
              <Plus className="h-4 w-4" strokeWidth={2.25} />
              Novo Educador
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total de Educadores", value: "1.142", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Pais", value: "486", color: "bg-pastel-blue text-pastel-blue-foreground" },
            { label: "Mães", value: "562", color: "bg-pastel-pink text-pastel-pink-foreground" },
            { label: "Outros Tutores", value: "94", color: "bg-pastel-lilac text-pastel-lilac-foreground" },
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
            <h2 className="text-lg font-bold text-foreground">Lista de Educadores</h2>
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
                  <th className="py-4 pr-4 font-semibold">Nome do Educador</th>
                  <th className="py-4 pr-4 font-semibold">ID</th>
                  <th className="py-4 pr-4 font-semibold">Aluno</th>
                  <th className="py-4 pr-4 font-semibold">Turma</th>
                  <th className="py-4 pr-4 font-semibold">Relação</th>
                  <th className="py-4 pr-4 font-semibold">Telefone</th>
                  <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const isSelected = selected.includes(g.id);
                  return (
                    <tr
                      key={g.id}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors",
                        isSelected ? "bg-pastel-blue/15" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="py-4 pl-5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(g.id)}
                          className="h-4 w-4 cursor-pointer rounded border-border accent-pastel-blue-foreground"
                        />
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold", avatarStyles[g.avatarColor])}>
                            {g.initials}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{g.name}</p>
                            <p className="text-xs text-muted-foreground">{g.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{g.guardianId}</td>
                      <td className="py-4 pr-4 text-foreground">{g.student}</td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{g.studentClass}</span>
                      </td>
                      <td className="py-4 pr-4">
                        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", relationshipStyles[g.relationship])}>
                          {g.relationship}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{g.phone}</span>
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

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-5 sm:flex-row">
            <p className="text-xs text-muted-foreground">
              A mostrar 1–{filtered.length} de {guardians.length} educadores
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

export default Educadores;
