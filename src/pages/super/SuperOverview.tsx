import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, GraduationCap, RadioTower } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type OverviewRow = {
  total_schools: number;
  active_schools: number;
  total_student_profiles: number;
  total_staff_profiles: number;
};

const SuperOverview = () => {
  const [row, setRow] = useState<OverviewRow | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("platform_saas_dashboard_overview");
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        return;
      }
      const r = Array.isArray(data) ? data[0] : null;
      setRow(r ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {err}
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const kpis = [
    { icon: Building2, label: "Escolas", value: row.total_schools, badge: `${row.active_schools} act./trial` },
    { icon: GraduationCap, label: "Perfis estudante", value: row.total_student_profiles },
    { icon: RadioTower, label: "Perfis não-aluno/pai", value: row.total_staff_profiles },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Resumo da plataforma</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Indicadores agregados (todas as escolas). O controlo granular de módulos e impersonação ficam nas secções seguintes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ icon: Icon, label, value, badge }) => (
          <Card key={label} className="rounded-2xl border-border/70 p-5 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-pastel-blue/90 text-pastel-blue-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="text-3xl font-bold text-foreground">{value}</p>
                {badge ? <p className="text-[11px] text-muted-foreground">{badge}</p> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild className="rounded-full">
          <Link to="/super/escolas">Gerir escolas e módulos</Link>
        </Button>
        <Button variant="outline" asChild className="rounded-full">
          <Link to="/super/crm">CRM leads</Link>
        </Button>
        <Button variant="outline" asChild className="rounded-full">
          <Link to="/super/propostas">Propostas</Link>
        </Button>
        <Button variant="secondary" asChild className="rounded-full">
          <Link to="/dashboard">Painel escolar</Link>
        </Button>
      </div>
    </div>
  );
};

export default SuperOverview;
