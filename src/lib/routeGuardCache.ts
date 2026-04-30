/** Evita novo fetch de perfil/escola ao remontar o guard (Strict Mode / edge cases). */
export type RouteGuardSnapshot = {
  hasSchool: boolean;
  isActive: boolean;
  trialExpired: boolean;
  schoolName: string | null;
  trialEndsAt: string | null;
};

const guardByUser = new Map<string, RouteGuardSnapshot>();

export function getRouteGuardSnapshot(userId: string): RouteGuardSnapshot | undefined {
  return guardByUser.get(userId);
}

export function setRouteGuardSnapshot(userId: string, snap: RouteGuardSnapshot) {
  guardByUser.set(userId, snap);
}

export function clearRouteGuardCache(userId?: string) {
  if (userId) guardByUser.delete(userId);
  else guardByUser.clear();
}
