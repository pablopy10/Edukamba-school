import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  GraduationCap,
  Sparkles,
  ArrowRight,
  Bell,
  Bus,
  Wallet,
  MessagesSquare,
  FileStack,
  Link2,
  Shield,
  Quote,
  Check,
  X,
  Cloud,
  Monitor,
  Smartphone,
  Gauge,
  WifiOff,
  Mail,
  CalendarDays,
} from "lucide-react";
import heroImage from "@/assets/landing-hero.jpg";


const Landing = () => {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation("common");

  const demoMailHref = useMemo(
    () => "mailto:geral@edukamba.com?subject=" + encodeURIComponent(t("landing.mail_demo_subject")),
    [t],
  );
  const planosMailHref = useMemo(
    () => "mailto:contacto@edukamba.ao?subject=" + encodeURIComponent(t("landing.mail_plans_subject")),
    [t],
  );

  const pillars = useMemo(
    () => [
      {
        icon: MessagesSquare,
        title: t("landing.pillar_comm_title"),
        bullets: [t("landing.pillar_comm_b1"), t("landing.pillar_comm_b2"), t("landing.pillar_comm_b3")],
        tone: "bg-pastel-blue text-pastel-blue-foreground",
      },
      {
        icon: Bus,
        title: t("landing.pillar_log_title"),
        bullets: [t("landing.pillar_log_b1"), t("landing.pillar_log_b2")],
        tone: "bg-pastel-green text-pastel-green-foreground",
      },
      {
        icon: Wallet,
        title: t("landing.pillar_fin_title"),
        bullets: [t("landing.pillar_fin_b1"), t("landing.pillar_fin_b2")],
        tone: "bg-pastel-yellow text-pastel-yellow-foreground",
      },
      {
        icon: FileStack,
        title: t("landing.pillar_sec_title"),
        bullets: [t("landing.pillar_sec_b1"), t("landing.pillar_sec_b2"), t("landing.pillar_sec_b3")],
        tone: "bg-pastel-lilac text-pastel-lilac-foreground",
      },
    ],
    [t],
  );

  const comparisonRows = useMemo(
    () => [
      {
        aspect: t("landing.compare_r1_aspect"),
        trad: t("landing.compare_r1_trad"),
        edu: t("landing.compare_r1_edu"),
      },
      {
        aspect: t("landing.compare_r2_aspect"),
        trad: t("landing.compare_r2_trad"),
        edu: t("landing.compare_r2_edu"),
      },
      {
        aspect: t("landing.compare_r3_aspect"),
        trad: t("landing.compare_r3_trad"),
        edu: t("landing.compare_r3_edu"),
      },
      {
        aspect: t("landing.compare_r4_aspect"),
        trad: t("landing.compare_r4_trad"),
        edu: t("landing.compare_r4_edu"),
      },
    ],
    [t],
  );

  const faqItems = useMemo(
    () => [
      { q: t("landing.faq1_q"), a: t("landing.faq1_a") },
      { q: t("landing.faq2_q"), a: t("landing.faq2_a") },
      { q: t("landing.faq3_q"), a: t("landing.faq3_a") },
    ],
    [t],
  );

  const showEscolasSection = false;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex shrink-0 items-center">
            <img src="/edukamba-logo.png" alt="Edukamba" className="h-8 w-auto" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <a href="#legado" className="transition-colors hover:text-foreground">
              {t("landing.nav_integration")}
            </a>
            <a href="#funcionalidades" className="transition-colors hover:text-foreground">
              {t("landing.nav_features")}
            </a>
            <a href="#porque" className="transition-colors hover:text-foreground">
              {t("landing.nav_why")}
            </a>
            {showEscolasSection && (
              <a href="#escolas" className="transition-colors hover:text-foreground">
                {t("landing.nav_schools")}
              </a>
            )}
            <a href="#faq" className="transition-colors hover:text-foreground">
              {t("landing.nav_faq")}
            </a>
            <a href="#contacto" className="transition-colors hover:text-foreground">
              {t("landing.nav_contact")}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/auth?tab=login">{tc("auth.tab_login")}</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
            >
              <Link to="/auth?tab=signup" className="gap-1">
                {t("landing.register_school")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — impacto imediato */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-pastel-blue opacity-55 blur-3xl" />
          <div className="absolute -bottom-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-pastel-green/35 blur-3xl" />
        </div>

        <div className="container grid gap-14 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
              <Sparkles className="h-3.5 w-3.5 text-pastel-blue-foreground" />
              {t("landing.hero_badge")}
            </span>
            <h1 className="text-4xl font-bold leading-[1.12] tracking-tight text-balance sm:text-5xl lg:text-[2.65rem] lg:leading-[1.1] xl:text-[2.85rem]">
              {t("landing.hero_title")}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
              {t("landing.hero_sub")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
              >
                <a href={demoMailHref} className="gap-2">
                  <CalendarDays className="h-4 w-4" />
                  {t("landing.cta_demo")}
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href={planosMailHref} className="gap-2">
                  {t("landing.cta_plans")}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("landing.hero_note")}
            </p>
          </div>

          {/* Mockup telemóvel + notificações */}
          <div className="relative mx-auto flex w-full max-w-[320px] justify-center lg:max-w-none">
            <div className="relative w-[280px] sm:w-[300px]">
              <div
                aria-hidden
                className="absolute inset-0 -translate-y-6 scale-105 rounded-[2.85rem] bg-gradient-to-br from-pastel-blue/50 to-pastel-green/25 blur-2xl"
              />
              <div className="relative overflow-hidden rounded-[2.65rem] border-[10px] border-foreground/[0.88] bg-foreground/[0.88] shadow-2xl">
                <div className="aspect-[9/19] overflow-hidden rounded-[2rem] bg-background">
                  <div className="relative h-[38%] w-full bg-muted">
                    <img
                      src={heroImage}
                      alt=""
                      className="h-full w-full object-cover opacity-95"
                      loading="eager"
                    />
                    <div className="absolute inset-x-3 top-3 flex justify-between text-[10px] font-semibold text-foreground">
                      <span>9:41</span>
                      <div className="flex gap-0.5 opacity-70">
                        <span className="h-2 w-3 rounded-sm bg-foreground/80" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2.5 p-4">
                    <p className="text-xs font-semibold text-muted-foreground">{t("landing.mock_notifications")}</p>
                    <div className="flex gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pastel-green/90 text-pastel-green-foreground">
                        <Wallet className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{t("landing.mock_fee_paid_title")}</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {t("landing.mock_fee_paid_body")}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
                        <Bus className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{t("landing.mock_bus_title")}</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          {t("landing.mock_bus_body")}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                      {t("landing.mock_footer")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ponte com legado */}
      <section id="legado" className="border-t border-border/60 bg-card/35 py-16 lg:py-24">
        <div className="container grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
          <div className="space-y-4">
            <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">{t("landing.legado_kicker")}</span>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              {t("landing.legado_title")}
            </h2>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              {t("landing.legado_p1")}
            </p>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              {t("landing.legado_p2")}
            </p>
          </div>
          <Card className="relative overflow-hidden rounded-2xl border-pastel-blue-foreground/25 bg-background p-6 shadow-card">
            <Link2 className="absolute right-4 top-4 h-14 w-14 text-pastel-blue/35" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("landing.legado_card_kicker")}</p>
            <p className="mt-3 text-lg font-semibold leading-snug">
              {t("landing.legado_card_title")}
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              {t("landing.legado_card_body")}
            </p>
          </Card>
        </div>
      </section>

      {/* Pilares */}
      <section id="funcionalidades" className="container py-16 lg:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">{t("landing.func_kicker")}</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("landing.func_title")}</h2>
          <p className="mt-4 text-muted-foreground">
            {t("landing.func_sub")}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {pillars.map(({ icon: Icon, title, bullets, tone }) => (
            <Card
              key={title}
              className="flex flex-col gap-4 rounded-2xl border-border/60 p-6 shadow-soft transition-all hover:shadow-card"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold">{title}</h3>
              <ul className="flex flex-1 flex-col gap-2 text-sm text-muted-foreground">
                {bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-pastel-blue-foreground" />
                    <span className="leading-snug">{b}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Prova social — ver `showEscolasSection` */}
      {showEscolasSection && (
        <section id="escolas" className="border-t border-border/60 bg-muted/25 py-16 lg:py-24">
          <div className="container space-y-12">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">
                Confiança
              </span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Escolas e conformidade</h2>
              <p className="mt-3 text-muted-foreground">
                Logótipos de parceiros à medida que fechamos cada escola — o CSFA será o primeiro em destaque.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
              {["CSFA", "Colégio parceiro", "Instituição piloto"].map((label) => (
                <div
                  key={label}
                  className="flex h-16 min-w-[140px] items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-sm font-medium text-muted-foreground"
                >
                  {label === "CSFA" ? (
                    <span className="text-foreground">
                      <span className="font-bold">CSFA</span>
                      <span className="ml-1 text-xs font-normal text-muted-foreground">(breve)</span>
                    </span>
                  ) : (
                    label
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="flex flex-col justify-center gap-3 rounded-2xl border-border/60 p-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
                    <Shield className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">Alinhamento fiscal — AGT</p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      Mercado angolano
                    </Badge>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Facturação e recibos conforme as exigências da{" "}
                  <strong>Administração Geral Tributária (AGT)</strong>, para reduzir risco e atrito com auditorias e
                  reportes às famílias.
                </p>
              </Card>

              <Card className="relative overflow-hidden rounded-2xl border-pastel-blue-foreground/20 bg-card p-8 shadow-soft">
                <Quote className="absolute right-6 top-6 h-16 w-16 text-pastel-blue/25" aria-hidden />
                <p className="text-lg font-medium leading-relaxed text-foreground">
                  “O Edukamba reduziu o fluxo de chamadas na nossa secretaria em <strong>60%</strong> no primeiro mês.”
                </p>
                <p className="mt-4 text-sm text-muted-foreground">— Equipa de secretaria, escola piloto</p>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Comparação */}
      <section id="porque" className="container py-16 lg:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">{t("landing.compare_kicker")}</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("landing.compare_title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("landing.compare_sub")}</p>
        </div>

        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-border text-sm">
            <div className="bg-muted/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("landing.compare_col_aspect")}
            </div>
            <div className="bg-muted/40 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("landing.compare_col_trad")}
            </div>
            <div className="bg-pastel-blue/25 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-pastel-blue-foreground">
              {t("landing.compare_col_edu")}
            </div>
            {comparisonRows.map((row) => (
              <div key={row.aspect} className="contents">
                <div className="bg-background px-4 py-4 font-medium">{row.aspect}</div>
                <div className="bg-background px-4 py-4 text-muted-foreground">
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                    <X className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </span>
                  <span className="align-middle leading-snug">{row.trad}</span>
                </div>
                <div className="bg-background px-4 py-4">
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-pastel-green/35 text-pastel-green-foreground">
                    <Check className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="align-middle text-pretty leading-snug">{row.edu}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 border-t border-border bg-muted/20 px-4 py-4 text-xs text-muted-foreground sm:gap-10">
            <span className="inline-flex items-center gap-2">
              <Monitor className="h-4 w-4" /> {t("landing.compare_foot_desk")}
            </span>
            <span className="inline-flex items-center gap-2">
              <Gauge className="h-4 w-4 text-destructive/80" aria-hidden /> {t("landing.compare_foot_slow")}
            </span>
            <span className="inline-flex items-center gap-2">
              <WifiOff className="h-4 w-4" /> {t("landing.compare_foot_dep")}
            </span>
            <span className="hidden items-center gap-2 sm:inline-flex">
              <Cloud className="h-4 w-4 text-pastel-blue-foreground" /> {t("landing.compare_foot_cloud")}
            </span>
            <span className="inline-flex items-center gap-2 font-medium text-pastel-blue-foreground">
              <Smartphone className="h-4 w-4" /> {t("landing.compare_foot_mobile")}
            </span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border/60 bg-card/25 py-16 lg:py-24">
        <div className="container mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">{t("landing.faq_kicker")}</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">{t("landing.faq_title")}</h2>
          </div>
          <Accordion type="single" collapsible className="w-full rounded-xl border border-border/60 bg-card px-4">
            {faqItems.map((item, idx) => (
              <AccordionItem key={item.q} value={`item-${idx}`}>
                <AccordionTrigger className="text-left text-base hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="container pb-20 pt-8 lg:pb-28">
        <Card className="relative overflow-hidden rounded-3xl border-border/60 bg-pastel-blue p-10 text-center shadow-card sm:p-16">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-pastel-blue-foreground/20 blur-3xl" />
          <Bell className="mx-auto mb-4 h-10 w-10 text-pastel-blue-foreground opacity-90" aria-hidden />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("landing.cta2_title")}</h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
            {t("landing.cta2_body")}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
            >
              <a href={demoMailHref} className="gap-2">
                <Mail className="h-4 w-4" />
                {t("landing.cta2_demo")}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full bg-background/60">
              <a href={planosMailHref}>{t("landing.cta2_email_plans")}</a>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-full">
              <Link to="/auth?tab=signup">{t("landing.cta2_create")}</Link>
            </Button>
          </div>
        </Card>
      </section>

      <footer className="border-t border-border/60">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pastel-blue text-pastel-blue-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="font-medium text-foreground">Edukamba</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <a href="#funcionalidades" className="hover:text-foreground">
              {t("landing.footer_features")}
            </a>
            <a href="#legado" className="hover:text-foreground">
              {t("landing.footer_integration")}
            </a>
            <a href="#faq" className="hover:text-foreground">
              {t("landing.footer_faq")}
            </a>
            <Link to="/termos" className="hover:text-foreground">
              {tc("auth.terms")}
            </Link>
            <Link to="/privacidade" className="hover:text-foreground">
              {tc("auth.privacy_policy")}
            </Link>
            <Link to="/dashboard" className="hover:text-foreground">
              {tc("nav.dashboard_short")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
