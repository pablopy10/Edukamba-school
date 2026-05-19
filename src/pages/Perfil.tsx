import { useEffect, useMemo, useState } from "react";
import {
  User, Mail, Phone, Lock, Shield, Bell, Eye, EyeOff, Check, AlertCircle,
  Globe, Save, Loader2, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { supabaseRestTable } from "@/lib/supabaseRestUrls";
import { qk } from "@/hooks/queries/keys";
import { usePerfilProfileQuery } from "@/hooks/queries/usePerfilProfileQuery";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
import { Capacitor } from "@capacitor/core";
import { applyNativePushPreference } from "@/lib/oneSignalNative";
import { applyWebPushPreference } from "@/lib/oneSignalWeb";
import {
  USER_NOTIFICATION_PREF,
  USER_NOTIFICATION_PREF_CHANNELS,
} from "@/lib/userNotificationPreferenceChannels";
import { useTranslation } from "react-i18next";
import type { AppLocale } from "@/i18n/constants";
import { normalizeAppLocale } from "@/i18n/constants";
import { syncAppLocale } from "@/lib/syncAppLocale";

type Tab = "pessoal" | "credenciais" | "preferencias" | "seguranca";

const PROFILE_TABS: { id: Tab; labelKey: string; icon: typeof User }[] = [
  { id: "pessoal", labelKey: "perfil.tabs.pessoal", icon: User },
  { id: "credenciais", labelKey: "perfil.tabs.credenciais", icon: Lock },
  { id: "preferencias", labelKey: "perfil.tabs.preferencias", icon: Bell },
  { id: "seguranca", labelKey: "perfil.tabs.seguranca", icon: Shield },
];

/** Antes as preferências eram só em localStorage; usado para migrar uma vez após carregar da BD. */
const LEGACY_PREFS_KEY = "perfil:prefs";
const SECURITY_KEY = "perfil:security";

type UserPrefsUi = {
  pushNotif: boolean;
  emailNotif: boolean;
  eventReminders: boolean;
};

const defaultPrefs: UserPrefsUi = { pushNotif: true, emailNotif: true, eventReminders: true };
const defaultSecurity = { loginAlerts: true };

const Perfil = () => {
  const { t } = useTranslation("common");
  const deleteConfirmWord = t("perfil.seguranca.delete_confirm_word");

  const profileSchema = useMemo(
    () =>
      z.object({
        full_name: z.string().trim().min(1, t("perfil.validation.name_required")).max(100, t("perfil.validation.name_max")),
        phone: z.string().trim().max(30, t("perfil.validation.phone_max")).optional().or(z.literal("")),
        language: z.enum(["pt", "en", "fr"]),
      }),
    [t],
  );

  const emailSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().email(t("perfil.validation.email_invalid")).max(255, t("perfil.validation.email_max")),
      }),
    [t],
  );

  const passwordSchema = useMemo(
    () =>
      z
        .object({
          newPassword: z
            .string()
            .min(8, t("perfil.validation.password_min"))
            .max(72, t("perfil.validation.password_max"))
            .regex(/[A-Z]/, t("perfil.validation.password_upper"))
            .regex(/[a-z]/, t("perfil.validation.password_lower"))
            .regex(/[0-9]/, t("perfil.validation.password_digit")),
          confirmPassword: z.string(),
        })
        .refine((d) => d.newPassword === d.confirmPassword, {
          path: ["confirmPassword"],
          message: t("perfil.validation.password_mismatch"),
        }),
    [t],
  );

  const roleLabel = (r: string | null | undefined) => {
    if (!r) return t("perfil.roles.staff_fallback");
    return t(`perfil.roles.${r}`, { defaultValue: t("perfil.roles.staff_fallback") });
  };

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isOnline, enqueuePendingSync } = useOfflineSync();
  const { data: perfilDb, isLoading: perfilFetching } = usePerfilProfileQuery(user?.id);
  const loading = !!user?.id && perfilFetching;
  const [activeTab, setActiveTab] = useState<Tab>("pessoal");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Personal info
  const [profile, setProfile] = useState<{
    full_name: string;
    phone: string;
    language: AppLocale;
    role: string | null;
  }>({ full_name: "", phone: "", language: "pt", role: null });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Email
  const [email, setEmail] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password
  const [pwd, setPwd] = useState({ newPassword: "", confirmPassword: "" });
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
  const [showPwd, setShowPwd] = useState({ next: false, confirm: false });

  const [prefs, setPrefs] = useState<UserPrefsUi>(defaultPrefs);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    setEmailDraft(user.email ?? "");
  }, [user?.id]);

  useEffect(() => {
    if (!perfilDb) return;
    setProfile({
      full_name: perfilDb.full_name ?? "",
      phone: perfilDb.phone ?? "",
      language: normalizeAppLocale(perfilDb.language),
      role: perfilDb.role ?? null,
    });
  }, [perfilDb]);

  useEffect(() => {
    if (!user?.id) {
      setPrefsLoaded(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("channel, enabled")
        .eq("user_id", user.id)
        .in("channel", [...USER_NOTIFICATION_PREF_CHANNELS]);

      if (cancelled) return;

      let next: UserPrefsUi = { ...defaultPrefs };
      if (data && !error) {
        const byCh = Object.fromEntries(data.map((r) => [r.channel, r.enabled])) as Record<string, boolean>;
        if (byCh[USER_NOTIFICATION_PREF.PUSH] !== undefined) next.pushNotif = !!byCh[USER_NOTIFICATION_PREF.PUSH];
        if (byCh[USER_NOTIFICATION_PREF.EMAIL] !== undefined) next.emailNotif = !!byCh[USER_NOTIFICATION_PREF.EMAIL];
        if (byCh[USER_NOTIFICATION_PREF.EVENT_CALENDAR] !== undefined) {
          next.eventReminders = !!byCh[USER_NOTIFICATION_PREF.EVENT_CALENDAR];
        }
      }

      const hasAnyDb = Boolean(data?.length);
      if (!hasAnyDb && typeof window !== "undefined") {
        try {
          const raw = localStorage.getItem(LEGACY_PREFS_KEY);
          if (raw) {
            const j = JSON.parse(raw) as Record<string, unknown>;
            if (typeof j.pushNotif === "boolean") next.pushNotif = j.pushNotif;
            if (typeof j.emailNotif === "boolean") next.emailNotif = j.emailNotif;
            if (typeof j.eventReminders === "boolean") next.eventReminders = j.eventReminders;
          }
        } catch {
          /* ignore */
        }
      }

      setPrefs(next);
      setPrefsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSaveProfile = async () => {
    if (!user) return;
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { if (i.path[0]) errs[String(i.path[0])] = i.message; });
      setProfileErrors(errs);
      showToast("error", t("perfil.pessoal.toast_validation"));
      return;
    }
    setProfileErrors({});
    setSaving(true);
    const locale = normalizeAppLocale(profile.language);
    const body = {
      full_name: profile.full_name.trim(),
      phone: profile.phone?.trim() || null,
      language: locale,
    };

    if (!isOnline) {
      const profilesUrl = `${supabaseRestTable("profiles")}?id=eq.${encodeURIComponent(user.id)}`;
      enqueuePendingSync({
        url: profilesUrl,
        method: "PATCH",
        body: JSON.stringify(body),
      });
      queryClient.setQueryData(qk.perfilProfile(user.id), (prev) => {
        if (!prev || typeof prev !== "object") return prev;
        return { ...prev, ...body };
      });
      setSaving(false);
      void syncAppLocale(locale);
      showToast("success", t("perfil.pessoal.toast_offline"));
      return;
    }

    const { error } = await supabase.from("profiles").update(body).eq("id", user.id);
    setSaving(false);
    if (error) { showToast("error", error.message); return; }
    await syncAppLocale(locale);
    await queryClient.invalidateQueries({ queryKey: qk.perfilProfile(user.id) });
    showToast("success", t("perfil.pessoal.toast_saved"));
  };

  const handleSaveEmail = async () => {
    const parsed = emailSchema.safeParse({ email: emailDraft });
    if (!parsed.success) { setEmailError(parsed.error.issues[0]?.message ?? t("perfil.validation.email_invalid")); return; }
    setEmailError(null);
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ email: emailDraft.trim() });
    setSaving(false);
    if (error) { showToast("error", error.message); return; }
    showToast("success", t("perfil.credenciais.email_toast"));
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
    showToast("success", t("perfil.credenciais.password_toast"));
  };

  const handleSavePrefs = async () => {
    if (!user) return;
    const schoolId = perfilDb?.school_id;
    if (!schoolId) {
      showToast("error", t("perfil.prefs.toast_no_school"));
      return;
    }
    if (!isOnline) {
      showToast("error", t("perfil.prefs.toast_offline"));
      return;
    }
    setSaving(true);
    const rows = [
      { school_id: schoolId, user_id: user.id, channel: USER_NOTIFICATION_PREF.PUSH, enabled: prefs.pushNotif },
      { school_id: schoolId, user_id: user.id, channel: USER_NOTIFICATION_PREF.EMAIL, enabled: prefs.emailNotif },
      {
        school_id: schoolId,
        user_id: user.id,
        channel: USER_NOTIFICATION_PREF.EVENT_CALENDAR,
        enabled: prefs.eventReminders,
      },
    ];
    const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,channel" });
    if (error) {
      setSaving(false);
      showToast("error", error.message);
      return;
    }

    try {
      localStorage.removeItem(LEGACY_PREFS_KEY);
    } catch {
      /* ignore */
    }

    const pushOk = Capacitor.isNativePlatform()
      ? await applyNativePushPreference(prefs.pushNotif)
      : await applyWebPushPreference(prefs.pushNotif);
    setSaving(false);
    if (!pushOk && prefs.pushNotif) {
      showToast(
        "error",
        t("perfil.prefs.toast_push_partial"),
      );
      return;
    }
    showToast("success", t("perfil.prefs.toast_saved"));
  };

  const handleSaveSecurity = () => {
    localStorage.setItem(SECURITY_KEY, JSON.stringify(security));
    showToast("success", t("perfil.seguranca.settings_toast"));
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
      <>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("perfil.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("perfil.subtitle")}</p>
        </div>

        {/* Profile summary */}
        <div className="rounded-2xl bg-card p-6 shadow-card">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-pastel-lilac text-3xl font-bold text-pastel-lilac-foreground shadow-soft">
              {initials}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-foreground">{profile.full_name || t("perfil.no_name")}</h2>
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
          {PROFILE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-[var(--transition-smooth)]",
                  active
                    ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Personal */}
        {activeTab === "pessoal" && (
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-foreground">{t("perfil.pessoal.heading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("perfil.pessoal.hint")}</p>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <Field label={t("perfil.pessoal.full_name")} icon={User} error={profileErrors.full_name}>
                  <input
                    className={inputCls(!!profileErrors.full_name)}
                    value={profile.full_name}
                    maxLength={100}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={t("perfil.pessoal.phone")} icon={Phone} error={profileErrors.phone}>
                <input
                  className={inputCls(!!profileErrors.phone)}
                  value={profile.phone}
                  maxLength={30}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </Field>
              <Field label={t("perfil.pessoal.language")} icon={Globe}>
                <select
                  className={inputCls(false)}
                  value={profile.language}
                  onChange={(e) =>
                    setProfile({ ...profile, language: normalizeAppLocale(e.target.value) })
                  }
                >
                  <option value="pt">{t("perfil.lang.pt")}</option>
                  <option value="en">{t("perfil.lang.en")}</option>
                  <option value="fr">{t("perfil.lang.fr")}</option>
                </select>
              </Field>
              <Field label={t("perfil.pessoal.role")} icon={Shield}>
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
                {t("perfil.pessoal.save")}
              </button>
            </div>
          </div>
        )}

        {/* Credenciais */}
        {activeTab === "credenciais" && (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">{t("perfil.credenciais.email_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("perfil.credenciais.email_desc")}
              </p>
              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={t("perfil.credenciais.email_current")} icon={Mail}>
                  <input className={cn(inputCls(false), "bg-muted/40")} value={email} readOnly />
                </Field>
                <Field label={t("perfil.credenciais.email_new")} icon={Mail} error={emailError ?? undefined}>
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
                  {t("perfil.credenciais.email_update")}
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">{t("perfil.credenciais.password_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("perfil.credenciais.password_desc")}
              </p>

              <div className="mt-5 grid grid-cols-1 gap-5">
                {([
                  { key: "newPassword" as const, label: t("perfil.credenciais.password_new"), show: showPwd.next, toggle: () => setShowPwd((s) => ({ ...s, next: !s.next })) },
                  { key: "confirmPassword" as const, label: t("perfil.credenciais.password_confirm"), show: showPwd.confirm, toggle: () => setShowPwd((s) => ({ ...s, confirm: !s.confirm })) },
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
                  {t("perfil.credenciais.password_update")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Preferências */}
        {activeTab === "preferencias" && (
          <div className="rounded-2xl bg-card p-6 shadow-card">
            <h2 className="text-lg font-bold text-foreground">{t("perfil.prefs.heading")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("perfil.prefs.hint")}</p>

            <div className="mt-6 flex flex-col divide-y divide-border">
              {!prefsLoaded && (
                <p className="py-4 text-sm text-muted-foreground">{t("perfil.prefs.loading")}</p>
              )}
              {prefsLoaded &&
                (
                  [
                    {
                      k: "pushNotif" as const,
                      label: t("perfil.prefs.channels.push.label"),
                      desc: t("perfil.prefs.channels.push.desc"),
                    },
                    {
                      k: "emailNotif" as const,
                      label: t("perfil.prefs.channels.email.label"),
                      desc: t("perfil.prefs.channels.email.desc"),
                    },
                    {
                      k: "eventReminders" as const,
                      label: t("perfil.prefs.channels.events.label"),
                      desc: t("perfil.prefs.channels.events.desc"),
                    },
                  ] as const
                ).map((p) => (
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
                disabled={saving || !prefsLoaded}
                className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" strokeWidth={2} /> {t("perfil.prefs.save")}
              </button>
            </div>
          </div>
        )}

        {/* Segurança */}
        {activeTab === "seguranca" && (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-card p-6 shadow-card">
              <h2 className="text-lg font-bold text-foreground">{t("perfil.seguranca.account_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("perfil.seguranca.account_desc")}</p>

              <div className="mt-6 flex flex-col divide-y divide-border">
                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("perfil.seguranca.login_alerts_label")}</p>
                    <p className="text-xs text-muted-foreground">{t("perfil.seguranca.login_alerts_desc")}</p>
                  </div>
                  <Toggle checked={security.loginAlerts} onChange={(v) => setSecurity({ ...security, loginAlerts: v })} />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSaveSecurity}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
                >
                  <Save className="h-4 w-4" strokeWidth={2} /> {t("perfil.seguranca.save_settings")}
                </button>
              </div>
            </div>

            {/* Danger zone — Remover conta */}
            <div className="rounded-2xl border-2 border-pastel-pink/60 bg-card p-6 shadow-card">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pastel-pink text-pastel-pink-foreground">
                  <Trash2 className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-foreground">{t("perfil.seguranca.delete_title")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("perfil.seguranca.delete_desc")}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => { setDeleteConfirm(""); setDeleteOpen(true); }}
                  className="flex h-11 items-center gap-2 rounded-full bg-pastel-pink px-5 text-sm font-semibold text-pastel-pink-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} /> {t("perfil.seguranca.delete_button")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm delete dialog */}
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("perfil.seguranca.delete_dialog_title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("perfil.seguranca.delete_dialog_desc", { word: deleteConfirmWord })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <input
              autoFocus
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={deleteConfirmWord}
              className="h-11 rounded-xl border border-border bg-card px-4 text-sm shadow-soft outline-none focus:border-pastel-pink-foreground focus:ring-2 focus:ring-pastel-pink/40"
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting} className="rounded-full">{t("perfil.seguranca.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteConfirm !== deleteConfirmWord || deleting}
                onClick={(e) => { e.preventDefault(); handleDeleteAccount(); }}
                className="rounded-full bg-pastel-pink text-pastel-pink-foreground hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" strokeWidth={2} />}
                {t("perfil.seguranca.delete_confirm_action")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
    </>
  );
};

export default Perfil;
