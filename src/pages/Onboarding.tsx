import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  GraduationCap,
  ImagePlus,
  Loader2,
  Palette,
  CalendarRange,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type StepId = 1 | 2 | 3 | 4;

const Onboarding = () => {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const steps: { id: StepId; title: string; description: string; icon: React.ElementType }[] = useMemo(
    () => [
      { id: 1, title: t("onboarding.step1_title"), description: t("onboarding.step1_desc"), icon: Building2 },
      { id: 2, title: t("onboarding.step2_title"), description: t("onboarding.step2_desc"), icon: Palette },
      { id: 3, title: t("onboarding.step3_title"), description: t("onboarding.step3_desc"), icon: CalendarRange },
      { id: 4, title: t("onboarding.step4_title"), description: t("onboarding.step4_desc"), icon: Sparkles },
    ],
    [t],
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [address, setAddress] = useState("");

  // Step 2
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [secondaryColor, setSecondaryColor] = useState("#1e293b");

  // Step 3
  const currentYear = new Date().getFullYear();
  const [yearLabel, setYearLabel] = useState(`${currentYear}/${currentYear + 1}`);
  const [startDate, setStartDate] = useState(`${currentYear}-09-01`);
  const [endDate, setEndDate] = useState(`${currentYear + 1}-07-31`);

  // Redirect if user already has a school
  useEffect(() => {
    if (authLoading || !user) return;
    supabase
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.school_id) navigate("/dashboard", { replace: true });
      });
  }, [user, authLoading, navigate]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: t("onboarding.toast_image_large_title"), description: t("onboarding.toast_image_large_desc"), variant: "destructive" });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const validateStep = (step: StepId): boolean => {
    if (step === 1) {
      if (!name.trim()) {
        toast({ title: t("onboarding.toast_name_required_title"), description: t("onboarding.toast_name_required_desc"), variant: "destructive" });
        return false;
      }
    }
    if (step === 3) {
      if (!yearLabel.trim() || !startDate || !endDate) {
        toast({ title: t("onboarding.toast_year_incomplete_title"), description: t("onboarding.toast_year_incomplete_desc"), variant: "destructive" });
        return false;
      }
      if (new Date(endDate) <= new Date(startDate)) {
        toast({
          title: t("onboarding.toast_dates_invalid_title"),
          description: t("onboarding.toast_dates_invalid_desc"),
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < 4) setCurrentStep((s) => (s + 1) as StepId);
  };
  const goBack = () => {
    if (currentStep > 1) setCurrentStep((s) => (s - 1) as StepId);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      // 1. Upload logo (optional)
      let logoUrl: string | null = null;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop() ?? "png";
        const path = `${user.id}/logo-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("school-logos")
          .upload(path, logoFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from("school-logos").getPublicUrl(path);
        logoUrl = pub.publicUrl;
      }

      // 2. Atomically create school, link profile and create academic year
      const { error: rpcError } = await supabase.rpc("create_school_with_admin", {
        _name: name.trim(),
        _nif: nif.trim() || null,
        _address: address.trim() || null,
        _logo_url: logoUrl,
        _primary_color: primaryColor,
        _secondary_color: secondaryColor,
        _year_label: yearLabel.trim(),
        _year_start: startDate,
        _year_end: endDate,
      });
      if (rpcError) throw rpcError;

      toast({ title: t("onboarding.toast_success_title"), description: t("onboarding.toast_success_desc") });
      // Hard reload to ensure all auth/school context is refreshed
      window.location.assign("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("onboarding.toast_error_retry");
      toast({ title: t("onboarding.toast_error_title"), description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-pastel-blue-foreground" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-pastel-blue opacity-40 blur-3xl" />
      </div>

      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pastel-blue text-pastel-blue-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Edukamba</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/", { replace: true });
            }}
          >
            {tc("nav.logout")}
          </Button>
        </div>
      </header>

      <main className="container max-w-4xl py-12">
        <div className="mb-10 text-center">
          <span className="text-sm font-medium uppercase tracking-wider text-pastel-blue-foreground">
            {t("onboarding.welcome_badge")}
          </span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("onboarding.title")}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {t("onboarding.subtitle")}
          </p>
        </div>

        {/* Stepper */}
        <ol className="mb-10 grid grid-cols-4 gap-2">
          {steps.map((s) => {
            const isDone = currentStep > s.id;
            const isActive = currentStep === s.id;
            const Icon = s.icon;
            return (
              <li key={s.id} className="flex flex-col items-center gap-2">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                    isDone
                      ? "border-pastel-blue-foreground bg-pastel-blue-foreground text-primary-foreground"
                      : isActive
                        ? "border-pastel-blue-foreground bg-pastel-blue text-pastel-blue-foreground"
                        : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <div className="hidden text-center sm:block">
                  <p
                    className={`text-xs font-medium ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {s.title}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <Card className="rounded-2xl border-border/60 p-6 shadow-card sm:p-10">
          {currentStep === 1 && (
            <div className="space-y-6">
              <header>
                <h2 className="text-xl font-semibold">{t("onboarding.step1_heading")}</h2>
                <p className="text-sm text-muted-foreground">{t("onboarding.step1_intro")}</p>
              </header>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="name">{t("onboarding.school_name_label")}</Label>
                  <Input
                    id="name"
                    placeholder={t("onboarding.school_name_placeholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nif">{t("onboarding.nif_label")}</Label>
                  <Input
                    id="nif"
                    placeholder="5417000000"
                    value={nif}
                    onChange={(e) => setNif(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="address">{t("onboarding.address_label")}</Label>
                  <Textarea
                    id="address"
                    rows={3}
                    placeholder={t("onboarding.address_placeholder")}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <header>
                <h2 className="text-xl font-semibold">{t("onboarding.step2_heading")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.step2_intro")}
                </p>
              </header>

              <div className="space-y-2">
                <Label>{t("onboarding.logo_label")}</Label>
                <div className="flex items-center gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40">
                    {logoPreview ? (
                      <img src={logoPreview} alt={t("onboarding.logo_preview_alt")} className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {logoFile ? t("onboarding.change_logo") : t("onboarding.upload_logo")}
                    </Button>
                    <p className="text-xs text-muted-foreground">{t("onboarding.logo_hint")}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="primary">{t("onboarding.primary_color")}</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="primary"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-md border border-input bg-transparent"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondary">{t("onboarding.secondary_color")}</Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="secondary"
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-10 w-14 cursor-pointer rounded-md border border-input bg-transparent"
                    />
                    <Input
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <header>
                <h2 className="text-xl font-semibold">{t("onboarding.step3_heading")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.step3_intro")}
                </p>
              </header>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2 sm:col-span-1">
                  <Label htmlFor="year-label">{t("onboarding.year_label_field")}</Label>
                  <Input
                    id="year-label"
                    placeholder={t("onboarding.year_label_ph")}
                    value={yearLabel}
                    onChange={(e) => setYearLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start">{t("onboarding.start_date")}</Label>
                  <Input
                    id="start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">{t("onboarding.end_date")}</Label>
                  <Input
                    id="end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <header>
                <h2 className="text-xl font-semibold">{t("onboarding.step4_heading")}</h2>
                <p className="text-sm text-muted-foreground">
                  {t("onboarding.step4_intro")}
                </p>
              </header>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("onboarding.summary_school")}</p>
                  <p className="mt-1 font-medium">{name || "—"}</p>
                  {nif && <p className="text-sm text-muted-foreground">{t("onboarding.nif_label")}: {nif}</p>}
                  {address && <p className="text-sm text-muted-foreground">{address}</p>}
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("onboarding.summary_brand")}</p>
                  <div className="mt-2 flex items-center gap-3">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt={t("onboarding.logo_alt")}
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span
                        className="inline-block h-6 w-6 rounded-full border border-border"
                        style={{ backgroundColor: primaryColor }}
                        title={primaryColor}
                      />
                      <span
                        className="inline-block h-6 w-6 rounded-full border border-border"
                        style={{ backgroundColor: secondaryColor }}
                        title={secondaryColor}
                      />
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {t("onboarding.summary_year")}
                  </p>
                  <p className="mt-1 font-medium">{yearLabel || "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {startDate} → {endDate}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t border-border/60 pt-6">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={goBack}
              disabled={currentStep === 1 || submitting}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("onboarding.back")}
            </Button>

            {currentStep < 4 ? (
              <Button
                type="button"
                className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
                onClick={goNext}
              >
                {t("onboarding.continue")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="rounded-full bg-pastel-blue-foreground text-primary-foreground hover:bg-pastel-blue-foreground/90"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {t("onboarding.create_school")}
                    <Check className="h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Onboarding;