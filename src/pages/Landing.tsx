import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  GraduationCap,
  Users,
  CalendarCheck,
  Wallet,
  BarChart3,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Check,
} from "lucide-react";
import heroImage from "@/assets/landing-hero.jpg";

const features = [
  {
    icon: Users,
    title: "Gestão de Alunos",
    description: "Cadastro, matrículas e perfis completos num só lugar.",
    tone: "bg-pastel-blue text-pastel-blue-foreground",
  },
  {
    icon: CalendarCheck,
    title: "Presenças & Horários",
    description: "Controle diário de presenças e organização de horários.",
    tone: "bg-pastel-blue text-pastel-blue-foreground",
  },
  {
    icon: Wallet,
    title: "Pagamentos",
    description: "Propinas, recibos e validação de comprovativos.",
    tone: "bg-pastel-blue text-pastel-blue-foreground",
  },
  {
    icon: BarChart3,
    title: "Relatórios",
    description: "Dados claros sobre desempenho, frequência e finanças.",
    tone: "bg-pastel-blue text-pastel-blue-foreground",
  },
  {
    icon: MessageSquare,
    title: "Comunicação",
    description: "Mensagens entre escola, professores e encarregados.",
    tone: "bg-pastel-blue text-pastel-blue-foreground",
  },
  {
    icon: ShieldCheck,
    title: "Seguro & Privado",
    description: "Dados protegidos com permissões por perfil.",
    tone: "bg-pastel-blue text-pastel-blue-foreground",
  },
];

const stats = [
  { value: "120+", label: "Escolas activas" },
  { value: "98%", label: "Satisfação" },
  { value: "24/7", label: "Suporte" },
];

