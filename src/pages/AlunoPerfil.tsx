import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, GraduationCap, BookOpen, Clock, CheckCircle2, XCircle, AlertCircle, TrendingUp, Award, Users, FileText, Pencil, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type AvatarColor = "lilac" | "blue" | "yellow" | "green" | "pink";

const avatarStyles: Record<AvatarColor, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

type Student = {
  id: string;
  name: string;
  email: string;
  studentId: string;
  class: string;
  course: string;
  dob: string;
  age: number;
  phone: string;
  address: string;
  enrollmentDate: string;
  status: "Activo" | "Inactivo";
  initials: string;
  avatarColor: AvatarColor;
  gender: "Masculino" | "Feminino";
  guardian: string;
  guardianPhone: string;
  bloodType: string;
};

const studentsDb: Record<string, Student> = {
  "1": { id: "1", name: "Sara Miller", email: "smiller@edukamba.edu", studentId: "2016-01-001", class: "10A", course: "Ciências e Tecnologias", dob: "18/04/2008", age: 17, phone: "(244) 923 101 010", address: "Rua dos Coqueiros 12, Luanda", enrollmentDate: "12/09/2016", status: "Activo", initials: "SM", avatarColor: "pink", gender: "Feminino", guardian: "Maria Miller", guardianPhone: "(244) 923 555 111", bloodType: "O+" },
  "2": { id: "2", name: "Ethan Brown", email: "ebrown@edukamba.edu", studentId: "2014-02-002", class: "12", course: "Ciências e Tecnologias", dob: "22/07/2006", age: 19, phone: "(244) 923 202 020", address: "Av. 4 de Fevereiro 88, Luanda", enrollmentDate: "08/09/2014", status: "Activo", initials: "EB", avatarColor: "blue", gender: "Masculino", guardian: "Robert Brown", guardianPhone: "(244) 923 555 222", bloodType: "A+" },
  "3": { id: "3", name: "Olivia Smith", email: "osmith@edukamba.edu", studentId: "2017-03-003", class: "9B", course: "Ensino Geral", dob: "29/09/2010", age: 15, phone: "(244) 923 303 030", address: "Bairro Maianga 23, Luanda", enrollmentDate: "10/09/2017", status: "Activo", initials: "OS", avatarColor: "yellow", gender: "Feminino", guardian: "John Smith", guardianPhone: "(244) 923 555 333", bloodType: "B+" },
  "4": { id: "4", name: "Lucas Johnson", email: "ljohnson@edukamba.edu", studentId: "2015-01-004", class: "11A", course: "Economia", dob: "03/11/2009", age: 16, phone: "(244) 923 404 040", address: "Rua Amílcar Cabral 45, Luanda", enrollmentDate: "15/09/2015", status: "Activo", initials: "LJ", avatarColor: "green", gender: "Masculino", guardian: "Anna Johnson", guardianPhone: "(244) 923 555 444", bloodType: "AB+" },
  "5": { id: "5", name: "Mia Williams", email: "mwilliams@edukamba.edu", studentId: "2018-02-005", class: "8B", course: "Ensino Geral", dob: "19/01/2007", age: 18, phone: "(244) 923 505 050", address: "Rua Rainha Ginga 7, Luanda", enrollmentDate: "20/09/2018", status: "Activo", initials: "MW", avatarColor: "lilac", gender: "Feminino", guardian: "Sophia Williams", guardianPhone: "(244) 923 555 555", bloodType: "O-" },
};

const grades = [
  { subject: "Matemática", t1: 16, t2: 17, t3: 18, final: 17, color: "blue" as AvatarColor },
  { subject: "Português", t1: 14, t2: 15, t3: 16, final: 15, color: "pink" as AvatarColor },
  { subject: "Inglês", t1: 18, t2: 18, t3: 19, final: 18, color: "yellow" as AvatarColor },
  { subject: "Física", t1: 13, t2: 14, t3: 15, final: 14, color: "green" as AvatarColor },
  { subject: "Química", t1: 17, t2: 16, t3: 17, final: 17, color: "lilac" as AvatarColor },
  { subject: "Biologia", t1: 15, t2: 16, t3: 17, final: 16, color: "blue" as AvatarColor },
  { subject: "História", t1: 12, t2: 13, t3: 14, final: 13, color: "pink" as AvatarColor },
  { subject: "Ed. Física", t1: 18, t2: 19, t3: 19, final: 19, color: "green" as AvatarColor },
];

