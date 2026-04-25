import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Landing from "./pages/Landing.tsx";
import Auth from "./pages/Auth.tsx";
import Termos from "./pages/Termos.tsx";
import Privacidade from "./pages/Privacidade.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute";
import NotFound from "./pages/NotFound.tsx";
import Alunos from "./pages/Alunos.tsx";
import AlunoPerfil from "./pages/AlunoPerfil.tsx";
import Professores from "./pages/Professores.tsx";
import ProfessorPerfil from "./pages/ProfessorPerfil.tsx";
import Matriculas from "./pages/Matriculas.tsx";
import Cursos from "./pages/Cursos.tsx";
import Turmas from "./pages/Turmas.tsx";
import Disciplinas from "./pages/Disciplinas.tsx";
import Educadores from "./pages/Educadores.tsx";
import Presencas from "./pages/Presencas.tsx";
import Horarios from "./pages/Horarios.tsx";
import Avaliacoes from "./pages/Avaliacoes.tsx";
import Eventos from "./pages/Eventos.tsx";
import Extracurriculares from "./pages/Extracurriculares.tsx";
import Pedidos from "./pages/Pedidos.tsx";
import Material from "./pages/Material.tsx";
import Relatorios from "./pages/Relatorios.tsx";
import Timesheet from "./pages/Timesheet.tsx";
import Perfil from "./pages/Perfil.tsx";
import Definicoes from "./pages/Definicoes.tsx";
import Modulos from "./pages/Modulos.tsx";
import Notificacoes from "./pages/Notificacoes.tsx";
import Chat from "./pages/Chat.tsx";
import Pesquisa from "./pages/Pesquisa.tsx";
import { ModulesProvider } from "./context/ModulesContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ModulesProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/alunos" element={<ProtectedRoute><Alunos /></ProtectedRoute>} />
          <Route path="/alunos/:id" element={<ProtectedRoute><AlunoPerfil /></ProtectedRoute>} />
          <Route path="/professores" element={<ProtectedRoute><Professores /></ProtectedRoute>} />
          <Route path="/professores/:id" element={<ProtectedRoute><ProfessorPerfil /></ProtectedRoute>} />
          <Route path="/matriculas" element={<ProtectedRoute><Matriculas /></ProtectedRoute>} />
          <Route path="/cursos" element={<ProtectedRoute><Cursos /></ProtectedRoute>} />
          <Route path="/turmas" element={<ProtectedRoute><Turmas /></ProtectedRoute>} />
          <Route path="/disciplinas" element={<ProtectedRoute><Disciplinas /></ProtectedRoute>} />
          <Route path="/educadores" element={<ProtectedRoute><Educadores /></ProtectedRoute>} />
          <Route path="/presencas" element={<ProtectedRoute><Presencas /></ProtectedRoute>} />
          <Route path="/horario" element={<ProtectedRoute><Horarios /></ProtectedRoute>} />
          <Route path="/horarios" element={<ProtectedRoute><Horarios /></ProtectedRoute>} />
          <Route path="/avaliacoes" element={<ProtectedRoute><Avaliacoes /></ProtectedRoute>} />
          <Route path="/eventos" element={<ProtectedRoute><Eventos /></ProtectedRoute>} />
          <Route path="/extracurriculares" element={<ProtectedRoute><Extracurriculares /></ProtectedRoute>} />
          <Route path="/pedidos" element={<ProtectedRoute><Pedidos /></ProtectedRoute>} />
          <Route path="/material" element={<ProtectedRoute><Material /></ProtectedRoute>} />
          <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
          <Route path="/timesheet" element={<ProtectedRoute><Timesheet /></ProtectedRoute>} />
          <Route path="/perfil" element={<ProtectedRoute><Perfil /></ProtectedRoute>} />
          <Route path="/definicoes" element={<ProtectedRoute><Definicoes /></ProtectedRoute>} />
          <Route path="/modulos" element={<ProtectedRoute><Modulos /></ProtectedRoute>} />
          <Route path="/notificacoes" element={<ProtectedRoute><Notificacoes /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/pesquisa" element={<ProtectedRoute><Pesquisa /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ModulesProvider>
  </QueryClientProvider>
);

export default App;
