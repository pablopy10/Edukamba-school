import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";
import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Image as ImageIcon,
  Users as UsersIcon,
  Shield,
  Bell,
  CreditCard,
  Globe,
  Calendar,
  Save,
  Upload,
  Check,
  AlertCircle,
  Trash2,
  Pencil,
  Mail,
  Phone,
  MapPin,
  Hash,
  Loader2,
  FileText,
  Plus,
  History,
  Search,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { TermsAndHolidaysManager } from "@/components/definicoes/TermsAndHolidaysManager";
import { NewAcademicYearWizard } from "@/components/definicoes/NewAcademicYearWizard";
import { BillingEncargadosDiscountsPanel } from "@/components/definicoes/BillingEncargadosDiscountsPanel";
import { AuditLogsPanel } from "@/components/definicoes/AuditLogsPanel";
import { InviteStaffUserDialog } from "@/components/definicoes/InviteStaffUserDialog";
import { isSchoolSettingsAdmin } from "@/lib/schoolStaffRoles";
import { isDefinicoesTabAllowed } from "@/lib/staffNavAccess";
import { invokeAdminUpdateUserEmail } from "@/lib/admin/invokeAdminUpdateUserEmail";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getDefaultRoleModulePermission,
  fullAccessMatrix,
  PERMISSION_ROUTE_ORDER,
  type PermissionModuleKey,
} from "@/lib/schoolPermissionModules";
import { schoolPermissionMatrixQueryRoot } from "@/hooks/useSchoolPermissionMatrix";
import { uploadFileToR2, R2UploadError } from "@/lib/r2/uploadFileToR2";
import { openFileUrl } from "@/lib/r2/resolveFileUrl";
import { effectiveSchoolIdFromProfile } from "@/lib/effectiveTenant";

type Tab =
  | "escola"
  | "marca"
  | "academico"
  | "utilizadores"
  | "permissoes"
  | "notificacoes"
  | "faturacao"
  | "auditoria";

type Role = Database["public"]["Enums"]["user_role"];

const TAB_DEFS: { id: Tab; icon: typeof Building2 }[] = [
  { id: "escola", icon: Building2 },
  { id: "marca", icon: ImageIcon },
  { id: "academico", icon: Calendar },
  { id: "utilizadores", icon: UsersIcon },
  { id: "permissoes", icon: Shield },
  { id: "notificacoes", icon: Bell },
  { id: "faturacao", icon: CreditCard },
  { id: "auditoria", icon: History },
];

// ===== UI atoms (module scope to keep stable identity across renders) =====
const inputCls = (hasError?: boolean) =>
  cn(
    "h-11 rounded-xl border bg-card px-4 text-sm shadow-soft outline-none transition-[var(--transition-smooth)]",
    hasError
      ? "border-pastel-pink-foreground focus:ring-2 focus:ring-pastel-pink/40"
      : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20",
  );

