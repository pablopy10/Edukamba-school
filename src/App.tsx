import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Alunos from "./pages/Alunos.tsx";
import Professores from "./pages/Professores.tsx";
import Matriculas from "./pages/Matriculas.tsx";
import Cursos from "./pages/Cursos.tsx";
import Turmas from "./pages/Turmas.tsx";
import Disciplinas from "./pages/Disciplinas.tsx";
import Educadores from "./pages/Educadores.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/alunos" element={<Alunos />} />
          <Route path="/professores" element={<Professores />} />
          <Route path="/matriculas" element={<Matriculas />} />
          <Route path="/cursos" element={<Cursos />} />
          <Route path="/turmas" element={<Turmas />} />
          <Route path="/disciplinas" element={<Disciplinas />} />
          <Route path="/educadores" element={<Educadores />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
