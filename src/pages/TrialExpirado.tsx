import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface TrialExpiradoProps {
  schoolName?: string | null;
  trialEndedAt?: string | null;
}

const TrialExpirado = ({ schoolName, trialEndedAt }: TrialExpiradoProps) => {
  const navigate = useNavigate();

  const endedLabel = trialEndedAt
    ? new Date(trialEndedAt).toLocaleDateString("pt-PT", {
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
          O período de avaliação terminou
        </h1>

        <p className="mt-3 text-sm text-muted-foreground">
          {schoolName ? <>O trial de 30 dias da escola <span className="font-semibold text-foreground">{schoolName}</span> </> : "O trial de 30 dias "}
          {endedLabel ? <>terminou a <span className="font-semibold text-foreground">{endedLabel}</span>.</> : "expirou."}
          {" "}
          Para continuar a usar o Edukamba, é necessário ativar uma subscrição.
        </p>

        <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          Enquanto a subscrição não estiver ativa, nenhum utilizador da escola
          (administradores, professores, encarregados ou alunos) consegue
          aceder aos dados da plataforma.
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1 rounded-full" size="lg">
            <a href="mailto:suporte@edukamba.ao?subject=Ativar%20subscri%C3%A7%C3%A3o%20Edukamba">
              Falar com vendas
            </a>
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-full"
            size="lg"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Terminar sessão
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Voltar à página inicial
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default TrialExpirado;