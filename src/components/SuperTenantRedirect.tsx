import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * SUPER_ADMIN sem escola efectiva não deve ficar perdido num painel escolar em branco.
 */
export function SuperTenantRedirect() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role, loading } = useUserRole();

  useEffect(() => {
    if (loading || !user?.id || role !== "SUPER_ADMIN") return;

    let cancelled = false;

    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const tenant = data.support_context_school_id ?? data.school_id;
      if (!tenant) {
        navigate("/super", { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, role, loading, navigate]);

  return null;
}