const assessments = [
  { id: "a1", title: "Teste de Matemática — Funções", date: "12/04/2026", type: "Teste", score: 17, max: 20, status: "Concluído" },
  { id: "a2", title: "Trabalho de Grupo — Biologia", date: "08/04/2026", type: "Trabalho", score: 16, max: 20, status: "Concluído" },
  { id: "a3", title: "Exame de Inglês — Speaking", date: "02/04/2026", type: "Exame", score: 18, max: 20, status: "Concluído" },
  { id: "a4", title: "Quiz de Química — Orgânica", date: "28/03/2026", type: "Quiz", score: 14, max: 20, status: "Concluído" },
  { id: "a5", title: "Teste de Física — Mecânica", date: "30/04/2026", type: "Teste", score: null, max: 20, status: "Agendado" },
];

const schedule = [
  { day: "Segunda", slots: [
    { time: "08:00 — 09:30", subject: "Matemática", room: "Sala 12", teacher: "Prof. Silva", color: "blue" as AvatarColor },
    { time: "09:45 — 11:15", subject: "Português", room: "Sala 8", teacher: "Prof. Santos", color: "pink" as AvatarColor },
    { time: "11:30 — 13:00", subject: "Física", room: "Lab 2", teacher: "Prof. Costa", color: "green" as AvatarColor },
  ]},
  { day: "Terça", slots: [
    { time: "08:00 — 09:30", subject: "Inglês", room: "Sala 5", teacher: "Prof. Brown", color: "yellow" as AvatarColor },
    { time: "09:45 — 11:15", subject: "Química", room: "Lab 1", teacher: "Prof. Mendes", color: "lilac" as AvatarColor },
    { time: "14:00 — 15:30", subject: "Ed. Física", room: "Ginásio", teacher: "Prof. Lopes", color: "green" as AvatarColor },
  ]},
  { day: "Quarta", slots: [
    { time: "08:00 — 09:30", subject: "Matemática", room: "Sala 12", teacher: "Prof. Silva", color: "blue" as AvatarColor },
    { time: "09:45 — 11:15", subject: "Biologia", room: "Lab 3", teacher: "Prof. Pinto", color: "blue" as AvatarColor },
    { time: "11:30 — 13:00", subject: "História", room: "Sala 9", teacher: "Prof. Vieira", color: "pink" as AvatarColor },
  ]},
  { day: "Quinta", slots: [
    { time: "08:00 — 09:30", subject: "Português", room: "Sala 8", teacher: "Prof. Santos", color: "pink" as AvatarColor },
    { time: "09:45 — 11:15", subject: "Inglês", room: "Sala 5", teacher: "Prof. Brown", color: "yellow" as AvatarColor },
    { time: "11:30 — 13:00", subject: "Física", room: "Lab 2", teacher: "Prof. Costa", color: "green" as AvatarColor },
  ]},
  { day: "Sexta", slots: [
    { time: "08:00 — 09:30", subject: "Química", room: "Lab 1", teacher: "Prof. Mendes", color: "lilac" as AvatarColor },
    { time: "09:45 — 11:15", subject: "Matemática", room: "Sala 12", teacher: "Prof. Silva", color: "blue" as AvatarColor },
    { time: "11:30 — 13:00", subject: "Biologia", room: "Lab 3", teacher: "Prof. Pinto", color: "blue" as AvatarColor },
  ]},
];

const attendance = [
  { date: "21/04/2026", subject: "Matemática", status: "Presente" as const },
  { date: "21/04/2026", subject: "Português", status: "Presente" as const },
  { date: "20/04/2026", subject: "Inglês", status: "Falta" as const },
  { date: "20/04/2026", subject: "Química", status: "Presente" as const },
  { date: "19/04/2026", subject: "Física", status: "Atraso" as const },
  { date: "19/04/2026", subject: "Biologia", status: "Presente" as const },
  { date: "18/04/2026", subject: "Matemática", status: "Presente" as const },
  { date: "18/04/2026", subject: "História", status: "Presente" as const },
];

const educators = [
  { name: "Prof. António Silva", role: "Director de Turma", subject: "Matemática", email: "asilva@edukamba.edu", phone: "(244) 923 111 001", color: "blue" as AvatarColor, initials: "AS" },
  { name: "Prof. Beatriz Santos", role: "Educadora", subject: "Português", email: "bsantos@edukamba.edu", phone: "(244) 923 111 002", color: "pink" as AvatarColor, initials: "BS" },
  { name: "Prof. Carlos Costa", role: "Educador", subject: "Física", email: "ccosta@edukamba.edu", phone: "(244) 923 111 003", color: "green" as AvatarColor, initials: "CC" },
  { name: "Prof. Daniela Mendes", role: "Educadora", subject: "Química", email: "dmendes@edukamba.edu", phone: "(244) 923 111 004", color: "lilac" as AvatarColor, initials: "DM" },
  { name: "Prof. Emily Brown", role: "Educadora", subject: "Inglês", email: "ebrown@edukamba.edu", phone: "(244) 923 111 005", color: "yellow" as AvatarColor, initials: "EB" },
];

