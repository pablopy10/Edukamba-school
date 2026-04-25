import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Building2, Image as ImageIcon, Users as UsersIcon, Shield, Bell, CreditCard, Globe, Calendar, Plug, Save, Upload, Check, AlertCircle, Plus, Trash2, Pencil, Mail, Phone, MapPin, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

type Tab = "escola" | "marca" | "academico" | "utilizadores" | "permissoes" | "notificacoes" | "faturacao" | "integracoes";

const schoolSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120, "Máx. 120 caracteres"),
  legalName: z.string().trim().max(150, "Máx. 150 caracteres").optional().or(z.literal("")),
  taxId: z.string().trim().max(40, "Máx. 40 caracteres").optional().or(z.literal("")),
  email: z.string().trim().email("Email inválido").max(255),
  phone: z.string().trim().max(40, "Máx. 40 caracteres").optional().or(z.literal("")),
  website: z.string().trim().url("URL inválido").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(200, "Máx. 200 caracteres").optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(500, "Máx. 500 caracteres").optional().or(z.literal("")),
});

const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "escola", label: "Escola", icon: Building2 },
  { id: "marca", label: "Marca", icon: ImageIcon },
  { id: "academico", label: "Académico", icon: Calendar },
  { id: "utilizadores", label: "Utilizadores", icon: UsersIcon },
  { id: "permissoes", label: "Permissões", icon: Shield },
  { id: "notificacoes", label: "Notificações", icon: Bell },
  { id: "faturacao", label: "Faturação", icon: CreditCard },
  { id: "integracoes", label: "Integrações", icon: Plug },
];

type Role = "Administrador" | "Coordenador" | "Professor" | "Educador" | "Funcionário";
type Permission =
  | "manage_school"
  | "manage_users"
  | "manage_students"
  | "manage_teachers"
  | "manage_finance"
  | "manage_grades"
  | "manage_attendance"
  | "manage_events"
  | "view_reports";

const permissionLabels: Record<Permission, { label: string; desc: string }> = {
  manage_school: { label: "Gerir Escola", desc: "Editar definições gerais da escola." },
  manage_users: { label: "Gerir Utilizadores", desc: "Convidar, editar e remover utilizadores." },
  manage_students: { label: "Gerir Alunos", desc: "Criar e editar fichas de alunos." },
  manage_teachers: { label: "Gerir Professores", desc: "Criar e editar fichas de professores." },
  manage_finance: { label: "Gerir Faturação", desc: "Aceder a pagamentos e faturação." },
  manage_grades: { label: "Lançar Notas", desc: "Inserir e editar notas e avaliações." },
  manage_attendance: { label: "Registar Presenças", desc: "Marcar e editar presenças." },
  manage_events: { label: "Gerir Eventos", desc: "Criar e editar eventos escolares." },
  view_reports: { label: "Ver Relatórios", desc: "Aceder a relatórios e exportações." },
};

const initialRoles: Record<Role, Permission[]> = {
  Administrador: Object.keys(permissionLabels) as Permission[],
  Coordenador: ["manage_students", "manage_teachers", "manage_grades", "manage_attendance", "manage_events", "view_reports"],
  Professor: ["manage_grades", "manage_attendance", "view_reports"],
  Educador: ["manage_attendance", "view_reports"],
  Funcionário: ["view_reports"],
};

type InvitedUser = { id: string; name: string; email: string; role: Role; status: "Ativo" | "Convidado" | "Inativo" };
const initialUsers: InvitedUser[] = [
  { id: "u1", name: "Ana Cardoso", email: "acardoso@edukamba.edu", role: "Administrador", status: "Ativo" },
  { id: "u2", name: "Carla Mendes", email: "cmendes@edukamba.edu", role: "Coordenador", status: "Ativo" },
  { id: "u3", name: "Tiago Ferreira", email: "tferreira@edukamba.edu", role: "Professor", status: "Ativo" },
  { id: "u4", name: "Helena Costa", email: "hcosta@edukamba.edu", role: "Professor", status: "Convidado" },
  { id: "u5", name: "Rui Pereira", email: "rpereira@edukamba.edu", role: "Educador", status: "Inativo" },
];

