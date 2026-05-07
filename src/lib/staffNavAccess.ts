import type { UserRole } from "@/hooks/useUserRole";
import { isSchoolSettingsAdmin } from "@/lib/schoolStaffRoles";

type StaffOperationalRole = Exclude<
  UserRole,
  null | "ADMIN" | "SUPER_ADMIN" | "TEACHER" | "PARENT" | "STUDENT"
>;

/** Rotas de menu disponíveis por perfil não-admin (alinhado à matriz de permissões pedida). */
const STAFF_NAV: Record<StaffOperationalRole, readonly string[]> = {
  DIRECTOR: [
    "/dashboard",
    "/professores",
    "/alunos",
    "/matriculas",
    "/cursos",
    "/turmas",
    "/disciplinas",
    "/educadores",
    "/presencas",
    "/horario",
    "/horarios",
    "/avaliacoes",
    "/notas",
    "/eventos",
    "/extracurriculares",
    "/transportes",
    "/pedidos",
    "/material",
    "/pagamentos",
    "/financas",
    "/relatorios",
    "/timesheet",
    "/documentos",
    "/chat",
    "/pesquisa",
    "/notificacoes",
  ],
  SECRETARY: [
    "/dashboard",
    "/professores",
    "/alunos",
    "/matriculas",
    "/cursos",
    "/turmas",
    "/disciplinas",
    "/horario",
    "/horarios",
    "/pedidos",
    "/pagamentos",
    "/notas",
    "/relatorios",
    "/extracurriculares",
    "/documentos",
    "/chat",
    "/pesquisa",
    "/notificacoes",
  ],
  TREASURER: [
    "/dashboard",
    "/alunos",
    "/matriculas",
    "/material",
    "/pagamentos",
    "/financas",
    "/transportes",
    "/chat",
    "/pesquisa",
    "/notificacoes",
  ],
  STOCK_MANAGER: [
    "/dashboard",
    "/alunos",
    "/educadores",
    "/material",
    "/chat",
    "/pesquisa",
    "/notificacoes",
  ],
  LIBRARIAN: [
    "/dashboard",
    "/alunos",
    "/educadores",
    "/material",
    "/chat",
    "/pesquisa",
    "/notificacoes",
  ],
  RECEPTIONIST: [
    "/dashboard",
    "/horario",
    "/horarios",
    "/eventos",
    "/alunos",
    "/professores",
    "/pedidos",
    "/chat",
    "/pesquisa",
    "/notificacoes",
  ],
};

function staffRoutes(role: Exclude<UserRole, null>): readonly string[] | null {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return null;
  if (role === "TEACHER" || role === "PARENT" || role === "STUDENT") return null;
  return STAFF_NAV[role];
}

/** Separadores exclusivos Administrador/Super-admin (Nome/marca, plano SaaS, etc.). */
export const DEFINICOES_TAB_SETTINGS_ONLY = ["escola", "marca", "academico", "faturacao"] as const;
export type DefinicoesRestrictedTabId = (typeof DEFINICOES_TAB_SETTINGS_ONLY)[number];

/** Director gere equipa/permissões; não toca nos blocos estratégicos da escola. */
const DIRECTOR_DEFINICOES_TABS = new Set<string>([
  "utilizadores",
  "permissoes",
  "notificacoes",
  "auditoria",
]);

export function canOpenDefinicoesPage(role: UserRole | null): boolean {
  if (role == null) return false;
  return isSchoolSettingsAdmin(role) || role === "DIRECTOR";
}

export function canOpenModulosPage(role: UserRole | null): boolean {
  return isSchoolSettingsAdmin(role);
}

export function isDefinicoesTabAllowed(role: UserRole | null, tabId: string): boolean {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (role === "DIRECTOR") return DIRECTOR_DEFINICOES_TABS.has(tabId);
  return false;
}

export function normalizeNavPath(path: string): string {
  if (path === "/" || path === "") return "/dashboard";
  let p = path.replace(/\/$/, "");
  if (p === "/horarios") return "/horario";
  return p;
}

function pathMatchesNavPrefix(path: string, routePrefix: string): boolean {
  const rr = normalizeNavPath(routePrefix);
  return path === rr || path.startsWith(`${rr}/`);
}

function pathMatchesAnyPrefix(path: string, routes: readonly string[]): boolean {
  return routes.some((r) => pathMatchesNavPrefix(path, r));
}

/** Rotas de menu (prefixo) para professor — alinhado à Sidebar. */
const TEACHER_NAV_PREFIXES = [
  "/dashboard",
  "/alunos",
  "/turmas",
  "/avaliacoes",
  "/notas",
  "/presencas",
  "/horario",
  "/material",
  "/pedidos",
  "/eventos",
  "/educadores",
  "/documentos",
] as const;

const PARENT_NAV_PREFIXES = [
  "/dashboard",
  "/alunos",
  "/avaliacoes",
  "/notas",
  "/pagamentos",
  "/horario",
  "/matriculas",
  "/eventos",
  "/presencas",
  "/material",
  "/professores",
  "/extracurriculares",
  "/transportes",
  "/documentos",
] as const;

/** Aluno — alinhado à Sidebar. */
const STUDENT_NAV_PREFIXES = [
  "/dashboard",
  "/presencas",
  "/horario",
  "/avaliacoes",
  "/notas",
  "/eventos",
  "/material",
] as const;

export function isNavPathAllowedForRole(role: UserRole | null, rawPath: string): boolean {
  if (role == null) return false;
  const path = normalizeNavPath(rawPath);
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (pathMatchesNavPrefix(path, "/perfil")) return true;
  const list = staffRoutes(role);
  if (list !== null && list.length > 0) {
    return pathMatchesAnyPrefix(path, list);
  }
  if (role === "TEACHER") return pathMatchesAnyPrefix(path, TEACHER_NAV_PREFIXES);
  if (role === "PARENT") return pathMatchesAnyPrefix(path, PARENT_NAV_PREFIXES);
  if (role === "STUDENT") return pathMatchesAnyPrefix(path, STUDENT_NAV_PREFIXES);
  return false;
}

