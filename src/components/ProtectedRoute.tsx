import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import TrialExpirado from "@/pages/TrialExpirado";
import { isDashboardRouteBlockedOnNative } from "@/lib/nativeApp";
import {
  clearRouteGuardCache,
  getRouteGuardSnapshot,
  setRouteGuardSnapshot,
  type RouteGuardSnapshot,
} from "@/lib/routeGuardCache";
import { TENANT_CHANGED_EVENT } from "@/lib/tenantBroadcast";

export const ProtectedRoute = () => {
  const { session, user, loading } = useAuth();
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<RouteGuardSnapshot | null>(() => {
    if (!user?.id) return null;
    const warm = getRouteGuardSnapshot(user.id);
    /** Não reutilizar cache "sem escola": evita um frame de redirect errado antes do refetch (JWT/rede). */
    return warm?.hasSchool ? warm : null;
  });
  const [tenantEpoch, setTenantEpoch] = useState(0);

  useEffect(() => {
    const bump = () => {
      if (user?.id) clearRouteGuardCache(user.id);
      setSnapshot(null);
      setTenantEpoch((e) => e + 1);
    };
    window.addEventListener(TENANT_CHANGED_EVENT, bump);
    return () => window.removeEventListener(TENANT_CHANGED_EVENT, bump);
  }, [user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setSnapshot(null);
      return;
    }

    const cached = getRouteGuardSnapshot(user.id);
    // Only trust cached "tem escola" snapshots. A primeira leitura do perfil pode falhar por timing
    // do JWT/rede e ficar gravada como hasSchool: false até ao fim da sessão — preso ao onboarding,
    // em especial SUPER_ADMIN sem escola efectiva (dashboard de gestão vs painel Escola).
    if (cached?.hasSchool && tenantEpoch === 0) {
      setSnapshot(cached);
      return;
    }

    let cancelled = false;

    const run = async () => {
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase
          .from("profiles")
          .select("school_id, support_context_school_id, role, is_active")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          const tenantId = data.support_context_school_id ?? data.school_id ?? null;
          const isSuperAdmin = data.role === "SUPER_ADMIN";
          /** SUPER_ADMIN pode aceder ao produto mesmo sem onboarding de escola; é redireccionado pela SuperTenantRedirect. */
          const hasSchool = !!tenantId || isSuperAdmin;
          const isActive = data.is_active !== false;

          let schoolName: string | null = null;
          let trialEndsAt: string | null = null;
          let trialExpired = false;

          if (tenantId && !isSuperAdmin) {
            const { data: school } = await supabase
              .from("schools")
              .select("name, trial_ends_at, subscription_status")
              .eq("id", tenantId)
              .maybeSingle();
            if (cancelled) return;
            if (school) {
              schoolName = school.name;
              trialEndsAt = school.trial_ends_at;
              trialExpired =
                school.subscription_status !== "active" &&
                (school.subscription_status !== "trialing" ||
                  new Date((school.trial_ends_at as string) ?? 0).getTime() <= Date.now());
            }
          }

          const snap: RouteGuardSnapshot = {
            hasSchool,
            isActive,
            trialExpired: !isSuperAdmin && trialExpired,
            schoolName,
            trialEndsAt,
          };
          setRouteGuardSnapshot(user.id, snap);
          if (!cancelled) setSnapshot(snap);
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!cancelled) {
        const snap: RouteGuardSnapshot = {
          hasSchool: false,
          isActive: true,
          trialExpired: false,
          schoolName: null,
          trialEndsAt: null,
        };
        setRouteGuardSnapshot(user.id, snap);
        if (!cancelled) setSnapshot(snap);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading, tenantEpoch]);

  if (loading || (session && user && !snapshot)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!snapshot.isActive) {
    void supabase.auth.signOut();
    return <Navigate to="/auth" replace />;
  }

  const isSuperArea = location.pathname === "/super" || location.pathname.startsWith("/super/");

  if (!snapshot.hasSchool && location.pathname !== "/onboarding" && !isSuperArea) {
    return <Navigate to="/onboarding" replace />;
  }

  if (
    snapshot.hasSchool &&
    snapshot.trialExpired &&
    location.pathname !== "/onboarding" &&
    !isSuperArea
  ) {
    return <TrialExpirado schoolName={snapshot.schoolName} trialEndedAt={snapshot.trialEndsAt} />;
  }

  if (isDashboardRouteBlockedOnNative(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
