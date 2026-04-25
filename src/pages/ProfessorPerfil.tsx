import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, GraduationCap, BookOpen, Clock, FileText, Pencil, Download, Award, Users, Briefcase, Star, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type AvatarColor = "lilac" | "blue" | "yellow" | "green" | "pink";

const avatarStyles: Record<AvatarColor, string> = {
  lilac: "bg-pastel-lilac text-pastel-lilac-foreground",
  blue: "bg-pastel-blue text-pastel-blue-foreground",
  yellow: "bg-pastel-yellow text-pastel-yellow-foreground",
  green: "bg-pastel-green text-pastel-green-foreground",
  pink: "bg-pastel-pink text-pastel-pink-foreground",
};

type Teacher = {
  id: string;
  name: string;
  email: string;
  teacherId: string;
  subject: string;
  hireDate: string;
  phone: string;
  initials: string;
  avatarColor: AvatarColor;
  address: string;
  dob: string;
  gender: "Masculino" | "Feminino";
  status: "Activo" | "Inactivo";
  qualification: string;
  yearsExp: number;
  department: string;
  role: string;
};

const teachersDb: Record<string, Teacher> = {
  "1": { id: "1", name: "Carla Mendes", email: "cmendes@edukamba.edu", teacherId: "PROF-2016-001", subject: "Matemática", hireDate: "12/03/2016", phone: "(244) 924 101 010", initials: "CM", avatarColor: "pink", address: "Rua Ho Chi Minh 14, Luanda", dob: "07/05/1985", gender: "Feminino", status: "Activo", qualification: "Mestrado em Matemática Aplicada", yearsExp: 10, department: "Ciências Exactas", role: "Coordenadora de Departamento" },
  "2": { id: "2", name: "Tiago Ferreira", email: "tferreira@edukamba.edu", teacherId: "PROF-2014-002", subject: "Física", hireDate: "01/09/2014", phone: "(244) 924 202 020", initials: "TF", avatarColor: "blue", address: "Av. Comandante Valódia 56, Luanda", dob: "15/11/1982", gender: "Masculino", status: "Activo", qualification: "Doutoramento em Física", yearsExp: 12, department: "Ciências Exactas", role: "Professor Sénior" },
  "3": { id: "3", name: "Helena Costa", email: "hcosta@edukamba.edu", teacherId: "PROF-2017-003", subject: "Português", hireDate: "23/01/2017", phone: "(244) 924 303 030", initials: "HC", avatarColor: "yellow", address: "Rua Marechal Brós Tito 22, Luanda", dob: "29/03/1988", gender: "Feminino", status: "Activo", qualification: "Licenciatura em Letras", yearsExp: 9, department: "Línguas e Humanidades", role: "Professora" },
  "4": { id: "4", name: "Rui Pereira", email: "rpereira@edukamba.edu", teacherId: "PROF-2015-004", subject: "Química", hireDate: "10/06/2015", phone: "(244) 924 404 040", initials: "RP", avatarColor: "green", address: "Bairro Alvalade 9, Luanda", dob: "18/08/1980", gender: "Masculino", status: "Activo", qualification: "Mestrado em Química Orgânica", yearsExp: 11, department: "Ciências Exactas", role: "Professor" },
  "5": { id: "5", name: "Sofia Almeida", email: "salmeida@edukamba.edu", teacherId: "PROF-2018-005", subject: "Biologia", hireDate: "05/02/2018", phone: "(244) 924 505 050", initials: "SA", avatarColor: "lilac", address: "Rua Lueji A'Nkonde 31, Luanda", dob: "12/12/1990", gender: "Feminino", status: "Activo", qualification: "Mestrado em Biologia Molecular", yearsExp: 8, department: "Ciências Naturais", role: "Diretora de Turma" },
};

const subjects = [
  { name: "Matemática A", classes: ["10A", "11A", "12"], students: 84, color: "blue" as AvatarColor },
  { name: "Matemática Aplicada", classes: ["11B"], students: 28, color: "lilac" as AvatarColor },
];

const schedule = [
  { day: "Segunda", slots: [
    { time: "08:00 — 09:30", subject: "Matemática A", room: "Sala 12", className: "10A", color: "blue" as AvatarColor },
    { time: "09:45 — 11:15", subject: "Matemática A", room: "Sala 14", className: "11A", color: "blue" as AvatarColor },
  ]},
  { day: "Terça", slots: [
    { time: "08:00 — 09:30", subject: "Matemática A", room: "Sala 12", className: "12", color: "blue" as AvatarColor },
    { time: "11:30 — 13:00", subject: "Matemática Aplic.", room: "Sala 9", className: "11B", color: "lilac" as AvatarColor },
  ]},
  { day: "Quarta", slots: [
    { time: "08:00 — 09:30", subject: "Matemática A", room: "Sala 12", className: "10A", color: "blue" as AvatarColor },
    { time: "14:00 — 15:30", subject: "Apoio Escolar", room: "Sala 7", className: "Misto", color: "green" as AvatarColor },
  ]},
  { day: "Quinta", slots: [
    { time: "09:45 — 11:15", subject: "Matemática A", room: "Sala 14", className: "11A", color: "blue" as AvatarColor },
    { time: "11:30 — 13:00", subject: "Matemática Aplic.", room: "Sala 9", className: "11B", color: "lilac" as AvatarColor },
  ]},
  { day: "Sexta", slots: [
    { time: "09:45 — 11:15", subject: "Matemática A", room: "Sala 12", className: "12", color: "blue" as AvatarColor },
  ]},
];

