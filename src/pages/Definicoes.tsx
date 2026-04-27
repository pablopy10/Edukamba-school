import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { TermsAndHolidaysManager } from "@/components/definicoes/TermsAndHolidaysManager";
import { useAcademicYear } from "@/context/AcademicYearContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Tab =
  | "escola"
  | "marca"
  | "academico"
  | "utilizadores"
  | "permissoes"
  | "notificacoes"
  | "faturacao";

type Role = Database["public"]["Enums"]["user_role"];

const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "escola", label: "Escola", icon: Building2 },
  { id: "marca", label: "Marca", icon: ImageIcon },
  { id: "academico", label: "Académico", icon: Calendar },
  { id: "utilizadores", label: "Utilizadores", icon: UsersIcon },
  { id: "permissoes", label: "Permissões", icon: Shield },
  { id: "notificacoes", label: "Notificações", icon: Bell },
  { id: "faturacao", label: "Faturação", icon: CreditCard },
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
  isAdmin,
}: {
  onClick: () => void;
  disabled?: boolean;
  saving?: boolean;
  isAdmin?: boolean;
}) => (
  <div className="mt-6 flex justify-end">
    <button
      onClick={onClick}
      disabled={disabled || saving || !isAdmin}
      className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
      Guardar Alterações
    </button>
  </div>
);

const ROLES: Role[] = ["ADMIN", "TEACHER", "PARENT", "STUDENT"];
const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  TEACHER: "Professor",
  PARENT: "Encarregado",
  STUDENT: "Aluno",
};

type ModuleKey =
  | "alunos"
  | "professores"
  | "turmas"
  | "horarios"
  | "avaliacoes"
  | "presencas"
  | "eventos"
  | "material"
  | "matriculas"
  | "relatorios"
  | "faturacao"
  | "definicoes";

const MODULES: { key: ModuleKey; label: string; desc: string }[] = [
  { key: "alunos", label: "Alunos", desc: "Fichas, matrículas e contactos." },
  { key: "professores", label: "Professores", desc: "Equipa pedagógica e atribuições." },
  { key: "turmas", label: "Turmas", desc: "Turmas, anos e cursos." },
  { key: "horarios", label: "Horários", desc: "Horários semanais e blocos." },
  { key: "avaliacoes", label: "Avaliações", desc: "Testes, exames e notas." },
  { key: "presencas", label: "Presenças", desc: "Marcação de presenças e faltas." },
  { key: "eventos", label: "Eventos", desc: "Calendário escolar." },
  { key: "material", label: "Material", desc: "Inventário e pedidos." },
  { key: "matriculas", label: "Matrículas", desc: "Inscrições no ano letivo." },
  { key: "relatorios", label: "Relatórios", desc: "Relatórios e exportações." },
  { key: "faturacao", label: "Faturação", desc: "Pagamentos e propinas." },
  { key: "definicoes", label: "Definições", desc: "Configurações da escola." },
];

const NOTIFICATION_CHANNELS: { key: string; label: string; desc: string }[] = [
  { key: "welcome_email", label: "Email de boas-vindas", desc: "Enviado quando um utilizador é criado." },
  { key: "enrollment", label: "Confirmação de matrícula", desc: "Enviado ao concluir a matrícula." },
  { key: "grade_published", label: "Notas publicadas", desc: "Notificar quando notas forem lançadas." },
  { key: "event_reminder", label: "Lembretes de eventos", desc: "Enviar 1 dia antes do evento." },
  { key: "absence_alert", label: "Alertas de faltas", desc: "Notificar encarregado em caso de falta." },
  { key: "invoice_issued", label: "Faturas emitidas", desc: "Email automático ao emitir fatura." },
  { key: "new_message", label: "Nova mensagem no chat", desc: "Notificação ao receber uma mensagem." },
  { key: "complaint_update", label: "Atualização de reclamações", desc: "Quando o estado de uma reclamação muda." },
  { key: "material_request", label: "Pedidos de material", desc: "Notificar admin de novos pedidos." },
  { key: "absence_request", label: "Pedidos de ausência", desc: "Notificar admin de novos pedidos." },
];

const schoolSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  nif: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
});

const Definicoes = () => {
  const { user } = useAuth();
  const { years, selectedYearId, setSelectedYearId, refresh: refreshAcademicYears } = useAcademicYear();
  const [activeTab, setActiveTab] = useState<Tab>("escola");
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const isAdmin = myRole === "ADMIN" || myRole === "SUPER_ADMIN";

  // School
  const [school, setSchool] = useState({
    name: "",
    nif: "",
    address: "",
    logo_url: "" as string | null | "",
    primary_color: "#A78BFA",
    secondary_color: "#7DD3FC",
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
  });
  const [savingAcademicSettings, setSavingAcademicSettings] = useState(false);

  // Users
  type UserRow = {
    id: string;
    full_name: string;
    role: Role | null;
    is_active: boolean | null;
    phone: string | null;
    avatar_url: string | null;
  };
  const [users, setUsers] = useState<UserRow[]>([]);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  // Permissions
  type Perm = { module: ModuleKey; can_read: boolean; can_write: boolean; can_delete: boolean };
  const [permTab, setPermTab] = useState<"role" | "user">("role");
  const [activeRole, setActiveRole] = useState<Role>("TEACHER");
  const [rolePerms, setRolePerms] = useState<Record<string, Perm>>({});
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [userPerms, setUserPerms] = useState<Record<string, Perm>>({});

  // Notifications (admin manages defaults per role)
  const [notifRole, setNotifRole] = useState<Role>("TEACHER");
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({});

  // Billing
  type Subscription = {
    id: string | null;
    plan_type: "Essencial" | "Pro" | "Enterprise";
    billing_cycle: "SEMESTRAL" | "ANNUAL";
  };
  const [sub, setSub] = useState<Subscription>({ id: null, plan_type: "Essencial", billing_cycle: "ANNUAL" });
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
        .select("school_id, role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !profile?.school_id) {
        setLoading(false);
        return;
      }
      setSchoolId(profile.school_id);
      setMyRole((profile.role as Role) ?? null);

      const yearQuery = selectedYearId
        ? supabase.from("academic_years").select("*").eq("id", selectedYearId).maybeSingle()
        : supabase
            .from("academic_years")
            .select("*")
            .eq("school_id", profile.school_id)
            .eq("is_active", true)
            .order("start_date", { ascending: false })
            .limit(1)
            .maybeSingle();
      const [schoolRes, yearRes, usersRes, subRes, invRes] = await Promise.all([
        supabase.from("schools").select("*").eq("id", profile.school_id).maybeSingle(),
        yearQuery,
        supabase
          .from("profiles")
          .select("id, full_name, role, is_active, phone, avatar_url")
          .eq("school_id", profile.school_id)
          .order("full_name"),
        supabase
          .from("saas_subscriptions")
          .select("*")
          .eq("school_id", profile.school_id)
          .maybeSingle(),
        supabase
          .from("school_invoices")
          .select("*")
          .eq("school_id", profile.school_id)
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
    } else if (activeUserId) {
      void loadUserPerms(activeUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, permTab, activeRole, activeUserId, schoolId]);

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
      map[m.key] = {
        module: m.key,
        can_read: found?.can_read ?? defaultPerm(role, m.key).can_read,
        can_write: found?.can_write ?? defaultPerm(role, m.key).can_write,
        can_delete: found?.can_delete ?? defaultPerm(role, m.key).can_delete,
      };
    });
    setRolePerms(map);
  };

  const loadUserPerms = async (userId: string) => {
    const { data } = await supabase
      .from("user_permissions")
      .select("module, can_read, can_write, can_delete")
      .eq("user_id", userId);
    const map: Record<string, Perm> = {};
    MODULES.forEach((m) => {
      const found = data?.find((d) => d.module === m.key);
      map[m.key] = {
        module: m.key,
        can_read: found?.can_read ?? false,
        can_write: found?.can_write ?? false,
        can_delete: found?.can_delete ?? false,
      };
    });
    setUserPerms(map);
  };

  const defaultPerm = (role: Role, mod: ModuleKey): Omit<Perm, "module"> => {
    if (role === "ADMIN" || role === "SUPER_ADMIN")
      return { can_read: true, can_write: true, can_delete: true };
    if (role === "TEACHER") {
      const w = ["avaliacoes", "presencas", "eventos", "material"].includes(mod);
      return { can_read: true, can_write: w, can_delete: false };
    }
    return { can_read: ["alunos", "eventos", "avaliacoes"].includes(mod), can_write: false, can_delete: false };
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
      showToast("error", "Verifique os campos do formulário.");
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
      })
      .eq("id", schoolId);
    setSaving(false);
    if (error) return showToast("error", error.message);
    showToast("success", "Informações da escola guardadas.");
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
    showToast("success", "Marca atualizada.");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !schoolId) return;
    if (file.size > 2 * 1024 * 1024) return showToast("error", "Ficheiro demasiado grande (máx. 2MB).");
    setLogoUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${schoolId}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("school-logos").upload(path, file, { upsert: true });
    if (upErr) {
      setLogoUploading(false);
      return showToast("error", upErr.message);
    }
    const { data: pub } = supabase.storage.from("school-logos").getPublicUrl(path);
    setSchool((s) => ({ ...s, logo_url: pub.publicUrl }));
    setLogoUploading(false);
    showToast("success", "Logotipo carregado. Lembre-se de guardar.");
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
    showToast("success", "Ano letivo atualizado.");
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
    showToast("success", "Ano letivo ativo atualizado.");
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
    showToast("success", "Ano letivo criado. Edite os dados conforme necessário.");
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
        ? "Não é possível eliminar: existem turmas, matrículas ou propinas associadas a este ano letivo."
        : error.message;
      return showToast("error", msg);
    }
    if (!data || data.length === 0) {
      setConfirmDeleteYearId(null);
      return showToast(
        "error",
        "Sem permissão para eliminar este ano letivo. Apenas administradores podem fazê-lo.",
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
    showToast("success", "Ano letivo eliminado.");
  };

  // ===== Users =====
  const updateUserRole = async (id: string, role: Role) => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) return showToast("error", error.message);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    showToast("success", "Função atualizada.");
  };

  const toggleUserActive = async (id: string, value: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: value }).eq("id", id);
    if (error) return showToast("error", error.message);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_active: value } : u)));
    showToast("success", value ? "Utilizador ativado." : "Utilizador desativado.");
  };

  const saveEditUser = async () => {
    if (!editUser) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editUser.full_name, phone: editUser.phone })
      .eq("id", editUser.id);
    setSaving(false);
    if (error) return showToast("error", error.message);
    setUsers((prev) => prev.map((u) => (u.id === editUser.id ? { ...u, ...editUser } : u)));
    setEditUser(null);
    showToast("success", "Utilizador atualizado.");
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
    showToast("success", "Utilizador removido. Já não consegue aceder ao Edukamba.");
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
    showToast("success", "Permissões da função guardadas.");
  };

  const saveUserPerms = async () => {
    if (!schoolId || !activeUserId) return;
    setSaving(true);
    const rows = MODULES.map((m) => ({
      school_id: schoolId,
      user_id: activeUserId,
      module: m.key,
      can_read: userPerms[m.key]?.can_read ?? false,
      can_write: userPerms[m.key]?.can_write ?? false,
      can_delete: userPerms[m.key]?.can_delete ?? false,
    }));
    const { error } = await supabase.from("user_permissions").upsert(rows, { onConflict: "user_id,module" });
    setSaving(false);
    if (error) return showToast("error", error.message);
    showToast("success", "Permissões personalizadas guardadas.");
  };

  // ===== Save notification prefs =====
  const saveNotifPrefs = async () => {
    if (!schoolId) return;
    const targets = users.filter((u) => u.role === notifRole && u.is_active !== false);
    if (targets.length === 0) return showToast("error", "Sem utilizadores nesta função.");
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
    showToast("success", `Preferências aplicadas a ${targets.length} utilizador(es).`);
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
    // Gerar cobranças conforme o ciclo
    const { data: genCount, error: genErr } = await supabase.rpc("generate_school_invoices", {
      _school_id: schoolId,
    });
    if (genErr) {
      showToast("error", `Ciclo guardado, mas falhou a geração: ${genErr.message}`);
    } else {
      await reloadInvoices();
      const n = Number(genCount ?? 0);
      showToast(
        "success",
        n > 0 ? `Ciclo atualizado. ${n} cobrança(s) gerada(s).` : "Ciclo atualizado.",
      );
    }
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
    if (!proofFile) return showToast("error", "Selecione o ficheiro do comprovativo.");
    setProofUploading(true);
    try {
      const ext = proofFile.name.split(".").pop() || "pdf";
      const path = `${schoolId}/${proofInvoice.id}-${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("school-invoice-proofs")
        .upload(path, proofFile, { upsert: true, contentType: proofFile.type || undefined });
      if (up.error) throw up.error;
      const { error: updErr } = await supabase
        .from("school_invoices")
        .update({
          proof_url: path,
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
      showToast("success", "Comprovativo enviado. Aguarda validação.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar comprovativo.";
      showToast("error", msg);
    } finally {
      setProofUploading(false);
    }
  };

  const downloadProof = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("school-invoice-proofs")
      .createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) return showToast("error", "Não foi possível abrir o comprovativo.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const statusBadge = (active: boolean | null) => {
    const isActive = active !== false;
    const cls = isActive
      ? "bg-pastel-green text-pastel-green-foreground"
      : "bg-pastel-pink text-pastel-pink-foreground";
    return <span className={cn("rounded-full px-3 py-1 text-xs font-medium", cls)}>{isActive ? "Ativo" : "Inativo"}</span>;
  };

  const setRolePermField = (mod: ModuleKey, key: keyof Omit<Perm, "module">, value: boolean) => {
    setRolePerms((prev) => ({
      ...prev,
      [mod]: { ...(prev[mod] ?? { module: mod, can_read: false, can_write: false, can_delete: false }), [key]: value },
    }));
  };
  const setUserPermField = (mod: ModuleKey, key: keyof Omit<Perm, "module">, value: boolean) => {
    setUserPerms((prev) => ({
      ...prev,
      [mod]: { ...(prev[mod] ?? { module: mod, can_read: false, can_write: false, can_delete: false }), [key]: value },
    }));
  };

  const formatCurrency = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(amount);
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
      <DashboardLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Definições</h1>
          <p className="text-sm text-muted-foreground">
            Faça a gestão das definições gerais da escola, marca, utilizadores e permissões.
          </p>
          {!isAdmin && (
            <p className="mt-2 rounded-xl bg-pastel-yellow/40 px-3 py-2 text-xs text-pastel-yellow-foreground">
              Apenas administradores podem alterar as definições.
            </p>
          )}
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
          <SectionCard title="Informações da Escola" desc="Estes dados são usados em documentos, faturas e na app.">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Nome da escola" icon={Building2} error={schoolErrors.name}>
                <input
                  className={inputCls(!!schoolErrors.name)}
                  value={school.name}
                  maxLength={120}
                  disabled={!isAdmin}
                  onChange={(e) => setSchool({ ...school, name: e.target.value })}
                />
              </Field>
              <Field label="NIF / Tax ID" icon={Hash} error={schoolErrors.nif}>
                <input
                  className={inputCls(!!schoolErrors.nif)}
                  value={school.nif}
                  maxLength={40}
                  disabled={!isAdmin}
                  onChange={(e) => setSchool({ ...school, nif: e.target.value })}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Morada" icon={MapPin} error={schoolErrors.address}>
                  <input
                    className={inputCls(!!schoolErrors.address)}
                    value={school.address}
                    maxLength={200}
                    disabled={!isAdmin}
                    onChange={(e) => setSchool({ ...school, address: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <SaveBar onClick={handleSaveSchool} saving={saving} isAdmin={isAdmin} />
          </SectionCard>
        )}

        {/* MARCA */}
        {activeTab === "marca" && (
          <SectionCard title="Marca e Identidade Visual" desc="Logotipo e cores que aparecem em toda a app.">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-dashed border-border p-5">
                <p className="text-sm font-semibold text-foreground">Logotipo</p>
                <p className="text-xs text-muted-foreground">PNG ou SVG · até 2MB</p>
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-muted/40 overflow-hidden">
                    {school.logo_url ? (
                      <img src={school.logo_url} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <label
                    className={cn(
                      "flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-soft hover:bg-accent",
                      (!isAdmin || logoUploading) && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    {logoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.75} />}
                    Carregar
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!isAdmin || logoUploading}
                      onChange={handleLogoUpload}
                    />
                  </label>
                </div>
              </div>

              <Field label="Cor primária">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    disabled={!isAdmin}
                    value={school.primary_color}
                    onChange={(e) => setSchool({ ...school, primary_color: e.target.value })}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-card"
                  />
                  <input
                    className={inputCls(false)}
                    disabled={!isAdmin}
                    value={school.primary_color}
                    onChange={(e) => setSchool({ ...school, primary_color: e.target.value })}
                  />
                </div>
              </Field>
              <Field label="Cor secundária">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    disabled={!isAdmin}
                    value={school.secondary_color}
                    onChange={(e) => setSchool({ ...school, secondary_color: e.target.value })}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-card"
                  />
                  <input
                    className={inputCls(false)}
                    disabled={!isAdmin}
                    value={school.secondary_color}
                    onChange={(e) => setSchool({ ...school, secondary_color: e.target.value })}
                  />
                </div>
              </Field>
            </div>
            <SaveBar onClick={handleSaveBrand} saving={saving} isAdmin={isAdmin} />
          </SectionCard>
        )}

        {/* ACADÉMICO */}
        {activeTab === "academico" && (
          <div className="flex flex-col gap-6">
            <SectionCard
              title="Anos letivos"
              desc="Crie, edite ou elimine os anos letivos da escola. O ano selecionado é usado em toda a aplicação para filtrar a informação."
            >
              <div className="mb-5 flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1 max-w-sm">
                  <Field label="Ano em edição" icon={Calendar}>
                    <Select
                      value={selectedYearId ?? undefined}
                      onValueChange={setSelectedYearId}
                      disabled={years.length === 0}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-border bg-card shadow-soft">
                        <SelectValue placeholder="Sem anos letivos criados" />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y.id} value={y.id}>
                            {y.label}{y.is_active ? " · ativo" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleCreateAcademicYear}
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Novo ano letivo
                  </button>
                )}
                {isAdmin && year.id && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteYearId(year.id)}
                    disabled={saving || years.find((y) => y.id === year.id)?.is_active === true}
                    title={
                      years.find((y) => y.id === year.id)?.is_active
                        ? "Não é possível eliminar o ano letivo ativo."
                        : "Eliminar ano letivo"
                    }
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-pastel-pink-foreground/40 bg-card px-5 text-sm font-semibold text-pastel-pink-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-pastel-pink/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                    Eliminar
                  </button>
                )}
              </div>
              {!year.id ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
                  Sem anos letivos criados. Clique em <span className="font-semibold text-foreground">"Novo ano letivo"</span> para começar.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field label="Ano letivo">
                    <input
                      className={inputCls(false)}
                      disabled={!isAdmin}
                      value={year.label}
                      onChange={(e) => setYear({ ...year, label: e.target.value })}
                    />
                  </Field>
                  <Field label="Início" icon={Calendar}>
                    <input
                      type="date"
                      className={inputCls(false)}
                      disabled={!isAdmin}
                      value={year.start_date}
                      onChange={(e) => setYear({ ...year, start_date: e.target.value })}
                    />
                  </Field>
                  <Field label="Fim" icon={Calendar}>
                    <input
                      type="date"
                      className={inputCls(false)}
                      disabled={!isAdmin}
                      value={year.end_date}
                      onChange={(e) => setYear({ ...year, end_date: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                {year.id && !years.find((y) => y.id === year.id)?.is_active && isAdmin && (
                  <button
                    type="button"
                    onClick={handleSetActiveAcademic}
                    disabled={saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-soft transition-[var(--transition-smooth)] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Tornar ativo
                  </button>
                )}
                <SaveBar onClick={handleSaveAcademic} disabled={!year.id} saving={saving} isAdmin={isAdmin} />
              </div>
            </SectionCard>

            <SectionCard
              title="Trimestres e Férias"
              desc="Defina as datas dos 1º, 2º e 3º trimestres e marque os períodos de férias dos alunos."
            >
              <TermsAndHolidaysManager schoolId={schoolId} academicYearId={year.id ?? null} isAdmin={isAdmin} />
            </SectionCard>
          </div>
        )}

        {/* UTILIZADORES */}
        {activeTab === "utilizadores" && (
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
                    <th className="py-4 pr-4 font-semibold">Telefone</th>
                    <th className="py-4 pr-4 font-semibold">Função</th>
                    <th className="py-4 pr-4 font-semibold">Estado</th>
                    <th className="py-4 pr-5 font-semibold text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="py-3.5 pl-5 pr-4 font-medium text-foreground">{u.full_name}</td>
                      <td className="py-3.5 pr-4 text-muted-foreground">{u.phone || "—"}</td>
                      <td className="py-3.5 pr-4">
                        <select
                          value={u.role ?? "TEACHER"}
                          disabled={!isAdmin || u.id === user?.id}
                          onChange={(e) => updateUserRole(u.id, e.target.value as Role)}
                          className="h-9 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground disabled:opacity-50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-3">
                          {statusBadge(u.is_active)}
                          <Toggle
                            checked={u.is_active !== false}
                            disabled={!isAdmin || u.id === user?.id}
                            onChange={(v) => toggleUserActive(u.id, v)}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            title="Editar"
                            disabled={!isAdmin}
                            onClick={() => setEditUser(u)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-yellow/50 hover:text-pastel-yellow-foreground disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                          <button
                            title="Remover"
                            disabled={!isAdmin || u.id === user?.id}
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
                        Sem utilizadores.
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
          <SectionCard title="Permissões" desc="Defina as permissões por função ou personalize por utilizador.">
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                onClick={() => setPermTab("role")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium",
                  permTab === "role" ? "bg-pastel-lilac text-pastel-lilac-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                Por Função
              </button>
              <button
                onClick={() => setPermTab("user")}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-medium",
                  permTab === "user" ? "bg-pastel-lilac text-pastel-lilac-foreground shadow-soft" : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                Por Utilizador
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
                      {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
                <PermissionsTable
                  perms={rolePerms}
                  onChange={setRolePermField}
                  disabled={!isAdmin || activeRole === "ADMIN"}
                />
                {activeRole === "ADMIN" && (
                  <p className="mt-3 rounded-xl bg-pastel-yellow/40 p-3 text-xs text-pastel-yellow-foreground">
                    Administradores têm sempre todas as permissões.
                  </p>
                )}
                <SaveBar onClick={saveRolePerms} disabled={activeRole === "ADMIN"} saving={saving} isAdmin={isAdmin} />
              </>
            ) : (
              <>
                <Field label="Utilizador">
                  <select
                    className={inputCls(false)}
                    value={activeUserId}
                    disabled={!isAdmin}
                    onChange={(e) => setActiveUserId(e.target.value)}
                  >
                    <option value="">— Selecione —</option>
                    {users
                      .filter((u) => u.role !== "ADMIN" && u.is_active !== false)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} · {ROLE_LABEL[(u.role ?? "TEACHER") as Role]}
                        </option>
                      ))}
                  </select>
                </Field>
                {activeUserId && (
                  <>
                    <PermissionsTable perms={userPerms} onChange={setUserPermField} disabled={!isAdmin} />
                    <SaveBar onClick={saveUserPerms} saving={saving} isAdmin={isAdmin} />
                  </>
                )}
              </>
            )}
          </SectionCard>
        )}

        {/* NOTIFICAÇÕES */}
        {activeTab === "notificacoes" && (
          <SectionCard title="Notificações" desc="Configure que notificações são enviadas aos utilizadores de cada função.">
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
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Será aplicado a {memoizedUsersForNotif} utilizador(es) ativo(s) com a função {ROLE_LABEL[notifRole]}.
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
                    disabled={!isAdmin}
                    onChange={(v) => setNotifPrefs((p) => ({ ...p, [c.key]: v }))}
                  />
                </div>
              ))}
            </div>
            <SaveBar onClick={saveNotifPrefs} saving={saving} isAdmin={isAdmin} />
          </SectionCard>
        )}

        {/* FATURAÇÃO */}
        {activeTab === "faturacao" && (
          <div className="flex flex-col gap-6">
            <SectionCard title="Plano Atual">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Plano</p>
                  <p className="text-2xl font-bold text-foreground">{sub.plan_type}</p>
                </div>
                <span className="rounded-full bg-pastel-green px-4 py-2 text-xs font-semibold text-pastel-green-foreground">
                  Ativo
                </span>
              </div>
            </SectionCard>

            <SectionCard title="Ciclo de Pagamento" desc="Escolha como prefere ser cobrado pela plataforma.">
              <div className="flex flex-wrap gap-3">
                {(["SEMESTRAL", "ANNUAL"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => isAdmin && saveBillingCycle(c)}
                    disabled={!isAdmin}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl border-2 p-5 text-left transition-[var(--transition-smooth)] disabled:opacity-50",
                      sub.billing_cycle === c ? "border-pastel-blue bg-pastel-blue/20" : "border-border bg-card hover:border-pastel-blue/50",
                    )}
                  >
                    <span className="text-sm font-bold text-foreground">{c === "SEMESTRAL" ? "Semestral" : "Anual"}</span>
                    <span className="text-xs text-muted-foreground">
                      {c === "SEMESTRAL" ? "Pagamento a cada 6 meses" : "Pagamento uma vez por ano"}
                    </span>
                    {sub.billing_cycle === c && (
                      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-pastel-blue-foreground">
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Selecionado
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </SectionCard>

            <div className="rounded-2xl bg-card shadow-card">
              <div className="border-b border-border p-5">
                <h2 className="text-lg font-bold text-foreground">Faturas da Escola</h2>
                <p className="text-sm text-muted-foreground">
                  Pagamentos efetuados pela escola à plataforma Edukamba.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-pastel-blue/40 text-left text-xs uppercase tracking-wider text-pastel-blue-foreground">
                      <th className="py-4 pl-5 pr-4 font-semibold">Nº</th>
                      <th className="py-4 pr-4 font-semibold">Emissão</th>
                      <th className="py-4 pr-4 font-semibold">Vencimento</th>
                      <th className="py-4 pr-4 font-semibold">Valor</th>
                      <th className="py-4 pr-4 font-semibold">Estado</th>
                      <th className="py-4 pr-5 font-semibold text-right">Ações</th>
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
                              ? "Pago"
                              : inv.status === "overdue"
                                ? "Em atraso"
                                : inv.status === "submitted"
                                  ? "A validar"
                                  : "Pendente"}
                          </span>
                        </td>
                        <td className="py-3.5 pr-5 text-right">
                          <div className="flex justify-end gap-2">
                            {inv.proof_url && (
                              <button
                                onClick={() => downloadProof(inv.proof_url!)}
                                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                              >
                                Ver comprovativo
                              </button>
                            )}
                            {isAdmin && inv.status !== "paid" && (
                              <button
                                onClick={() => {
                                  setProofInvoice(inv);
                                  setProofFile(null);
                                  setProofMethod(inv.payment_method ?? "transferencia");
                                  setProofNotes(inv.notes ?? "");
                                }}
                                className="rounded-lg bg-pastel-blue px-3 py-1.5 text-xs font-semibold text-pastel-blue-foreground hover:opacity-90"
                              >
                                {inv.proof_url ? "Substituir" : "Anexar comprovativo"}
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
                          Sem faturas registadas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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
              <h3 className="text-lg font-bold text-foreground">Editar Utilizador</h3>
              <div className="mt-5 flex flex-col gap-4">
                <Field label="Nome completo" icon={UsersIcon}>
                  <input
                    className={inputCls(false)}
                    value={editUser.full_name}
                    onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
                  />
                </Field>
                <Field label="Telefone" icon={Phone}>
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
                  Cancelar
                </button>
                <button
                  onClick={saveEditUser}
                  disabled={saving}
                  className="h-10 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90 disabled:opacity-50"
                >
                  Guardar
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
              <h3 className="text-lg font-bold text-foreground">Anexar comprovativo</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Fatura <span className="font-medium text-foreground">{proofInvoice.invoice_number}</span> ·{" "}
                {formatCurrency(Number(proofInvoice.amount), proofInvoice.currency)}
              </p>
              <div className="mt-5 flex flex-col gap-4">
                <Field label="Método de pagamento" icon={CreditCard}>
                  <select
                    className={inputCls(false)}
                    value={proofMethod}
                    onChange={(e) => setProofMethod(e.target.value)}
                  >
                    <option value="transferencia">Transferência bancária</option>
                    <option value="multibanco">Multibanco</option>
                    <option value="mbway">MB WAY</option>
                    <option value="numerario">Numerário</option>
                    <option value="outro">Outro</option>
                  </select>
                </Field>
                <Field label="Ficheiro do comprovativo" icon={FileText}>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-pastel-blue/30 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-pastel-blue-foreground"
                  />
                </Field>
                <Field label="Notas (opcional)">
                  <textarea
                    className={cn(inputCls(false), "min-h-[80px] py-2")}
                    value={proofNotes}
                    onChange={(e) => setProofNotes(e.target.value)}
                    placeholder="Referência da transferência, data, etc."
                  />
                </Field>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setProofInvoice(null)}
                  disabled={proofUploading}
                  className="h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitProof}
                  disabled={proofUploading || !proofFile}
                  className="flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90 disabled:opacity-50"
                >
                  {proofUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Enviar para validação
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
              <h3 className="text-lg font-bold text-foreground">Remover utilizador</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                O utilizador será desativado e perderá imediatamente o acesso ao Edukamba. Esta ação pode ser revertida
                reativando o utilizador.
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setRemoveId(null)}
                  className="h-10 rounded-full border border-border px-4 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmRemoveUser}
                  className="h-10 rounded-full bg-pastel-pink px-4 text-sm font-semibold text-pastel-pink-foreground shadow-soft hover:opacity-90"
                >
                  Remover
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
              <h3 className="text-lg font-bold text-foreground">Eliminar ano letivo</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Vai eliminar o ano letivo{" "}
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
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteAcademicYear}
                  disabled={saving}
                  className="h-10 rounded-full bg-pastel-pink px-4 text-sm font-semibold text-pastel-pink-foreground shadow-soft hover:opacity-90 disabled:opacity-50"
                >
                  Eliminar
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

const PermissionsTable = ({
  perms,
  onChange,
  disabled,
}: {
  perms: Record<string, { module: string; can_read: boolean; can_write: boolean; can_delete: boolean }>;
  onChange: (mod: any, key: "can_read" | "can_write" | "can_delete", value: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="mt-6 overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="py-3 pl-5 pr-4 font-semibold">Módulo</th>
          <th className="py-3 pr-4 font-semibold text-center">Ler</th>
          <th className="py-3 pr-4 font-semibold text-center">Escrever</th>
          <th className="py-3 pr-5 font-semibold text-center">Apagar</th>
        </tr>
      </thead>
      <tbody>
        {MODULES.map((m) => {
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

export default Definicoes;