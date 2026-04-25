import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { User, Mail, Phone, MapPin, Calendar, Lock, Shield, Bell, Eye, EyeOff, Camera, Check, AlertCircle, Globe, Briefcase, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";

type Tab = "pessoal" | "credenciais" | "preferencias" | "seguranca";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Nome obrigatório").max(50, "Máx. 50 caracteres"),
  lastName: z.string().trim().min(1, "Apelido obrigatório").max(50, "Máx. 50 caracteres"),
  phone: z.string().trim().max(30, "Máx. 30 caracteres").optional().or(z.literal("")),
  address: z.string().trim().max(200, "Máx. 200 caracteres").optional().or(z.literal("")),
  bio: z.string().trim().max(500, "Máx. 500 caracteres").optional().or(z.literal("")),
  dob: z.string().optional().or(z.literal("")),
  jobTitle: z.string().trim().max(100, "Máx. 100 caracteres").optional().or(z.literal("")),
});

const emailSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255, "Máx. 255 caracteres"),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Palavra-passe atual obrigatória"),
    newPassword: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .max(72, "Máx. 72 caracteres")
      .regex(/[A-Z]/, "Deve conter uma letra maiúscula")
      .regex(/[a-z]/, "Deve conter uma letra minúscula")
      .regex(/[0-9]/, "Deve conter um número"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As palavras-passe não coincidem",
  });

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "pessoal", label: "Informações Pessoais", icon: User },
  { id: "credenciais", label: "Credenciais", icon: Lock },
  { id: "preferencias", label: "Preferências", icon: Bell },
  { id: "seguranca", label: "Segurança", icon: Shield },
];

