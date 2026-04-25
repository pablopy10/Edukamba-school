import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  Search,
  Users,
  GraduationCap,
  Receipt,
  BookOpen,
  Presentation,
  CalendarCheck,
  BookMarked,
  FileText,
  MessageSquare,
  Bell,
  ArrowRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ResultType = "aluno" | "professor" | "matricula" | "curso" | "turma" | "evento" | "avaliacao" | "documento" | "mensagem" | "notificacao";

type Result = {
  id: string;
  type: ResultType;
  title: string;
  subtitle: string;
  context: string;
  to: string;
};

const typeMeta: Record<ResultType, { label: string; icon: typeof Search; bg: string; text: string }> = {
  aluno: { label: "Alunos", icon: Users, bg: "bg-pastel-blue", text: "text-pastel-blue-foreground" },
  professor: { label: "Professores", icon: GraduationCap, bg: "bg-pastel-green", text: "text-pastel-green-foreground" },
  matricula: { label: "Matrículas", icon: Receipt, bg: "bg-pastel-yellow", text: "text-pastel-yellow-foreground" },
  curso: { label: "Cursos", icon: BookOpen, bg: "bg-pastel-lilac", text: "text-pastel-lilac-foreground" },
  turma: { label: "Turmas", icon: Presentation, bg: "bg-pastel-pink", text: "text-pastel-pink-foreground" },
  evento: { label: "Eventos", icon: CalendarCheck, bg: "bg-pastel-green", text: "text-pastel-green-foreground" },
  avaliacao: { label: "Avaliações", icon: BookMarked, bg: "bg-pastel-blue", text: "text-pastel-blue-foreground" },
  documento: { label: "Documentos", icon: FileText, bg: "bg-pastel-yellow", text: "text-pastel-yellow-foreground" },
  mensagem: { label: "Mensagens", icon: MessageSquare, bg: "bg-pastel-lilac", text: "text-pastel-lilac-foreground" },
  notificacao: { label: "Notificações", icon: Bell, bg: "bg-pastel-pink", text: "text-pastel-pink-foreground" },
};

const dataset: Result[] = [
  { id: "a1", type: "aluno", title: "Mariana Silva", subtitle: "10.º A · Nº 12", context: "Aluna · Matriculada em 2025/2026", to: "/alunos" },
  { id: "a2", type: "aluno", title: "João Almeida", subtitle: "7.º B · Nº 5", context: "Aluno · Justificação de falta aprovada", to: "/alunos" },
  { id: "a3", type: "aluno", title: "Beatriz Costa", subtitle: "12.º C · Nº 21", context: "Aluna · Encarregada: Helena Costa", to: "/alunos" },
  { id: "p1", type: "professor", title: "Tiago Ferreira", subtitle: "Matemática", context: "Professor · 10.º A, 10.º B", to: "/professores" },
  { id: "p2", type: "professor", title: "Helena Costa", subtitle: "Português", context: "Professora · Convidada", to: "/professores" },
  { id: "p3", type: "professor", title: "Carla Mendes", subtitle: "Coordenadora", context: "Coordenação Pedagógica", to: "/professores" },
  { id: "m1", type: "matricula", title: "Matrícula #2026-0123", subtitle: "Mariana Silva · 7.º ano", context: "Pendente de aprovação", to: "/matriculas" },
  { id: "c1", type: "curso", title: "Ensino Secundário — Ciências", subtitle: "10.º ao 12.º ano", context: "Curso · 3 turmas", to: "/cursos" },
  { id: "c2", type: "curso", title: "Ensino Básico — 3.º ciclo", subtitle: "7.º ao 9.º ano", context: "Curso · 6 turmas", to: "/cursos" },
  { id: "t1", type: "turma", title: "10.º A", subtitle: "Ciências · 28 alunos", context: "Director de turma: Tiago Ferreira", to: "/turmas" },
  { id: "t2", type: "turma", title: "7.º B", subtitle: "3.º ciclo · 24 alunos", context: "Director de turma: Helena Costa", to: "/turmas" },
  { id: "e1", type: "evento", title: "Reunião de pais — 3.º ciclo", subtitle: "Sexta-feira · 18h00", context: "Evento · Auditório principal", to: "/eventos" },
  { id: "e2", type: "evento", title: "Festa de Natal", subtitle: "20 Dez · inscrições abertas", context: "Evento · Pavilhão", to: "/eventos" },
  { id: "av1", type: "avaliacao", title: "2.º Teste de Matemática", subtitle: "10.º A · Tiago Ferreira", context: "Notas publicadas", to: "/avaliacoes" },
  { id: "d1", type: "documento", title: "Regulamento Interno 2025/2026", subtitle: "PDF · 1.4 MB", context: "Documento institucional", to: "/material" },
  { id: "ms1", type: "mensagem", title: "Carla Mendes", subtitle: "\"Confirmas a reunião pedagógica?\"", context: "Mensagem · há 5 min", to: "/chat" },
  { id: "n1", type: "notificacao", title: "Nova matrícula pendente", subtitle: "Mariana Silva — 7.º ano", context: "Notificação · há 22 min", to: "/notificacoes" },
];