const Field = ({
  label,
  children,
  error,
  icon: Icon,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  icon?: typeof Building2;
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

const Toggle = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={cn(
      "relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-pastel-blue/40",
      checked ? "bg-pastel-blue" : "bg-muted",
      disabled && "opacity-50 cursor-not-allowed",
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

const SectionCard = ({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-2xl bg-card p-6 shadow-card">
    <h2 className="text-lg font-bold text-foreground">{title}</h2>
    {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
    <div className="mt-5">{children}</div>
  </div>
);

const SaveBar = ({
  onClick,
  disabled,
  saving,
  canSave,
  saveLabel,
}: {
  onClick: () => void;
  disabled?: boolean;
  saving?: boolean;
  canSave?: boolean;
  saveLabel?: string;
}) => {
  const { t: tr } = useTranslation("pages", { keyPrefix: "definicoes" });
  const label = saveLabel ?? tr("shared.save_changes");
  return (
  <div className="mt-6 flex justify-end">
    <button
      onClick={onClick}
      disabled={disabled || saving || !canSave}
      className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
      {label}
    </button>
  </div>
  );
};


const ROLES: Role[] = [
  "ADMIN",
  "DIRECTOR",
  "SECRETARY",
  "TREASURER",
  "LIBRARIAN",
  "STOCK_MANAGER",
  "RECEPTIONIST",
  "TEACHER",
  "PARENT",
  "STUDENT",
];
const Definicoes = () => {
  const { t: tr, i18n } = useTranslation("pages", { keyPrefix: "definicoes" });

  const tabs = useMemo(
    () => TAB_DEFS.map((tab) => ({ ...tab, label: tr(`tabs.${tab.id}`) })),
    [tr],
  );

  const MODULES = useMemo(
    () => [
      ...PERMISSION_ROUTE_ORDER.map((key) => ({
        key,
        label: tr(`modules.${key}.label`),
        desc: tr(`modules.${key}.desc`),
      })),
      {
        key: "modulos" as PermissionModuleKey,
        label: tr("modules.modulos.label"),
        desc: tr("modules.modulos.desc"),
      },
      {
        key: "definicoes" as PermissionModuleKey,
        label: tr("modules.definicoes.label"),
        desc: tr("modules.definicoes.desc"),
      },
    ],
    [tr],
  );

  const NOTIFICATION_CHANNELS = useMemo(
    () =>
      (
        [
          "welcome_email",
          "enrollment",
          "grade_published",
          "event_reminder",
          "absence_alert",
          "invoice_issued",
          "new_message",
          "complaint_update",
          "material_request",
          "absence_request",
        ] as const
      ).map((key) => ({
        key,
        label: tr(`notificacoes.channels.${key}.label`),
        desc: tr(`notificacoes.channels.${key}.desc`),
      })),
    [tr],
  );

  const schoolSchema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, tr("validation.school_name_required")).max(120),
        nif: z.string().trim().max(40).optional().or(z.literal("")),
        address: z.string().trim().max(200).optional().or(z.literal("")),
      }),
    [tr],
  );

  const roleLabel = (r: Role) => tr(`roles.${r}`);

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { years, selectedYearId, setSelectedYearId, refresh: refreshAcademicYears } = useAcademicYear();
  const [activeTab, setActiveTab] = useState<Tab>("escola");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  /** Apenas ADMIN/Super: escola na cloud, marca, SaaS e módulos. */
  const settingsAdmin = isSchoolSettingsAdmin(myRole);
  /** ADMIN/Super ou director: utilizadores e políticas pedagógicas operacionais. */
  const operationsAdmin = settingsAdmin || myRole === "DIRECTOR";

  const visibleDefinicoesTabs = useMemo(
    () => tabs.filter((t) => myRole === null || isDefinicoesTabAllowed(myRole, t.id)),
    [myRole],
  );

  useEffect(() => {
    if (!myRole) return;
    if (!visibleDefinicoesTabs.some((t) => t.id === activeTab)) {
      const fallback = visibleDefinicoesTabs[0]?.id ?? activeTab;
      if (fallback !== activeTab) setActiveTab(fallback as Tab);
    }
  }, [myRole, activeTab, visibleDefinicoesTabs]);

  // School
  const [school, setSchool] = useState({
    name: "",
    nif: "",
    address: "",
    logo_url: "" as string | null | "",
    primary_color: "#A78BFA",
    secondary_color: "#7DD3FC",
    usa_faturacao_externa: false,
    webhook_billing_url: "" as string | null | "",
  });
  const [schoolErrors, setSchoolErrors] = useState<Record<string, string>>({});
  const [logoUploading, setLogoUploading] = useState(false);

  // Academic year (active)
  const [year, setYear] = useState({
    id: "" as string,
    label: "",
    start_date: "",
    end_date: "",
  });

  // Academic settings (stored on schools.settings jsonb)
  const [academicSettings, setAcademicSettings] = useState({
    honor_roll_min_average: 14,
    grading_max_score: 20,
    late_fee_enabled: false,
    late_fee_type: "fixed" as "fixed" | "percentage",
    late_fee_value: 0,
    enrollment_fee_new: 0,
    enrollment_fee_renewal: 0,
  });
  const [savingAcademicSettings, setSavingAcademicSettings] = useState(false);

  // Users
  type UserRow = {
    id: string;
    full_name: string;
    email: string | null;
    role: Role | null;
    is_active: boolean | null;
    phone: string | null;
    avatar_url: string | null;
  };
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersSearchQuery, setUsersSearchQuery] = useState("");
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    const raw = usersSearchQuery.trim().toLowerCase();
    if (!raw) return users;
    const qPhone = raw.replace(/\s+/g, "");
    return users.filter((u) => {
      const name = (u.full_name ?? "").toLowerCase();
      const mail = (u.email ?? "").toLowerCase();
      const phone = (u.phone ?? "").replace(/\s+/g, "").toLowerCase();
      const r = u.role ?? "TEACHER";
      const roleLabelLower = roleLabel(r as Role).toLowerCase();
      const roleKeyLower = String(r).toLowerCase().replace(/_/g, " ");
      return (
        name.includes(raw) ||
        mail.includes(raw) ||
        (!!qPhone && phone.includes(qPhone)) ||
        roleLabelLower.includes(raw) ||
        roleKeyLower.includes(raw)
      );
    });
  }, [users, usersSearchQuery]);

  // Permissions
  type Perm = { module: PermissionModuleKey; can_read: boolean; can_write: boolean; can_delete: boolean };
  const [permTab, setPermTab] = useState<"role" | "user" | "personalizadas">("role");
  const [activeRole, setActiveRole] = useState<Role>("TEACHER");
  const [rolePerms, setRolePerms] = useState<Record<string, Perm>>({});
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [userPerms, setUserPerms] = useState<Record<string, Perm>>({});
  const [storedRolePermRows, setStoredRolePermRows] = useState<number | null>(null);
  const [storedUserPermRows, setStoredUserPermRows] = useState<number | null>(null);
  const [storedCountsLoading, setStoredCountsLoading] = useState(false);

  // Notifications (admin manages defaults per role)
  const [notifRole, setNotifRole] = useState<Role>("TEACHER");
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});

  // Billing
  type Subscription = {
    id: string | null;
    plan_type: "Essencial" | "Pro" | "Enterprise";
    billing_cycle: "SEMESTRAL" | "ANNUAL";
  };
  const [sub, setSub] = useState<Subscription>({ id: null, plan_type: "Enterprise", billing_cycle: "ANNUAL" });
  type Invoice = {
    id: string;
    invoice_number: string;
    amount: number;
    currency: string;
    issue_date: string;
    due_date: string;
    paid_at: string | null;
    status: string;
    proof_url?: string | null;
    payment_method?: string | null;
    notes?: string | null;
    submitted_at?: string | null;
    description?: string | null;
  };
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [proofInvoice, setProofInvoice] = useState<Invoice | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofMethod, setProofMethod] = useState<string>("transferencia");
  const [proofNotes, setProofNotes] = useState<string>("");
  const [proofUploading, setProofUploading] = useState(false);

  // ===== Initial load =====
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: profile } = await supabase
        .from("profiles")
        .select("school_id, support_context_school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      const effectiveSid = effectiveSchoolIdFromProfile(profile);
      if (cancelled || !effectiveSid) {
        setLoading(false);
        return;
      }
      setSchoolId(effectiveSid);
      setMyRole((profile?.role as Role) ?? null);

      const yearQuery = selectedYearId
        ? supabase.from("academic_years").select("*").eq("id", selectedYearId).maybeSingle()
        : supabase
            .from("academic_years")
            .select("*")
            .eq("school_id", effectiveSid)
            .eq("is_active", true)
            .order("start_date", { ascending: false })
            .limit(1)
            .maybeSingle();
      const [schoolRes, yearRes, usersRes, subRes, invRes] = await Promise.all([
        supabase.from("schools").select("*").eq("id", effectiveSid).maybeSingle(),
        yearQuery,
        supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active, phone, avatar_url")
          .eq("school_id", effectiveSid)
          .order("full_name"),
        supabase
          .from("saas_subscriptions")
          .select("*")
          .eq("school_id", effectiveSid)
          .maybeSingle(),
        supabase
          .from("school_invoices")
          .select("*")
          .eq("school_id", effectiveSid)
          .order("issue_date", { ascending: false }),
      ]);

      if (cancelled) return;
      if (schoolRes.data) {
        setSchool({
          name: schoolRes.data.name ?? "",
          nif: schoolRes.data.nif ?? "",
          address: schoolRes.data.address ?? "",
          logo_url: schoolRes.data.logo_url ?? "",
          primary_color: schoolRes.data.primary_color ?? "#A78BFA",
          secondary_color: schoolRes.data.secondary_color ?? "#7DD3FC",
          usa_faturacao_externa: schoolRes.data.usa_faturacao_externa ?? false,
          webhook_billing_url: schoolRes.data.webhook_billing_url ?? "",
        });
        const s = (schoolRes.data.settings ?? {}) as {
          honor_roll_min_average?: number;
          grading_max_score?: number;
          late_fee_enabled?: boolean;
          late_fee_type?: "fixed" | "percentage";
          late_fee_value?: number;
          enrollment_fee_new?: number;
          enrollment_fee_renewal?: number;
        };
        setAcademicSettings({
          honor_roll_min_average: typeof s.honor_roll_min_average === "number" ? s.honor_roll_min_average : 14,
          grading_max_score: typeof s.grading_max_score === "number" ? s.grading_max_score : 20,
          late_fee_enabled: typeof s.late_fee_enabled === "boolean" ? s.late_fee_enabled : false,
          late_fee_type: s.late_fee_type === "percentage" ? "percentage" : "fixed",
          late_fee_value: typeof s.late_fee_value === "number" ? s.late_fee_value : 0,
          enrollment_fee_new: typeof s.enrollment_fee_new === "number" ? s.enrollment_fee_new : 0,
          enrollment_fee_renewal: typeof s.enrollment_fee_renewal === "number" ? s.enrollment_fee_renewal : 0,
        });
      }
      if (yearRes.data) {
        setYear({
          id: yearRes.data.id,
          label: yearRes.data.label,
          start_date: yearRes.data.start_date,
          end_date: yearRes.data.end_date,
        });
      }
      if (usersRes.data) setUsers(usersRes.data as UserRow[]);
      if (subRes.data) {
        setSub({
          id: subRes.data.id,
          plan_type: (subRes.data.plan_type as Subscription["plan_type"]) ?? "Essencial",
          billing_cycle:
            (subRes.data.billing_cycle as Subscription["billing_cycle"]) === "SEMESTRAL"
              ? "SEMESTRAL"
              : "ANNUAL",
        });
      }
      if (invRes.data) setInvoices(invRes.data as Invoice[]);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedYearId]);

  // ===== Permissions: load on tab/role/user change =====
  useEffect(() => {
    if (!schoolId) return;
    if (activeTab !== "permissoes") return;
    if (permTab === "role") {
      void loadRolePerms(activeRole);
    } else if (permTab === "user" && activeUserId) {
      void loadUserPerms(activeUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, permTab, activeRole, activeUserId, schoolId]);

  useEffect(() => {
    if (!schoolId || activeTab !== "permissoes" || permTab !== "personalizadas") return;
    let cancelled = false;
    void (async () => {
      setStoredCountsLoading(true);
      try {
        const roleRes = await supabase
          .from("role_permissions")
          .select("*", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .eq("role", activeRole);
        const userRes = activeUserId
          ? await supabase
              .from("user_permissions")
              .select("*", { count: "exact", head: true })
              .eq("user_id", activeUserId)
              .eq("school_id", schoolId)
          : null;
        if (cancelled) return;
        setStoredRolePermRows(typeof roleRes.count === "number" ? roleRes.count : null);
        if (activeUserId && userRes) {
          setStoredUserPermRows(typeof userRes.count === "number" ? userRes.count : null);
        } else {
          setStoredUserPermRows(null);
        }
      } finally {
        if (!cancelled) setStoredCountsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId, activeTab, permTab, activeRole, activeUserId]);

  const loadRolePerms = async (role: Role) => {
    if (!schoolId) return;
    const { data } = await supabase
      .from("role_permissions")
      .select("module, can_read, can_write, can_delete")
      .eq("school_id", schoolId)
      .eq("role", role);
    const map: Record<string, Perm> = {};
    MODULES.forEach((m) => {
      const found = data?.find((d) => d.module === m.key);
      const dfl = getDefaultRoleModulePermission(role, m.key);
      map[m.key] = {
        module: m.key,
        can_read: found?.can_read ?? dfl.can_read,
        can_write: found?.can_write ?? dfl.can_write,
        can_delete: found?.can_delete ?? dfl.can_delete,
      };
    });
    setRolePerms(map);
  };

  const loadUserPerms = async (userId: string) => {
    if (!schoolId) return;
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    const targetRole = (profile?.role as Role | null) ?? null;
    if (!targetRole) return;

    if (targetRole === "ADMIN" || targetRole === "SUPER_ADMIN") {
      const full = fullAccessMatrix();
      const map: Record<string, Perm> = {};
      MODULES.forEach((m) => {
        const f = full[m.key];
        map[m.key] = {
          module: m.key,
          can_read: f.can_read,
          can_write: f.can_write,
          can_delete: f.can_delete,
        };
      });
      setUserPerms(map);
      return;
    }

    const [{ data: roleData }, { data: userData }] = await Promise.all([
      supabase
        .from("role_permissions")
        .select("module, can_read, can_write, can_delete")
        .eq("school_id", schoolId)
        .eq("role", targetRole),
      supabase.from("user_permissions").select("module, can_read, can_write, can_delete").eq("user_id", userId),
    ]);

    const map: Record<string, Perm> = {};
    MODULES.forEach((m) => {
      const uRow = userData?.find((d) => d.module === m.key);
      if (uRow) {
        map[m.key] = {
          module: m.key,
          can_read: !!uRow.can_read,
          can_write: !!uRow.can_write,
          can_delete: !!uRow.can_delete,
        };
        return;
      }
      const rRow = roleData?.find((d) => d.module === m.key);
      const dfl = getDefaultRoleModulePermission(targetRole, m.key);
      map[m.key] = {
        module: m.key,
        can_read: rRow?.can_read ?? dfl.can_read,
        can_write: rRow?.can_write ?? dfl.can_write,
        can_delete: rRow?.can_delete ?? dfl.can_delete,
      };
    });
    setUserPerms(map);
  };

  // ===== Notifications: load when tab/role changes =====
  useEffect(() => {
    if (!schoolId) return;
    if (activeTab !== "notificacoes") return;
    void loadNotifPrefs(notifRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, notifRole, schoolId]);

  const loadNotifPrefs = async (role: Role) => {
    // We use one user as template per role: load any user with the role and read their preferences.
    const sample = users.find((u) => u.role === role);
    if (!sample) {
      const map: Record<string, boolean> = {};
      NOTIFICATION_CHANNELS.forEach((c) => (map[c.key] = true));
      setNotifPrefs(map);
      return;
    }
    const { data } = await supabase
      .from("notification_preferences")
      .select("channel, enabled")
      .eq("user_id", sample.id);
    const map: Record<string, boolean> = {};
    NOTIFICATION_CHANNELS.forEach((c) => {
      const f = data?.find((d) => d.channel === c.key);
      map[c.key] = f?.enabled ?? true;
    });
    setNotifPrefs(map);
  };

  // ===== Helpers =====
  const showToast = (kind: "success" | "error", msg: string) => {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 2800);
  };

  // ===== Save school =====
  const handleSaveSchool = async () => {
    if (!schoolId) return;
    const parsed = schoolSchema.safeParse({ name: school.name, nif: school.nif, address: school.address });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => i.path[0] && (errs[String(i.path[0])] = i.message));
      setSchoolErrors(errs);
      showToast("error", tr("validation.form_check"));
      return;
    }
    setSchoolErrors({});
    setSaving(true);
    const { error } = await supabase
      .from("schools")
      .update({
        name: school.name,
        nif: school.nif || null,
        address: school.address || null,
        usa_faturacao_externa: school.usa_faturacao_externa,
        webhook_billing_url: school.webhook_billing_url || null,
      })
      .eq("id", schoolId);
    setSaving(false);
    if (error) return showToast("error", error.message);
    showToast("success", tr("toasts.school_saved"));
  };

  // ===== Save brand =====
  const handleSaveBrand = async () => {
    if (!schoolId) return;
    setSaving(true);
    const { error } = await supabase
      .from("schools")
      .update({
        primary_color: school.primary_color,
        secondary_color: school.secondary_color,
        logo_url: school.logo_url || null,
      })
      .eq("id", schoolId);
    setSaving(false);
    if (error) return showToast("error", error.message);
    showToast("success", tr("toasts.brand_saved"));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !schoolId) return;
    if (file.size > 2 * 1024 * 1024) return showToast("error", tr("validation.logo_max_size"));
    setLogoUploading(true);
    try {
      const publicUrl = await uploadFileToR2(file, { prefix: "school-logos" });
      setSchool((s) => ({ ...s, logo_url: publicUrl }));
      showToast("success", tr("toasts.logo_uploaded"));
    } catch (e) {
      const msg = e instanceof R2UploadError ? e.message : e instanceof Error ? e.message : tr("toasts.proof_error");
      showToast("error", msg);
    } finally {
      setLogoUploading(false);
    }
  };

  // ===== Save academic =====
  const handleSaveAcademic = async () => {
    if (!year.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("academic_years")
      .update({
        label: year.label,
        start_date: year.start_date,
        end_date: year.end_date,
      })
      .eq("id", year.id);
    setSaving(false);
    if (error) return showToast("error", error.message);
    await refreshAcademicYears();
    showToast("success", tr("toasts.academic_updated"));
  };

  const handleSetActiveAcademic = async () => {
    if (!schoolId || !year.id) return;
    setSaving(true);
    const clear = await supabase.from("academic_years").update({ is_active: false }).eq("school_id", schoolId);
    const setActive = clear.error
      ? clear
      : await supabase.from("academic_years").update({ is_active: true }).eq("id", year.id);
    setSaving(false);
    if (setActive.error) return showToast("error", setActive.error.message);
    await refreshAcademicYears();
    showToast("success", tr("toasts.academic_active_updated"));
  };

  const handleCreateAcademicYear = async () => {
    if (!schoolId) return;
    // Suggest the next school year based on the most recent end_date.
    const latest = years
      .slice()
      .sort((a, b) => (a.end_date < b.end_date ? 1 : -1))[0];
    const baseYear = latest ? new Date(latest.end_date).getFullYear() : new Date().getFullYear();
    const startYear = baseYear;
    const endYear = baseYear + 1;
    const label = `${startYear}/${endYear}`;
    const start_date = `${startYear}-09-01`;
    const end_date = `${endYear}-07-31`;
    setSaving(true);
    const { data, error } = await supabase
      .from("academic_years")
      .insert({ school_id: schoolId, label, start_date, end_date, is_active: false })
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error) return showToast("error", error.message);
    await refreshAcademicYears();
    if (data?.id) setSelectedYearId(data.id);
    showToast("success", tr("toasts.academic_created"));
  };

  const [confirmDeleteYearId, setConfirmDeleteYearId] = useState<string | null>(null);

  const handleDeleteAcademicYear = async () => {
    if (!schoolId || !confirmDeleteYearId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("academic_years")
      .delete()
      .eq("id", confirmDeleteYearId)
      .select("id");
    setSaving(false);
    if (error) {
      setConfirmDeleteYearId(null);
      const msg = /foreign key|violates|referenced/i.test(error.message)
        ? tr("validation.delete_year_blocked")
        : error.message;
      return showToast("error", msg);
    }
    if (!data || data.length === 0) {
      setConfirmDeleteYearId(null);
      return showToast(
        "error",
        tr("validation.delete_year_forbidden"),
      );
    }
    const removed = confirmDeleteYearId;
    setConfirmDeleteYearId(null);
    await refreshAcademicYears();
    // Pick another year if the removed one was selected.
    if (selectedYearId === removed) {
      const next = years.find((y) => y.id !== removed);
      if (next) setSelectedYearId(next.id);
    }
    showToast("success", tr("toasts.academic_deleted"));
  };

  const handleSaveAcademicSettings = async () => {
    if (!schoolId) return;
    const min = Number(academicSettings.honor_roll_min_average);
    const max = Number(academicSettings.grading_max_score);
    if (Number.isNaN(min) || min < 0 || Number.isNaN(max) || max <= 0 || min > max) {
      return showToast("error", tr("validation.academic_values"));
    }
    const lateValue = Number(academicSettings.late_fee_value);
    if (academicSettings.late_fee_enabled) {
      if (Number.isNaN(lateValue) || lateValue <= 0) {
        return showToast("error", tr("validation.late_fee_positive"));
      }
      if (academicSettings.late_fee_type === "percentage" && lateValue > 100) {
        return showToast("error", tr("validation.late_fee_pct_max"));
      }
    }
    setSavingAcademicSettings(true);
    // Merge into existing settings to avoid wiping unrelated keys
    const { data: current } = await supabase
      .from("schools")
      .select("settings")
      .eq("id", schoolId)
      .maybeSingle();
    const merged = {
      ...((current?.settings ?? {}) as Record<string, unknown>),
      honor_roll_min_average: min,
      grading_max_score: max,
      late_fee_enabled: academicSettings.late_fee_enabled,
      late_fee_type: academicSettings.late_fee_type,
      late_fee_value: academicSettings.late_fee_enabled ? lateValue : 0,
      enrollment_fee_new: Math.max(0, Number(academicSettings.enrollment_fee_new) || 0),
      enrollment_fee_renewal: Math.max(0, Number(academicSettings.enrollment_fee_renewal) || 0),
    };
    const { error } = await supabase.from("schools").update({ settings: merged }).eq("id", schoolId);
    setSavingAcademicSettings(false);
    if (error) return showToast("error", error.message);
    showToast("success", tr("toasts.academic_settings_saved"));
  };

  // ===== Users =====
  const updateUserRole = async (id: string, role: Role) => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) return showToast("error", error.message);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    showToast("success", tr("toasts.role_updated"));
  };

  const toggleUserActive = async (id: string, value: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: value }).eq("id", id);
    if (error) return showToast("error", error.message);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_active: value } : u)));
    showToast("success", value ? tr("toasts.user_activated") : tr("toasts.user_deactivated"));
  };

  const saveEditUser = async () => {
    if (!editUser) return;
    const prevMail = users.find((u) => u.id === editUser.id)?.email?.trim().toLowerCase() ?? "";
    const nextMail = (editUser.email ?? "").trim().toLowerCase();
    if (!nextMail) {
      return showToast("error", tr("validation.email_required_login"));
    }
    setSaving(true);
    if (nextMail !== prevMail) {
      const fx = await invokeAdminUpdateUserEmail(editUser.id, nextMail);
      if (!fx.ok) {
        setSaving(false);
        return showToast("error", fx.message ?? tr("validation.update_email_failed"));
      }
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editUser.full_name,
        phone: editUser.phone,
        email: nextMail,
      })
      .eq("id", editUser.id);
    setSaving(false);
    if (error) return showToast("error", error.message);
    setUsers((prev) =>
      prev.map((u) => (u.id === editUser.id ? { ...editUser, email: nextMail } : u)),
    );
    setEditUser(null);
    showToast("success", tr("toasts.user_updated"));
  };

  const confirmRemoveUser = async () => {
    if (!removeId) return;
    // Soft remove: set inactive and detach school so RLS hides everything
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: false })
      .eq("id", removeId);
    if (error) return showToast("error", error.message);
    setUsers((prev) => prev.map((u) => (u.id === removeId ? { ...u, is_active: false } : u)));
    setRemoveId(null);
    showToast("success", tr("toasts.user_removed"));
  };

  // ===== Save permissions =====
  const saveRolePerms = async () => {
    if (!schoolId) return;
    setSaving(true);
    const rows = MODULES.map((m) => ({
      school_id: schoolId,
      role: activeRole,
      module: m.key,
      can_read: rolePerms[m.key]?.can_read ?? false,
      can_write: rolePerms[m.key]?.can_write ?? false,
      can_delete: rolePerms[m.key]?.can_delete ?? false,
    }));
    const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "school_id,role,module" });
    setSaving(false);
    if (error) return showToast("error", error.message);
    void queryClient.invalidateQueries({ queryKey: [...schoolPermissionMatrixQueryRoot] });
    showToast("success", tr("toasts.role_perms_saved"));
  };

  const saveUserPerms = async () => {
    if (!schoolId || !activeUserId) return;
    const targetUser = users.find((u) => u.id === activeUserId);
    const targetRole = targetUser?.role;
    if (!targetRole) {
      return showToast("error", tr("validation.cannot_resolve_user_role"));
    }
    if (targetRole === "ADMIN" || targetRole === "SUPER_ADMIN") {
      return showToast("error", tr("validation.admin_always_full_access"));
    }

    setSaving(true);

    const { data: rp } = await supabase
      .from("role_permissions")
      .select("module, can_read, can_write, can_delete")
      .eq("school_id", schoolId)
      .eq("role", targetRole);

    type UpsertRow = {
      school_id: string;
      user_id: string;
      module: PermissionModuleKey;
      can_read: boolean;
      can_write: boolean;
      can_delete: boolean;
    };
    const toUpsert: UpsertRow[] = [];
    const toClear: PermissionModuleKey[] = [];

    for (const m of MODULES) {
      const rRow = rp?.find((d) => d.module === m.key);
      const dfl = getDefaultRoleModulePermission(targetRole, m.key);
      const base = {
        can_read: rRow?.can_read ?? dfl.can_read,
        can_write: rRow?.can_write ?? dfl.can_write,
        can_delete: rRow?.can_delete ?? dfl.can_delete,
      };
      const cur = userPerms[m.key] ?? {
        module: m.key,
        can_read: base.can_read,
        can_write: base.can_write,
        can_delete: base.can_delete,
      };
      const same =
        cur.can_read === base.can_read &&
        cur.can_write === base.can_write &&
        cur.can_delete === base.can_delete;
      if (same) toClear.push(m.key);
      else {
        toUpsert.push({
          school_id: schoolId,
          user_id: activeUserId,
          module: m.key,
          can_read: !!cur.can_read,
          can_write: !!cur.can_write,
          can_delete: !!cur.can_delete,
        });
      }
    }

    if (toClear.length > 0) {
      const { error: delErr } = await supabase
        .from("user_permissions")
        .delete()
        .eq("user_id", activeUserId)
        .in("module", toClear);
      if (delErr) {
        setSaving(false);
        return showToast("error", delErr.message);
      }
    }
    if (toUpsert.length > 0) {
      const { error } = await supabase.from("user_permissions").upsert(toUpsert, { onConflict: "user_id,module" });
      if (error) {
        setSaving(false);
        return showToast("error", error.message);
      }
    }

    setSaving(false);
    void queryClient.invalidateQueries({ queryKey: [...schoolPermissionMatrixQueryRoot] });
    showToast("success", tr("toasts.user_perms_saved"));
  };

  const clearStoredRolePermissions = async () => {
    if (!schoolId || !operationsAdmin) return;
    if (activeRole === "ADMIN") {
      return showToast(
        "error",
        tr("validation.admin_no_stored_perms"),
      );
    }
    if (
      !window.confirm(tr("modals.confirm_clear_role.body", { role: roleLabel(activeRole) }))
    ) {
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("school_id", schoolId)
      .eq("role", activeRole);
    setSaving(false);
    if (error) return showToast("error", error.message);
    setStoredRolePermRows(0);
    void loadRolePerms(activeRole);
    void queryClient.invalidateQueries({ queryKey: [...schoolPermissionMatrixQueryRoot] });
    showToast("success", tr("toasts.role_perms_reset"));
  };

  const clearStoredUserPermissions = async () => {
    if (!schoolId || !activeUserId || !operationsAdmin) return;
    const targetUser = users.find((u) => u.id === activeUserId);
    const targetRole = targetUser?.role;
    if (!targetRole) return showToast("error", tr("validation.cannot_resolve_user_role"));
    if (targetRole === "ADMIN" || targetRole === "SUPER_ADMIN") {
      return showToast("error", tr("validation.admin_user_full_access"));
    }
    if (
      !window.confirm(tr("modals.confirm_clear_user.body", { name: targetUser.full_name }))
    ) {
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("user_permissions")
      .delete()
      .eq("user_id", activeUserId)
      .eq("school_id", schoolId);
    setSaving(false);
    if (error) return showToast("error", error.message);
    setStoredUserPermRows(0);
    void loadUserPerms(activeUserId);
    void queryClient.invalidateQueries({ queryKey: [...schoolPermissionMatrixQueryRoot] });
    showToast("success", tr("toasts.user_perms_cleared"));
  };

  // ===== Save notification prefs =====
  const saveNotifPrefs = async () => {
    if (!schoolId) return;
    const targets = users.filter((u) => u.role === notifRole && u.is_active !== false);
    if (targets.length === 0) return showToast("error", tr("validation.users_required_for_notif"));
    setSaving(true);
    const rows = targets.flatMap((u) =>
      NOTIFICATION_CHANNELS.map((c) => ({
        school_id: schoolId,
        user_id: u.id,
        channel: c.key,
        enabled: notifPrefs[c.key] ?? true,
      })),
    );
    const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,channel" });
    setSaving(false);
    if (error) return showToast("error", error.message);
    showToast("success", tr("toasts.notif_prefs_applied", { count: targets.length }));
  };

  // ===== Save billing cycle =====
  const saveBillingCycle = async (cycle: "SEMESTRAL" | "ANNUAL") => {
    if (!schoolId) return;
    setSub((s) => ({ ...s, billing_cycle: cycle }));
    let subId = sub.id;
    if (sub.id) {
      const { error } = await supabase
        .from("saas_subscriptions")
        .update({ billing_cycle: cycle, last_generated_cycle_key: null })
        .eq("id", sub.id);
      if (error) return showToast("error", error.message);
    } else {
      const { data, error } = await supabase
        .from("saas_subscriptions")
        .insert({ school_id: schoolId, plan_type: sub.plan_type, billing_cycle: cycle, status: "ACTIVE" })
        .select()
        .maybeSingle();
      if (error) return showToast("error", error.message);
      if (data) {
        setSub((s) => ({ ...s, id: data.id }));
        subId = data.id;
      }
    }
    // Pagamentos são gerados manualmente — não disparar geração automática
    showToast("success", tr("toasts.billing_cycle_updated"));
    void subId;
  };

  const reloadInvoices = async () => {
    if (!schoolId) return;
    const { data } = await supabase
      .from("school_invoices")
      .select("*")
      .eq("school_id", schoolId)
      .order("issue_date", { ascending: false });
    if (data) setInvoices(data as Invoice[]);
  };

  const submitProof = async () => {
    if (!proofInvoice || !schoolId || !user) return;
    if (!proofFile) return showToast("error", tr("validation.proof_file_required"));
    setProofUploading(true);
    try {
      const proofPublicUrl = await uploadFileToR2(proofFile, { prefix: "school-invoice-proofs" });
      const { error: updErr } = await supabase
        .from("school_invoices")
        .update({
          proof_url: proofPublicUrl,
          payment_method: proofMethod,
          notes: proofNotes || null,
          submitted_at: new Date().toISOString(),
          submitted_by: user.id,
          status: "submitted",
        })
        .eq("id", proofInvoice.id);
      if (updErr) throw updErr;
      await reloadInvoices();
      setProofInvoice(null);
      setProofFile(null);
      setProofMethod("transferencia");
      setProofNotes("");
      showToast("success", tr("toasts.proof_submitted"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : tr("toasts.proof_error");
      showToast("error", msg);
    } finally {
      setProofUploading(false);
    }
  };

  const downloadProof = async (path: string) => {
    try {
      await openFileUrl(path, "school-invoice-proofs");
    } catch {
      showToast("error", tr("toasts.proof_open_failed"));
    }
  };

  const statusBadge = (active: boolean | null) => {
    const isActive = active !== false;
    const cls = isActive
      ? "bg-pastel-green text-pastel-green-foreground"
      : "bg-pastel-pink text-pastel-pink-foreground";
    return (
      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", cls)}>
        {isActive ? tr("utilizadores.status_active") : tr("utilizadores.status_inactive")}
      </span>
    );
  };

  const setRolePermField = (
    mod: PermissionModuleKey,
    key: keyof Omit<Perm, "module">,
    value: boolean,
  ) => {
    setRolePerms((prev) => ({
      ...prev,
      [mod]: { ...(prev[mod] ?? { module: mod, can_read: false, can_write: false, can_delete: false }), [key]: value },
    }));
  };
  const setUserPermField = (
    mod: PermissionModuleKey,
    key: keyof Omit<Perm, "module">,
    value: boolean,
  ) => {
    setUserPerms((prev) => ({
      ...prev,
      [mod]: { ...(prev[mod] ?? { module: mod, can_read: false, can_write: false, can_delete: false }), [key]: value },
    }));
  };

  const formatCurrency = (amount: number, currency: string) => {
    const locale = intlLocaleTagFromLng(i18n.language);
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  };

  const memoizedUsersForNotif = useMemo(
    () => users.filter((u) => u.role === notifRole && u.is_active !== false).length,
    [users, notifRole],
  );

  if (loading) {
    return (
      <>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{tr("page_header.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {tr("page_header.subtitle")}
          </p>
          {operationsAdmin && !settingsAdmin && (
            <p className="mt-2 rounded-xl bg-pastel-blue/35 px-3 py-2 text-xs text-pastel-blue-foreground">
              {tr("page_header.director_notice")}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 rounded-2xl bg-card p-2 shadow-card">
          {visibleDefinicoesTabs.map((t) => {
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
          <SectionCard title={tr("escola.section_title")} desc={tr("escola.section_desc")}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label={tr("escola.field_name")} icon={Building2} error={schoolErrors.name}>
                <input
                  className={inputCls(!!schoolErrors.name)}
                  value={school.name}
                  maxLength={120}
                  disabled={!settingsAdmin}
                  onChange={(e) => setSchool({ ...school, name: e.target.value })}
                />
              </Field>
              <Field label={tr("escola.field_nif")} icon={Hash} error={schoolErrors.nif}>
                <input
                  className={inputCls(!!schoolErrors.nif)}
                  value={school.nif}
                  maxLength={40}
                  disabled={!settingsAdmin}
                  onChange={(e) => setSchool({ ...school, nif: e.target.value })}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label={tr("escola.field_address")} icon={MapPin} error={schoolErrors.address}>
                  <input
                    className={inputCls(!!schoolErrors.address)}
                    value={school.address}
                    maxLength={200}
                    disabled={!settingsAdmin}
                    onChange={(e) => setSchool({ ...school, address: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <SaveBar onClick={handleSaveSchool} saving={saving} canSave={settingsAdmin} />
          </SectionCard>
        )}

        {/* MARCA */}
        {activeTab === "marca" && (
          <SectionCard title={tr("marca.section_title")} desc={tr("marca.section_desc")}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-dashed border-border p-5">
                <p className="text-sm font-semibold text-foreground">{tr("marca.logo_title")}</p>
                <p className="text-xs text-muted-foreground">{tr("marca.logo_hint")}</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted/40 overflow-hidden">
                    {school.logo_url ? (
                      <img src={school.logo_url} alt={tr("shared.logo_alt")} className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <label
                    className={cn(
                      "flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft hover:bg-accent",
                      (!settingsAdmin || logoUploading) && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.75} />}
                    {tr("shared.carregar")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!settingsAdmin || logoUploading}
                      onChange={handleLogoUpload}
                    />
                  </label>
                </div>
              </div>

              <Field label={tr("marca.primary_color")}>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    disabled={!settingsAdmin}
                    value={school.primary_color}
                    onChange={(e) => setSchool({ ...school, primary_color: e.target.value })}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-card"
                  />
                  <input
                    className={inputCls(false)}
                    disabled={!settingsAdmin}
                    value={school.primary_color}
                    onChange={(e) => setSchool({ ...school, primary_color: e.target.value })}
                  />
                </div>
              </Field>
              <Field label={tr("marca.secondary_color")}>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    disabled={!settingsAdmin}
                    value={school.secondary_color}
                    onChange={(e) => setSchool({ ...school, secondary_color: e.target.value })}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-card"
                  />
                  <input
                    className={inputCls(false)}
                    disabled={!settingsAdmin}
                    value={school.secondary_color}
                    onChange={(e) => setSchool({ ...school, secondary_color: e.target.value })}
                  />
                </div>
              </Field>
            </div>
            <SaveBar onClick={handleSaveBrand} saving={saving} canSave={settingsAdmin} />
          </SectionCard>
        )}

        {/* ACADÉMICO */}
        {activeTab === "academico" && (
          <div className="flex flex-col gap-6">
            <SectionCard
              title={tr("academico.years.section_title")}
              desc={tr("academico.years.section_desc")}
            >
              <div className="mb-5 flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1 max-w-sm">
                  <Field label={tr("academico.years.field_editing_year")} icon={Calendar}>
                    <Select
                      value={selectedYearId ?? undefined}
                      onValueChange={setSelectedYearId}
                      disabled={years.length === 0}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-border bg-card shadow-soft">
                        <SelectValue placeholder={tr("academico.years.placeholder_no_years")} />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.label}{y.is_active ? tr("shared.active_suffix") : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {settingsAdmin && (
                  <button
                    type="button"
                    onClick={handleCreateAcademicYear}
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    {tr("academico.years.btn_new")}
                  </button>
                )}
                {settingsAdmin && year.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteYearId(year.id)}
                    disabled={saving || years.find((y) => y.id === year.id)?.is_active === true}
                    title={
                      years.find((y) => y.id === year.id)?.is_active
                        ? tr("academico.years.title_cannot_delete_active")
                        : tr("academico.years.title_delete")
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-pastel-pink-foreground/40 bg-card px-5 text-sm font-semibold text-pastel-pink-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-pastel-pink/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                    {tr("academico.years.btn_delete")}
                  </button>
                )}
              </div>
              {!year.id ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
                  Sem anos letivos criados. Clique em <span className="font-semibold text-foreground">"{tr("academico.years.btn_new")}"</span> para começar.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field label={tr("academico.years.field_year_label")}>
                    <input
                      className={inputCls(false)}
                      disabled={!settingsAdmin}
                      value={year.label}
                      onChange={(e) => setYear({ ...year, label: e.target.value })}
                    />
                  </Field>
                  <Field label={tr("academico.years.field_start")} icon={Calendar}>
                    <input
                      type="date"
                      className={inputCls(false)}
                      disabled={!settingsAdmin}
                      value={year.start_date}
                      onChange={(e) => setYear({ ...year, start_date: e.target.value })}
                    />
                  </Field>
                  <Field label={tr("academico.years.field_end")} icon={Calendar}>
                    <input
                      type="date"
                      className={inputCls(false)}
                      disabled={!settingsAdmin}
                      value={year.end_date}
                      onChange={(e) => setYear({ ...year, end_date: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                {year.id && !years.find((y) => y.id === year.id)?.is_active && settingsAdmin && (
                  <button
                    type="button"
                    onClick={handleSetActiveAcademic}
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {tr("academico.years.btn_make_active")}
                  </button>
                )}
                <button
                  onClick={handleSaveAcademic}
                  disabled={!year.id || saving || !settingsAdmin}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
                  {tr("shared.save_changes")}
                </button>
              </div>
            </SectionCard>

            <SectionCard
              title={tr("academico.terms_holidays.section_title")}
              desc={tr("academico.terms_holidays.section_desc")}
            >
              <TermsAndHolidaysManager schoolId={schoolId} academicYearId={year.id ?? null} isAdmin={settingsAdmin} />
            </SectionCard>

            <SectionCard
              title={tr("academico.wizard.section_title")}
              desc={tr("academico.wizard.section_desc")}
            >
              <NewAcademicYearWizard schoolId={schoolId} isAdmin={settingsAdmin} />
            </SectionCard>

            <SectionCard
              title={tr("academico.honor_roll.section_title")}
              desc={tr("academico.honor_roll.section_desc")}
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={tr("academico.honor_roll.field_min_avg")}>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className={inputCls(false)}
                    disabled={!settingsAdmin}
                    value={academicSettings.honor_roll_min_average}
                    onChange={(e) =>
                      setAcademicSettings((s) => ({
                        ...s,
                        honor_roll_min_average: e.target.value === "" ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label={tr("academico.honor_roll.field_max_grade")}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={inputCls(false)}
                    disabled={!settingsAdmin}
                    value={academicSettings.grading_max_score}
                    onChange={(e) =>
                      setAcademicSettings((s) => ({
                        ...s,
                        grading_max_score: e.target.value === "" ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                <SaveBar onClick={handleSaveAcademicSettings} saving={savingAcademicSettings} canSave={settingsAdmin} />
              </div>
            </SectionCard>

            <SectionCard
              title={tr("academico.late_fees.section_title")}
              desc={tr("academico.late_fees.section_desc")}
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <Field label={tr("academico.late_fees.field_charge")}>
                  <select
                    className={inputCls(false)}
                    disabled={!settingsAdmin}
                    value={academicSettings.late_fee_enabled ? "yes" : "no"}
                    onChange={(e) =>
                      setAcademicSettings((s) => ({ ...s, late_fee_enabled: e.target.value === "yes" }))
                    }
                  >
                    <option value="no">{tr("academico.late_fees.opt_no")}</option>
                    <option value="yes">{tr("academico.late_fees.opt_yes")}</option>
                  </select>
                </Field>
                <Field label={tr("academico.late_fees.field_type")}>
                  <select
                    className={inputCls(false)}
                    disabled={!settingsAdmin || !academicSettings.late_fee_enabled}
                    value={academicSettings.late_fee_type}
                    onChange={(e) =>
                      setAcademicSettings((s) => ({
                        ...s,
                        late_fee_type: e.target.value === "percentage" ? "percentage" : "fixed",
                      }))
                    }
                  >
                    <option value="fixed">{tr("academico.late_fees.type_fixed")}</option>
                    <option value="percentage">{tr("academico.late_fees.type_percentage")}</option>
                  </select>
                </Field>
                <Field
                  label={
                    academicSettings.late_fee_type === "percentage"
                      ? tr("academico.late_fees.field_value_pct")
                      : tr("academico.late_fees.field_value_fixed")
                  }
                >
                  <input
                    type="number"
                    min={0}
                    step={academicSettings.late_fee_type === "percentage" ? 0.5 : 100}
                    className={inputCls(false)}
                    disabled={!settingsAdmin || !academicSettings.late_fee_enabled}
                    value={academicSettings.late_fee_value}
                    onChange={(e) =>
                      setAcademicSettings((s) => ({
                        ...s,
                        late_fee_value: e.target.value === "" ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </Field>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {tr("academico.late_fees.help")}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                <SaveBar onClick={handleSaveAcademicSettings} saving={savingAcademicSettings} canSave={settingsAdmin} />
              </div>
            </SectionCard>

            <SectionCard
              title={tr("academico.enrollment_fees.section_title")}
              desc={tr("academico.enrollment_fees.section_desc")}
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label={tr("academico.enrollment_fees.field_new")}>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    className={inputCls(false)}
                    disabled={!settingsAdmin}
                    value={academicSettings.enrollment_fee_new}
                    onChange={(e) =>
                      setAcademicSettings((s) => ({
                        ...s,
                        enrollment_fee_new: e.target.value === "" ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label={tr("academico.enrollment_fees.field_renewal")}>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    className={inputCls(false)}
                    disabled={!settingsAdmin}
                    value={academicSettings.enrollment_fee_renewal}
                    onChange={(e) =>
                      setAcademicSettings((s) => ({
                        ...s,
                        enrollment_fee_renewal: e.target.value === "" ? 0 : Number(e.target.value),
                      }))
                    }
                  />
                </Field>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {tr("academico.enrollment_fees.help")}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                <SaveBar onClick={handleSaveAcademicSettings} saving={savingAcademicSettings} canSave={settingsAdmin} />
              </div>
            </SectionCard>
          </div>
        )}

        {/* UTILIZADORES */}
        {activeTab === "utilizadores" && (
          <div className="rounded-2xl bg-card shadow-card">
            <div className="flex flex-col gap-4 border-b border-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
              <h2 className="text-lg font-bold text-foreground">{tr("utilizadores.section_title")}</h2>
              <p className="text-sm text-muted-foreground">
                {usersSearchQuery.trim()
                  ? tr("utilizadores.summary_filtered", { shown: filteredUsers.length, total: users.length })
                  : tr("utilizadores.summary_total", { count: users.length })}
              </p>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[min(100%,280px)] justify-end">
                <div className="relative w-full max-w-md min-w-[200px] flex-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <input
                    type="search"
                    aria-label={tr("utilizadores.search_aria")}
                    placeholder={tr("utilizadores.search_placeholder")}
                    autoComplete="off"
                    value={usersSearchQuery}
                    onChange={(e) => setUsersSearchQuery(e.target.value)}
                    className={cn(inputCls(false), "h-10 w-full pl-10")}
                  />
                </div>
                {operationsAdmin && (
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    {tr("utilizadores.btn_new")}
                  </button>
                )}
              </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                    <th className="py-4 pl-5 pr-4 font-semibold">{tr("utilizadores.col_name")}</th>
                    <th className="py-4 pr-4 font-semibold">{tr("utilizadores.col_phone")}</th>
                    <th className="py-4 pr-4 font-semibold">{tr("utilizadores.col_role")}</th>
                    <th className="py-4 pr-4 font-semibold">{tr("utilizadores.col_status")}</th>
                    <th className="py-4 pr-5 font-semibold text-right">{tr("utilizadores.col_actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="py-3.5 pl-5 pr-4 font-medium text-foreground">{u.full_name}</td>
                      <td className="py-3.5 pr-4 text-muted-foreground">{u.phone || tr("shared.em_dash")}</td>
                      <td className="py-3.5 pr-4">
                        <select
                          value={u.role ?? "TEACHER"}
                          disabled={!operationsAdmin || u.id === user?.id}
                          onChange={(e) => updateUserRole(u.id, e.target.value as Role)}
                          className="h-9 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-3">
                          {statusBadge(u.is_active)}
                          <Toggle
                            checked={u.is_active !== false}
                            disabled={!operationsAdmin || u.id === user?.id}
                            onChange={(v) => toggleUserActive(u.id, v)}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title={tr("utilizadores.action_edit_title")}
                            disabled={!operationsAdmin}
                            onClick={() => setEditUser(u)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button
                            title={tr("utilizadores.action_remove_title")}
                            disabled={!operationsAdmin || u.id === user?.id}
                            onClick={() => setRemoveId(u.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink/50 hover:text-pastel-pink-foreground disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        {tr("utilizadores.empty")}
                      </td>
                    </tr>
                  )}
                  {users.length > 0 && filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        {tr("utilizadores.empty_search")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PERMISSÕES */}
        {activeTab === "permissoes" && (
          <SectionCard title={tr("permissoes.section_title")} desc={tr("permissoes.section_desc")}>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setPermTab("role")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium",
                  permTab === "role" ? "bg-pastel-lilac text-pastel-lilac-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {tr("permissoes.tab_role")}
              </button>
              <button
                onClick={() => setPermTab("user")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium",
                  permTab === "user" ? "bg-pastel-lilac text-pastel-lilac-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {tr("permissoes.tab_user")}
              </button>
              <button
                type="button"
                onClick={() => setPermTab("personalizadas")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium",
                  permTab === "personalizadas"
                    ? "bg-pastel-lilac text-pastel-lilac-foreground shadow-soft"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {tr("permissoes.tab_custom")}
              </button>
            </div>

            {permTab === "role" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setActiveRole(r)}
                      className={cn(
                        "rounded-xl px-4 py-2 text-sm font-medium transition-[var(--transition-smooth)]",
                        activeRole === r ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {roleLabel(r)}
                    </button>
                  ))}
                </div>
                <PermissionsTable
                  modules={MODULES}
                  perms={rolePerms}
                  onChange={setRolePermField}
                  disabled={!operationsAdmin || (activeRole === "ADMIN" && !settingsAdmin)}
                />
                {activeRole === "ADMIN" && (
                  <p className="mt-3 rounded-xl bg-pastel-yellow/40 p-3 text-xs text-pastel-yellow-foreground">
                    {tr("permissoes.admin_always_full")}
                  </p>
                )}
                <SaveBar
                  onClick={saveRolePerms}
                  disabled={activeRole === "ADMIN"}
                  saving={saving}
                  canSave={operationsAdmin && (activeRole !== "ADMIN" || settingsAdmin)}
                />
              </>
            ) : permTab === "personalizadas" ? (
              <div className="flex flex-col gap-10">
                <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                  {tr("permissoes.custom_intro")}
                </p>

                <div className="rounded-2xl border border-border bg-card/60 p-5">
                  <h3 className="text-base font-semibold text-foreground">{tr("permissoes.custom_role_title")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tr("permissoes.custom_role_desc")}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={saving || !operationsAdmin}
                        onClick={() => setActiveRole(r)}
                        className={cn(
                          "rounded-xl px-4 py-2 text-sm font-medium transition-[var(--transition-smooth)] disabled:opacity-50",
                          activeRole === r
                            ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft"
                            : "bg-muted text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {roleLabel(r)}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {storedCountsLoading || storedRolePermRows === null ? (
                        <span>{tr("permissoes.custom_role_count_loading")}</span>
                      ) : activeRole === "ADMIN" ? (
                        <span>{tr("permissoes.custom_role_count_admin_none")}</span>
                      ) : (
                        <span>{tr("permissoes.custom_role_count", { count: storedRolePermRows })}</span>
                      )}
                    </p>
                    <button
                      type="button"
                      disabled={
                        saving ||
                        !operationsAdmin ||
                        storedCountsLoading ||
                        activeRole === "ADMIN" ||
                        storedRolePermRows === null ||
                        storedRolePermRows === 0
                      }
                      onClick={() => void clearStoredRolePermissions()}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-pastel-pink/60 bg-transparent px-5 text-sm font-semibold text-pastel-pink-foreground hover:bg-pastel-pink/30 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={2} />
                      {tr("permissoes.btn_clear_role")}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card/60 p-5">
                  <h3 className="text-base font-semibold text-foreground">{tr("permissoes.custom_user_title")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tr("permissoes.custom_user_desc")}
                  </p>
                  <div className="mt-4 max-w-xl">
                    <Field label={tr("permissoes.field_user")}>
                      <select
                        className={inputCls(false)}
                        value={activeUserId}
                        disabled={!operationsAdmin}
                        onChange={(e) => setActiveUserId(e.target.value)}
                      >
                        <option value="">{tr("shared.select_placeholder")}</option>
                        {users
                          .filter((u) => u.role !== "ADMIN" && u.role !== "SUPER_ADMIN" && u.is_active !== false)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} · {roleLabel((u.role ?? "TEACHER") as Role)}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                      {!activeUserId ? (
                        <span>{tr("permissoes.custom_user_hint_select")}</span>
                      ) : storedCountsLoading || storedUserPermRows === null ? (
                        <span>{tr("permissoes.custom_user_count_loading")}</span>
                      ) : (
                        <span>{tr("permissoes.custom_user_count", { count: storedUserPermRows })}</span>
                      )}
                    </p>
                    <button
                      type="button"
                      disabled={
                        saving ||
                        !operationsAdmin ||
                        !activeUserId ||
                        storedCountsLoading ||
                        storedUserPermRows === null ||
                        storedUserPermRows === 0
                      }
                      onClick={() => void clearStoredUserPermissions()}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-pastel-pink/60 bg-transparent px-5 text-sm font-semibold text-pastel-pink-foreground hover:bg-pastel-pink/30 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={2} />
                      {tr("permissoes.btn_clear_user")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Field label={tr("permissoes.field_user")}>
                  <select
                    className={inputCls(false)}
                    value={activeUserId}
                    disabled={!operationsAdmin}
                    onChange={(e) => setActiveUserId(e.target.value)}
                  >
                    <option value="">{tr("shared.select_placeholder")}</option>
                    {users
                      .filter((u) => u.role !== "ADMIN" && u.role !== "SUPER_ADMIN" && u.is_active !== false)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} · {roleLabel((u.role ?? "TEACHER") as Role)}
                        </option>
                      ))}
                  </select>
                </Field>
                {activeUserId && (
                  <>
                    <PermissionsTable modules={MODULES} perms={userPerms} onChange={setUserPermField} disabled={!operationsAdmin} />
                    <SaveBar onClick={saveUserPerms} saving={saving} canSave={operationsAdmin} />
                  </>
                )}
              </>
            )}
          </SectionCard>
        )}

        {/* NOTIFICAÇÕES */}
        {activeTab === "notificacoes" && (
          <SectionCard title={tr("notificacoes.section_title")} desc={tr("notificacoes.section_desc")}>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setNotifRole(r)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-medium transition-[var(--transition-smooth)]",
                    notifRole === r ? "bg-pastel-blue text-pastel-blue-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                  )}
                >
                  {roleLabel(r)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {tr("notificacoes.apply_hint", { count: memoizedUsersForNotif, role: roleLabel(notifRole) })}
            </p>
            <div className="mt-4 flex flex-col divide-y divide-border">
              {NOTIFICATION_CHANNELS.map((c) => (
                <div key={c.key} className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                  <Toggle
                    checked={notifPrefs[c.key] ?? true}
                    disabled={!operationsAdmin}
                    onChange={(v) => setNotifPrefs((p) => ({ ...p, [c.key]: v }))}
                  />
                </div>
              ))}
            </div>
            <SaveBar onClick={saveNotifPrefs} saving={saving} canSave={operationsAdmin} />
          </SectionCard>
        )}

        {/* FATURAÇÃO */}
        {activeTab === "faturacao" && (
          <div className="flex flex-col gap-6">
            {/* Faturação externa */}
            <SectionCard title="Faturação externa" desc="Configure se a escola usa software de faturação de terceiros.">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Usar faturação externa</p>
                    <p className="text-xs text-muted-foreground">Quando activo, o sistema não gera FT/FR fiscais — apenas comprovativos internos e notifica o sistema externo.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={school.usa_faturacao_externa}
                      disabled={!settingsAdmin}
                      onChange={(e) => setSchool({ ...school, usa_faturacao_externa: e.target.checked })}
                    />
                    <div className="peer h-6 w-11 rounded-full bg-muted after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-pastel-blue peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
                  </label>
                </div>
                {school.usa_faturacao_externa && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">URL do Webhook (sistema externo)</label>
                    <input
                      className={inputCls(false)}
                      value={school.webhook_billing_url ?? ""}
                      placeholder="https://api.exemplo.com/webhook/pagamentos"
                      disabled={!settingsAdmin}
                      onChange={(e) => setSchool({ ...school, webhook_billing_url: e.target.value })}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Quando um pagamento é validado, o sistema envia um POST com os dados para este URL.</p>
                  </div>
                )}
              </div>
              <SaveBar onClick={handleSaveSchool} saving={saving} canSave={settingsAdmin} />
            </SectionCard>

            <SectionCard
              title={tr("faturacao.billing_discounts.section_title")}
              desc={tr("faturacao.billing_discounts.section_desc")}
            >
              <BillingEncargadosDiscountsPanel schoolId={schoolId} />
            </SectionCard>

            <SectionCard title={tr("faturacao.cycle.section_title")} desc={tr("faturacao.cycle.section_desc")}>
              <div className="flex flex-wrap gap-3">
                {(["SEMESTRAL", "ANNUAL"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => settingsAdmin && saveBillingCycle(c)}
                    disabled={!settingsAdmin}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl border-2 p-5 text-left transition-[var(--transition-smooth)] disabled:opacity-50",
                      sub.billing_cycle === c ? "border-pastel-blue bg-pastel-blue/20" : "border-border bg-card hover:border-pastel-blue/50",
                    )}
                  >
                    <span className="text-sm font-bold text-foreground">{c === "SEMESTRAL" ? tr("faturacao.cycle.semestral_title") : tr("faturacao.cycle.anual_title")}</span>
                    <span className="text-xs text-muted-foreground">
                      {c === "SEMESTRAL" ? tr("faturacao.cycle.semestral_desc") : tr("faturacao.cycle.anual_desc")}
                    </span>
                    {sub.billing_cycle === c && (
                      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-pastel-blue-foreground">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> {tr("faturacao.cycle.selected")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </SectionCard>

            <div className="rounded-2xl bg-card shadow-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-bold text-foreground">{tr("faturacao.invoices.section_title")}</h2>
                <p className="text-sm text-muted-foreground">
                  {tr("faturacao.invoices.section_desc")}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                      <th className="py-4 pl-5 pr-4 font-semibold">{tr("faturacao.invoices.col_number")}</th>
                      <th className="py-4 pr-4 font-semibold">{tr("faturacao.invoices.col_issue")}</th>
                      <th className="py-4 pr-4 font-semibold">{tr("faturacao.invoices.col_due")}</th>
                      <th className="py-4 pr-4 font-semibold">{tr("faturacao.invoices.col_amount")}</th>
                      <th className="py-4 pr-4 font-semibold">{tr("utilizadores.col_status")}</th>
                      <th className="py-4 pr-5 font-semibold text-right">{tr("faturacao.invoices.col_actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="py-3.5 pl-5 pr-4 font-medium text-foreground">{inv.invoice_number}</td>
                        <td className="py-3.5 pr-4 text-muted-foreground">{inv.issue_date}</td>
                        <td className="py-3.5 pr-4 text-muted-foreground">{inv.due_date}</td>
                        <td className="py-3.5 pr-4 font-medium text-foreground">
                          {formatCurrency(Number(inv.amount), inv.currency)}
                        </td>
                        <td className="py-3.5 pr-4">
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium",
                              inv.status === "paid"
                                ? "bg-pastel-green text-pastel-green-foreground"
                                : inv.status === "overdue"
                                  ? "bg-pastel-pink text-pastel-pink-foreground"
                                  : inv.status === "submitted"
                                    ? "bg-pastel-blue text-pastel-blue-foreground"
                                    : "bg-pastel-yellow text-pastel-yellow-foreground",
                            )}
                          >
                            {inv.status === "paid"
                              ? tr("faturacao.invoices.status_paid")
                              : inv.status === "overdue"
                                ? tr("faturacao.invoices.status_overdue")
                                : inv.status === "submitted"
                                  ? tr("faturacao.invoices.status_submitted")
                                  : tr("faturacao.invoices.status_pending")}
                          </span>
                        </td>
                        <td className="py-3.5 pr-5 text-right">
                          <div className="flex justify-end gap-2">
                            {inv.proof_url && (
                              <button
                                onClick={() => downloadProof(inv.proof_url!)}
                                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                              >
                                {tr("faturacao.invoices.btn_view_proof")}
                              </button>
                            )}
                            {settingsAdmin && inv.status !== "paid" && (
                              <button
                                onClick={() => {
                                  setProofInvoice(inv);
                                  setProofFile(null);
                                  setProofMethod(inv.payment_method ?? "transferencia");
                                  setProofNotes(inv.notes ?? "");
                                }}
                                className="rounded-lg bg-pastel-blue px-3 py-1.5 text-xs font-semibold text-pastel-blue-foreground hover:opacity-90"
                              >
                                {inv.proof_url ? tr("faturacao.invoices.btn_replace_proof") : tr("faturacao.invoices.btn_attach_proof")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {invoices.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                          <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                          {tr("faturacao.invoices.empty")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* AUDITORIA */}
        {activeTab === "auditoria" && (
          operationsAdmin ? (
            <AuditLogsPanel />
          ) : (
            <div className="rounded-2xl bg-card p-8 text-center shadow-card">
              <Shield className="mx-auto mb-3 h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
              <h2 className="text-lg font-bold text-foreground">{tr("auditoria.restricted_title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("auditoria.restricted_desc")}
              </p>
            </div>
          )
        )}

      <InviteStaffUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={async () => {
          if (!schoolId) return;
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, email, role, is_active, phone, avatar_url")
            .eq("school_id", schoolId)
            .order("full_name");
          if (data) setUsers(data as UserRow[]);
        }}
      />

        {/* Edit user modal */}
        {editUser && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setEditUser(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground">{tr("modals.edit_user.title")}</h3>
              <div className="mt-5 flex flex-col gap-4">
                <Field label={tr("modals.edit_user.field_name")} icon={UsersIcon}>
                  <input
                    className={inputCls(false)}
                    value={editUser.full_name}
                    onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
                  />
                </Field>
                <Field label={tr("modals.edit_user.field_email")} icon={Mail}>
                  <input
                    className={inputCls(false)}
                    type="email"
                    autoComplete="off"
                    value={editUser.email ?? ""}
                    onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {tr("modals.edit_user.email_help")}
                  </p>
                </Field>
                <Field label={tr("modals.edit_user.field_phone")} icon={Phone}>
                  <input
                    className={inputCls(false)}
                    value={editUser.phone ?? ""}
                    onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setEditUser(null)}
                  className="h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {tr("shared.cancel")}
                </button>
                <button
                  onClick={saveEditUser}
                  disabled={saving}
                  className="h-10 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90 disabled:opacity-50"
                >
                  {tr("shared.guardar")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Proof upload modal */}
        {proofInvoice && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !proofUploading && setProofInvoice(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground">{tr("modals.proof.title")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {tr("modals.proof.invoice_line", {
                  number: proofInvoice.invoice_number,
                  amount: formatCurrency(Number(proofInvoice.amount), proofInvoice.currency),
                })}
              </p>
              <div className="mt-5 flex flex-col gap-4">
                <Field label={tr("modals.proof.field_method")} icon={CreditCard}>
                  <select
                    className={inputCls(false)}
                    value={proofMethod}
                    onChange={(e) => setProofMethod(e.target.value)}
                  >
                    <option value="transferencia">{tr("modals.proof.method_transfer")}</option>
                    <option value="multibanco">{tr("modals.proof.method_mb")}</option>
                    <option value="mbway">{tr("modals.proof.method_mbway")}</option>
                    <option value="numerario">{tr("modals.proof.method_cash")}</option>
                    <option value="outro">{tr("modals.proof.method_other")}</option>
                  </select>
                </Field>
                <Field label={tr("modals.proof.field_file")} icon={FileText}>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-pastel-blue/30 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-pastel-blue-foreground"
                  />
                </Field>
                <Field label={tr("modals.proof.field_notes")}>
                  <textarea
                    className={cn(inputCls(false), "min-h-[80px] py-2")}
                    value={proofNotes}
                    onChange={(e) => setProofNotes(e.target.value)}
                    placeholder={tr("modals.proof.notes_placeholder")}
                  />
                </Field>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setProofInvoice(null)}
                  disabled={proofUploading}
                  className="h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {tr("shared.cancel")}
                </button>
                <button
                  onClick={submitProof}
                  disabled={proofUploading || !proofFile}
                  className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90 disabled:opacity-50"
                >
                  {proofUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {tr("modals.proof.btn_submit")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove confirm modal */}
        {removeId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setRemoveId(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground">{tr("modals.remove_user.title")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tr("modals.remove_user.body")}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setRemoveId(null)}
                  className="h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {tr("shared.cancel")}
                </button>
                <button
                  onClick={confirmRemoveUser}
                  className="h-10 rounded-full bg-pastel-pink px-4 text-sm font-semibold text-pastel-pink-foreground shadow-soft hover:opacity-90"
                >
                  {tr("shared.remover")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete academic year confirm modal */}
        {confirmDeleteYearId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setConfirmDeleteYearId(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-card p-6 shadow-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-foreground">{tr("academico.years.btn_delete")} ano letivo</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tr("modals.delete_year.body", { label: years.find((y) => y.id === confirmDeleteYearId)?.label ?? "" }).split(years.find((y) => y.id === confirmDeleteYearId)?.label ?? "")[0]}
                <span className="font-semibold text-foreground">
                  {years.find((y) => y.id === confirmDeleteYearId)?.label}
                </span>
                . Só é possível eliminar se não existirem turmas, matrículas, avaliações ou outros dados associados.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteYearId(null)}
                  className="h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {tr("shared.cancel")}
                </button>
                <button
                  onClick={handleDeleteAcademicYear}
                  disabled={saving}
                  className="h-10 rounded-full bg-pastel-pink px-4 text-sm font-semibold text-pastel-pink-foreground shadow-soft hover:opacity-90 disabled:opacity-50"
                >
                  {tr("academico.years.btn_delete")}
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
    </>
  );
};

const PermissionsTable = ({
  perms,
  onChange,
  disabled,
  modules,
}: {
  perms: Record<string, { module: string; can_read: boolean; can_write: boolean; can_delete: boolean }>;
  onChange: (mod: PermissionModuleKey, key: "can_read" | "can_write" | "can_delete", value: boolean) => void;
  disabled?: boolean;
  modules: { key: PermissionModuleKey; label: string; desc: string }[];
}) => {
  const { t: tr } = useTranslation("pages", { keyPrefix: "definicoes" });
  return (
  <div className="mt-6 overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          {/* i18n headers */}
          <th className="py-3 pl-5 pr-4 font-semibold">{tr("permissions_table.col_module")}</th>
          <th className="py-3 pr-4 font-semibold text-center">{tr("permissions_table.col_read")}</th>
          <th className="py-3 pr-4 font-semibold text-center">{tr("permissions_table.col_write")}</th>
          <th className="py-3 pr-5 font-semibold text-center">{tr("permissions_table.col_delete")}</th>
        </tr>
      </thead>
      <tbody>
        {modules.map((m) => {
          const p = perms[m.key] ?? { module: m.key, can_read: false, can_write: false, can_delete: false };
          return (
            <tr key={m.key} className="border-t border-border">
              <td className="py-3 pl-5 pr-4">
                <p className="font-medium text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </td>
              {(["can_read", "can_write", "can_delete"] as const).map((k) => (
                <td key={k} className="py-3 pr-4 text-center">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={(p as any)[k]}
                    onChange={(e) => onChange(m.key, k, e.target.checked)}
                    className="h-5 w-5 cursor-pointer rounded border-border text-pastel-blue focus:ring-pastel-blue/40 disabled:opacity-50"
                  />
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
  );
};

export default Definicoes;