const Perfil = () => {
  const [activeTab, setActiveTab] = useState<Tab>("pessoal");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  // Personal info
  const [profile, setProfile] = useState({
    firstName: "Ana",
    lastName: "Cardoso",
    phone: "(244) 923 000 123",
    address: "Rua Marechal Brós Tito 22, Luanda",
    bio: "Coordenadora académica da EduKamba.",
    dob: "1988-05-14",
    jobTitle: "Coordenadora Académica",
    language: "pt-PT",
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Email
  const [email, setEmail] = useState("acardoso@edukamba.edu");
  const [emailDraft, setEmailDraft] = useState(email);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password
  const [pwd, setPwd] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
  const [showPwd, setShowPwd] = useState({ current: false, next: false, confirm: false });

  // Preferences
  const [prefs, setPrefs] = useState({
    emailNotif: true,
    pushNotif: true,
    smsNotif: false,
    weeklyReport: true,
    eventReminders: true,
  });

  // Security
  const [security, setSecurity] = useState({ twoFactor: false, loginAlerts: true });

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 2800);
  };

  const handleSaveProfile = () => {
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        if (i.path[0]) errs[String(i.path[0])] = i.message;
      });
      setProfileErrors(errs);
      showToast("error", "Verifique os campos do formulário.");
      return;
    }
    setProfileErrors({});
    showToast("success", "Informações pessoais atualizadas.");
  };

  const handleSaveEmail = () => {
    const parsed = emailSchema.safeParse({ email: emailDraft });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? "Email inválido");
      return;
    }
    setEmailError(null);
    setEmail(emailDraft);
    showToast("success", "Email atualizado. Verifique a sua caixa de entrada.");
  };

  const handleSavePassword = () => {
    const parsed = passwordSchema.safeParse(pwd);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        if (i.path[0]) errs[String(i.path[0])] = i.message;
      });
      setPwdErrors(errs);
      return;
    }
    setPwdErrors({});
    setPwd({ currentPassword: "", newPassword: "", confirmPassword: "" });
    showToast("success", "Palavra-passe atualizada.");
  };

  const initials = `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase();

  const Field = ({
    label,
    children,
    error,
    icon: Icon,
  }: {
    label: string;
    children: React.ReactNode;
    error?: string;
    icon?: typeof User;
  }) => (
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
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-pastel-blue-foreground" : "bg-muted",
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-soft transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">O Meu Perfil</h1>
          <p className="text-sm text-muted-foreground">Faça a gestão da sua conta, credenciais e preferências.</p>
        </div>

        {/* Profile summary */}
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-pastel-lilac text-3xl font-bold text-pastel-lilac-foreground shadow-soft">
                {initials || "U"}
              </div>
              <button
                title="Alterar foto"
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-pastel-blue text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
              >
                <Camera className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-foreground">
                  {profile.firstName} {profile.lastName}
                </h2>
                <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">
                  Verificado
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{profile.jobTitle || "Funcionário"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-blue/40 px-3 py-1 text-xs font-medium text-pastel-blue-foreground">
                  <Mail className="h-3.5 w-3.5" strokeWidth={2} /> {email}
                </span>
                {profile.phone && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-yellow/50 px-3 py-1 text-xs font-medium text-pastel-yellow-foreground">
                    <Phone className="h-3.5 w-3.5" strokeWidth={2} /> {profile.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
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
                  active
                    ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === "pessoal" && (
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-foreground">Informações Pessoais</h2>
            <p className="mt-1 text-sm text-muted-foreground">Atualize os seus dados pessoais e profissionais.</p>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Nome" icon={User} error={profileErrors.firstName}>
                <input
                  className={inputCls(!!profileErrors.firstName)}
                  value={profile.firstName}
                  maxLength={50}
                  onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                />
              </Field>
              <Field label="Apelido" icon={User} error={profileErrors.lastName}>
                <input
                  className={inputCls(!!profileErrors.lastName)}
                  value={profile.lastName}
                  maxLength={50}
                  onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                />
              </Field>
              <Field label="Telefone" icon={Phone} error={profileErrors.phone}>
                <input
                  className={inputCls(!!profileErrors.phone)}
                  value={profile.phone}
                  maxLength={30}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </Field>
              <Field label="Data de Nascimento" icon={Calendar}>
                <input
                  type="date"
                  className={inputCls(false)}
                  value={profile.dob}
                  onChange={(e) => setProfile({ ...profile, dob: e.target.value })}
                />
              </Field>
              <Field label="Cargo" icon={Briefcase} error={profileErrors.jobTitle}>
                <input
                  className={inputCls(!!profileErrors.jobTitle)}
                  value={profile.jobTitle}
                  maxLength={100}
                  onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                />
              </Field>
              <Field label="Idioma" icon={Globe}>
                <select
                  className={inputCls(false)}
                  value={profile.language}
                  onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                >
                  <option value="pt-PT">Português (Portugal)</option>
                  <option value="pt-AO">Português (Angola)</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Morada" icon={MapPin} error={profileErrors.address}>
                  <input
                    className={inputCls(!!profileErrors.address)}
                    value={profile.address}
                    maxLength={200}
                    onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Biografia" error={profileErrors.bio}>
                  <textarea
                    rows={4}
                    className={cn(inputCls(!!profileErrors.bio), "h-auto py-3 resize-none")}
                    value={profile.bio}
                    maxLength={500}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  />
                  <p className="text-right text-[11px] text-muted-foreground">{profile.bio.length}/500</p>
                </Field>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveProfile}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
              >
                <Save className="h-4 w-4" strokeWidth={2} /> Guardar Alterações
              </button>
            </div>
          </div>
        )}

        {activeTab === "credenciais" && (
          <div className="flex flex-col gap-6">
            {/* Email */}
            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">Email de Acesso</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Será enviado um email de confirmação para o novo endereço.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Email atual" icon={Mail}>
                  <input className={cn(inputCls(false), "bg-muted/40")} value={email} readOnly />
                </Field>
                <Field label="Novo email" icon={Mail} error={emailError ?? undefined}>
                  <input
                    type="email"
                    className={inputCls(!!emailError)}
                    value={emailDraft}
                    maxLength={255}
                    onChange={(e) => setEmailDraft(e.target.value)}
                  />
                </Field>
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  onClick={handleSaveEmail}
                  disabled={emailDraft === email || !emailDraft}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" strokeWidth={2} /> Atualizar Email
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">Palavra-passe</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use no mínimo 8 caracteres com letras maiúsculas, minúsculas e números.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-5">
                {([
                  { key: "currentPassword" as const, label: "Palavra-passe atual", show: showPwd.current, toggle: () => setShowPwd((s) => ({ ...s, current: !s.current })) },
                  { key: "newPassword" as const, label: "Nova palavra-passe", show: showPwd.next, toggle: () => setShowPwd((s) => ({ ...s, next: !s.next })) },
                  { key: "confirmPassword" as const, label: "Confirmar nova palavra-passe", show: showPwd.confirm, toggle: () => setShowPwd((s) => ({ ...s, confirm: !s.confirm })) },
                ]).map((f) => (
                  <Field key={f.key} label={f.label} icon={Lock} error={pwdErrors[f.key]}>
                    <div className="relative">
                      <input
                        type={f.show ? "text" : "password"}
                        className={cn(inputCls(!!pwdErrors[f.key]), "w-full pr-11")}
                        value={pwd[f.key]}
                        maxLength={72}
                        onChange={(e) => setPwd({ ...pwd, [f.key]: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={f.toggle}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {f.show ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                      </button>
                    </div>
                  </Field>
                ))}
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={handleSavePassword}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
                >
                  <Save className="h-4 w-4" strokeWidth={2} /> Atualizar Palavra-passe
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "preferencias" && (
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-foreground">Preferências</h2>
            <p className="mt-1 text-sm text-muted-foreground">Escolha como quer receber notificações e visualizar a app.</p>

            <div className="mt-6 flex flex-col divide-y divide-border">
              {([
                { k: "emailNotif" as const, label: "Notificações por email", desc: "Receber alertas no seu email." },
                { k: "pushNotif" as const, label: "Notificações push", desc: "Receber notificações no navegador." },
                { k: "smsNotif" as const, label: "Notificações por SMS", desc: "Receber SMS para eventos críticos." },
                { k: "weeklyReport" as const, label: "Relatório semanal", desc: "Resumo de atividade todas as segundas." },
                { k: "eventReminders" as const, label: "Lembretes de eventos", desc: "Receber lembretes 30 min antes." },
              ]).map((p) => (
                <div key={p.k} className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </div>
                  <Toggle checked={prefs[p.k]} onChange={(v) => setPrefs({ ...prefs, [p.k]: v })} />
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => showToast("success", "Preferências guardadas.")}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
              >
                <Save className="h-4 w-4" strokeWidth={2} /> Guardar Preferências
              </button>
            </div>
          </div>
        )}

        {activeTab === "seguranca" && (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">Segurança da Conta</h2>
              <p className="mt-1 text-sm text-muted-foreground">Reforce a proteção do seu acesso.</p>

              <div className="mt-6 flex flex-col divide-y divide-border">
                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Autenticação de dois fatores (2FA)</p>
                    <p className="text-xs text-muted-foreground">Receba um código adicional ao iniciar sessão.</p>
                  </div>
                  <Toggle checked={security.twoFactor} onChange={(v) => setSecurity({ ...security, twoFactor: v })} />
                </div>
                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Alertas de início de sessão</p>
                    <p className="text-xs text-muted-foreground">Notificar sempre que houver um novo login.</p>
                  </div>
                  <Toggle checked={security.loginAlerts} onChange={(v) => setSecurity({ ...security, loginAlerts: v })} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">Sessões Ativas</h2>
              <div className="mt-4 flex flex-col gap-3">
                {[
                  { device: "Chrome · Windows 11", location: "Luanda, AO", time: "Agora", current: true },
                  { device: "Safari · iPhone 15", location: "Luanda, AO", time: "há 2 horas", current: false },
                  { device: "Firefox · MacBook Pro", location: "Lisboa, PT", time: "há 3 dias", current: false },
                ].map((s, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-border p-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {s.device}{" "}
                        {s.current && (
                          <span className="ml-2 rounded-full bg-pastel-green px-2 py-0.5 text-[10px] font-semibold text-pastel-green-foreground">
                            Atual
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.location} · {s.time}</p>
                    </div>
                    {!s.current && (
                      <button
                        onClick={() => showToast("success", "Sessão terminada.")}
                        className="rounded-full bg-pastel-pink/60 px-3 py-1.5 text-xs font-medium text-pastel-pink-foreground transition-colors hover:opacity-90"
                      >
                        Terminar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-pastel-pink/60 bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-pastel-pink-foreground">Zona de Perigo</h2>
              <p className="mt-1 text-sm text-muted-foreground">Estas ações são permanentes e não podem ser desfeitas.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                  Exportar os meus dados
                </button>
                <button className="rounded-full bg-pastel-pink px-5 py-2.5 text-sm font-semibold text-pastel-pink-foreground shadow-soft transition-colors hover:opacity-90">
                  Eliminar conta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div
            className={cn(
              "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-card",
              toast.kind === "success"
                ? "bg-pastel-green text-pastel-green-foreground"
                : "bg-pastel-pink text-pastel-pink-foreground",
            )}
          >
            {toast.kind === "success" ? <Check className="h-4 w-4" strokeWidth={2} /> : <AlertCircle className="h-4 w-4" strokeWidth={2} />}
            {toast.msg}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Perfil;
