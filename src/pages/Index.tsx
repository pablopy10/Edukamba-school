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
import { useStudentSelf } from "@/hooks/useStudentSelf";
import { PageLoadingSkeleton } from "@/components/dashboard/PageLoadingSkeleton";
import { cn } from "@/lib/utils";
import { isNativeMobileApp } from "@/lib/nativeApp";
import { StudentTodayScheduleCard } from "@/components/dashboard/StudentTodayScheduleCard";
import { useTranslation } from "react-i18next";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";

const Index = () => {
  const { t, i18n } = useTranslation("common");
  const countsFmtLocale = intlLocaleTagFromLng(i18n.language);
  const fmt = (n: number) => n.toLocaleString(countsFmtLocale);
  const { counts, gender, messages } = useDashboardData();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { role, loading: roleLoading } = useUserRole();
  const isParent = role === "PARENT";
  const isStudent = role === "STUDENT";
  const isTeacher = role === "TEACHER";
  const nativeMobile = isNativeMobileApp();
  /** Painel nativo iOS/Android: professor não vê calendário, agenda nem mensagens na direita. */
  const hideTeacherMobileRail = nativeMobile && isTeacher;
  /** Aluno na app nativa: sem calendário nem agenda na coluna direita (só na web). */
  const hideStudentMobileAside = nativeMobile && isStudent;
  const showDashboardAside = !hideTeacherMobileRail && !hideStudentMobileAside;
  const { studentId, loading: studentLoading } = useStudentSelf();
  if (roleLoading || (isStudent && studentLoading)) return <PageLoadingSkeleton />;
  return (
    <>
      <div
        className={cn(
          "grid grid-cols-1 gap-6",
          showDashboardAside && "xl:grid-cols-[1fr_320px]",
        )}
      >
            {/* Center column */}
            <div className="flex flex-col gap-6">
              <h1 className="sr-only">{t("dashboard.sr_title")}</h1>

              {isStudent && (
                <section className="grid grid-cols-1 gap-6">
                  <StudentTodayScheduleCard />
                </section>
              )}

              {!isParent && !isStudent && (
                <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <StatCard label={t("dashboard.stats.students")} value={fmt(counts.students)} delta={0} variant="lilac" />
                  <StatCard label={t("dashboard.stats.teachers")} value={fmt(counts.teachers)} delta={0} variant="yellow" />
                  <StatCard label={t("dashboard.stats.staff")} value={fmt(counts.staff)} delta={0} variant="lilac" />
                  <StatCard label={t("dashboard.stats.classrooms")} value={fmt(counts.classrooms)} delta={0} variant="yellow" />
                </section>
              )}

              {!isParent && !isStudent && (
                <section className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
                  <StudentsCard male={gender.male} female={gender.female} total={gender.total} />
                  <AttendanceCard />
                </section>
              )}

              {isParent || isStudent ? (
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

              {isParent || isStudent ? (
                <section className="grid grid-cols-1 gap-6">
                  <ComplaintsCard studentScopeId={isStudent ? studentId : undefined} />
                </section>
              ) : (
                <section
                  className={cn(
                    "grid grid-cols-1 gap-6",
                    !isTeacher && "lg:grid-cols-2",
                  )}
                >
                  {!isTeacher && <EarningsCard />}
                  <ComplaintsCard />
                </section>
              )}
            </div>

            {/* Right column — omitido na app nativa para professores; aluno nativo sem calendário/agenda */}
            {showDashboardAside && (
              <aside className="flex flex-col gap-6">
                <CalendarCard selectedDate={selectedDate} onSelect={setSelectedDate} />
                <AgendaCard date={selectedDate} />
                {!isStudent && <MessagesCard messages={messages} />}
              </aside>
            )}
      </div>
    </>
  );
};

export default Index;
