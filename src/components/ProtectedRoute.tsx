import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, user, loading } = useAuth();
  const location = useLocation();
  const [schoolChecked, setSchoolChecked] = useState(false);
  const [hasSchool, setHasSchool] = useState<boolean>(false);

  useEffect(() => {
    if (loading || !user) {
      setSchoolChecked(false);
      return;
    }
    supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHasSchool(!!data?.school_id);
        setSchoolChecked(true);
      });
  }, [user, loading]);

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

  // User signed in but has no school → force onboarding
  if (!hasSchool && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};