import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";

interface TrialExpiradoProps {
  schoolName?: string | null;
  trialEndedAt?: string | null;
}

const TrialExpirado = ({ schoolName, trialEndedAt }: TrialExpiradoProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("pages");
  const localeTag = intlLocaleTagFromLng(i18n.language);

  const endedLabel = trialEndedAt
    ? new Date(trialEndedAt).toLocaleDateString(localeTag, {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-lg rounded-2xl border-border/60 p-8 shadow-card">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("trial_expired.heading")}
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          {schoolName ? t("trial_expired.intro_with_school", { school: schoolName }) : t("trial_expired.intro_no_school")}
          {endedLabel ? ` ${t("trial_expired.ended_date", { date: endedLabel })}` : ` ${t("trial_expired.expired_short")}`}{" "}
          {t("trial_expired.subscription_required")}
        </p>

        <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          {t("trial_expired.blocked_hint")}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1 rounded-full" size="lg">
            <a href="mailto:suporte@edukamba.ao?subject=Ativar%20subscri%C3%A7%C3%A3o%20Edukamba">
              {t("trial_expired.contact_sales")}
            </a>
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            size="lg"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("trial_expired.sign_out")}
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            {t("trial_expired.back_home")}
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default TrialExpirado;
