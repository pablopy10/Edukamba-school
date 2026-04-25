import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Users,
  Receipt,
  GraduationCap,
  ClipboardList,
  UserCheck,
  BookOpen,
  Download,
  Filter,
  Search,
  FileSpreadsheet,
  FileText,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type ReportKey = "alunos" | "matriculas" | "notas" | "testes" | "presencas" | "cursos";

type ReportMeta = {
  key: ReportKey;
  label: string;
  description: string;
  icon: typeof Users;
  color: string;
};

const reports: ReportMeta[] = [
  {
    key: "alunos",
    label: "Alunos",
    description: "Lista completa de alunos matriculados",
    icon: Users,
    color: "bg-pastel-blue text-pastel-blue-foreground",
  },
  {
    key: "matriculas",
    label: "Matrículas",
    description: "Histórico de matrículas e renovações",
    icon: Receipt,
    color: "bg-pastel-lilac text-pastel-lilac-foreground",
  },
  {
    key: "notas",
    label: "Notas",
    description: "Pautas e médias por disciplina",
    icon: GraduationCap,
    color: "bg-pastel-yellow text-pastel-yellow-foreground",
  },
  {
    key: "testes",
    label: "Testes",
    description: "Resultados de testes e avaliações",
    icon: ClipboardList,
    color: "bg-pastel-pink text-pastel-pink-foreground",
  },
  {
    key: "presencas",
    label: "Presenças",
    description: "Registo de presenças e faltas",
    icon: UserCheck,
    color: "bg-pastel-green text-pastel-green-foreground",
  },
  {
    key: "cursos",
    label: "Cursos",
    description: "Cursos, turmas e ocupação",
    icon: BookOpen,
    color: "bg-pastel-blue text-pastel-blue-foreground",
  },
];

// --- Mock data per report ---

const alunosData = [
  { nome: "Maria Silva", turma: "10ºA", curso: "Ciências", idade: 16, encarregado: "João Silva", estado: "Ativo" },
  { nome: "Pedro Santos", turma: "11ºB", curso: "Humanidades", idade: 17, encarregado: "Ana Santos", estado: "Ativo" },
  { nome: "Ana Costa", turma: "12ºC", curso: "Artes", idade: 18, encarregado: "Rui Costa", estado: "Ativo" },
  { nome: "Tiago Mendes", turma: "10ºA", curso: "Ciências", idade: 16, encarregado: "Marta Mendes", estado: "Inativo" },
  { nome: "Sofia Lopes", turma: "11ºB", curso: "Humanidades", idade: 17, encarregado: "Paulo Lopes", estado: "Ativo" },
];

const matriculasData = [
  { aluno: "Maria Silva", curso: "Ciências", anoLetivo: "2024/25", data: "2024-09-01", valor: "85.000 Kz", estado: "Paga" },
  { aluno: "Pedro Santos", curso: "Humanidades", anoLetivo: "2024/25", data: "2024-09-03", valor: "85.000 Kz", estado: "Paga" },
  { aluno: "Ana Costa", curso: "Artes", anoLetivo: "2024/25", data: "2024-09-05", valor: "90.000 Kz", estado: "Pendente" },
  { aluno: "Sofia Lopes", curso: "Humanidades", anoLetivo: "2024/25", data: "2024-09-07", valor: "85.000 Kz", estado: "Paga" },
];

const notasData = [
  { aluno: "Maria Silva", turma: "10ºA", disciplina: "Matemática", trimestre: "1º", nota: 16, estado: "Aprovado" },
  { aluno: "Pedro Santos", turma: "11ºB", disciplina: "Português", trimestre: "1º", nota: 14, estado: "Aprovado" },
  { aluno: "Ana Costa", turma: "12ºC", disciplina: "História", trimestre: "1º", nota: 18, estado: "Aprovado" },
  { aluno: "Tiago Mendes", turma: "10ºA", disciplina: "Matemática", trimestre: "1º", nota: 8, estado: "Reprovado" },
  { aluno: "Sofia Lopes", turma: "11ºB", disciplina: "Filosofia", trimestre: "1º", nota: 13, estado: "Aprovado" },
];

