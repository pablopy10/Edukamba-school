import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import { ModulesProvider } from "./context/ModulesContext";
import { AcademicYearProvider } from "./context/AcademicYearContext";
import { UserRoleProvider } from "./hooks/useUserRole";
import { SelectedChildProvider } from "./context/SelectedChildContext";
import { OfflineSyncProvider } from "@/hooks/useOfflineSync";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: (failureCount) => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return false;
        return failureCount < 2;
      },
      /** Permite servir dados persistidos offline quando aplicável. */
      networkMode: "offlineFirst",
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: window.localStorage,
});

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    }}
  >
    <OfflineSyncProvider>
      <ModulesProvider>
        <AcademicYearProvider>
          <UserRoleProvider>
            <SelectedChildProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<NativeAppRoot />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/termos" element={<Termos />} />
                    <Route path="/privacidade" element={<Privacidade />} />

                    <Route element={<ProtectedRoute />}>
                      <Route path="/onboarding" element={<Onboarding />} />
                      <Route element={<DashboardShell />}>
                        <Route path="/dashboard" element={<Index />} />
                        <Route path="/alunos" element={<Alunos />} />
                        <Route path="/alunos/:id" element={<AlunoPerfil />} />
                        <Route path="/professores" element={<Professores />} />
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
                        <Route path="/definicoes" element={<Definicoes />} />
                        <Route path="/modulos" element={<Modulos />} />
                        <Route path="/notificacoes" element={<Notificacoes />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/pesquisa" element={<Pesquisa />} />
                        <Route path="/transportes" element={<Transportes />} />
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
