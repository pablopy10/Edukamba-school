import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isNativeMobileApp } from "@/lib/nativeApp";
import Landing from "@/pages/Landing.tsx";

/**
 * Na web: landing de marketing.
 * Na app iOS/Android: primeiro ecrã = Painel se há sessão, senão login (sem landing).
 */
export const NativeAppRoot = () => {
  const native = isNativeMobileApp();
  const [ready, setReady] = useState(!native);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (!native) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setHasSession(!!session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, session) => {
      setHasSession(!!session);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [native]);

  if (!native) {
    return <Landing />;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="A carregar" />
      </div>
    );
  }

  if (hasSession) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/auth" replace />;
};
