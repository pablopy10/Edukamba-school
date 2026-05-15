import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException, withScope } from "@sentry/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GraduationCap, RefreshCw } from "lucide-react";

type Props = { children: ReactNode };

type State = { hasError: boolean; error?: Error };

/**
 * Error boundary com branding Edukamba; reporta crashes à UI antes de partir a árvore toda.
 * Complementar ao `ErrorBoundary` do Sentry (este componente garante UX consistente).
 */
export class EdukambaErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    withScope((scope) => {
      scope.setTag("boundary", "EdukambaErrorBoundary");
      scope.setContext("react", { componentStack: info.componentStack });
      captureException(error);
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center bg-background px-4 py-12">
          <Card className="max-w-lg space-y-6 rounded-3xl border-border/70 bg-card p-8 shadow-card text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pastel-blue text-pastel-blue-foreground">
              <GraduationCap className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Edukamba</p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Algo correu mal neste ecrã</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                O problema foi registado para a equipa poder analisar. Pode tentar recarregar ou voltar ao início —
                os seus dados continuam seguros na plataforma.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button type="button" className="gap-2 rounded-full bg-pastel-blue-foreground" onClick={this.handleRetry}>
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
              <Button type="button" variant="outline" className="rounded-full" asChild>
                <a href="/dashboard">Ir para o painel</a>
              </Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
