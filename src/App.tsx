import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ResumePausedMutationsBridge } from "@/components/ResumePausedMutationsBridge";
import { QueryPersistenceAuthSync } from "@/components/QueryPersistenceAuthSync";
import { persistQueryOptions } from "@/lib/persistQueryOptions";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import { NativeAppRoot } from "./components/NativeAppRoot.tsx";
import Auth from "./pages/Auth.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Termos from "./pages/Termos.tsx";
import Privacidade from "./pages/Privacidade.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardShell } from "./components/dashboard/DashboardShell";
import NotFound from "./pages/NotFound.tsx";
import AppOpen from "./pages/AppOpen.tsx";
import Alunos from "./pages/Alunos.tsx";
import AlunoPerfil from "./pages/AlunoPerfil.tsx";
import Professores from "./pages/Professores.tsx";
import ProfessorPerfil from "./pages/ProfessorPerfil.tsx";
import Matriculas from "./pages/Matriculas.tsx";
import Cursos from "./pages/Cursos.tsx";
import Turmas from "./pages/Turmas.tsx";
import TurmaDetalhe from "./pages/TurmaDetalhe.tsx";
import Disciplinas from "./pages/Disciplinas.tsx";
import Educadores from "./pages/Educadores.tsx";
import Presencas from "./pages/Presencas.tsx";
import Horarios from "./pages/Horarios.tsx";
import Avaliacoes from "./pages/Avaliacoes.tsx";
import AvaliacaoNotas from "./pages/AvaliacaoNotas.tsx";
import Notas from "./pages/Notas.tsx";
import Eventos from "./pages/Eventos.tsx";
import Extracurriculares from "./pages/Extracurriculares.tsx";
import Pedidos from "./pages/Pedidos.tsx";
import Material from "./pages/Material.tsx";
import Pagamentos from "./pages/Pagamentos.tsx";
import Financas from "./pages/Financas.tsx";
import Relatorios from "./pages/Relatorios.tsx";
import Timesheet from "./pages/Timesheet.tsx";
import Perfil from "./pages/Perfil.tsx";
import Definicoes from "./pages/Definicoes.tsx";
import Modulos from "./pages/Modulos.tsx";
import Notificacoes from "./pages/Notificacoes.tsx";
import Chat from "./pages/Chat.tsx";
import Pesquisa from "./pages/Pesquisa.tsx";
import Transportes from "./pages/Transportes.tsx";
import Documentos from "./pages/Documentos.tsx";
import DocumentSign from "./pages/DocumentSign.tsx";
import { ModulesProvider } from "./context/ModulesContext";
import { AcademicYearProvider } from "./context/AcademicYearContext";
import { UserRoleProvider, useUserRole } from "./hooks/useUserRole";
import { canOpenDefinicoesPage, canOpenModulosPage } from "@/lib/staffNavAccess";
import { SelectedChildProvider } from "./context/SelectedChildContext";
import { OfflineSyncProvider } from "@/hooks/useOfflineSync";
import { queryClient } from "@/lib/queryClient";
import { OneSignalWebBridge } from "@/components/OneSignalWebBridge";
import { OpenInAppBanner } from "@/components/OpenInAppBanner";

function RouteSpinner() {
  return (
    <div className="flex h-[40vh] min-h-[12rem] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/** Bloqueio directo por URL — Admin/Super em módulos; Admin/Super/Director em definições. */
function GatedModulosRoute() {
  const { role, loading } = useUserRole();
  if (loading) return <RouteSpinner />;
  if (!canOpenModulosPage(role)) return <Navigate to="/dashboard" replace />;
  return <Modulos />;
}

function GatedDefinicoesRoute() {
  const { role, loading } = useUserRole();
  if (loading) return <RouteSpinner />;
  if (!canOpenDefinicoesPage(role)) return <Navigate to="/dashboard" replace />;
  return <Definicoes />;
}

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={persistQueryOptions}
    onError={() => console.error("[query-persist] restore failed")}
  >
    <ResumePausedMutationsBridge />
    <QueryPersistenceAuthSync />
    <OfflineSyncProvider>
      <ModulesProvider>
        <AcademicYearProvider>
          <UserRoleProvider>
            <SelectedChildProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <OneSignalWebBridge />
                  <OpenInAppBanner />
                  <Routes>
                    <Route path="/" element={<NativeAppRoot />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/app-open" element={<AppOpen />} />
                    <Route path="/termos" element={<Termos />} />
                    <Route path="/privacidade" element={<Privacidade />} />

                    <Route element={<ProtectedRoute />}>
                      <Route path="/onboarding" element={<Onboarding />} />
                      <Route element={<DashboardShell />}>
                        <Route path="/dashboard" element={<Index />} />
                        <Route path="/alunos" element={<Alunos />} />
                        <Route path="/alunos/:id" element={<AlunoPerfil />} />
                        <Route path="/professores" element={<Professores />} />
                        <Route path="/professores/perfil/:profileId" element={<ProfessorPerfil />} />
                        <Route path="/professores/:id" element={<ProfessorPerfil />} />
                        <Route path="/matriculas" element={<Matriculas />} />
                        <Route path="/cursos" element={<Cursos />} />
                        <Route path="/turmas" element={<Turmas />} />
                        <Route path="/turmas/:id" element={<TurmaDetalhe />} />
                        <Route path="/disciplinas" element={<Disciplinas />} />
                        <Route path="/educadores" element={<Educadores />} />
                        <Route path="/presencas" element={<Presencas />} />
                        <Route path="/horario" element={<Horarios />} />
                        <Route path="/horarios" element={<Horarios />} />
                        <Route path="/avaliacoes" element={<Avaliacoes />} />
                        <Route path="/avaliacoes/:id/notas" element={<AvaliacaoNotas />} />
                        <Route path="/notas" element={<Notas />} />
                        <Route path="/eventos" element={<Eventos />} />
                        <Route path="/extracurriculares" element={<Extracurriculares />} />
                        <Route path="/pedidos" element={<Pedidos />} />
                        <Route path="/material" element={<Material />} />
                        <Route path="/pagamentos" element={<Pagamentos />} />
                        <Route path="/financas" element={<Financas />} />
                        <Route path="/relatorios" element={<Relatorios />} />
                        <Route path="/timesheet" element={<Timesheet />} />
                        <Route path="/perfil" element={<Perfil />} />
                        <Route path="/definicoes" element={<GatedDefinicoesRoute />} />
                        <Route path="/modulos" element={<GatedModulosRoute />} />
                        <Route path="/notificacoes" element={<Notificacoes />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/pesquisa" element={<Pesquisa />} />
                        <Route path="/transportes" element={<Transportes />} />
                        <Route path="/documentos" element={<Documentos />} />
                        <Route path="/documentos/assinar/:requestId" element={<DocumentSign />} />
                        <Route path="*" element={<NotFound />} />
                      </Route>
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </BrowserRouter>
              </TooltipProvider>
            </SelectedChildProvider>
          </UserRoleProvider>
        </AcademicYearProvider>
      </ModulesProvider>
    </OfflineSyncProvider>
  </PersistQueryClientProvider>
);

export default App;
