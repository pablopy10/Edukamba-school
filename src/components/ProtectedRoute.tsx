import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import TrialExpirado from "@/pages/TrialExpirado";
import { isDashboardRouteBlockedOnNative } from "@/lib/nativeApp";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, user, loading } = useAuth();
  const location = useLocation();
  const [schoolChecked, setSchoolChecked] = useState(false);
  const [hasSchool, setHasSchool] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [trialExpired, setTrialExpired] = useState(false);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const checkedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      checkedForUserRef.current = null;
      setSchoolChecked(false);
      setHasSchool(false);
      setTrialExpired(false);
      return;
    }
    // Only check once per authenticated user id (avoid re-running on every auth event)
    if (checkedForUserRef.current === user.id) return;
    checkedForUserRef.current = user.id;

    let cancelled = false;
    const run = async () => {
      // Retry briefly to handle the race with the handle_new_user trigger
      for (let i = 0; i < 5; i++) {
        const { data } = await supabase
          .from("profiles")
          .select("school_id, is_active")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setHasSchool(!!data.school_id);
          setIsActive(data.is_active !== false);
          if (data.school_id) {
            const { data: school } = await supabase
              .from("schools")
              .select("name, trial_ends_at, subscription_status")
              .eq("id", data.school_id)
              .maybeSingle();
            if (cancelled) return;
            if (school) {
              setSchoolName(school.name);
              setTrialEndsAt(school.trial_ends_at);
              const expired =
                school.subscription_status !== "active" &&
                (school.subscription_status !== "trialing" ||
                  new Date(school.trial_ends_at).getTime() <= Date.now());
              setTrialExpired(expired);
            }
          }
          setSchoolChecked(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (!cancelled) {
        setHasSchool(false);
        setSchoolChecked(true);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  if (loading || (session && !schoolChecked)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Inactive / removed users → force sign-out
  if (!isActive) {
    void supabase.auth.signOut();
    return <Navigate to="/auth" replace />;
  }

  // User signed in but has no school → force onboarding
  if (!hasSchool && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // School trial expired → block all routes (except onboarding) with notice screen
  if (hasSchool && trialExpired && location.pathname !== "/onboarding") {
    return <TrialExpirado schoolName={schoolName} trialEndedAt={trialEndsAt} />;
  }

  if (isDashboardRouteBlockedOnNative(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};