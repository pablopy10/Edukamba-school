import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Mail, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { prefetchTeacherData, resolveDefaultAcademicYearId } from "@/lib/prefetchTeacherData";
import { supabase } from "@/integrations/supabase/client";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { cn } from "@/lib/utils";
import heroImage from "@/assets/landing-hero.jpg";
import { useTranslation } from "react-i18next";

/** Inputs arredondados estilo app + ícone à esquerda */
const authInputClass =
  "h-14 rounded-full border-0 bg-muted/70 pl-14 pr-5 text-base shadow-none transition-all placeholder:text-muted-foreground focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-pastel-blue/35";

const authPasswordInputClass =
  "h-14 rounded-full border-0 bg-muted/70 pl-14 pr-12 text-base shadow-none transition-all placeholder:text-muted-foreground focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-pastel-blue/35";

const iconWrapClass =
  "pointer-events-none absolute left-5 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-pastel-blue-foreground";

/** Destino após sessão válida: SUPER_ADMIN sem deep-link vai para o dashboard de gestão da plataforma. */
function landingAfterAuth(role: string | null | undefined, redirectAfterLogin: string) {
  const pathPart = redirectAfterLogin.split("#")[0].split("?")[0] || "";
  const defaultLanding = pathPart === "" || pathPart === "/" || pathPart === "/dashboard";
  return role === "SUPER_ADMIN" && defaultLanding ? "/super" : redirectAfterLogin;
}