const assessmentsCreated = [
  { id: "a1", title: "Teste de Funções", date: "12/04/2026", type: "Teste", className: "10A", students: 28, avgScore: 14.5, status: "Corrigido" },
  { id: "a2", title: "Trabalho — Estatística", date: "08/04/2026", type: "Trabalho", className: "11A", students: 26, avgScore: 15.8, status: "Corrigido" },
  { id: "a3", title: "Exame Intercalar", date: "02/04/2026", type: "Exame", className: "12", students: 30, avgScore: 13.2, status: "Corrigido" },
  { id: "a4", title: "Quiz — Derivadas", date: "28/03/2026", type: "Quiz", className: "11A", students: 26, avgScore: 16.1, status: "Corrigido" },
  { id: "a5", title: "Teste — Geometria", date: "30/04/2026", type: "Teste", className: "10A", students: 28, avgScore: null, status: "Agendado" },
];

const classes = [
  { name: "10A", role: "Professora", students: 28, color: "blue" as AvatarColor },
  { name: "11A", role: "Professora", students: 26, color: "lilac" as AvatarColor },
  { name: "11B", role: "Professora", students: 28, color: "green" as AvatarColor },
  { name: "12", role: "Diretora de Turma", students: 30, color: "pink" as AvatarColor },
];

const StatPill = ({ label, value, color }: { label: string; value: string; color: AvatarColor }) => (
  <div className="rounded-2xl bg-card p-5 shadow-card">
    <span className={cn("inline-block rounded-full px-3 py-1 text-xs font-medium", avatarStyles[color])}>{label}</span>
    <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
  </div>
);