const testesData = [
  { titulo: "Teste Funções", disciplina: "Matemática", turma: "10ºA", data: "2025-04-10", media: 13.5, aprovados: "82%" },
  { titulo: "Exame Português", disciplina: "Português", turma: "11ºB", data: "2025-04-12", media: 14.2, aprovados: "88%" },
  { titulo: "Trabalho Grupo", disciplina: "História", turma: "12ºC", data: "2025-04-15", media: 16.0, aprovados: "95%" },
  { titulo: "Oral Filosofia", disciplina: "Filosofia", turma: "11ºB", data: "2025-04-18", media: 12.8, aprovados: "76%" },
];

const presencasData = [
  { aluno: "Maria Silva", turma: "10ºA", presencas: 58, faltas: 2, atrasos: 1, percent: "96%" },
  { aluno: "Pedro Santos", turma: "11ºB", presencas: 55, faltas: 5, atrasos: 0, percent: "92%" },
  { aluno: "Ana Costa", turma: "12ºC", presencas: 60, faltas: 0, atrasos: 0, percent: "100%" },
  { aluno: "Tiago Mendes", turma: "10ºA", presencas: 45, faltas: 12, atrasos: 3, percent: "75%" },
  { aluno: "Sofia Lopes", turma: "11ºB", presencas: 57, faltas: 3, atrasos: 0, percent: "95%" },
];

const cursosData = [
  { nome: "Ciências", turmas: 4, alunos: 92, professores: 12, ocupacao: "85%" },
  { nome: "Humanidades", turmas: 3, alunos: 70, professores: 9, ocupacao: "78%" },
  { nome: "Artes", turmas: 2, alunos: 38, professores: 6, ocupacao: "62%" },
  { nome: "Tecnologias", turmas: 3, alunos: 65, professores: 8, ocupacao: "72%" },
];

const turmasOptions = ["Todas", "10ºA", "11ºB", "12ºC"];
const cursosOptions = ["Todos", "Ciências", "Humanidades", "Artes", "Tecnologias"];
const estadoOptions = ["Todos", "Ativo", "Inativo", "Paga", "Pendente", "Aprovado", "Reprovado"];