const Auth = () => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNative = isNativeMobileApp();

  // If the user was redirected here from a protected page, remember where to send them back
  const fromLocation = (location.state as { from?: Location } | null)?.from;
  const redirectAfterLogin = fromLocation
    ? `${(fromLocation as any).pathname ?? ""}${(fromLocation as any).search ?? ""}${(fromLocation as any).hash ?? ""}`
    : "/dashboard";

  const [tab, setTab] = useState<"login" | "signup">(() => {
    if (typeof window === "undefined") return "login";
    if (isNativeMobileApp()) return "login";
    const p = new URLSearchParams(window.location.search).get("tab");
    return p === "signup" ? "signup" : "login";
  });

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  /** Overlay pós-login: descarrega e persiste dados do professor antes do dashboard (único momento em que a rede é necessária). */
  const [preparingEnvironment, setPreparingEnvironment] = useState(false);

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      navigate(landingAfterAuth(profile?.role, redirectAfterLogin), { replace: true });
    })();
    return () => {
      cancelled = true;
    };
    // redirectAfterLogin is derived from location.state on mount — stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (isNative) {
      setTab("login");
      if (searchParams.get("tab") === "signup") {
        setSearchParams({ tab: "login" }, { replace: true });
      }
      return;
    }
    const urlTab = searchParams.get("tab");
    if (urlTab === "signup" || urlTab === "login") {
      setTab(urlTab);
    }
  }, [searchParams, setSearchParams, isNative]);

  const handleTabChange = (value: string) => {
    if (isNative) return;
    const next = value === "signup" ? "signup" : "login";
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const forgotPasswordHint = () => {
    toast({
      title: t("auth.toast_recover_title"),
      description: t("auth.toast_recover_desc"),
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setPreparingEnvironment(false);
    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) {
        const msg = error.message ?? "";
        const looksLikeNetwork =
          /\bfetch\b/i.test(msg) ||
          /\bnetwork\b/i.test(msg) ||
          /offline|timeout|timed out|aborted|cors/i.test(msg);
        toast({
          title: t("auth.toast_login_error_title"),
          description:
            error.message === "Invalid login credentials"
              ? t("auth.invalid_credentials")
              : looksLikeNetwork
                ? t("auth.network_error")
                : msg,
          variant: "destructive",
        });
        return;
      }

      const user = signInData.user;
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active, school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        toast({
          title: t("auth.toast_inactive_title"),
          description: t("auth.toast_inactive_desc"),
          variant: "destructive",
        });
        return;
      }

      if (
        profile?.role === "TEACHER" &&
        profile.school_id &&
        user.id
      ) {
        try {
          const academicYearId = await resolveDefaultAcademicYearId(profile.school_id);
          if (academicYearId) {
            setPreparingEnvironment(true);
            await prefetchTeacherData(queryClient, {
              userId: user.id,
              schoolId: profile.school_id,
              academicYearId,
              profileRole: profile.role,
            });
          }
        } catch {
          /* prefetch best-effort: sessão mesmo sem cache completo */
        }
      }

      toast({ title: t("auth.toast_welcome_title"), description: t("auth.toast_welcome_desc") });
      navigate(landingAfterAuth(profile?.role, redirectAfterLogin), { replace: true });
    } finally {
      setLoginLoading(false);
      setPreparingEnvironment(false);
    }
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
        title: t("auth.toast_signup_error_title"),
        description:
          error.message === "User already registered"
            ? t("auth.user_already_registered")
            : error.message,
        variant: "destructive",
      });
      return;
    }
    if (data.session) {
      toast({ title: t("auth.toast_created_title"), description: t("auth.toast_created_onboarding") });
      navigate("/onboarding", { replace: true });
    } else {
      toast({
        title: t("auth.toast_created_title"),
        description: t("auth.toast_created_confirm_email"),
      });
      setTab("login");
      setSearchParams({ tab: "login" }, { replace: true });
    }
  };

  const BrandMark = ({ interactive }: { interactive: boolean }) =>
    interactive ? (
      <Link to="/" className="mb-10 flex flex-col items-center gap-0">
        <img src="/edukamba-logo.png" alt="Edukamba" className="mb-3 h-10 w-auto" />
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("auth.tagline")}</p>
      </Link>
    ) : (
      <div className="mb-10 flex flex-col items-center gap-0">
        <img src="/edukamba-logo.png" alt="Edukamba" className="mb-3 h-10 w-auto" />
        <p className="mt-2 text-center text-sm text-muted-foreground">{t("auth.tagline")}</p>
      </div>
    );

  const submitBlueClass =
    "w-full rounded-full bg-pastel-blue py-6 text-base font-semibold text-pastel-blue-foreground shadow-[0_8px_28px_hsla(205,90%,65%,0.38)] transition hover:bg-pastel-blue/88 active:scale-[0.98] disabled:opacity-70";

  return (
    <div className="relative flex min-h-[100dvh] min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-12">
      {preparingEnvironment && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-background/90 px-6 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-10 w-10 animate-spin text-pastel-blue" aria-hidden />
          <p className="text-center text-lg font-semibold text-foreground">{t("auth.preparing_title")}</p>
          <p className="max-w-sm text-center text-sm text-muted-foreground">{t("auth.preparing_desc")}</p>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10%] top-[-10%] h-[42%] w-[42%] rounded-full bg-pastel-blue/25 blur-3xl" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[42%] w-[42%] rounded-full bg-pastel-lilac/25 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        <div className="w-full max-w-[480px]">
          <BrandMark interactive={!isNative} />

          <div
            className={cn(
              "rounded-[2rem] border border-white/60 bg-card p-8 shadow-[0_24px_60px_rgba(15,23,42,0.06)] backdrop-blur-sm md:p-12",
              "dark:border-white/10 dark:bg-card/95",
            )}
          >
            <Tabs value={isNative ? "login" : tab} onValueChange={handleTabChange} className="w-full">
              {!isNative && (
                <TabsList className="mb-8 grid w-full grid-cols-2 rounded-full bg-muted/50 p-1">
                  <TabsTrigger value="login" className="rounded-full text-sm font-medium">
                    {t("auth.tab_login")}
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-full text-sm font-medium">
                    {t("auth.tab_signup")}
                  </TabsTrigger>
                </TabsList>
              )}

              <TabsContent value="login" className="mt-0 outline-none">
                <div className="mb-10 text-center">
                  <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">{t("auth.welcome_back")}</h2>
                  <p className="text-sm text-muted-foreground">{t("auth.subtitle_login")}</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="ml-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t("auth.email")}
                    </Label>
                    <div className="group relative">
                      <Mail className={cn(iconWrapClass, "h-5 w-5")} aria-hidden />
                      <Input
                        id="login-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder={t("auth.placeholder_email")}
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className={authInputClass}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <Label htmlFor="login-password" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("auth.password")}
                      </Label>
                      <button
                        type="button"
                        onClick={forgotPasswordHint}
                        className="text-xs font-medium text-pastel-blue-foreground underline-offset-4 hover:underline"
                      >
                        {t("auth.forgot_password")}
                      </button>
                    </div>
                    <div className="group relative">
                      <Lock className={cn(iconWrapClass, "h-5 w-5")} aria-hidden />
                      <PasswordInput
                        id="login-password"
                        required
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className={authPasswordInputClass}
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button type="submit" disabled={loginLoading} size="lg" className={submitBlueClass}>
                      {loginLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("auth.sign_in")}
                    </Button>
                  </div>
                </form>

                <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
                  Ao entrar aceita os nossos{" "}
                  <Link to="/termos" className="font-medium text-pastel-blue-foreground underline-offset-2 hover:underline">
                    Termos
                  </Link>{" "}
                  e a{" "}
                  <Link to="/privacidade" className="font-medium text-pastel-blue-foreground underline-offset-2 hover:underline">
                    Política de Privacidade
                  </Link>
                  .
                </p>
              </TabsContent>

              {!isNative && (
                <TabsContent value="signup" className="mt-0 outline-none">
                  <div className="mb-10 text-center">
                    <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">{t("auth.signup_title")}</h2>
                    <p className="text-sm text-muted-foreground">{t("auth.signup_subtitle")}</p>
                  </div>

                  <form onSubmit={handleSignup} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name" className="ml-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("auth.full_name")}
                      </Label>
                      <div className="group relative">
                        <User className={cn(iconWrapClass, "h-5 w-5")} aria-hidden />
                        <Input
                          id="signup-name"
                          type="text"
                          required
                          autoComplete="name"
                          placeholder={t("auth.placeholder_name")}
                          value={signupName}
                          onChange={(e) => setSignupName(e.target.value)}
                          className={authInputClass}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email" className="ml-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("auth.email")}
                      </Label>
                      <div className="group relative">
                        <Mail className={cn(iconWrapClass, "h-5 w-5")} aria-hidden />
                        <Input
                          id="signup-email"
                          type="email"
                          required
                          autoComplete="email"
                          placeholder={t("auth.placeholder_email")}
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          className={authInputClass}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password" className="ml-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("auth.password")}
                      </Label>
                      <div className="group relative">
                        <Lock className={cn(iconWrapClass, "h-5 w-5")} aria-hidden />
                        <PasswordInput
                          id="signup-password"
                          required
                          minLength={6}
                          autoComplete="new-password"
                          placeholder={t("auth.min_password")}
                          value={signupPassword}
                          onChange={(e) => setSignupPassword(e.target.value)}
                          className={authPasswordInputClass}
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button type="submit" disabled={signupLoading} size="lg" className={submitBlueClass}>
                        {signupLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("auth.create_account_btn")}
                      </Button>
                    </div>
                  </form>

                  <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
                    {t("auth.terms_intro_signup")}{" "}
                    <Link to="/termos" className="font-medium text-pastel-blue-foreground underline-offset-2 hover:underline">
                      {t("auth.terms")}
                    </Link>{" "}
                    {t("auth.terms_connector")}{" "}
                    <Link to="/privacidade" className="font-medium text-pastel-blue-foreground underline-offset-2 hover:underline">
                      {t("auth.privacy_policy")}
                    </Link>
                    .
                  </p>
                </TabsContent>
              )}
            </Tabs>
          </div>

          {!isNative && (
            <footer className="mt-8 space-y-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t("auth.footer_no_account")}{" "}
                <button
                  type="button"
                  onClick={() => handleTabChange("signup")}
                  className="font-semibold text-pastel-blue-foreground underline decoration-2 underline-offset-4 hover:opacity-90"
                >
                  {t("auth.footer_register_school")}
                </button>
              </p>
              <div className="flex justify-center gap-8">
                <Link
                  to="/privacidade"
                  className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("auth.footer_privacy")}
                </Link>
                <Link to="/termos" className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                  {t("auth.footer_terms")}
                </Link>
              </div>
              <p>
                <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  {t("auth.back_home")}
                </Link>
              </p>
            </footer>
          )}
        </div>

        {!isNative && (
          <aside className="relative hidden h-[min(560px,70vh)] w-full max-w-[400px] shrink-0 rotate-3 overflow-hidden rounded-[3rem] shadow-2xl lg:block">
            <img
              src={heroImage}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-pastel-blue/75 via-pastel-blue/15 to-transparent" />
            <div className="absolute bottom-8 left-8 right-8 text-white">
              <h3 className="mb-2 text-xl font-semibold tracking-tight drop-shadow-sm">{t("auth.hero_title")}</h3>
              <p className="text-sm leading-relaxed opacity-[0.95] drop-shadow-sm">{t("auth.hero_subtitle")}</p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};

export default Auth;
