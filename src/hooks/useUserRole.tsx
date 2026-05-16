import { createContext, useContext, useEffect, useLayoutEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserRole =
  | "ADMIN"
  | "TEACHER"
  | "PARENT"
  | "STUDENT"
  | "SUPER_ADMIN"
  | "DIRECTOR"
  | "SECRETARY"
  | "TREASURER"
  | "LIBRARIAN"
  | "STOCK_MANAGER"
  | "RECEPTIONIST"
  | null;

type RoleContextValue = { role: UserRole; loading: boolean };

const UserRoleContext = createContext<RoleContextValue | null>(null);

const persistedRoleKey = (userId: string) => `edukamba.profileRole.${userId}`;

function readPersistedRole(userId: string): UserRole | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(persistedRoleKey(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as UserRole;
    if (v === null) return null;
    const allowed: UserRole[] = [
      "ADMIN",
      "TEACHER",
      "PARENT",
      "STUDENT",
      "SUPER_ADMIN",
      "DIRECTOR",
      "SECRETARY",
      "TREASURER",
      "LIBRARIAN",
      "STOCK_MANAGER",
      "RECEPTIONIST",
    ];
    if (allowed.includes(v as UserRole)) {
      return v as UserRole;
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

// Cache em memória + localStorage; o provider confirma sempre com o servidor (force) após identificar utilizador.
const roleCache = new Map<string, UserRole>();
const inflight = new Map<string, Promise<UserRole>>();/** Com `force`: ignora cache em memória (novo pedido ao servidor). */
const fetchRole = (userId: string, opts?: { force?: boolean }): Promise<UserRole> => {
  if (!opts?.force && roleCache.has(userId)) return Promise.resolve(roleCache.get(userId) ?? null);
  if (opts?.force) {
    inflight.delete(userId);
  }
  const existing = opts?.force ? undefined : inflight.get(userId);
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
  const [role, setRole] = useState<UserRole>(() =>
    user ? roleCache.get(user.id) ?? readPersistedRole(user.id) : null,
  );
  /** Sessão já presente antes do primeiro efeito: evita redirect errado antes do refetch (ex.: /super → /dashboard). */
  const [loading, setLoading] = useState<boolean>(() => Boolean(user?.id));

  useLayoutEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null);
      setLoading(false);
      return;
    }
    setRole(roleCache.get(user.id) ?? readPersistedRole(user.id));
    setLoading(true);
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    void fetchRole(user.id, { force: true }).then((r) => {
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