type FilterType = "all" | ResultType;

const Pesquisa = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    setQuery(params.get("q") ?? "");
  }, [params]);

  const updateQuery = (q: string) => {
    setQuery(q);
    const next = new URLSearchParams(params);
    if (q) next.set("q", q);
    else next.delete("q");
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Result[];
    return dataset
      .filter((r) => (filter === "all" ? true : r.type === filter))
      .filter((r) =>
        [r.title, r.subtitle, r.context, typeMeta[r.type].label].some((s) => s.toLowerCase().includes(q)),
      );
  }, [query, filter]);

  const grouped = useMemo(() => {
    const map = new Map<ResultType, Result[]>();
    filtered.forEach((r) => {
      const arr = map.get(r.type) ?? [];
      arr.push(r);
      map.set(r.type, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const counts = useMemo(() => {
    const all = query.trim()
      ? dataset.filter((r) =>
          [r.title, r.subtitle, r.context, typeMeta[r.type].label].some((s) =>
            s.toLowerCase().includes(query.trim().toLowerCase()),
          ),
        )
      : [];
    const c: Record<FilterType, number> = { all: all.length } as Record<FilterType, number>;
    (Object.keys(typeMeta) as ResultType[]).forEach((t) => (c[t] = all.filter((r) => r.type === t).length));
    return c;
  }, [query]);

  const filterTabs: { id: FilterType; label: string }[] = [
    { id: "all", label: "Todos" },
    ...(Object.keys(typeMeta) as ResultType[]).map((t) => ({ id: t as FilterType, label: typeMeta[t].label })),
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Pesquisa global</h1>
          <p className="text-sm text-muted-foreground">Pesquise alunos, professores, matrículas, cursos, eventos, mensagens e mais.</p>
        </div>

        {/* Big input */}
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <div className="relative">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              maxLength={200}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder="O que procura?"
              className="h-14 w-full rounded-2xl border border-border bg-background pl-14 pr-14 text-base shadow-soft outline-none transition-[var(--transition-smooth)] focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {query && (
              <button
                onClick={() => updateQuery("")}
                aria-label="Limpar"
                className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            )}
          </div>

          {/* Filtros */}
          <div className="mt-4 flex flex-wrap gap-2">
            {filterTabs.map((t) => {
              const active = filter === t.id;
              const count = counts[t.id] ?? 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setFilter(t.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-pastel-blue-foreground bg-pastel-blue text-pastel-blue-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t.label}
                  <span className={cn("rounded-full px-1.5 text-[10px] font-bold", active ? "bg-card/70" : "bg-muted")}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Resultados */}
        {!query.trim() ? (
          <div className="rounded-2xl bg-card p-12 text-center shadow-card">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Search className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">Comece a escrever para pesquisar</p>
            <p className="mt-1 text-xs text-muted-foreground">A pesquisa abrange toda a plataforma — pessoas, registos, conteúdos e comunicações.</p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["Mariana Silva", "10.º A", "Reunião de pais", "Matemática", "Matrícula"].map((s) => (
                <button
                  key={s}
                  onClick={() => updateQuery(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-card p-12 text-center shadow-card">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pastel-pink text-pastel-pink-foreground">
              <Search className="h-6 w-6" strokeWidth={1.5} />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">Sem resultados para "{query}"</p>
            <p className="mt-1 text-xs text-muted-foreground">Tente outras palavras-chave ou remova os filtros aplicados.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "resultado encontrado" : "resultados encontrados"} para "{query}"
            </p>

            {grouped.map(([type, items]) => {
              const meta = typeMeta[type];
              const Icon = meta.icon;
              return (
                <section key={type} className="overflow-hidden rounded-2xl bg-card shadow-card">
                  <header className="flex items-center justify-between border-b border-border px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", meta.bg, meta.text)}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{items.length}</span>
                    </div>
                  </header>
                  <ul className="divide-y divide-border">
                    {items.map((r) => (
                      <li key={r.id}>
                        <button
                          onClick={() => navigate(r.to)}
                          className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
                        >
                          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", meta.bg, meta.text)}>
                            <Icon className="h-4 w-4" strokeWidth={1.75} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{r.context}</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.75} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Pesquisa;