const extracurriculars = [
  { name: "Clube de Robótica", schedule: "Quartas, 15h00", color: "blue" as AvatarColor },
  { name: "Coro Escolar", schedule: "Sextas, 16h00", color: "pink" as AvatarColor },
  { name: "Equipa de Basquetebol", schedule: "Terças e Quintas, 17h00", color: "green" as AvatarColor },
];

const StatPill = ({ label, value, color }: { label: string; value: string; color: AvatarColor }) => (
  <div className="rounded-2xl bg-card p-5 shadow-card">
    <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", avatarStyles[color])}>{label}</span>
    <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
  </div>
);

const AlunoPerfil = () => {
  const { id } = useParams<{ id: string }>();
  const student = useMemo(() => (id && studentsDb[id]) || studentsDb["1"], [id]);

  const overallAverage = useMemo(() => {
    const sum = grades.reduce((acc, g) => acc + g.final, 0);
    return (sum / grades.length).toFixed(1);
  }, []);

  const presenceRate = useMemo(() => {
    const present = attendance.filter((a) => a.status === "Presente").length;
    return Math.round((present / attendance.length) * 100);
  }, []);

  const statusIcon = (status: "Presente" | "Falta" | "Atraso") => {
    if (status === "Presente") return <CheckCircle2 className="h-4 w-4 text-pastel-green-foreground" strokeWidth={2} />;
    if (status === "Falta") return <XCircle className="h-4 w-4 text-pastel-pink-foreground" strokeWidth={2} />;
    return <AlertCircle className="h-4 w-4 text-pastel-yellow-foreground" strokeWidth={2} />;
  };

  const statusBadge = (status: "Presente" | "Falta" | "Atraso") => {
    const map: Record<string, string> = {
      Presente: "bg-pastel-green text-pastel-green-foreground",
      Falta: "bg-pastel-pink text-pastel-pink-foreground",
      Atraso: "bg-pastel-yellow text-pastel-yellow-foreground",
    };
    return <span className={cn("rounded-full px-3 py-1 text-xs font-medium", map[status])}>{status}</span>;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Back link */}
        <Link to="/alunos" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Voltar a Alunos
        </Link>

        {/* Profile header card */}
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className={cn("flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl text-3xl font-bold shadow-soft", avatarStyles[student.avatarColor])}>
                {student.initials}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{student.name}</h1>
                  <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">{student.status}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">ID {student.studentId} · {student.gender} · {student.age} anos</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-blue/40 px-3 py-1 text-xs font-medium text-pastel-blue-foreground">
                    <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} /> Turma {student.class}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-lilac/50 px-3 py-1 text-xs font-medium text-pastel-lilac-foreground">
                    <BookOpen className="h-3.5 w-3.5" strokeWidth={2} /> {student.course}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent">
                <Download className="h-4 w-4" strokeWidth={1.75} /> Exportar Ficha
              </button>
              <button className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                <Pencil className="h-4 w-4" strokeWidth={2} /> Editar
              </button>
            </div>
          </div>

          {/* Contact grid */}
          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-blue/40 text-pastel-blue-foreground">
                <Mail className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="truncate text-sm font-medium text-foreground">{student.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-green/40 text-pastel-green-foreground">
                <Phone className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm font-medium text-foreground">{student.phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-pink/50 text-pastel-pink-foreground">
                <MapPin className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Morada</p>
                <p className="truncate text-sm font-medium text-foreground">{student.address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-yellow/50 text-pastel-yellow-foreground">
                <Calendar className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Matriculado em</p>
                <p className="text-sm font-medium text-foreground">{student.enrollmentDate}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatPill label="Média Geral" value={overallAverage} color="lilac" />
          <StatPill label="Assiduidade" value={`${presenceRate}%`} color="green" />
          <StatPill label="Avaliações" value={String(assessments.length)} color="blue" />
          <StatPill label="Disciplinas" value={String(grades.length)} color="yellow" />
        </div>

        {/* Two-column area */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Schedule */}
          <div className="rounded-2xl bg-card p-5 shadow-card xl:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Horário Semanal</h2>
              </div>
              <Link to="/horario" className="text-xs font-medium text-pastel-blue-foreground hover:underline">Ver completo</Link>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              {schedule.map((day) => (
                <div key={day.day} className="rounded-xl bg-muted/40 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{day.day}</p>
                  <div className="flex flex-col gap-2">
                    {day.slots.map((s, i) => (
                      <div key={i} className={cn("rounded-lg p-2.5 text-xs", avatarStyles[s.color])}>
                        <p className="font-semibold">{s.subject}</p>
                        <p className="opacity-80">{s.time}</p>
                        <p className="opacity-70">{s.room}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Guardian + extras */}
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-pastel-pink-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Encarregado de Educação</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pastel-pink text-pastel-pink-foreground font-bold">
                  {student.guardian.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{student.guardian}</p>
                  <p className="text-xs text-muted-foreground">{student.guardianPhone}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Data de Nasc.</p>
                  <p className="font-medium text-foreground">{student.dob}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tipo Sanguíneo</p>
                  <p className="font-medium text-foreground">{student.bloodType}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-pastel-yellow-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Extracurriculares</h2>
              </div>
              <div className="flex flex-col gap-2">
                {extracurriculars.map((e) => (
                  <div key={e.name} className={cn("flex items-center justify-between rounded-xl px-3 py-2.5 text-sm", avatarStyles[e.color])}>
                    <span className="font-semibold">{e.name}</span>
                    <span className="text-xs opacity-80">{e.schedule}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Grades */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-pastel-lilac-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Notas por Disciplina</h2>
            </div>
            <span className="rounded-full bg-pastel-lilac/50 px-3 py-1 text-xs font-semibold text-pastel-lilac-foreground">Média: {overallAverage}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pastel-lilac/30 text-left text-xs uppercase tracking-wider text-pastel-lilac-foreground">
                  <th className="py-4 pl-5 pr-4 font-semibold">Disciplina</th>
                  <th className="py-4 pr-4 font-semibold text-center">1.º Trim.</th>
                  <th className="py-4 pr-4 font-semibold text-center">2.º Trim.</th>
                  <th className="py-4 pr-4 font-semibold text-center">3.º Trim.</th>
                  <th className="py-4 pr-5 font-semibold text-center">Final</th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.subject} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="py-3.5 pl-5 pr-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-8 w-8 rounded-lg", avatarStyles[g.color])} />
                        <span className="font-medium text-foreground">{g.subject}</span>
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-center text-muted-foreground">{g.t1}</td>
                    <td className="py-3.5 pr-4 text-center text-muted-foreground">{g.t2}</td>
                    <td className="py-3.5 pr-4 text-center text-muted-foreground">{g.t3}</td>
                    <td className="py-3.5 pr-5 text-center">
                      <span className={cn(
                        "inline-block min-w-[40px] rounded-full px-3 py-1 text-xs font-bold",
                        g.final >= 16 ? "bg-pastel-green text-pastel-green-foreground" :
                        g.final >= 14 ? "bg-pastel-blue text-pastel-blue-foreground" :
                        g.final >= 10 ? "bg-pastel-yellow text-pastel-yellow-foreground" :
                        "bg-pastel-pink text-pastel-pink-foreground"
                      )}>{g.final}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Assessments + Attendance */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Avaliações Recentes</h2>
              </div>
              <Link to="/avaliacoes" className="text-xs font-medium text-pastel-blue-foreground hover:underline">Ver todas</Link>
            </div>
            <div className="divide-y divide-border">
              {assessments.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.date} · {a.type}</p>
                  </div>
                  <div className="text-right">
                    {a.score !== null ? (
                      <p className="text-lg font-bold text-foreground">{a.score}<span className="text-xs font-normal text-muted-foreground">/{a.max}</span></p>
                    ) : (
                      <span className="rounded-full bg-pastel-yellow px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">{a.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-pastel-green-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Presenças Recentes</h2>
              </div>
              <Link to="/presencas" className="text-xs font-medium text-pastel-green-foreground hover:underline">Ver todas</Link>
            </div>
            <div className="divide-y divide-border">
              {attendance.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    {statusIcon(a.status)}
                    <div>
                      <p className="font-semibold text-foreground">{a.subject}</p>
                      <p className="text-xs text-muted-foreground">{a.date}</p>
                    </div>
                  </div>
                  {statusBadge(a.status)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Educators */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-pastel-pink-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Educadores & Professores</h2>
            </div>
            <Link to="/educadores" className="text-xs font-medium text-pastel-pink-foreground hover:underline">Ver todos</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {educators.map((e) => (
              <div key={e.name} className="flex items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
                <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold", avatarStyles[e.color])}>
                  {e.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.role} · {e.subject}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {e.email}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AlunoPerfil;
