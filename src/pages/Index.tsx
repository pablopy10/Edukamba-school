import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { StudentsCard } from "@/components/dashboard/StudentsCard";
import { AttendanceCard } from "@/components/dashboard/AttendanceCard";
import { EarningsCard } from "@/components/dashboard/EarningsCard";
import { CalendarCard } from "@/components/dashboard/CalendarCard";
import { AgendaCard } from "@/components/dashboard/AgendaCard";
import { MessagesCard } from "@/components/dashboard/MessagesCard";
import { MiniStatCard } from "@/components/dashboard/MiniStatCard";

const Index = () => {
  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
            {/* Center column */}
            <div className="flex flex-col gap-6">
              <h1 className="sr-only">Painel Edukamba</h1>

              {/* Stat cards */}
              <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Alunos" value="124.684" delta={15} variant="lilac" />
                <StatCard label="Professores" value="12.379" delta={-3} variant="yellow" />
                <StatCard label="Funcionários" value="29.300" delta={-3} variant="lilac" />
                <StatCard label="Prêmios" value="95.800" delta={5} variant="yellow" />
              </section>

              {/* Students + Attendance */}
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
                <StudentsCard />
                <AttendanceCard />
              </section>

              {/* Earnings + side stats */}
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_240px]">
                <EarningsCard />
                <div className="flex flex-col gap-6">
                  <MiniStatCard icon="award" value="24.680" label="Alunos Olímpicos" delta={15} />
                  <MiniStatCard icon="trophy" value="3.000" label="Competições" delta={-8} />
                </div>
              </section>
            </div>

            {/* Right column */}
            <aside className="flex flex-col gap-6">
              <CalendarCard />
              <AgendaCard />
              <MessagesCard />
            </aside>
      </div>
    </DashboardLayout>
  );
};

export default Index;
