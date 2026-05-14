import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ModuleKey =
  | "professores"
  | "alunos"
  | "matriculas"
  | "cursos"
  | "turmas"
  | "disciplinas"
  | "educadores"
  | "presencas"
  | "horario"
  | "avaliacoes"
  | "notas"
  | "eventos"
  | "extracurriculares"
  | "pedidos"
  | "material"
  | "propinas"
  | "financas"
  | "relatorios"
  | "timesheet"
  | "transportes"
  | "refeicoes"
  | "documentos";

export const moduleMeta: Record<ModuleKey, { label: string; description: string; path: string }> = {
  professores: { label: "Professores", description: "Gestão dos professores e docentes da escola.", path: "/professores" },
  alunos: { label: "Alunos", description: "Lista, fichas e perfis dos alunos.", path: "/alunos" },
  matriculas: { label: "Matrículas", description: "Inscrições e renovações dos alunos.", path: "/matriculas" },
  cursos: { label: "Cursos", description: "Catálogo de cursos oferecidos.", path: "/cursos" },
  turmas: { label: "Turmas", description: "Organização das turmas por ano e curso.", path: "/turmas" },
  disciplinas: { label: "Disciplinas", description: "Disciplinas lecionadas em cada curso.", path: "/disciplinas" },
  educadores: { label: "Educadores", description: "Pessoal de apoio educativo.", path: "/educadores" },
  presencas: { label: "Presenças", description: "Registo diário de presenças dos alunos.", path: "/presencas" },
  horario: { label: "Horário", description: "Horário das turmas e dos professores.", path: "/horario" },
  avaliacoes: { label: "Avaliações", description: "Testes, exames e trabalhos avaliados.", path: "/avaliacoes" },
  notas: { label: "Notas", description: "Consulta de notas por turma e disciplina.", path: "/notas" },
  eventos: { label: "Eventos", description: "Eventos escolares e calendário institucional.", path: "/eventos" },
  extracurriculares: { label: "Extracurriculares", description: "Atividades fora do plano curricular.", path: "/extracurriculares" },
  pedidos: { label: "Pedidos", description: "Pedidos de ausência e aprovações.", path: "/pedidos" },
  material: { label: "Material", description: "Stock e pedidos de material escolar.", path: "/material" },
  propinas: { label: "Propinas", description: "Regras de cobrança, lista de propinas, validação e lembretes.", path: "/propinas" },
  financas: { label: "Finanças", description: "Despesas, receitas e gráficos de lucro.", path: "/financas" },
  relatorios: { label: "Relatórios", description: "Exportações e análises da escola.", path: "/relatorios" },
  timesheet: { label: "Timesheet", description: "Controlo de horas dos funcionários.", path: "/timesheet" },
  transportes: { label: "Transporte", description: "Giros escolares, paragens, inscrições e mensalidade do transporte.", path: "/transportes" },
  refeicoes: { label: "Refeições", description: "Planos do refeitório, regras de cobrança, inscrições e pagamentos.", path: "/refeicoes" },
  documentos: { label: "Documentos", description: "Documentos escolares, pedidos de assinatura e formulários.", path: "/documentos" },
};

export type PlanType = "Essencial" | "Pro" | "Enterprise";

// Module → minimum plan required.
export const modulePlan: Record<ModuleKey, PlanType> = {
  // Essencial
  professores: "Essencial",
  alunos: "Essencial",
  matriculas: "Essencial",
  cursos: "Essencial",
  turmas: "Essencial",
  disciplinas: "Essencial",
  educadores: "Essencial",
  presencas: "Essencial",
  horario: "Essencial",
  avaliacoes: "Essencial",
  notas: "Essencial",
  eventos: "Essencial",
  propinas: "Essencial",
  financas: "Essencial",
  relatorios: "Essencial",
  // Pro
  extracurriculares: "Pro",
  pedidos: "Pro",
  timesheet: "Pro",
  // Enterprise
  material: "Enterprise",
  transportes: "Enterprise",
  refeicoes: "Enterprise",
  documentos: "Essencial",
};

const planRank: Record<PlanType, number> = { Essencial: 1, Pro: 2, Enterprise: 3 };

export const isModuleAllowedForPlan = (key: ModuleKey, plan: PlanType): boolean =>
  planRank[plan] >= planRank[modulePlan[key]];

const STORAGE_KEY = "edukamba.modules";

const defaults: Record<ModuleKey, boolean> = (Object.keys(moduleMeta) as ModuleKey[]).reduce(
  (acc, k) => ({ ...acc, [k]: true }),
  {} as Record<ModuleKey, boolean>,
);

type Ctx = {
  modules: Record<ModuleKey, boolean>;
  setModule: (key: ModuleKey, enabled: boolean) => void;
  setAll: (enabled: boolean) => void;
  resetDefaults: () => void;
  plan: PlanType;
  isAllowed: (key: ModuleKey) => boolean;
};

const ModulesContext = createContext<Ctx | undefined>(undefined);

export const ModulesProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanType>("Enterprise");

  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<Record<ModuleKey, boolean>> & { pagamentos?: boolean };
      const { pagamentos: _removedPagamentos, ...rest } = parsed;
      return { ...defaults, ...rest };
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
    } catch {
      /* ignore */
    }
  }, [modules]);

  // Load the school's current plan
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.school_id || cancelled) return;
      const { data: sub } = await supabase
        .from("saas_subscriptions")
        .select("plan_type")
        .eq("school_id", profile.school_id)
        .maybeSingle();
      if (cancelled) return;
      const p = (sub?.plan_type as PlanType) ?? "Enterprise";
      if (p === "Essencial" || p === "Pro" || p === "Enterprise") setPlan(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Auto-disable modules that are not allowed for the current plan
  useEffect(() => {
    setModules((prev) => {
      let changed = false;
      const next = { ...prev };
      (Object.keys(moduleMeta) as ModuleKey[]).forEach((k) => {
        if (!isModuleAllowedForPlan(k, plan) && next[k]) {
          next[k] = false;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [plan]);

  const value = useMemo<Ctx>(
    () => ({
      modules,
      setModule: (key, enabled) => {
        // Block enabling a module that is not part of the current plan
        if (enabled && !isModuleAllowedForPlan(key, plan)) return;
        setModules((prev) => ({ ...prev, [key]: enabled }));
      },
      setAll: (enabled) =>
        setModules(() =>
          (Object.keys(moduleMeta) as ModuleKey[]).reduce(
            (acc, k) => ({ ...acc, [k]: enabled && isModuleAllowedForPlan(k, plan) }),
            {} as Record<ModuleKey, boolean>,
          ),
        ),
      resetDefaults: () =>
        setModules(
          (Object.keys(moduleMeta) as ModuleKey[]).reduce(
            (acc, k) => ({ ...acc, [k]: isModuleAllowedForPlan(k, plan) }),
            {} as Record<ModuleKey, boolean>,
          ),
        ),
      plan,
      isAllowed: (key) => isModuleAllowedForPlan(key, plan),
    }),
    [modules, plan],
  );

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
};

export const useModules = () => {
  const ctx = useContext(ModulesContext);
  if (!ctx) {
    return {
      modules: defaults,
      setModule: () => {},
      setAll: () => {},
      resetDefaults: () => {},
      plan: "Enterprise" as PlanType,
      isAllowed: () => true,
    } as Ctx;
  }
  return ctx;
};
