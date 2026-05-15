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

/** Perfis que podem validar/registar pagamentos na escola (UI e política de produto). */
export const SCHOOL_PAYMENT_VALIDATE_ROLES = [
  "ADMIN",
  "SUPER_ADMIN",
  "DIRECTOR",
  "SECRETARY",
  "TREASURER",
] as const;

export type SchoolPaymentValidateRole = (typeof SCHOOL_PAYMENT_VALIDATE_ROLES)[number];

/** Quem pode validar/registar comprovativos e cobranças na escola (exclui educador sem função financeira, encarregado e aluno). */
export function canValidateSchoolPaymentProofs(role: string | null | undefined): boolean {
  return role != null && (SCHOOL_PAYMENT_VALIDATE_ROLES as readonly string[]).includes(role);
}

/** Apenas estes perfis podem apagar registos de forma irreversível (RLS deve limitar igual). */
export function canSchoolHardDeleteRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN" || role === "DIRECTOR";
}

/** Alinhado à política RLS `event_student_rsvp` (lista de presenças declarada pelos encarregados). */
export function canViewSchoolEventAttendanceRoster(role: string | null | undefined): boolean {
  if (role == null) return false;
  switch (role) {
    case "ADMIN":
    case "SUPER_ADMIN":
    case "DIRECTOR":
    case "SECRETARY":
    case "TREASURER":
    case "TEACHER":
      return true;
    default:
      return false;
  }
}

/**
 * Perfis que podem corrigir submissões de formulários de autorização por módulo — alinhado a
 * `auth_is_module_auth_staff_viewer()` nas políticas RLS (Admin, Director, Secretariado e Tesouraria; inclui Super‑admin).
 */
export function isModuleAuthorizationStaffViewerRole(role: string | null | undefined): boolean {
  if (role == null) return false;
  const normalized = String(role).trim().toUpperCase();
  return normalized.length > 0 && (SCHOOL_PAYMENT_VALIDATE_ROLES as readonly string[]).includes(normalized);
}

/** Elegível como diretor de turma (perfil na escola). */
export const HOMEROOM_ELIGIBLE_PROFILE_ROLES = [
  ...SCHOOL_MANAGEMENT_ROLES,
  "TEACHER",
] as const;
