/**
 * Escola em que as operações devem aplicar‑se por sessão: SUPER_ADMIN em modo suporte
 * usa `support_context_school_id` (equivale a `get_my_school()` no servidor).
 */
export type ProfileEffectiveSchoolPick = {
  school_id?: string | null;
  support_context_school_id?: string | null;
};

export function effectiveSchoolIdFromProfile(
  profile: ProfileEffectiveSchoolPick | null | undefined,
): string | null {
  if (!profile) return null;
  const sid = profile.support_context_school_id ?? profile.school_id ?? null;
  return sid && sid.length > 0 ? sid : null;
}
