import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";

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
  | "eventos"
  | "extracurriculares"
  | "pedidos"
  | "material"
  | "relatorios"
  | "timesheet";

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
  eventos: { label: "Eventos", description: "Eventos escolares e calendário institucional.", path: "/eventos" },
  extracurriculares: { label: "Extracurriculares", description: "Atividades fora do plano curricular.", path: "/extracurriculares" },
  pedidos: { label: "Pedidos", description: "Pedidos de ausência e aprovações.", path: "/pedidos" },
  material: { label: "Material", description: "Stock e pedidos de material escolar.", path: "/material" },
  relatorios: { label: "Relatórios", description: "Exportações e análises da escola.", path: "/relatorios" },
  timesheet: { label: "Timesheet", description: "Controlo de horas dos funcionários.", path: "/timesheet" },
};

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
};

const ModulesContext = createContext<Ctx | undefined>(undefined);

export const ModulesProvider = ({ children }: { children: ReactNode }) => {
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<Record<ModuleKey, boolean>>;
      return { ...defaults, ...parsed };
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

  const value = useMemo<Ctx>(
    () => ({
      modules,
      setModule: (key, enabled) => setModules((prev) => ({ ...prev, [key]: enabled })),
      setAll: (enabled) =>
        setModules(() =>
          (Object.keys(moduleMeta) as ModuleKey[]).reduce(
            (acc, k) => ({ ...acc, [k]: enabled }),
            {} as Record<ModuleKey, boolean>,
          ),
        ),
      resetDefaults: () => setModules(defaults),
    }),
    [modules],
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
    } as Ctx;
  }
  return ctx;
};
