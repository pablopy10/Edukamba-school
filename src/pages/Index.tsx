import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { StudentsCard } from "@/components/dashboard/StudentsCard";
import { AttendanceCard } from "@/components/dashboard/AttendanceCard";
import { EarningsCard } from "@/components/dashboard/EarningsCard";
import { CalendarCard } from "@/components/dashboard/CalendarCard";
import { AgendaCard } from "@/components/dashboard/AgendaCard";
import { MessagesCard } from "@/components/dashboard/MessagesCard";
import { ClassroomPerformanceCard } from "@/components/dashboard/ClassroomPerformanceCard";
import { HonorRollCard } from "@/components/dashboard/HonorRollCard";
import { ComplaintsCard } from "@/components/dashboard/ComplaintsCard";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";

const Index = () => {
  const { counts, gender, messages } = useDashboardData();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { role } = useUserRole();
  const isParent = role === "PARENT";
  const fmt = (n: number) => n.toLocaleString("pt-PT");
  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
            {/* Center column */}
            <div className="flex flex-col gap-6">
              <h1 className="sr-only">Painel Edukamba</h1>

              {!isParent && (
                <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label="Alunos" value={fmt(counts.students)} delta={0} variant="lilac" />
                  <StatCard label="Professores" value={fmt(counts.teachers)} delta={0} variant="yellow" />
                  <StatCard label="Funcionários" value={fmt(counts.staff)} delta={0} variant="lilac" />
                  <StatCard label="Turmas" value={fmt(counts.classrooms)} delta={0} variant="yellow" />
                </section>
              )}

              {!isParent && (
                <section className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
                  <StudentsCard male={gender.male} female={gender.female} total={gender.total} />
                  <AttendanceCard />
                </section>
              )}

              {isParent ? (
                <section className="grid grid-cols-1 gap-6">
                  <HonorRollCard />
                </section>
              ) : (
                <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-[220px_220px_1fr]">
                  <ClassroomPerformanceCard variant="best" />
                  <ClassroomPerformanceCard variant="worst" />
                  <HonorRollCard />
                </section>
              )}

              {isParent ? (
                <section className="grid grid-cols-1 gap-6">
                  <ComplaintsCard />
                </section>
              ) : (
                <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <EarningsCard />
                  <ComplaintsCard />
                </section>
              )}
            </div>

            {/* Right column */}
            <aside className="flex flex-col gap-6">
              <CalendarCard selectedDate={selectedDate} onSelect={setSelectedDate} />
              <AgendaCard date={selectedDate} />
              <MessagesCard messages={messages} />
            </aside>
      </div>
    </DashboardLayout>
  );
};

export default Index;
