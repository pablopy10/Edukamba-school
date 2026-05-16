import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, GraduationCap, RadioTower, School, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type OverviewRow = {
  total_schools: number;
  active_schools: number;
  total_student_profiles: number;
  total_staff_profiles: number;
};

type SchoolRow = {
  school_id: string;
  school_name: string;
  subscription_status: string;
  student_count: number;
  staff_count: number;
};

const SuperOverview = () => {
  const [row, setRow] = useState<OverviewRow | null>(null);
  const [schools, setSchools] = useState<SchoolRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [schoolsErr, setSchoolsErr] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    void (async () => {
      setErr(null);
      setSchoolsErr(null);
      const [ov, sc] = await Promise.all([
        supabase.rpc("platform_saas_dashboard_overview"),
        supabase.rpc("platform_saas_list_schools_with_counts"),
      ]);
      if (ov.error) {
        setErr(ov.error.message);
        return;
      }
      const base = Array.isArray(ov.data) ? ov.data[0] : null;
      setRow((base ?? null) as OverviewRow | null);

      if (sc.error) {
        setSchoolsErr(sc.error.message);
        setSchools([]);
        return;
      }
      setSchools(((Array.isArray(sc.data) ? sc.data : []) as unknown as SchoolRow[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const schoolTotals = useMemo(() => {
    if (!schools?.length) return { students: 0, staff: 0 };
    return schools.reduce(
      (acc, s) => ({
        students: acc.students + (Number(s.student_count) || 0),
        staff: acc.staff + (Number(s.staff_count) || 0),
      }),
      { students: 0, staff: 0 },
    );
  }, [schools]);

  if (err) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        {err}
      </div>
    );
  }

  if (!row || schools === null) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const kpis = [
    {
      icon: Building2,
      label: "Escolas na plataforma",
      value: row.total_schools,
      badge: `${row.active_schools} com plano activo ou trial`,
    },
    {
      icon: School,
      label: "Total de alunos (por escola)",
      value: schoolTotals.students,
      badge: "Soma das contagens por escola (tabela académica)",
    },
    {
      icon: GraduationCap,
      label: "Perfis STUDENT na base",
      value: row.total_student_profiles,
      badge: "Todos os estudantes registados como utilizador",
    },
    {
      icon: UsersRound,
      label: "Staff institucional (aprox.)",
      value: schoolTotals.staff,
      badge: "Soma das contagens por escola na tabela em baixo",
    },
    {
      icon: RadioTower,
      label: "Perfis não-aluno / pai (global)",
      value: row.total_staff_profiles,
      badge: "Docentes, admin, outros",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Resumo da plataforma</h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Visão consolidada de todas as escolas Edukamba. Para configurar uma escola concreta em nome da equipa, sem pedir
          acesso ao director, vá a <strong className="font-medium text-foreground">Escolas</strong> e utilize{" "}
          <strong className="font-medium text-foreground">Assumir controlo</strong> — modo suporte com permissões de
          administrador nessa escola.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ icon: Icon, label, value, badge }) => (
          <Card key={label} className="rounded-2xl border-border/70 p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pastel-blue/90 text-pastel-blue-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">{value}</p>
                {badge ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{badge}</p> : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Detalhe por escola</h2>
            <p className="text-sm text-muted-foreground">Alunos na escola, staff e estado de subscrição.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="w-fit shrink-0 rounded-full">
            <Link to="/super/escolas">Gerir escolas e bloqueios de módulos</Link>
          </Button>
        </div>

        {schoolsErr ? (
          <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {schoolsErr}
          </div>
        ) : null}

        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-soft">
          <div className="max-h-[min(480px,55vh)] overflow-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/65 text-muted-foreground backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold">Escola</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right tabular-nums">Alunos</th>
                  <th className="px-4 py-3 font-semibold text-right tabular-nums">Staff</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s.school_id} className="border-t border-border/70">
                    <td className="px-4 py-2.5 font-medium text-foreground">{s.school_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.subscription_status || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.student_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.staff_count}</td>
                  </tr>
                ))}
                {schools.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      Sem escolas registadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild className="rounded-full">
          <Link to="/super/escolas">Escolas · bloqueios · assumir controlo</Link>
        </Button>
        <Button variant="outline" asChild className="rounded-full">
          <Link to="/super/crm">CRM — Kanban de leads</Link>
        </Button>
        <Button variant="outline" asChild className="rounded-full">
          <Link to="/super/propostas">Propostas comerciais</Link>
        </Button>
      </div>
    </div>
  );
};

export default SuperOverview;
