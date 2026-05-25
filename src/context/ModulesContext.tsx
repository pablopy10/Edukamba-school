import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { TENANT_CHANGED_EVENT } from "@/lib/tenantBroadcast";

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
  | "orcamentos"
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
  orcamentos: { label: "Orçamentos", description: "Criação e gestão de orçamentos e propostas comerciais.", path: "/orcamentos" },
  relatorios: { label: "Relatórios", description: "Exportações e análises da escola.", path: "/relatorios" },
  timesheet: { label: "Timesheet", description: "Controlo de horas dos funcionários.", path: "/timesheet" },
  transportes: { label: "Transporte", description: "Giros escolares, paragens, inscrições e mensalidade do transporte.", path: "/transportes" },
  refeicoes: { label: "Refeições", description: "Planos do refeitório, regras de cobrança, inscrições e pagamentos.", path: "/refeicoes" },
  documentos: { label: "Documentos", description: "Documentos escolares, pedidos de assinatura e formulários.", path: "/documentos" },
};

export type PlanType = "Essencial" | "Pro" | "Enterprise";

export const modulePlan: Record<ModuleKey, PlanType> = {
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
  orcamentos: "Pro",
  relatorios: "Essencial",
  extracurriculares: "Pro",
  pedidos: "Pro",
  timesheet: "Pro",
  material: "Enterprise",
  transportes: "Enterprise",
  refeicoes: "Enterprise",
  documentos: "Essencial",
};

const planRank: Record<PlanType, number> = { Essencial: 1, Pro: 2, Enterprise: 3 };

export const isModuleAllowedForPlan = (key: ModuleKey, plan: PlanType): boolean =>
  planRank[plan] >= planRank[modulePlan[key]];

const STORAGE_KEY = "edukamba.modules";

const moduleKeysAll = Object.keys(moduleMeta) as ModuleKey[];

const defaults: Record<ModuleKey, boolean> = moduleKeysAll.reduce(
  (acc, k) => ({ ...acc, [k]: true }),
  {} as Record<ModuleKey, boolean>,
);

function coerceModuleKey(raw: string): ModuleKey | null {
  return moduleKeysAll.includes(raw as ModuleKey) ? (raw as ModuleKey) : null;
}

function buildEffectivePrefs(
  prefs: Record<ModuleKey, boolean>,
  plan: PlanType,
): Record<ModuleKey, boolean> {
  const next = { ...prefs };
  moduleKeysAll.forEach((k) => {
    if (!isModuleAllowedForPlan(k, plan)) next[k] = false;
  });
  return next;
}

/** Preferências guardadas pelo utilizador × plano SaaS × bloqueios da plataforma (Edukamba). */
type Ctx = {
  modules: Record<ModuleKey, boolean>;
  setModule: (key: ModuleKey, enabled: boolean) => void;
  setAll: (enabled: boolean) => void;
  resetDefaults: () => void;
  plan: PlanType;
  isAllowed: (key: ModuleKey) => boolean;
  isPlatformForcedOff: (key: ModuleKey) => boolean;
};

const ModulesContext = createContext<Ctx | undefined>(undefined);

export const ModulesProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [plan, setPlan] = useState<PlanType>("Enterprise");
  const [tenantEpoch, setTenantEpoch] = useState(0);
  const [platformForcedOff, setPlatformForcedOff] = useState<Partial<Record<ModuleKey, boolean>>>({});

  const [prefs, setPrefs] = useState<Record<ModuleKey, boolean>>(() => {
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  useEffect(() => {
    const onTenant = () => setTenantEpoch((e) => e + 1);
    window.addEventListener(TENANT_CHANGED_EVENT, onTenant);
    return () => window.removeEventListener(TENANT_CHANGED_EVENT, onTenant);
  }, []);

  // Plano SaaS + bloqueios da plataforma (por escola efectiva — inclui modo suporte SUPER_ADMIN).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !profile) return;
      const sid = profile.support_context_school_id ?? profile.school_id;
      if (!sid) {
        setPlatformForcedOff({});
        return;
      }
      const { data: sub } = await supabase.from("saas_subscriptions").select("plan_type").eq("school_id", sid).maybeSingle();
      if (cancelled) return;
      const p = (sub?.plan_type as PlanType) ?? "Enterprise";
      if (p === "Essencial" || p === "Pro" || p === "Enterprise") setPlan(p);

      const { data: locks } = await supabase.from("saas_platform_module_locks").select("module_key").eq("school_id", sid);
      if (cancelled) return;
      const off: Partial<Record<ModuleKey, boolean>> = {};
      (locks ?? []).forEach((row) => {
        const mk = coerceModuleKey(row.module_key);
        if (mk) off[mk] = true;
      });
      setPlatformForcedOff(off);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, tenantEpoch]);

  useEffect(() => {
    setPrefs((prev) => buildEffectivePrefs(prev, plan));
  }, [plan]);

  const modules = useMemo(() => {
    const out = { ...defaults };
    moduleKeysAll.forEach((k) => {
      out[k] = prefs[k] && isModuleAllowedForPlan(k, plan) && !platformForcedOff[k];
    });
    return out;
  }, [prefs, platformForcedOff, plan]);

  const value = useMemo<Ctx>(
    () => ({
      modules,
      setModule: (key, enabled) => {
        if (platformForcedOff[key]) {
          toast.error("Este módulo foi desactivado pela Edukamba. Contacte-nos para o reactivar.");
          return;
        }
        if (enabled && !isModuleAllowedForPlan(key, plan)) return;
        setPrefs((prev) => ({ ...prev, [key]: enabled }));
      },
      setAll: (enabled) =>
        setPrefs(() =>
          moduleKeysAll.reduce(
            (acc, k) => {
              let next = enabled && isModuleAllowedForPlan(k, plan);
              if (platformForcedOff[k]) next = false;
              acc[k] = next;
              return acc;
            },
            { ...defaults },
          ),
        ),
      resetDefaults: () =>
        setPrefs(
          moduleKeysAll.reduce(
            (acc, k) => ({
              ...acc,
              [k]: isModuleAllowedForPlan(k, plan) && !platformForcedOff[k],
            }),
            {} as Record<ModuleKey, boolean>,
          ),
        ),
      plan,
      isAllowed: (key) => isModuleAllowedForPlan(key, plan),
      isPlatformForcedOff: (key) => platformForcedOff[key] === true,
    }),
    [modules, platformForcedOff, plan],
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
      isPlatformForcedOff: () => false,
    } as Ctx;
  }
  return ctx;
};