const Definicoes = () => {
  const [activeTab, setActiveTab] = useState<Tab>("escola");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  // School info
  const [school, setSchool] = useState({
    name: "EduKamba",
    legalName: "EduKamba Educação, Lda.",
    taxId: "5417000123",
    email: "geral@edukamba.edu",
    phone: "(244) 222 000 000",
    website: "https://edukamba.edu",
    address: "Rua Marechal Brós Tito, 22",
    city: "Luanda",
    country: "Angola",
    description: "Escola privada com ensino do 1.º ao 12.º ano, focada em excelência académica e desenvolvimento integral.",
  });
  const [schoolErrors, setSchoolErrors] = useState<Record<string, string>>({});

  // Branding
  const [brand, setBrand] = useState({
    primaryColor: "#A78BFA",
    accentColor: "#7DD3FC",
    logo: null as string | null,
    favicon: null as string | null,
  });

  // Academic
  const [academic, setAcademic] = useState({
    schoolYear: "2025/2026",
    yearStart: "2025-09-15",
    yearEnd: "2026-07-10",
    gradingScale: "0-20",
    passingGrade: 10,
    weekdays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    classDuration: 45,
    timezone: "Africa/Luanda",
    currency: "AOA",
  });

  // Users / Roles
  const [users, setUsers] = useState<InvitedUser[]>(initialUsers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("Professor");

  // Permissions
  const [rolePerms, setRolePerms] = useState<Record<Role, Permission[]>>(initialRoles);
  const [activeRole, setActiveRole] = useState<Role>("Coordenador");

  // Notifications
  const [notif, setNotif] = useState({
    welcomeEmail: true,
    enrollmentEmail: true,
    gradePublished: true,
    eventReminder: true,
    absenceAlert: true,
    invoiceIssued: false,
  });

  // Billing
  const [billing, setBilling] = useState({
    plan: "Pro" as "Free" | "Pro" | "Enterprise",
    currency: "AOA",
    invoicePrefix: "FA-2026-",
    nextInvoice: "FA-2026-0123",
    iban: "AO06 0040 0000 1234 5678 9012 3",
    bankName: "Banco BAI",
  });

  // Integrations
  const [integrations, setIntegrations] = useState({
    google: false,
    microsoft: true,
    zoom: false,
    sms: true,
    payments: true,
  });

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 2800);
  };

  const handleSaveSchool = () => {
    const parsed = schoolSchema.safeParse(school);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        if (i.path[0]) errs[String(i.path[0])] = i.message;
      });
      setSchoolErrors(errs);
      showToast("error", "Verifique os campos do formulário.");
      return;
    }
    setSchoolErrors({});
    showToast("success", "Definições da escola guardadas.");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, key: "logo" | "favicon") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("error", "Ficheiro demasiado grande (máx. 2MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBrand((b) => ({ ...b, [key]: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const togglePerm = (role: Role, perm: Permission) => {
    setRolePerms((prev) => {
      const list = prev[role];
      return {
        ...prev,
        [role]: list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm],
      };
    });
  };

  const inviteUser = () => {
    const parsed = z.string().email().safeParse(inviteEmail);
    if (!parsed.success) {
      showToast("error", "Email inválido.");
      return;
    }
    setUsers((prev) => [
      ...prev,
      { id: `u${Date.now()}`, name: inviteEmail.split("@")[0], email: inviteEmail, role: inviteRole, status: "Convidado" },
    ]);
    setInviteEmail("");
    showToast("success", "Convite enviado.");
  };

  const removeUser = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    showToast("success", "Utilizador removido.");
  };

  const Field = ({ label, children, error, icon: Icon }: { label: string; children: React.ReactNode; error?: string; icon?: typeof Building2 }) => (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />}
        {label}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-pastel-pink-foreground">
          <AlertCircle className="h-3 w-3" strokeWidth={2} /> {error}
        </p>
      )}
    </div>
  );

  const inputCls = (hasError?: boolean) =>
    cn(
      "h-11 rounded-xl border bg-card px-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)]",
      hasError
        ? "border-pastel-pink-foreground focus:ring-2 focus:ring-pastel-pink/40"
        : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20",
    );

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-[52px] shrink-0 rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-pastel-blue/40",
        checked ? "bg-pastel-blue-foreground border-pastel-blue-foreground" : "bg-muted border-border",
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white shadow-card transition-transform",
          checked ? "translate-x-[26px]" : "translate-x-0.5",
        )}
      />
    </button>
  );

  const SectionCard = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
    <div className="rounded-2xl bg-card p-6 shadow-card">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );

  const statusBadge = (s: InvitedUser["status"]) => {
    const map: Record<InvitedUser["status"], string> = {
      Ativo: "bg-pastel-green text-pastel-green-foreground",
      Convidado: "bg-pastel-yellow text-pastel-yellow-foreground",
      Inativo: "bg-pastel-pink text-pastel-pink-foreground",
    };
    return <span className={cn("rounded-full px-3 py-1 text-xs font-medium", map[s])}>{s}</span>;
  };

  const SaveBar = ({ onClick }: { onClick: () => void }) => (
    <div className="mt-6 flex justify-end">
      <button onClick={onClick} className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
        <Save className="h-4 w-4" strokeWidth={2} /> Guardar Alterações
      </button>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Definições</h1>
          <p className="text-sm text-muted-foreground">Faça a gestão das definições gerais da escola, marca, utilizadores e permissões.</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 rounded-2xl bg-card p-2 shadow-card">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-[var(--transition-smooth)]",
                  active ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ESCOLA */}
        {activeTab === "escola" && (
          <SectionCard title="Informações da Escola" desc="Dados gerais usados em documentos, faturas e comunicações.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Nome da escola" icon={Building2} error={schoolErrors.name}>
                <input className={inputCls(!!schoolErrors.name)} value={school.name} maxLength={120} onChange={(e) => setSchool({ ...school, name: e.target.value })} />
              </Field>
              <Field label="Designação legal" icon={Building2} error={schoolErrors.legalName}>
                <input className={inputCls(!!schoolErrors.legalName)} value={school.legalName} maxLength={150} onChange={(e) => setSchool({ ...school, legalName: e.target.value })} />
              </Field>
              <Field label="NIF / Tax ID" icon={Hash} error={schoolErrors.taxId}>
                <input className={inputCls(!!schoolErrors.taxId)} value={school.taxId} maxLength={40} onChange={(e) => setSchool({ ...school, taxId: e.target.value })} />
              </Field>
              <Field label="Email institucional" icon={Mail} error={schoolErrors.email}>
                <input className={inputCls(!!schoolErrors.email)} value={school.email} maxLength={255} onChange={(e) => setSchool({ ...school, email: e.target.value })} />
              </Field>
              <Field label="Telefone" icon={Phone} error={schoolErrors.phone}>
                <input className={inputCls(!!schoolErrors.phone)} value={school.phone} maxLength={40} onChange={(e) => setSchool({ ...school, phone: e.target.value })} />
              </Field>
              <Field label="Website" icon={Globe} error={schoolErrors.website}>
                <input className={inputCls(!!schoolErrors.website)} value={school.website} maxLength={255} onChange={(e) => setSchool({ ...school, website: e.target.value })} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Morada" icon={MapPin} error={schoolErrors.address}>
                  <input className={inputCls(!!schoolErrors.address)} value={school.address} maxLength={200} onChange={(e) => setSchool({ ...school, address: e.target.value })} />
                </Field>
              </div>
              <Field label="Cidade" icon={MapPin}>
                <input className={inputCls(false)} value={school.city} maxLength={80} onChange={(e) => setSchool({ ...school, city: e.target.value })} />
              </Field>
              <Field label="País" icon={Globe}>
                <input className={inputCls(false)} value={school.country} maxLength={80} onChange={(e) => setSchool({ ...school, country: e.target.value })} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Descrição" error={schoolErrors.description}>
                  <textarea
                    rows={4}
                    className={cn(inputCls(!!schoolErrors.description), "h-auto py-3 resize-none")}
                    value={school.description}
                    maxLength={500}
                    onChange={(e) => setSchool({ ...school, description: e.target.value })}
                  />
                  <p className="text-right text-[11px] text-muted-foreground">{school.description.length}/500</p>
                </Field>
              </div>
            </div>
            <SaveBar onClick={handleSaveSchool} />
          </SectionCard>
        )}

        {/* MARCA */}
        {activeTab === "marca" && (
          <SectionCard title="Marca e Identidade Visual" desc="Logotipo, favicon e cores que aparecem na app, emails e relatórios.">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Logo */}
              <div className="rounded-xl border border-dashed border-border p-5">
                <p className="text-sm font-semibold text-foreground">Logotipo</p>
                <p className="text-xs text-muted-foreground">PNG ou SVG · até 2MB · recomendado 512×512</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted/40 overflow-hidden">
                    {brand.logo ? (
                      <img src={brand.logo} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft hover:bg-accent">
                    <Upload className="h-4 w-4" strokeWidth={1.75} />
                    Carregar
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, "logo")} />
                  </label>
                </div>
              </div>

              {/* Favicon */}
              <div className="rounded-xl border border-dashed border-border p-5">
                <p className="text-sm font-semibold text-foreground">Favicon</p>
                <p className="text-xs text-muted-foreground">PNG ou ICO · até 2MB · recomendado 64×64</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted/40 overflow-hidden">
                    {brand.favicon ? (
                      <img src={brand.favicon} alt="Favicon" className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft hover:bg-accent">
                    <Upload className="h-4 w-4" strokeWidth={1.75} />
                    Carregar
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, "favicon")} />
                  </label>
                </div>
              </div>

              {/* Colors */}
              <Field label="Cor primária">
                <div className="flex items-center gap-3">
                  <input type="color" value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-card" />
                  <input className={inputCls(false)} value={brand.primaryColor} onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })} />
                </div>
              </Field>
              <Field label="Cor de destaque">
                <div className="flex items-center gap-3">
                  <input type="color" value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-card" />
                  <input className={inputCls(false)} value={brand.accentColor} onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })} />
                </div>
              </Field>
            </div>
            <SaveBar onClick={() => showToast("success", "Marca atualizada.")} />
          </SectionCard>
        )}

        {/* ACADÉMICO */}
        {activeTab === "academico" && (
          <SectionCard title="Configuração Académica" desc="Ano letivo, escala de notas, dias de aulas e moeda.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Ano letivo">
                <input className={inputCls(false)} value={academic.schoolYear} onChange={(e) => setAcademic({ ...academic, schoolYear: e.target.value })} />
              </Field>
              <Field label="Fuso horário" icon={Globe}>
                <select className={inputCls(false)} value={academic.timezone} onChange={(e) => setAcademic({ ...academic, timezone: e.target.value })}>
                  <option value="Africa/Luanda">Africa/Luanda</option>
                  <option value="Europe/Lisbon">Europe/Lisbon</option>
                  <option value="Africa/Maputo">Africa/Maputo</option>
                  <option value="UTC">UTC</option>
                </select>
              </Field>
              <Field label="Início do ano" icon={Calendar}>
                <input type="date" className={inputCls(false)} value={academic.yearStart} onChange={(e) => setAcademic({ ...academic, yearStart: e.target.value })} />
              </Field>
              <Field label="Fim do ano" icon={Calendar}>
                <input type="date" className={inputCls(false)} value={academic.yearEnd} onChange={(e) => setAcademic({ ...academic, yearEnd: e.target.value })} />
              </Field>
              <Field label="Escala de notas">
                <select className={inputCls(false)} value={academic.gradingScale} onChange={(e) => setAcademic({ ...academic, gradingScale: e.target.value })}>
                  <option value="0-20">0–20</option>
                  <option value="0-100">0–100</option>
                  <option value="A-F">A–F</option>
                </select>
              </Field>
              <Field label="Nota mínima de aprovação">
                <input type="number" min={0} max={100} className={inputCls(false)} value={academic.passingGrade} onChange={(e) => setAcademic({ ...academic, passingGrade: Number(e.target.value) })} />
              </Field>
              <Field label="Duração da aula (minutos)">
                <input type="number" min={15} max={180} className={inputCls(false)} value={academic.classDuration} onChange={(e) => setAcademic({ ...academic, classDuration: Number(e.target.value) })} />
              </Field>
              <Field label="Moeda">
                <select className={inputCls(false)} value={academic.currency} onChange={(e) => setAcademic({ ...academic, currency: e.target.value })}>
                  <option value="AOA">AOA — Kwanza</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="USD">USD — Dólar</option>
                  <option value="BRL">BRL — Real</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Dias de aulas</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["mon", "Seg"], ["tue", "Ter"], ["wed", "Qua"], ["thu", "Qui"], ["fri", "Sex"], ["sat", "Sáb"], ["sun", "Dom"],
                  ] as const).map(([k, l]) => {
                    const active = academic.weekdays[k];
                    return (
                      <button
                        key={k}
                        onClick={() => setAcademic({ ...academic, weekdays: { ...academic.weekdays, [k]: !active } })}
                        className={cn(
                          "h-10 rounded-xl px-4 text-sm font-medium transition-[var(--transition-smooth)]",
                          active ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <SaveBar onClick={() => showToast("success", "Definições académicas guardadas.")} />
          </SectionCard>
        )}

        {/* UTILIZADORES */}
        {activeTab === "utilizadores" && (
          <div className="flex flex-col gap-6">
            <SectionCard title="Convidar Utilizador" desc="Envie um convite por email para juntar-se à plataforma.">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  className={cn(inputCls(false), "flex-1")}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <select className={cn(inputCls(false), "sm:w-52")} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
                  {(Object.keys(initialRoles) as Role[]).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button onClick={inviteUser} className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90">
                  <Plus className="h-4 w-4" strokeWidth={2} /> Convidar
                </button>
              </div>
            </SectionCard>

            <div className="rounded-2xl bg-card shadow-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-bold text-foreground">Utilizadores</h2>
                <p className="text-sm text-muted-foreground">Total: {users.length}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                      <th className="py-4 pl-5 pr-4 font-semibold">Nome</th>
                      <th className="py-4 pr-4 font-semibold">Email</th>
                      <th className="py-4 pr-4 font-semibold">Função</th>
                      <th className="py-4 pr-4 font-semibold">Estado</th>
                      <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="py-3.5 pl-5 pr-4 font-medium text-foreground">{u.name}</td>
                        <td className="py-3.5 pr-4 text-muted-foreground">{u.email}</td>
                        <td className="py-3.5 pr-4">
                          <select
                            value={u.role}
                            onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: e.target.value as Role } : x))}
                            className="h-9 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground"
                          >
                            {(Object.keys(initialRoles) as Role[]).map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3.5 pr-4">{statusBadge(u.status)}</td>
                        <td className="py-3.5 pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <button title="Editar" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground">
                              <Pencil className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                            <button onClick={() => removeUser(u.id)} title="Remover" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground">
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PERMISSÕES */}
        {activeTab === "permissoes" && (
          <SectionCard title="Permissões por Função" desc="Defina o que cada função pode fazer na plataforma.">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(initialRoles) as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setActiveRole(r)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-medium transition-[var(--transition-smooth)]",
                    activeRole === r ? "bg-pastel-lilac text-pastel-lilac-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-6 flex flex-col divide-y divide-border">
              {(Object.keys(permissionLabels) as Permission[]).map((p) => {
                const enabled = rolePerms[activeRole].includes(p);
                const isAdmin = activeRole === "Administrador";
                return (
                  <div key={p} className="flex items-center justify-between py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{permissionLabels[p].label}</p>
                      <p className="text-xs text-muted-foreground">{permissionLabels[p].desc}</p>
                    </div>
                    <Toggle
                      checked={enabled || isAdmin}
                      onChange={() => !isAdmin && togglePerm(activeRole, p)}
                    />
                  </div>
                );
              })}
            </div>
            {activeRole === "Administrador" && (
              <p className="mt-4 rounded-xl bg-pastel-yellow/40 p-3 text-xs text-pastel-yellow-foreground">
                A função Administrador tem todas as permissões e não pode ser alterada.
              </p>
            )}
            <SaveBar onClick={() => showToast("success", "Permissões guardadas.")} />
          </SectionCard>
        )}

        {/* NOTIFICAÇÕES */}
        {activeTab === "notificacoes" && (
          <SectionCard title="Notificações Automáticas" desc="Escolha que comunicações automáticas enviar a alunos, encarregados e funcionários.">
            <div className="flex flex-col divide-y divide-border">
              {([
                { k: "welcomeEmail" as const, label: "Email de boas-vindas", desc: "Enviado quando um utilizador é criado." },
                { k: "enrollmentEmail" as const, label: "Confirmação de matrícula", desc: "Enviado ao concluir a matrícula." },
                { k: "gradePublished" as const, label: "Notas publicadas", desc: "Notificar quando notas forem lançadas." },
                { k: "eventReminder" as const, label: "Lembretes de eventos", desc: "Enviar 1 dia antes do evento." },
                { k: "absenceAlert" as const, label: "Alertas de faltas", desc: "Notificar encarregado em caso de falta." },
                { k: "invoiceIssued" as const, label: "Faturas emitidas", desc: "Email automático ao emitir fatura." },
              ]).map((p) => (
                <div key={p.k} className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                  <Toggle checked={notif[p.k]} onChange={(v) => setNotif({ ...notif, [p.k]: v })} />
                </div>
              ))}
            </div>
            <SaveBar onClick={() => showToast("success", "Notificações atualizadas.")} />
          </SectionCard>
        )}

        {/* FATURAÇÃO */}
        {activeTab === "faturacao" && (
          <div className="flex flex-col gap-6">
            <SectionCard title="Plano Atual">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Plano</p>
                  <p className="text-2xl font-bold text-foreground">{billing.plan}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["Free", "Pro", "Enterprise"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setBilling({ ...billing, plan: p })}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-medium transition-[var(--transition-smooth)]",
                        billing.plan === p ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Faturação" desc="Configure o prefixo e dados bancários para emissão de faturas.">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Moeda">
                  <select className={inputCls(false)} value={billing.currency} onChange={(e) => setBilling({ ...billing, currency: e.target.value })}>
                    <option value="AOA">AOA — Kwanza</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="USD">USD — Dólar</option>
                  </select>
                </Field>
                <Field label="Prefixo de fatura">
                  <input className={inputCls(false)} value={billing.invoicePrefix} onChange={(e) => setBilling({ ...billing, invoicePrefix: e.target.value })} />
                </Field>
                <Field label="Próximo número de fatura">
                  <input className={cn(inputCls(false), "bg-muted/40")} value={billing.nextInvoice} readOnly />
                </Field>
                <Field label="Banco">
                  <input className={inputCls(false)} value={billing.bankName} onChange={(e) => setBilling({ ...billing, bankName: e.target.value })} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="IBAN">
                    <input className={inputCls(false)} value={billing.iban} onChange={(e) => setBilling({ ...billing, iban: e.target.value })} />
                  </Field>
                </div>
              </div>
              <SaveBar onClick={() => showToast("success", "Dados de faturação guardados.")} />
            </SectionCard>
          </div>
        )}

        {/* INTEGRAÇÕES */}
        {activeTab === "integracoes" && (
          <SectionCard title="Integrações" desc="Active serviços externos para potenciar a sua escola.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {([
                { k: "google" as const, name: "Google Workspace", desc: "Sincronizar agenda e contas Google." },
                { k: "microsoft" as const, name: "Microsoft 365", desc: "Login e calendário Outlook." },
                { k: "zoom" as const, name: "Zoom", desc: "Aulas online integradas no horário." },
                { k: "sms" as const, name: "Gateway SMS", desc: "Envio de SMS para encarregados." },
                { k: "payments" as const, name: "Pagamentos Online", desc: "Receber propinas online." },
              ]).map((i) => (
                <div key={i.k} className="flex items-center justify-between rounded-xl border border-border p-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{i.name}</p>
                    <p className="text-xs text-muted-foreground">{i.desc}</p>
                  </div>
                  <Toggle checked={integrations[i.k]} onChange={(v) => setIntegrations({ ...integrations, [i.k]: v })} />
                </div>
              ))}
            </div>
            <SaveBar onClick={() => showToast("success", "Integrações atualizadas.")} />
          </SectionCard>
        )}

        {/* Toast */}
        {toast && (
          <div className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-card",
            toast.kind === "success" ? "bg-pastel-green text-pastel-green-foreground" : "bg-pastel-pink text-pastel-pink-foreground",
          )}>
            {toast.kind === "success" ? <Check className="h-4 w-4" strokeWidth={2} /> : <AlertCircle className="h-4 w-4" strokeWidth={2} />}
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Definicoes;
