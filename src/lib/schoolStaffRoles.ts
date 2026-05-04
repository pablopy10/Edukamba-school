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

/** Elegível como diretor de turma (perfil na escola). */
export const HOMEROOM_ELIGIBLE_PROFILE_ROLES = [
  ...SCHOOL_MANAGEMENT_ROLES,
  "TEACHER",
] as const;
