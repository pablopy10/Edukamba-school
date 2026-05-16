import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { TENANT_CHANGED_EVENT, broadcastTenantChanged } from "@/lib/tenantBroadcast";

/**
 * SUPER_ADMIN em modo suporte: aviso quando `support_context_school_id` está activo (RLS vê dados dessa escola).
 */
export const SupportSessionBanner = () => {
  const { user } = useAuth();
  const { role } = useUserRole();
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [ctxSchoolId, setCtxSchoolId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || role !== "SUPER_ADMIN") {
      setCtxSchoolId(null);
      setSchoolName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("support_context_school_id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const sid = data?.support_context_school_id ?? null;
      setCtxSchoolId(sid);
      if (!sid) {
        setSchoolName(null);
        return;
      }
      const { data: s } = await supabase.from("schools").select("name").eq("id", sid).maybeSingle();
      if (!cancelled) setSchoolName(s?.name ?? "Escola");
    })();

    const onEv = () => {
      void (async () => {
        const { data } = await supabase
          .from("profiles")
          .select("support_context_school_id")
          .eq("id", user!.id)
          .maybeSingle();
        if (cancelled) return;
        const sid = data?.support_context_school_id ?? null;
        setCtxSchoolId(sid);
        if (!sid) {
          setSchoolName(null);
          return;
        }
        const { data: s } = await supabase.from("schools").select("name").eq("id", sid).maybeSingle();
        if (!cancelled) setSchoolName(s?.name ?? "Escola");
      })();
    };
    window.addEventListener(TENANT_CHANGED_EVENT, onEv);
    return () => {
      cancelled = true;
      window.removeEventListener(TENANT_CHANGED_EVENT, onEv);
    };
  }, [user?.id, role]);

  if (role !== "SUPER_ADMIN" || !ctxSchoolId) return null;

  const exit = async () => {
    await supabase.rpc("platform_super_clear_support_context");
    broadcastTenantChanged();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
      <p>
        Modo suporte Edukamba: a operar dados de <strong>{schoolName ?? ctxSchoolId}</strong>. Todas as acções ficam registadas pela escola nos audit logs habituais.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild className="rounded-full">
          <Link to="/super">← Área SaaS</Link>
        </Button>
        <Button variant="destructive" size="sm" className="rounded-full" onClick={() => void exit()}>
          Sair do modo escola
        </Button>
      </div>
    </div>
  );
};
