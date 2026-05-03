import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserRole = "ADMIN" | "TEACHER" | "PARENT" | "STUDENT" | "SUPER_ADMIN" | null;

type RoleContextValue = { role: UserRole; loading: boolean };

const UserRoleContext = createContext<RoleContextValue | null>(null);

const persistedRoleKey = (userId: string) => `edukamba.profileRole.${userId}`;

function readPersistedRole(userId: string): UserRole | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(persistedRoleKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as UserRole;
    if (v === "ADMIN" || v === "TEACHER" || v === "PARENT" || v === "STUDENT" || v === "SUPER_ADMIN" || v === null) {
      return v;
    }
    return null;
  } catch {
    return null;
  }
}

function writePersistedRole(userId: string, role: UserRole) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(persistedRoleKey(userId), JSON.stringify(role));
  } catch {
    /* ignore */
  }
}

function clearPersistedRole(userId: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(persistedRoleKey(userId));
  } catch {
    /* ignore */
  }
}

// Module-level cache so the role survives unmounts/remounts and is reused
// across navigations without refetching (eliminates the sidebar flash).
const roleCache = new Map<string, UserRole>();
const inflight = new Map<string, Promise<UserRole>>();

const fetchRole = (userId: string): Promise<UserRole> => {
  if (roleCache.has(userId)) return Promise.resolve(roleCache.get(userId) ?? null);
  const existing = inflight.get(userId);
  if (existing) return existing;
  const p = (async () => {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const r = (data?.role as UserRole) ?? null;
    roleCache.set(userId, r);
    writePersistedRole(userId, r);
    inflight.delete(userId);
    return r;
  })();
  inflight.set(userId, p);
  return p;
};

export const UserRoleProvider = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const cached = user ? roleCache.get(user.id) ?? null : null;
  const [role, setRole] = useState<UserRole>(cached);
  const [loading, setLoading] = useState<boolean>(user ? !roleCache.has(user.id) : true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    if (roleCache.has(user.id)) {
      setRole(roleCache.get(user.id) ?? null);
      setLoading(false);
      return;
    }
    const disk = readPersistedRole(user.id);
    if (disk !== null) {
      roleCache.set(user.id, disk);
      setRole(disk);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchRole(user.id).then((r) => {
      if (cancelled) return;
      setRole(r);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  return (
    <UserRoleContext.Provider value={{ role, loading }}>
      {children}
    </UserRoleContext.Provider>
  );
};

export const useUserRole = (): RoleContextValue => {
  const ctx = useContext(UserRoleContext);
  if (ctx) return ctx;
  // Fallback (should not happen if provider is mounted) — preserves API.
  return { role: null, loading: true };
};
