import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import TrialExpirado from "@/pages/TrialExpirado";
import { isDashboardRouteBlockedOnNative } from "@/lib/nativeApp";
import {
  getRouteGuardSnapshot,
  setRouteGuardSnapshot,
  type RouteGuardSnapshot,
} from "@/lib/routeGuardCache";

/**
 * Portão de sessão + escola + trial. Renderiza `<Outlet />` para rotas filhas.
 * Com rotas aninhadas em App.tsx, o componente mantém-se montado ao navegar
 * entre páginas do dashboard — evita spinner completo a cada troca de rota.
 */
export const ProtectedRoute = () => {
  const { session, user, loading } = useAuth();
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<RouteGuardSnapshot | null>(() =>
    user?.id ? getRouteGuardSnapshot(user.id) ?? null : null,
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setSnapshot(null);
      return;
    }

    const cached = getRouteGuardSnapshot(user.id);
    if (cached) {
      setSnapshot(cached);
      return;
    }

    let cancelled = false;

    const run = async () => {
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase
          .from("profiles")
          .select("school_id, is_active")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          const hasSchool = !!data.school_id;
          const isActive = data.is_active !== false;
          let schoolName: string | null = null;
          let trialEndsAt: string | null = null;
          let trialExpired = false;

          if (data.school_id) {
            const { data: school } = await supabase
              .from("schools")
              .select("name, trial_ends_at, subscription_status")
              .eq("id", data.school_id)
              .maybeSingle();
            if (cancelled) return;
            if (school) {
              schoolName = school.name;
              trialEndsAt = school.trial_ends_at;
              trialExpired =
                school.subscription_status !== "active" &&
                (school.subscription_status !== "trialing" ||
                  new Date(school.trial_ends_at).getTime() <= Date.now());
            }
          }

          const snap: RouteGuardSnapshot = {
            hasSchool,
            isActive,
            trialExpired,
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
        setSnapshot(snap);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

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

  if (!snapshot.hasSchool && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (snapshot.hasSchool && snapshot.trialExpired && location.pathname !== "/onboarding") {
    return (
      <TrialExpirado schoolName={snapshot.schoolName} trialEndedAt={snapshot.trialEndsAt} />
    );
  }

  if (isDashboardRouteBlockedOnNative(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};
