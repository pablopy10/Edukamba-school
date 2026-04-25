import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
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
          <Route path="/" element={<Index />} />
          <Route path="/alunos" element={<Alunos />} />
          <Route path="/alunos/:id" element={<AlunoPerfil />} />
          <Route path="/professores" element={<Professores />} />
          <Route path="/professores/:id" element={<ProfessorPerfil />} />
          <Route path="/matriculas" element={<Matriculas />} />
          <Route path="/cursos" element={<Cursos />} />
          <Route path="/turmas" element={<Turmas />} />
          <Route path="/disciplinas" element={<Disciplinas />} />
          <Route path="/educadores" element={<Educadores />} />
          <Route path="/presencas" element={<Presencas />} />
          <Route path="/horario" element={<Horarios />} />
          <Route path="/horarios" element={<Horarios />} />
          <Route path="/avaliacoes" element={<Avaliacoes />} />
          <Route path="/eventos" element={<Eventos />} />
          <Route path="/extracurriculares" element={<Extracurriculares />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/material" element={<Material />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/timesheet" element={<Timesheet />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/definicoes" element={<Definicoes />} />
          <Route path="/modulos" element={<Modulos />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ModulesProvider>
  </QueryClientProvider>
);

export default App;
