import { Link } from "react-router-dom";
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

const demoMailHref =
  "mailto:geral@edukamba.com?subject=" + encodeURIComponent("Agendar demonstração – Edukamba");
const planosMailHref =
  "mailto:contacto@edukamba.ao?subject=" + encodeURIComponent("Informação sobre planos – Edukamba");

const pillars = [
  {
    icon: MessagesSquare,
    title: "Comunicação de elite",
    bullets: ["Notificações push e emails automáticos", "Avisos de eventos e lembretes", "Menos papel na mochila"],
    tone: "bg-pastel-blue text-pastel-blue-foreground",
  },
  {
    icon: Bus,
    title: "Logística inteligente",
    bullets: [
      "Transporte escolar: giros e paragens",
      "Refeitório: planos e inscrições com cobrança alinhada",
    ],
    tone: "bg-pastel-green text-pastel-green-foreground",
  },
  {
    icon: Wallet,
    title: "Finanças sem stress",
    bullets: ["Validação de comprovativos na app", "Lembretes de propinas para reduzir inadimplência"],
    tone: "bg-pastel-yellow text-pastel-yellow-foreground",
  },
  {
    icon: FileStack,
    title: "Secretaria digital",
    bullets: ["Documentos e formulários centralizados", "Matrículas e renovações à distância", "Pedidos de ausência simplificados"],
    tone: "bg-pastel-lilac text-pastel-lilac-foreground",
  },
];

const comparisonRows = [
  {
    aspect: "Velocidade de trabalho",
    trad: "Fluxos lentos em filas únicas ao balcão",
    edu: "Respostas e ações registadas à distância, em tempo real",
  },
  {
    aspect: "Onde corre",
    trad: "Dependente de postos em escritório (desktop)",
    edu: "Cloud + experiência mobile para quem precisa de agilidade",
  },
  {
    aspect: "Comunicação com encarregados",
    trad: "Papéis, telefonemas e filas na secretaria",
    edu: "Push, email e histórico na app — menos ruído operacional",
  },
  {
    aspect: "Conformidade fiscal (Angola)",
    trad: "Processos manuais e dispersos entre sistemas",
    edu: "Emissões e fluxos alinhados com práticas e integração fiscal (AGT)",
  },
];

