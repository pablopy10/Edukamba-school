/** Perfis de gestão na escola (acesso ao menu e operações administrativas). */
export const SCHOOL_MANAGEMENT_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "DIRECTOR",
  "SECRETARY",
  "TREASURER",
  "LIBRARIAN",
  "STOCK_MANAGER",
  "RECEPTIONIST",
] as const;

export type SchoolManagementRole = (typeof SCHOOL_MANAGEMENT_ROLES)[number];

export function isSchoolManagementRole(role: string | null | undefined): role is SchoolManagementRole {
  return role != null && (SCHOOL_MANAGEMENT_ROLES as readonly string[]).includes(role);
}

export function isSchoolManagementOrTeacher(role: string | null | undefined): boolean {
  return role === "TEACHER" || isSchoolManagementRole(role);
}

/** Apenas estas funções gerem definições da escola na cloud (nome, marca, SaaS), módulos e políticas privilegiadas. */
export type SchoolSettingsRole = "ADMIN" | "SUPER_ADMIN";

export function isSchoolSettingsAdmin(role: string | null | undefined): role is SchoolSettingsRole {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Quem pode validar/rejeitar comprovativos e usar «Validar seleccionados» na UI dos pagamentos.
 * Exclui encarregados (PARENT) e alunos (STUDENT). Deve conjugar-se com `!isParent` na página quando aplicável.
 * A política definitiva deve espelhar a RLS (`payments`/validação na base de dados).
 */
export function canValidateSchoolPaymentProofs(role: string | null | undefined): boolean {
  return role != null && role !== "PARENT" && role !== "STUDENT";
}

/** Apenas estes perfis podem apagar registos de forma irreversível (RLS deve limitar igual). */
export function canSchoolHardDeleteRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN" || role === "DIRECTOR";
}

/** Elegível como diretor de turma (perfil na escola). */
export const HOMEROOM_ELIGIBLE_PROFILE_ROLES = [
  ...SCHOOL_MANAGEMENT_ROLES,
  "TEACHER",
] as const;