const plans = [
  {
    name: "Essencial",
    price: "500 Kz",
    suffix: "/aluno · mês",
    description:
      "Focado na organização administrativa básica e digitalização da secretaria.",
    features: [
      "Gestão Escolar Core: Alunos, Professores, Turmas e Disciplinas",
      "Secretaria Digital: Matrículas e Encarregados de Educação",
      "Controlo de Presenças: registo de faltas de alunos",
      "Horário Escolar: consulta de horários de turmas e professores",
      "Eventos: calendário escolar básico",
      "Pagamentos & Finanças: registo manual e fluxo de caixa simples",
      "Relatórios Básicos: listagens de alunos e aproveitamento",
      "Permissões: níveis de acesso básicos (Admin, Secretaria, Professor)",
    ],
    cta: "Começar agora",
    highlight: false,
  },
  {
    name: "Pro",
    price: "1.000 Kz",
    suffix: "/aluno · mês",
    description:
      "Ideal para escolas modernas que querem eliminar o papel e aproximar os pais.",
    features: [
      "Tudo do plano Essencial",
      "Mobile App completa para Pais, Alunos e Professores",
      "Notificações Push de notas, faltas e avisos sem custos de SMS",
      "Cobranças automáticas de propinas em atraso",
      "Chats em tempo real entre encarregados e escola",
      "Atividades extracurriculares: inscrições e cobranças",
      "Pedidos de ausência de funcionários e professores",
      "Timesheet: controlo de horas e assiduidade",
    ],
    cta: "Experimentar Pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "1.300 Kz",
    suffix: "/aluno · mês",
    description:
      "Gestão 360º com foco em logística, segurança de dados e auditoria total.",
    features: [
      "Tudo do plano Pro",
      "Gestão de Transportes: rotas, passageiros e cobrança de giros",
      "Stock & Pedidos de Material: inventário e pedidos aos pais",
      "Auditoria avançada (Logs): histórico completo de alterações",
      "Relatórios avançados: crescimento, retenção e previsões financeiras",
      "Suporte prioritário 24/7",
      "Backup personalizado: opções extras de segurança de dados",
    ],
    cta: "Falar connosco",
    highlight: false,
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Edukamba</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#funcionalidades" className="transition-colors hover:text-foreground">
              Funcionalidades
            </a>
            <a href="#planos" className="transition-colors hover:text-foreground">
              Planos
            </a>
            <a href="#contacto" className="transition-colors hover:text-foreground">
              Contacto
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link to="/auth?tab=login">Entrar</Link>
            </Button>
            <Button asChild className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90">
              <Link to="/auth?tab=signup">
                Criar conta
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-pastel-blue opacity-60 blur-3xl" />
          <div className="absolute -bottom-40 -right-20 h-[420px] w-[420px] rounded-full bg-pastel-blue opacity-40 blur-3xl" />
        </div>

        <div className="container grid gap-12 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div className="flex flex-col gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
              <Sparkles className="h-3.5 w-3.5 text-pastel-blue-foreground" />
              Plataforma de gestão escolar moderna
            </span>
            <h1 className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              A escola toda,{" "}
              <span className="bg-gradient-to-r from-[hsl(var(--pastel-blue-foreground))] to-[hsl(var(--pastel-blue))] bg-clip-text text-transparent">
                num único painel
              </span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              O Edukamba reúne alunos, professores, presenças, pagamentos e relatórios numa
              plataforma simples, leve e pronta para a realidade das escolas africanas.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90">
                <Link to="/auth">
                  Aceder ao painel
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full">
                <a href="#funcionalidades">Ver funcionalidades</a>
              </Button>
            </div>

            <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-6">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-2xl font-semibold tracking-tight">{stat.value}</dt>
                  <dd className="text-xs text-muted-foreground">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-pastel-blue opacity-50 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card shadow-card">
              <img
                src={heroImage}
                alt="Painel Edukamba com gestão escolar moderna"
                className="h-full w-full object-cover"
                loading="eager"
              />
            </div>
            <Card className="absolute -left-6 bottom-8 hidden w-56 gap-2 rounded-2xl border-border/60 p-4 shadow-card sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Presenças hoje</p>
                  <p className="text-base font-semibold">96,4%</p>
                </div>
              </div>
            </Card>
            <Card className="absolute -right-6 top-8 hidden w-56 gap-2 rounded-2xl border-border/60 p-4 shadow-card sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receita do mês</p>
                  <p className="text-base font-semibold">2,4M Kz</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="funcionalidades" className="container py-20 lg:py-28">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-sm font-medium uppercase tracking-wider text-pastel-blue-foreground">
            Funcionalidades
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Tudo o que a sua escola precisa
          </h2>
          <p className="mt-4 text-muted-foreground">
            Ferramentas desenhadas para a rotina real de directores, secretarias, professores e
            encarregados de educação.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description, tone }) => (
            <Card
              key={title}
              className="group flex flex-col gap-4 rounded-2xl border-border/60 p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-card"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="border-t border-border/60 bg-card/30 py-20 lg:py-28">
        <div className="container">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="text-sm font-medium uppercase tracking-wider text-pastel-blue-foreground">
              Planos
            </span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Preços simples e transparentes
            </h2>
            <p className="mt-4 text-muted-foreground">
              Escolha o plano ideal para a dimensão da sua escola. Sem surpresas.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative flex flex-col gap-6 rounded-2xl p-8 shadow-soft ${
                  plan.highlight
                    ? "border-pastel-blue-foreground bg-card ring-1 ring-pastel-blue-foreground/40"
                    : "border-border/60"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-pastel-blue-foreground px-3 py-1 text-xs font-medium text-primary-foreground">
                    Mais popular
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                  {plan.suffix && (
                    <span className="text-sm text-muted-foreground">{plan.suffix}</span>
                  )}
                </div>
                <ul className="flex flex-col gap-3 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-pastel-blue-foreground" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  className={`mt-auto rounded-full ${plan.highlight ? "bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90" : ""}`}
                  variant={plan.highlight ? "default" : "outline"}
                >
                  <Link to="/auth">{plan.cta}</Link>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contacto" className="container py-20 lg:py-28">
        <Card className="relative overflow-hidden rounded-3xl border-border/60 bg-pastel-blue p-10 text-center shadow-card sm:p-16">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-pastel-blue-foreground/20 blur-3xl" />
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Pronto a transformar a sua escola?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Comece hoje com o Edukamba e dê à sua equipa as ferramentas certas para gerir,
            comunicar e crescer.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90">
              <Link to="/auth">
                Aceder ao painel
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <a href="mailto:contacto@edukamba.ao">Falar com vendas</a>
            </Button>
          </div>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pastel-blue text-pastel-blue-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="font-medium text-foreground">Edukamba</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#funcionalidades" className="hover:text-foreground">
              Funcionalidades
            </a>
            <a href="#planos" className="hover:text-foreground">
              Planos
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