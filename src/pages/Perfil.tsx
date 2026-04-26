import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  User, Mail, Phone, Lock, Shield, Bell, Eye, EyeOff, Check, AlertCircle,
  Globe, Save, Loader2, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Tab = "pessoal" | "credenciais" | "preferencias" | "seguranca";

const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Nome obrigatório").max(100, "Máx. 100 caracteres"),
  phone: z.string().trim().max(30, "Máx. 30 caracteres").optional().or(z.literal("")),
  language: z.string().trim().max(10).optional().or(z.literal("")),
});

const emailSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255, "Máx. 255 caracteres"),
});

const passwordSchema = z
  .object({
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

const roleLabel = (r: string | null | undefined) => {
  switch (r) {
    case "ADMIN": return "Administrador";
    case "TEACHER": return "Professor";
    case "PARENT": return "Educador";
    case "STUDENT": return "Aluno";
    case "SUPER_ADMIN": return "Super admin";
    default: return "Funcionário";
  }
};

const PREFS_KEY = "perfil:prefs";
const SECURITY_KEY = "perfil:security";

const defaultPrefs = {
  emailNotif: true,
  pushNotif: true,
  smsNotif: false,
  weeklyReport: true,
  eventReminders: true,
};
const defaultSecurity = { twoFactor: false, loginAlerts: true };

const Perfil = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("pessoal");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Personal info
  const [profile, setProfile] = useState({ full_name: "", phone: "", language: "pt-PT", role: "" as string | null });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Email
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password
  const [pwd, setPwd] = useState({ newPassword: "", confirmPassword: "" });
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
  const [showPwd, setShowPwd] = useState({ next: false, confirm: false });

  // Preferences (localStorage)
  const [prefs, setPrefs] = useState(() => {
    if (typeof window === "undefined") return defaultPrefs;
    try { return { ...defaultPrefs, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}")) }; }
    catch { return defaultPrefs; }
  });

  // Security (localStorage)
  const [security, setSecurity] = useState(() => {
    if (typeof window === "undefined") return defaultSecurity;
    try { return { ...defaultSecurity, ...(JSON.parse(localStorage.getItem(SECURITY_KEY) ?? "{}")) }; }
    catch { return defaultSecurity; }
  });

  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 2800);
  };

  // Load real profile from DB
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setEmail(user.email ?? "");
    setEmailDraft(user.email ?? "");
    supabase
      .from("profiles")
      .select("full_name, phone, language, role")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile({
            full_name: data.full_name ?? "",
            phone: data.phone ?? "",
            language: data.language ?? "pt-PT",
            role: data.role ?? null,
          });
        }
        setLoading(false);
      });
  }, [user?.id]);

  const handleSaveProfile = async () => {
    if (!user) return;
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { if (i.path[0]) errs[String(i.path[0])] = i.message; });
      setProfileErrors(errs);
      showToast("error", "Verifique os campos do formulário.");
      return;
    }
    setProfileErrors({});
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: profile.full_name.trim(),
        phone: profile.phone?.trim() || null,
        language: profile.language || "pt-PT",
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) { showToast("error", error.message); return; }
    showToast("success", "Informações pessoais atualizadas.");
  };

  const handleSaveEmail = async () => {
    const parsed = emailSchema.safeParse({ email: emailDraft });
    if (!parsed.success) { setEmailError(parsed.error.issues[0]?.message ?? "Email inválido"); return; }
    setEmailError(null);
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ email: emailDraft.trim() });
    setSaving(false);
    if (error) { showToast("error", error.message); return; }
    showToast("success", "Email atualizado. Confirme no seu novo endereço.");
  };

  const handleSavePassword = async () => {
    const parsed = passwordSchema.safeParse(pwd);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { if (i.path[0]) errs[String(i.path[0])] = i.message; });
      setPwdErrors(errs);
      return;
    }
    setPwdErrors({});
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd.newPassword });
    setSaving(false);
    if (error) { showToast("error", error.message); return; }
    setPwd({ newPassword: "", confirmPassword: "" });
    showToast("success", "Palavra-passe atualizada.");
  };

  const handleSavePrefs = () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    showToast("success", "Preferências guardadas.");
  };

  const handleSaveSecurity = () => {
    localStorage.setItem(SECURITY_KEY, JSON.stringify(security));
    showToast("success", "Definições de segurança guardadas.");
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    // Soft-delete: deactivate profile (RLS-safe from client) and sign out.
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", user.id);
    if (error) {
      setDeleting(false);
      showToast("error", error.message);
      return;
    }
    await supabase.auth.signOut();
    setDeleting(false);
    setDeleteOpen(false);
    navigate("/auth", { replace: true });
  };

  const initials = profile.full_name
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "U";

  const Field = ({
    label, children, error, icon: Icon,
  }: {
    label: string; children: React.ReactNode; error?: string; icon?: typeof User;
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

  // SAME toggle as Modulos page
  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pastel-blue/40",
        checked ? "bg-pastel-blue" : "bg-muted",
      )}
      aria-pressed={checked}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-border bg-card shadow-soft transition-transform",
          checked ? "translate-x-[20px]" : "-translate-x-[4px]",
        )}
      />
    </button>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

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
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-pastel-lilac text-3xl font-bold text-pastel-lilac-foreground shadow-soft">
              {initials}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-foreground">{profile.full_name || "Sem nome"}</h2>
                <span className="rounded-full bg-pastel-green px-3 py-1 text-xs font-semibold text-pastel-green-foreground">
                  {roleLabel(profile.role)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-pastel-blue/40 px-3 py-1 text-xs font-medium text-pastel-blue-foreground">
                  <Mail className="h-3.5 w-3.5" strokeWidth={2} /> {email || "—"}
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

        {/* Personal */}
        {activeTab === "pessoal" && (
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-foreground">Informações Pessoais</h2>
            <p className="mt-1 text-sm text-muted-foreground">Atualize os seus dados pessoais.</p>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label="Nome completo" icon={User} error={profileErrors.full_name}>
                  <input
                    className={inputCls(!!profileErrors.full_name)}
                    value={profile.full_name}
                    maxLength={100}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Telefone" icon={Phone} error={profileErrors.phone}>
                <input
                  className={inputCls(!!profileErrors.phone)}
                  value={profile.phone}
                  maxLength={30}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
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
              <Field label="Função" icon={Shield}>
                <input className={cn(inputCls(false), "bg-muted/40")} value={roleLabel(profile.role)} readOnly />
              </Field>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
                Guardar Alterações
              </button>
            </div>
          </div>
        )}

        {/* Credenciais */}
        {activeTab === "credenciais" && (
          <div className="flex flex-col gap-6">
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
                  disabled={emailDraft === email || !emailDraft || saving}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
                  Atualizar Email
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">Palavra-passe</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use no mínimo 8 caracteres com letras maiúsculas, minúsculas e números.
              </p>

              <div className="mt-5 grid grid-cols-1 gap-5">
                {([
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
                  disabled={saving}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
                  Atualizar Palavra-passe
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preferências */}
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
                onClick={handleSavePrefs}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
              >
                <Save className="h-4 w-4" strokeWidth={2} /> Guardar Preferências
              </button>
            </div>
          </div>
        )}

        {/* Segurança */}
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

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveSecurity}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
                >
                  <Save className="h-4 w-4" strokeWidth={2} /> Guardar Definições
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