const faqItems = [
  {
    q: "É difícil migrar os dados?",
    a: "Não precisa de uma rutura abrupta com o sistema que já usa. O Edukamba foi pensado como camada complementar: pode começar com importações simples ou exportações periódicas e evoluir a integração aos poucos, sem parar o dia-a-dia da secretaria.",
  },
  {
    q: "Funciona sem internet constante?",
    a: "A app móvel aproveita caching local para navegar onde já carregou conteúdo (ex.: listas consultadas recentemente). Operações sensíveis em tempo real (pagamentos ou validações) funcionam quando a rede regressa — desenhado para a realidade de conectividade em campo.",
  },
  {
    q: "Os pais precisam de formação?",
    a: "O foco é simplicidade: notificações claras e telas objetivas para propinas, eventos e transporte. Na maioria dos casos, encarregados passam a autonomia em minutos — a escola deixa de ser central de chamadas repetitivas.",
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-3">
          <Link to="/" className="flex shrink-0 items-center">
            <img src="/edukamba-logo.png" alt="Edukamba" className="h-8 w-auto" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <a href="#legado" className="transition-colors hover:text-foreground">
              Integração
            </a>
            <a href="#funcionalidades" className="transition-colors hover:text-foreground">
              Diferenciais
            </a>
            <a href="#porque" className="transition-colors hover:text-foreground">
              Porquê Edukamba
            </a>
            <a href="#escolas" className="transition-colors hover:text-foreground">
              Escolas
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
            <a href="#contacto" className="transition-colors hover:text-foreground">
              Contacto
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/auth?tab=login">Entrar</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
            >
              <Link to="/auth?tab=signup" className="gap-1">
                Registar escola
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
              Gestão escolar moderna • Angola / Portugal
            </span>
            <h1 className="text-4xl font-bold leading-[1.12] tracking-tight text-balance sm:text-5xl lg:text-[2.65rem] lg:leading-[1.1] xl:text-[2.85rem]">
              A gestão escolar que os pais adoram e a secretaria agradece.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
              Simplifica a logística, comunica em tempo real e garante a conformidade fiscal. O complemento perfeito para o
              seu sistema actual.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
              >
                <a href={demoMailHref} className="gap-2">
                  <CalendarDays className="h-4 w-4" />
                  Agendar demonstração
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href={planosMailHref} className="gap-2">
                  Ver planos
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Demos por videochamada e visitas presenciais sob marcação para escolas em Angola e Portugal (Luso‑palop).
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
                    <p className="text-xs font-semibold text-muted-foreground">Notificações</p>
                    <div className="flex gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pastel-green/90 text-pastel-green-foreground">
                        <Wallet className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">Propina paga ✓</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          O comprovativo foi validado. Recibo disponível na app.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
                        <Bus className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">Carrinha a chegar</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">
                          Giro da manhã: estimativa ~7 min até a sua paragem.
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                      Push + histórico no mesmo lugar — menos perguntas à secretaria.
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
            <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">Integração</span>
            <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Trabalhamos em conjunto com o seu software actual.
            </h2>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              O Edukamba pode trabalhar lado a lado com o que a sua escola já usa. Comece quando fizer sentido —
              importações ou exportações em formatos simples, sem necessidade de repetir anos de histórico num único passo.
            </p>
            <p className="max-w-2xl text-muted-foreground leading-relaxed">
              A secretaria mantém os processos internos em que a sua equipa já confia; ao mesmo tempo, os encarregados
              passam a ver avisos e pagamentos com mais clareza no telemóvel.
            </p>
          </div>
          <Card className="relative overflow-hidden rounded-2xl border-pastel-blue-foreground/25 bg-background p-6 shadow-card">
            <Link2 className="absolute right-4 top-4 h-14 w-14 text-pastel-blue/35" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Destaque</p>
            <p className="mt-3 text-lg font-semibold leading-snug">
              Mantenha a sua faturação antiga enquanto moderniza a experiência dos pais.
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Sem migrações “para ontem”: comece onde faz sentido (comunicações, cobrança, transporte/refeições) e ligue o que
              já tem no desktop.
            </p>
          </Card>
        </div>
      </section>

      {/* Pilares */}
      <section id="funcionalidades" className="container py-16 lg:py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">Por benefício</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Os pilares que distinguem o Edukamba</h2>
          <p className="mt-4 text-muted-foreground">
            Não é apenas uma lista de módulos — é o efeito no dia-a-dia da secretaria e da família.
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

      {/* Prova social */}
      <section id="escolas" className="border-t border-border/60 bg-muted/25 py-16 lg:py-24">
        <div className="container space-y-12">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">Confiança</span>
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
                Facturação e recibos conforme as exigências da <strong>Administração Geral Tributária (AGT)</strong>, para
                reduzir risco e atrito com auditorias e reportes às famílias.
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

      {/* Comparação */}
      <section id="porque" className="container py-16 lg:py-24">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">Comparar</span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Porquê o Edukamba?</h2>
          <p className="mt-3 text-muted-foreground">Tradicional vs. experiência cloud + mobile orientada a famílias.</p>
        </div>

        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-border text-sm">
            <div className="bg-muted/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aspecto
            </div>
            <div className="bg-muted/40 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tradicional
            </div>
            <div className="bg-pastel-blue/25 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-pastel-blue-foreground">
              Edukamba
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
              <Monitor className="h-4 w-4" /> Escritório
            </span>
            <span className="inline-flex items-center gap-2">
              <Gauge className="h-4 w-4 text-destructive/80" aria-hidden /> Lento
            </span>
            <span className="inline-flex items-center gap-2">
              <WifiOff className="h-4 w-4" /> Dependente da secretaria para tudo
            </span>
            <span className="hidden items-center gap-2 sm:inline-flex">
              <Cloud className="h-4 w-4 text-pastel-blue-foreground" /> Cloud
            </span>
            <span className="inline-flex items-center gap-2 font-medium text-pastel-blue-foreground">
              <Smartphone className="h-4 w-4" /> Mobile-first para pais
            </span>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-border/60 bg-card/25 py-16 lg:py-24">
        <div className="container mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-pastel-blue-foreground">FAQ</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Perguntas frequentes</h2>
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
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Quer ver o Edukamba na sua escola?</h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
            Agende uma demonstração guiada ou peça uma proposta de planos adequada ao tamanho e às áreas onde quer modernizar
            primeiro.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
            >
              <a href={demoMailHref} className="gap-2">
                <Mail className="h-4 w-4" />
                Agendar demonstração
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full bg-background/60">
              <a href={planosMailHref}>Ver planos por email</a>
            </Button>
            <Button asChild size="lg" variant="secondary" className="rounded-full">
              <Link to="/auth?tab=signup">Criar conta de escola</Link>
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
              Diferenciais
            </a>
            <a href="#legado" className="hover:text-foreground">
              Integração
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
            <Link to="/termos" className="hover:text-foreground">
              Termos
            </Link>
            <Link to="/privacidade" className="hover:text-foreground">
              Privacidade
            </Link>
            <Link to="/dashboard" className="hover:text-foreground">
              Painel
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
