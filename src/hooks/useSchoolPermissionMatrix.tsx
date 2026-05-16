import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import type { SchoolUserRole } from "@/lib/schoolPermissionModules";
import {
  allPermissionModuleKeys,
  fullAccessMatrix,
  getDefaultRoleModulePermission,
  matrixFromDefaultsOnly,
  type ModulePermissionFlags,
  type PermissionModuleKey,
} from "@/lib/schoolPermissionModules";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";

export const schoolPermissionMatrixQueryRoot = ["schoolPermissionMatrix"] as const;

export function schoolPermissionMatrixQueryKey(userId: string | null) {
  return [...schoolPermissionMatrixQueryRoot, userId] as const;
}

async function fetchMatrixInner(schoolId: string, userId: string, role: SchoolUserRole) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") return fullAccessMatrix();

  const [rpRes, upRes] = await Promise.all([
    supabase
      .from("role_permissions")
      .select("module, can_read, can_write, can_delete")
      .eq("school_id", schoolId)
      .eq("role", role),
    supabase.from("user_permissions").select("module, can_read, can_write, can_delete").eq("user_id", userId),
  ]);

  const roleByMod = new Map(
    (rpRes.data ?? []).map((row) => [row.module as string, row as ModulePermissionFlags & { module: string }]),
  );
  const userByMod = new Map(
    (upRes.data ?? []).map((row) => [row.module as string, row as ModulePermissionFlags & { module: string }]),
  );

  const matrix = {} as Record<PermissionModuleKey, ModulePermissionFlags>;
  for (const mod of allPermissionModuleKeys()) {
    const u = userByMod.get(mod);
    if (u) {
      matrix[mod] = { can_read: !!u.can_read, can_write: !!u.can_write, can_delete: !!u.can_delete };
      continue;
    }
    const r = roleByMod.get(mod);
    const d = getDefaultRoleModulePermission(role, mod);
    matrix[mod] = {
      can_read: r?.can_read ?? d.can_read,
      can_write: r?.can_write ?? d.can_write,
      can_delete: r?.can_delete ?? d.can_delete,
    };
  }

  return matrix;
}

async function fetchMatrixForUser(userId: string): Promise<Record<PermissionModuleKey, ModulePermissionFlags>> {
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("school_id, support_context_school_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (pErr) throw pErr;

  const dbRole = (profile?.role ?? null) as SchoolUserRole | null;
  if (!dbRole || dbRole === "ADMIN" || dbRole === "SUPER_ADMIN") return fullAccessMatrix();

  const schoolId = effectiveSchoolIdFromProfile(profile);
  if (!schoolId) return matrixFromDefaultsOnly(dbRole);

  return fetchMatrixInner(schoolId, userId, dbRole);
}

export function useSchoolPermissionMatrix(): {
  matrix: Record<PermissionModuleKey, ModulePermissionFlags>;
  loading: boolean;
  canReadModule: (key: PermissionModuleKey) => boolean;
  canEditModule: (key: PermissionModuleKey) => boolean;
  canDeleteModule: (key: PermissionModuleKey) => boolean;
  error: unknown;
  refetch: () => void;
} {
  const { user } = useAuth();
  const { role, loading: roleLoading } = useUserRole();

  const bypass = role === "ADMIN" || role === "SUPER_ADMIN";

  const fallbackMat = useMemo(() => {
    if (bypass || !role) return fullAccessMatrix();
    return matrixFromDefaultsOnly(role as SchoolUserRole);
  }, [bypass, role]);

  const q = useQuery({
    queryKey: schoolPermissionMatrixQueryKey(user?.id ?? null),
    enabled: !!user?.id && !roleLoading && role != null && !bypass,
    staleTime: 30_000,
    queryFn: () => fetchMatrixForUser(user!.id),
  });

  const matrix = bypass ? fullAccessMatrix() : (q.data ?? fallbackMat);

  const waitingFirstFetch =
    !!user?.id && !bypass && !roleLoading && q.fetchStatus !== "idle" && !q.data && q.isFetching;

  return {
    matrix,
    loading: !!user?.id && (roleLoading || waitingFirstFetch),
    canReadModule: (key: PermissionModuleKey) => matrix[key]?.can_read === true,
    canEditModule: (key: PermissionModuleKey) => matrix[key]?.can_write === true,
    canDeleteModule: (key: PermissionModuleKey) => matrix[key]?.can_delete === true,
    error: q.error,
    refetch: () => void q.refetch(),
  };
}
