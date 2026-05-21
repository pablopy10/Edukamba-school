import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Building2,
  ChartNoAxesCombined,
  GraduationCap,
  HardDrive,
  Mail,
  RadioTower,
  School,
  UsersRound,
} from "lucide-react";
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
  nif: string | null;
  address: string | null;
  created_at: string | null;
  saas_contract_number: string | null;
  saas_billing_email: string | null;
  monthly_recurring_amount: number;
  usage_brevo_emails_sent_mt: number;
  usage_proof_storage_bytes_estimate: number;
};

type FinanceRow = {
  mrr: number;
  arr: number;
  paying_schools: number;
  avg_ltv_estimate: number;
  churn_schools_30d: number;
  churn_rate_pct: number | null;
  avg_tenure_months: number;
  computed_at: string;
};

type EngagementRow = {
  schools_total: number;
  students_roster: number;
  parents_total: number;
  staff_logins_24h: number;
  parent_logins_24h: number;
  proofs_validated_payments_mt: number;
  invoice_proofs_marked_mt: number;
  computed_at: string;
};

const formatKz = (n: number) =>
  new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);

const pctText = (p: number | null) => {
  if (p == null || Number.isNaN(p)) return "—";
  return `${p.toFixed(1)}%`;
};

const SuperOverview = () => {
  const [row, setRow] = useState<OverviewRow | null>(null);
  const [schools, setSchools] = useState<SchoolRow[] | null>(null);
  const [finance, setFinance] = useState<FinanceRow | null>(null);
  const [engagement, setEngagement] = useState<EngagementRow | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [financeErr, setFinanceErr] = useState<string | null>(null);
  const [engagementErr, setEngagementErr] = useState<string | null>(null);
  const [schoolsErr, setSchoolsErr] = useState<string | null>(null);

  const loadAll = useCallback(() => {
    void (async () => {
      setErr(null);
      setSchoolsErr(null);
      setFinanceErr(null);
      setEngagementErr(null);

      const [ov, sc, fi, eg] = await Promise.all([
        supabase.rpc("platform_saas_dashboard_overview"),
        supabase.rpc("platform_saas_list_schools_with_counts"),
        supabase.rpc("platform_saas_finance_metrics"),
        supabase.rpc("platform_saas_engagement_metrics"),
      ]);

      if (ov.error) {
        setErr(ov.error.message);
        return;
      }
      const base = Array.isArray(ov.data) ? ov.data[0] : null;
      setRow((base ?? null) as OverviewRow | null);

      if (fi.error) {
        setFinanceErr(fi.error.message);
        setFinance(null);
      } else {
        const fx = Array.isArray(fi.data) ? fi.data[0] : null;
        setFinance(((fx ?? null) as FinanceRow | null) ?? null);
      }

      if (eg.error) {
        setEngagementErr(eg.error.message);
        setEngagement(null);
      } else {
        const gx = Array.isArray(eg.data) ? eg.data[0] : null;
        setEngagement(((gx ?? null) as EngagementRow | null) ?? null);
      }

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

  const healthKpis = [
    {
      icon: ChartNoAxesCombined,
      label: "MRR (mensalidades contratadas)",
      value: `${formatKz(finance?.mrr ?? 0)} Kz`,
      badge:
        `${finance?.paying_schools ?? 0} escolas pagadoras · valores em saas_subscriptions.monthly_recurring_amount`.trim(),
    },
    {
      icon: ChartNoAxesCombined,
      label: "ARR (projeção 12 meses)",
      value: `${formatKz(finance?.arr ?? 0)} Kz`,
      badge: `MRR × 12 (${finance?.computed_at ? new Date(finance.computed_at).toLocaleString("pt-PT") : "—"})`,
    },
    {
      icon: Activity,
      label: "Churn (30 dias)",
      value: `${finance?.churn_schools_30d ?? 0} · ${pctText(finance?.churn_rate_pct ?? null)}`,
      badge: "Baseado em schools.subscription_cancelled_at (marcar quando houver churn real).",
    },
    {
      icon: ChartNoAxesCombined,
      label: "LTV médio estimado · permanência média",
      value: `${formatKz(finance?.avg_ltv_estimate ?? 0)} Kz`,
      badge: `~${Number(finance?.avg_tenure_months ?? 0).toFixed(1)} meses médios desde a data de registo SaaS.`,
    },
  ];

  const counterKpis = [
    {
      icon: Building2,
      label: "Escolas",
      value: engagement?.schools_total ?? row.total_schools,
      badge: `${row.active_schools} activas ou em trial segundo subscription_status.`,
    },
    {
      icon: School,
      label: "Total de alunos (base académica)",
      value: engagement?.students_roster ?? schoolTotals.students,
      badge:
        engagement?.students_roster != null ? "Todos os estudantes registados como alunos." : schoolTotals.students ? "Somado por escolas na lista abaixo (fallback)." : "",
    },
    {
      icon: UsersRound,
      label: "Encarregados (perfis pai)",
      value: engagement?.parents_total ?? 0,
      badge: `Proxy instalada App · engajamento: ${Number(engagement?.parent_logins_24h ?? 0)} logins (auth) últ. 24 h.`,
    },
    {
      icon: RadioTower,
      label: "Staff logins últ. 24 h",
      value: engagement?.staff_logins_24h ?? 0,
      badge: `Docentes/admin com last_sign_in recente (${Number(engagement?.staff_logins_24h ?? 0)} utilizadores únicos).`,
    },
    {
      icon: GraduationCap,
      label: "Perfis STUDENT (utilizador)",
      value: row.total_student_profiles,
      badge: "Alunos também como conta de utilizador.",
    },
    {
      icon: UsersRound,
      label: "Staff institucional (aprox.)",
      value: schoolTotals.staff,
      badge: "Soma das contagens por escola na tabela de baixo.",
    },
  ];

  const transactionKpis = [
    {
      icon: Mail,
      label: "Comprovativos validados · pagamentos tuition",
      value: engagement?.proofs_validated_payments_mt ?? 0,
      badge: `Mês corrente (UTC) sobre public.payments com proof_url.`,
    },
    {
      icon: HardDrive,
      label: "Faturas SaaS ligadas · comprovativos marcados",
      value: engagement?.invoice_proofs_marked_mt ?? 0,
      badge: "school_invoices com proof_url e submitted_at no mês UTC.",
    },
  ];

  return (
    <div className="space-y-12">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Dashboard de operações · Edukamba
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Consola para saúde financeira da plataforma, engajamento global, revisão rápida de escolas clientes e ligações
          ao CRM, propostas e auditoria. Para resolver um incidente numa instituição, use{" "}
          <strong className="font-medium text-foreground">Aceder como administrador</strong> em Escolas ou defina um
          follow-up pela equipa via CRM Kanban.
        </p>
      </div>

      <section id="financeiro" className="space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">1 · Métricas de saúde do negócio</h2>
          <p className="text-sm text-muted-foreground">
            MRR/ARR somam apenas escolas marcadas como <code className="text-[11px]">active</code> com mensalidades
            preenchidas no plano SaaS.
          </p>
        </div>
        {financeErr ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Métricas financeiras: {financeErr}{" "}
            <span className="opacity-85">Confirme se a migração `20260513171000_super_platform_metrics` foi aplicada.</span>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {healthKpis.map(({ icon: Icon, label, value, badge }) => (
            <Card key={label} className="rounded-2xl border-border/70 p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-900">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">{value}</p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{badge}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section id="escolas" className="space-y-4 scroll-mt-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">2 · Gestão de escolas (multi‑tenant)</h2>
            <p className="text-sm text-muted-foreground">
              Perfil SaaS consolidado, flags de bloqueios, consumos e entrada directa ao painel com permissões ADMIN.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="w-fit shrink-0 rounded-full">
            <Link to="/super/escolas">Gerir todas as instituições</Link>
          </Button>
        </div>
      </section>

      <section id="engajamento" className="space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">3 · Utilização · engajamento</h2>
          <p className="text-sm text-muted-foreground">
            DAU aproxima-se via <strong className="font-medium text-foreground">auth.users.last_sign_in_at</strong> nas
            últimas 24 h (não mede apenas calendário civil).
          </p>
        </div>
        {engagementErr ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Engajamento: {engagementErr}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {counterKpis.map(({ icon: Icon, label, value, badge }) => (
            <Card key={label} className="rounded-2xl border-border/70 p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pastel-blue/90 text-pastel-blue-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">{value}</p>
                  {badge ? (
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{badge}</p>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
          {transactionKpis.map(({ icon: Icon, label, value, badge }) => (
            <Card key={label} className="rounded-2xl border-border/70 p-5 shadow-soft sm:col-span-2 xl:col-span-1">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100/95 text-amber-950">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">{value}</p>
                  {badge ? (
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{badge}</p>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section id="growth" className="space-y-3 scroll-mt-6">
        <h2 className="text-lg font-semibold text-foreground">4 · CRM Kanban · 5 · Orçamentos · 6 · Auditoria</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/super/crm">CRM — Nova lead → Ganho/perdido</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/super/proforma-invoices">Orçamentos e Faturas Pró-Forma</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/super/auditoria">Auditoria + Sentry</Link>
          </Button>
          <Button asChild className="rounded-full">
            <Link to="/super/escolas">Escolas · bloqueios · suporte Admin</Link>
          </Button>
        </div>
      </section>

      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Detalhe por escola</h2>
            <p className="text-sm text-muted-foreground">Mensalidades SaaS, NIF/contacto fiscal e ocupação rápida.</p>
          </div>
          <Button asChild variant="outline" size="sm" className="w-fit shrink-0 rounded-full">
            <Link to="/super/escolas">Gestão integral</Link>
          </Button>
        </div>

        {schoolsErr ? (
          <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {schoolsErr}
          </div>
        ) : null}

        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-soft">
          <div className="max-h-[min(520px,60vh)] overflow-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-muted/65 text-muted-foreground backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold">Escola</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right tabular-nums">Alunos</th>
                  <th className="px-4 py-3 font-semibold text-right tabular-nums">Staff</th>
                  <th className="px-4 py-3 font-semibold text-right tabular-nums">MRR</th>
                  <th className="px-4 py-3 font-semibold">NIF · consumo mails</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr key={s.school_id} className="border-t border-border/70 align-top">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <div>{s.school_name}</div>
                      {s.address ? (
                        <div className="text-[11px] text-muted-foreground">{s.address}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.subscription_status || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.student_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.staff_count}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatKz(Number(s.monthly_recurring_amount) || 0)}</td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-foreground">{s.nif || "Sem NIF"}</div>
                      <div className="text-[11px] text-muted-foreground">{s.usage_brevo_emails_sent_mt ?? 0} emails</div>
                    </td>
                  </tr>
                ))}
                {schools.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Sem escolas registadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SuperOverview;
