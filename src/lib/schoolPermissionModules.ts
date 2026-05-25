import type { Database } from "@/integrations/supabase/types";
import { moduleMeta, type ModuleKey as AppRouteModuleKey } from "@/context/ModulesContext";

export type SchoolUserRole = Database["public"]["Enums"]["user_role"];

export type PermissionModuleKey = AppRouteModuleKey | "modulos" | "definicoes";

export type ModulePermissionFlags = {
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
};

/** Ordem estável coincide com Definições e com o gate de navegação. */
export const PERMISSION_ROUTE_ORDER: readonly AppRouteModuleKey[] = [
  "professores",
  "alunos",
  "matriculas",
  "cursos",
  "turmas",
  "disciplinas",
  "educadores",
  "presencas",
  "horario",
  "avaliacoes",
  "notas",
  "eventos",
  "propinas",
  "extracurriculares",
  "transportes",
  "refeicoes",
  "pedidos",
  "material",
  "documentos",
  "financas",
  "orcamentos",
  "relatorios",
  "timesheet",
] as const;

export const ADMIN_ONLY_PERMISSION_MODULES: readonly PermissionModuleKey[] = ["modulos", "definicoes"];

export function allPermissionModuleKeys(): PermissionModuleKey[] {
  return [...PERMISSION_ROUTE_ORDER, ...ADMIN_ONLY_PERMISSION_MODULES];
}

export function fullAccessMatrix(): Record<PermissionModuleKey, ModulePermissionFlags> {
  const m = {} as Record<PermissionModuleKey, ModulePermissionFlags>;
  for (const key of allPermissionModuleKeys()) {
    m[key] = { can_read: true, can_write: true, can_delete: true };
  }
  return m;
}

/** Valores por omissão (antes de gravar linhas na BD) para cada função. */
export function getDefaultRoleModulePermission(
  role: SchoolUserRole,
  mod: PermissionModuleKey,
): ModulePermissionFlags {
  const FULL = (): ModulePermissionFlags => ({
    can_read: true,
    can_write: true,
    can_delete: true,
  });
  const R = (): ModulePermissionFlags => ({
    can_read: true,
    can_write: false,
    can_delete: false,
  });
  const RW = (): ModulePermissionFlags => ({
    can_read: true,
    can_write: true,
    can_delete: false,
  });
  const N = (): ModulePermissionFlags => ({
    can_read: false,
    can_write: false,
    can_delete: false,
  });

  if (role === "ADMIN" || role === "SUPER_ADMIN") return FULL();

  if (role === "DIRECTOR") {
    if (mod === "modulos" || mod === "definicoes") return N();
    return FULL();
  }

  if (role === "SECRETARY") {
    const academicRw = ["alunos", "turmas", "cursos", "disciplinas", "horario", "matriculas", "pedidos"].includes(mod);
    if (academicRw) return RW();
    if (mod === "propinas" || mod === "notas" || mod === "relatorios") return R();
    if (
      mod === "modulos" ||
      mod === "definicoes" ||
      mod === "financas" ||
      mod === "transportes" ||
      mod === "timesheet" ||
      mod === "educadores"
    )
      return N();
    if (mod === "presencas" || mod === "professores" || mod === "extracurriculares" || mod === "avaliacoes" || mod === "material")
      return R();
    return R();
  }

  if (role === "TREASURER") {
    if (mod === "propinas" || mod === "financas" || mod === "transportes" || mod === "refeicoes") return RW();
    if (mod === "alunos" || mod === "matriculas" || mod === "material") return R();
    if (mod === "notas" || mod === "avaliacoes") return N();
    return N();
  }

  if (role === "STOCK_MANAGER" || role === "LIBRARIAN") {
    if (mod === "material") return RW();
    if (mod === "alunos" || mod === "professores") return R();
    if (mod === "financas" || mod === "notas" || mod === "turmas" || mod === "avaliacoes") return N();
    return N();
  }

  if (role === "RECEPTIONIST") {
    if (mod === "horario" || mod === "eventos" || mod === "professores") return R();
    if (mod === "alunos") return R();
    if (mod === "pedidos") return RW();
    if (mod === "propinas" || mod === "financas" || mod === "matriculas" || mod === "notas" || mod === "avaliacoes")
      return N();
    return N();
  }

  if (role === "TEACHER") {
    const w = ["avaliacoes", "presencas", "eventos", "material"].includes(mod);
    return { can_read: true, can_write: w, can_delete: false };
  }

  if (role === "PARENT" || role === "STUDENT") {
    return {
      can_read: ["alunos", "eventos", "avaliacoes", "propinas", "documentos"].includes(mod),
      can_write: false,
      can_delete: false,
    };
  }

  return R();
}

export function matrixFromDefaultsOnly(role: SchoolUserRole): Record<PermissionModuleKey, ModulePermissionFlags> {
  const out = {} as Record<PermissionModuleKey, ModulePermissionFlags>;
  for (const key of allPermissionModuleKeys()) {
    out[key] = getDefaultRoleModulePermission(role, key);
  }
  return out;
}
