import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { GraduationCap, Loader2, Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = useMemo(
    () => (searchParams.get("tab") === "signup" ? "signup" : "login"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [tab, setTab] = useState<"login" | "signup">(initialTab);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab === "signup" || urlTab === "login") {
      setTab(urlTab);
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    const next = value === "signup" ? "signup" : "login";
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    setLoginLoading(false);
    if (error) {
      toast({
        title: "Erro ao entrar",
        description:
          error.message === "Invalid login credentials"
            ? "Credenciais inválidas. Verifique o email e a password."
            : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Bem-vindo!", description: "Sessão iniciada com sucesso." });
    navigate("/dashboard", { replace: true });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
        data: { full_name: signupName },
      },
    });
    setSignupLoading(false);
    if (error) {
      toast({
        title: "Erro ao criar conta",
        description:
          error.message === "User already registered"
            ? "Já existe uma conta com este email. Tente entrar."
            : error.message,
        variant: "destructive",
      });
      return;
    }
    if (data.session) {
      // Email confirmation disabled — go straight to onboarding
      toast({ title: "Conta criada!", description: "Vamos configurar a sua escola." });
      navigate("/onboarding", { replace: true });
    } else {
      toast({
        title: "Conta criada!",
        description: "Verifique o seu email para confirmar e depois inicie sessão.",
      });
      setTab("login");
      setSearchParams({ tab: "login" }, { replace: true });
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-pastel-blue opacity-50 blur-3xl" />
      </div>

      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Edukamba</span>
        </Link>

        <Card className="rounded-2xl border-border/60 p-8 shadow-card">
          <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-full">
              <TabsTrigger value="login" className="rounded-full">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full">
                Criar conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6 space-y-6">
              <div className="space-y-1 text-center">
                <h1 className="text-2xl font-bold tracking-tight">Bem-vindo de volta</h1>
                <p className="text-sm text-muted-foreground">
                  Aceda ao painel da sua escola
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="nome@escola.ao"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
                  size="lg"
                >
                  {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6 space-y-6">
              <div className="space-y-1 text-center">
                <h1 className="text-2xl font-bold tracking-tight">Criar uma conta</h1>
                <p className="text-sm text-muted-foreground">
                  Comece a gerir a sua escola em poucos minutos
                </p>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome completo</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      required
                      autoComplete="name"
                      placeholder="O seu nome"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="nome@escola.ao"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      placeholder="Mínimo 6 caracteres"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={signupLoading}
                  className="w-full rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
                  size="lg"
                >
                  {signupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Ao entrar concorda com os nossos{" "}
            <Link to="/termos" className="underline hover:text-foreground">
              Termos
            </Link>{" "}
            e{" "}
            <Link to="/privacidade" className="underline hover:text-foreground">
              Política de Privacidade
            </Link>
            .
          </p>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Voltar à página inicial
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Auth;