const ProfessorPerfil = () => {
  const { id } = useParams<{ id: string }>();
  const teacher = useMemo(() => (id && teachersDb[id]) || teachersDb["1"], [id]);

  const totalStudents = subjects.reduce((acc, s) => acc + s.students, 0);
  const totalAssessments = assessmentsCreated.length;
  const corrected = assessmentsCreated.filter((a) => a.status === "Corrigido");
  const avgClassScore = corrected.length
    ? (corrected.reduce((acc, a) => acc + (a.avgScore ?? 0), 0) / corrected.length).toFixed(1)
    : "—";

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <Link to="/professores" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Voltar a Professores
        </Link>

        {/* Profile header */}
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className={cn("flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl text-3xl font-bold shadow-soft", avatarStyles[teacher.avatarColor])}>
                {teacher.initials}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{teacher.name}</h1>
                  <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">{teacher.status}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">ID {teacher.teacherId} · {teacher.gender} · {teacher.yearsExp} anos de experiência</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-blue/40 px-3 py-1 text-xs font-medium text-pastel-blue-foreground">
                    <BookOpen className="h-3.5 w-3.5" strokeWidth={2} /> {teacher.subject}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-lilac/50 px-3 py-1 text-xs font-medium text-pastel-lilac-foreground">
                    <Briefcase className="h-3.5 w-3.5" strokeWidth={2} /> {teacher.role}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-yellow/50 px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">
                    <GraduationCap className="h-3.5 w-3.5" strokeWidth={2} /> {teacher.department}
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
                <p className="truncate text-sm font-medium text-foreground">{teacher.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-green/40 text-pastel-green-foreground">
                <Phone className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="text-sm font-medium text-foreground">{teacher.phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-pink/50 text-pastel-pink-foreground">
                <MapPin className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Morada</p>
                <p className="truncate text-sm font-medium text-foreground">{teacher.address}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pastel-yellow/50 text-pastel-yellow-foreground">
                <Calendar className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Admitido em</p>
                <p className="text-sm font-medium text-foreground">{teacher.hireDate}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatPill label="Alunos" value={String(totalStudents)} color="blue" />
          <StatPill label="Turmas" value={String(classes.length)} color="lilac" />
          <StatPill label="Avaliações" value={String(totalAssessments)} color="yellow" />
          <StatPill label="Média Turmas" value={String(avgClassScore)} color="green" />
        </div>

        {/* Schedule + Sidebar info */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
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
                    {day.slots.length === 0 && <p className="text-xs text-muted-foreground italic">Sem aulas</p>}
                    {day.slots.map((s, i) => (
                      <div key={i} className={cn("rounded-lg p-2.5 text-xs", avatarStyles[s.color])}>
                        <p className="font-semibold">{s.subject}</p>
                        <p className="opacity-80">{s.time}</p>
                        <p className="opacity-70">{s.className} · {s.room}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {/* Qualification */}
            <div className="rounded-2xl bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <Award className="h-5 w-5 text-pastel-yellow-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Formação</h2>
              </div>
              <p className="text-sm font-medium text-foreground">{teacher.qualification}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Data de Nasc.</p>
                  <p className="font-medium text-foreground">{teacher.dob}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Experiência</p>
                  <p className="font-medium text-foreground">{teacher.yearsExp} anos</p>
                </div>
              </div>
            </div>

            {/* Subjects */}
            <div className="rounded-2xl bg-card p-5 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
                <h2 className="text-lg font-bold text-foreground">Disciplinas Lecionadas</h2>
              </div>
              <div className="flex flex-col gap-3">
                {subjects.map((s) => (
                  <div key={s.name} className={cn("rounded-xl p-3", avatarStyles[s.color])}>
                    <p className="font-semibold">{s.name}</p>
                    <p className="mt-1 text-xs opacity-80">{s.classes.join(" · ")} · {s.students} alunos</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Classes */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-pastel-pink-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Turmas</h2>
            </div>
            <Link to="/turmas" className="text-xs font-medium text-pastel-pink-foreground hover:underline">Ver todas</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {classes.map((c) => (
              <div key={c.name} className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
                <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold", avatarStyles[c.color])}>
                  {c.name}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Turma {c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.role}</p>
                  <p className="text-xs text-muted-foreground">{c.students} alunos</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Assessments created */}
        <div className="rounded-2xl bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-pastel-lilac-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Avaliações Criadas</h2>
            </div>
            <Link to="/avaliacoes" className="text-xs font-medium text-pastel-lilac-foreground hover:underline">Ver todas</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-pastel-lilac/30 text-left text-xs uppercase tracking-wider text-pastel-lilac-foreground">
                  <th className="py-4 pl-5 pr-4 font-semibold">Título</th>
                  <th className="py-4 pr-4 font-semibold">Tipo</th>
                  <th className="py-4 pr-4 font-semibold">Turma</th>
                  <th className="py-4 pr-4 font-semibold">Data</th>
                  <th className="py-4 pr-4 font-semibold text-center">Alunos</th>
                  <th className="py-4 pr-4 font-semibold text-center">Média</th>
                  <th className="py-4 pr-5 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {assessmentsCreated.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="py-3.5 pl-5 pr-4 font-medium text-foreground">{a.title}</td>
                    <td className="py-3.5 pr-4">
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">{a.type}</span>
                    </td>
                    <td className="py-3.5 pr-4 text-foreground">{a.className}</td>
                    <td className="py-3.5 pr-4 text-muted-foreground">{a.date}</td>
                    <td className="py-3.5 pr-4 text-center text-muted-foreground">{a.students}</td>
                    <td className="py-3.5 pr-4 text-center">
                      {a.avgScore !== null ? (
                        <span className={cn(
                          "inline-block min-w-[40px] rounded-full px-3 py-1 text-xs font-bold",
                          a.avgScore >= 16 ? "bg-pastel-green text-pastel-green-foreground" :
                          a.avgScore >= 14 ? "bg-pastel-blue text-pastel-blue-foreground" :
                          a.avgScore >= 10 ? "bg-pastel-yellow text-pastel-yellow-foreground" :
                          "bg-pastel-pink text-pastel-pink-foreground"
                        )}>{a.avgScore}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-5">
                      <span className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        a.status === "Corrigido" ? "bg-pastel-green text-pastel-green-foreground" : "bg-pastel-yellow text-pastel-yellow-foreground"
                      )}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Performance summary */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-pastel-green-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Desempenho</h2>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Média das turmas</span>
                <span className="font-bold text-foreground">{avgClassScore} / 20</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avaliações corrigidas</span>
                <span className="font-bold text-foreground">{corrected.length} / {totalAssessments}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Carga horária</span>
                <span className="font-bold text-foreground">22h / semana</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <Star className="h-5 w-5 text-pastel-yellow-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Avaliação dos Alunos</h2>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-bold text-foreground">4.7</p>
              <p className="text-sm text-muted-foreground">/ 5.0</p>
            </div>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={cn("h-4 w-4", i <= 4 ? "fill-pastel-yellow-foreground text-pastel-yellow-foreground" : "text-muted-foreground")} strokeWidth={1.5} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Baseado em 124 avaliações</p>
          </div>

          <div className="rounded-2xl bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-pastel-blue-foreground" strokeWidth={1.75} />
              <h2 className="text-lg font-bold text-foreground">Departamento</h2>
            </div>
            <p className="text-sm font-medium text-foreground">{teacher.department}</p>
            <p className="mt-1 text-xs text-muted-foreground">{teacher.role}</p>
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Coordenador</p>
              <p className="text-sm font-medium text-foreground">Prof. António Silva</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProfessorPerfil;