const Relatorios = () => {
  const [active, setActive] = useState<ReportKey>("alunos");
  const [search, setSearch] = useState("");
  const [turma, setTurma] = useState("Todas");
  const [curso, setCurso] = useState("Todos");
  const [estado, setEstado] = useState("Todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const meta = reports.find((r) => r.key === active)!;

  const { columns, rows } = useMemo(() => {
    const matchSearch = (row: Record<string, unknown>) => {
      if (!search.trim()) return true;
      return Object.values(row).some((v) => String(v).toLowerCase().includes(search.toLowerCase()));
    };
    const matchTurma = (v: string) => turma === "Todas" || v === turma;
    const matchCurso = (v: string) => curso === "Todos" || v === curso;
    const matchEstado = (v: string) => estado === "Todos" || v === estado;
    const matchDate = (d: string) => {
      if (!dataInicio && !dataFim) return true;
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    };

    switch (active) {
      case "alunos":
        return {
          columns: ["Nome", "Turma", "Curso", "Idade", "Encarregado", "Estado"],
          rows: alunosData
            .filter((r) => matchTurma(r.turma) && matchCurso(r.curso) && matchEstado(r.estado) && matchSearch(r))
            .map((r) => [r.nome, r.turma, r.curso, r.idade, r.encarregado, r.estado]),
        };
      case "matriculas":
        return {
          columns: ["Aluno", "Curso", "Ano Letivo", "Data", "Valor", "Estado"],
          rows: matriculasData
            .filter((r) => matchCurso(r.curso) && matchEstado(r.estado) && matchDate(r.data) && matchSearch(r))
            .map((r) => [r.aluno, r.curso, r.anoLetivo, r.data, r.valor, r.estado]),
        };
      case "notas":
        return {
          columns: ["Aluno", "Turma", "Disciplina", "Trimestre", "Nota", "Estado"],
          rows: notasData
            .filter((r) => matchTurma(r.turma) && matchEstado(r.estado) && matchSearch(r))
            .map((r) => [r.aluno, r.turma, r.disciplina, r.trimestre, r.nota, r.estado]),
        };
      case "testes":
        return {
          columns: ["Título", "Disciplina", "Turma", "Data", "Média", "Aprovados"],
          rows: testesData
            .filter((r) => matchTurma(r.turma) && matchDate(r.data) && matchSearch(r))
            .map((r) => [r.titulo, r.disciplina, r.turma, r.data, r.media, r.aprovados]),
        };
      case "presencas":
        return {
          columns: ["Aluno", "Turma", "Presenças", "Faltas", "Atrasos", "% Presença"],
          rows: presencasData
            .filter((r) => matchTurma(r.turma) && matchSearch(r))
            .map((r) => [r.aluno, r.turma, r.presencas, r.faltas, r.atrasos, r.percent]),
        };
      case "cursos":
        return {
          columns: ["Nome", "Turmas", "Alunos", "Professores", "Ocupação"],
          rows: cursosData
            .filter((r) => matchCurso(r.nome) && matchSearch(r))
            .map((r) => [r.nome, r.turmas, r.alunos, r.professores, r.ocupacao]),
        };
    }
  }, [active, search, turma, curso, estado, dataInicio, dataFim]);

  const exportCSV = () => {
    const header = columns.join(",");
    const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${active}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Relatório exportado", description: `${meta.label} • ${rows.length} registos` });
  };

  const exportPDF = () => {
    toast({ title: "A preparar PDF", description: `${meta.label} • ${rows.length} registos` });
  };

  const showTurma = ["alunos", "notas", "testes", "presencas"].includes(active);
  const showCurso = ["alunos", "matriculas", "cursos"].includes(active);
  const showEstado = ["alunos", "matriculas", "notas"].includes(active);
  const showDate = ["matriculas", "testes"].includes(active);

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Extraia listas detalhadas com filtros personalizados</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPDF}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-[var(--transition-smooth)]"
          >
            <FileText className="h-4 w-4" /> PDF
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90 transition-[var(--transition-smooth)]"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Report selector cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {reports.map((r) => {
          const Icon = r.icon;
          const isActive = active === r.key;
          return (
            <button
              key={r.key}
              onClick={() => setActive(r.key)}
              className={cn(
                "group flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-[var(--transition-smooth)]",
                isActive
                  ? "border-primary bg-card shadow-card ring-2 ring-primary/20"
                  : "border-border bg-card hover:border-primary/40 hover:shadow-soft",
              )}
            >
              <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl", r.color)}>
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">{r.label}</p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{r.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Filter className="h-4 w-4 text-muted-foreground" /> Filtros
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {showTurma && (
            <select
              value={turma}
              onChange={(e) => setTurma(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {turmasOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}

          {showCurso && (
            <select
              value={curso}
              onChange={(e) => setCurso(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {cursosOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}

          {showEstado && (
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {estadoOptions.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}

          {showDate && (
            <>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Result table */}
      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", meta.color)}>
              <meta.icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Relatório de {meta.label}</h2>
              <p className="text-xs text-muted-foreground">{rows.length} registos encontrados</p>
            </div>
          </div>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-[var(--transition-smooth)]"
          >
            <Download className="h-3.5 w-3.5" /> Descarregar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {columns.map((c) => (
                  <th key={c} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-muted-foreground">
                    Sem resultados para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className="px-5 py-3 text-foreground">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Relatorios;