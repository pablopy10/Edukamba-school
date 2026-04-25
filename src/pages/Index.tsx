import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { StudentsCard } from "@/components/dashboard/StudentsCard";
import { AttendanceCard } from "@/components/dashboard/AttendanceCard";
import { EarningsCard } from "@/components/dashboard/EarningsCard";
import { CalendarCard } from "@/components/dashboard/CalendarCard";
import { AgendaCard } from "@/components/dashboard/AgendaCard";
import { MessagesCard } from "@/components/dashboard/MessagesCard";
import { MiniStatCard } from "@/components/dashboard/MiniStatCard";
import { useDashboardData } from "@/hooks/useDashboardData";

const Index = () => {
  const { counts, gender, attendance, agenda, messages } = useDashboardData();
  const fmt = (n: number) => n.toLocaleString("pt-PT");
  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
            {/* Center column */}
            <div className="flex flex-col gap-6">
              <h1 className="sr-only">Painel Edukamba</h1>

              {/* Stat cards */}
              <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Alunos" value={fmt(counts.students)} delta={0} variant="lilac" />
                <StatCard label="Professores" value={fmt(counts.teachers)} delta={0} variant="yellow" />
                <StatCard label="Funcionários" value={fmt(counts.staff)} delta={0} variant="lilac" />
                <StatCard label="Turmas" value={fmt(counts.classrooms)} delta={0} variant="yellow" />
              </section>

              {/* Students + Attendance */}
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
                <StudentsCard male={gender.male} female={gender.female} total={gender.total} />
                <AttendanceCard data={attendance} />
              </section>

              {/* Earnings + side stats */}
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_240px]">
                <EarningsCard />
                <div className="flex flex-col gap-6">
                  <MiniStatCard icon="award" value={fmt(counts.students)} label="Alunos ativos" delta={0} />
                  <MiniStatCard icon="trophy" value={fmt(counts.classrooms)} label="Turmas" delta={0} />
                </div>
              </section>
            </div>

            {/* Right column */}
            <aside className="flex flex-col gap-6">
              <CalendarCard />
              <AgendaCard items={agenda} />
              <MessagesCard messages={messages} />
            </aside>
      </div>
    </DashboardLayout>
  );
};

export default Index;
