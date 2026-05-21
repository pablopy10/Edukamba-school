import fs from "fs";

const path = "src/pages/Definicoes.tsx";
let s = fs.readFileSync(path, "utf8");

if (s.includes('keyPrefix: "definicoes"')) {
  console.log("Already internationalized");
  process.exit(0);
}

s = s.replace(
  'import { useEffect, useMemo, useState } from "react";',
  'import { useEffect, useMemo, useState } from "react";\nimport { useTranslation } from "react-i18next";\nimport { intlLocaleTagFromLng } from "@/lib/intlLocale";',
);

s = s.replace(/const MODULES:[\s\S]*?\];\n\n/, "");

s = s.replace(
  /const tabs: \{ id: Tab; label: string; icon: typeof Building2 \}\[\] = \[[\s\S]*?\];\n\n/,
  `const TAB_DEFS: { id: Tab; icon: typeof Building2 }[] = [
  { id: "escola", icon: Building2 },
  { id: "marca", icon: ImageIcon },
  { id: "academico", icon: Calendar },
  { id: "utilizadores", icon: UsersIcon },
  { id: "permissoes", icon: Shield },
  { id: "notificacoes", icon: Bell },
  { id: "faturacao", icon: CreditCard },
  { id: "auditoria", icon: History },
];

`,
);

s = s.replace(/const ROLE_LABEL: Record<Role, string> = \{[\s\S]*?\};\n\n/, "");
s = s.replace(/const NOTIFICATION_CHANNELS: \{ key: string; label: string; desc: string \}\[\] = \[[\s\S]*?\];\n\n/, "");
s = s.replace(
  /const schoolSchema = z\.object\(\{\n  name: z\.string\(\)\.trim\(\)\.min\(1, "Nome obrigatório"\)\.max\(120\),\n  nif: z\.string\(\)\.trim\(\)\.max\(40\)\.optional\(\)\.or\(z\.literal\(""\)\),\n  address: z\.string\(\)\.trim\(\)\.max\(200\)\.optional\(\)\.or\(z\.literal\(""\)\),\n\}\);\n\n/,
  "",
);

const saveBarNew = `const SaveBar = ({
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
  <motion.div className="mt-6 flex justify-end">
    <button
      onClick={onClick}
      disabled={disabled || saving || !canSave}
      className="flex h-11 items-center gap-2 rounded-full bg-pastel-blue px-5 text-sm font-semibold text-pastel-blue-foreground shadow-soft transition-[var(--transition-smooth)] hover:opacity-90 disabled:opacity-50"
    >
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={2} />}
      {label}
    </button>
  </motion.div>
  );
};

`.replace(/motion\.div/g, "motion.div"); // placeholder

const saveBarFixed = saveBarNew.replace(/motion\.motion.div/g, "div").replace(/<motion\.div/g, "<div").replace(/<\/motion\.div>/g, "</motion.div>");

// fix save bar properly
const saveBarFinal = `const SaveBar = ({
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

`;

s = s.replace(
  /const SaveBar = \(\{[\s\S]*?Guardar Alterações[\s\S]*?\);\n/,
  saveBarFinal,
);

const hooksBlock = `  const { t: tr, i18n } = useTranslation("pages", { keyPrefix: "definicoes" });

  const tabs = useMemo(
    () => TAB_DEFS.map((tab) => ({ ...tab, label: tr(\`tabs.\${tab.id}\`) })),
    [tr],
  );

  const MODULES = useMemo(
    () => [
      ...PERMISSION_ROUTE_ORDER.map((key) => ({
        key,
        label: tr(\`modules.\${key}.label\`),
        desc: tr(\`modules.\${key}.desc\`),
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
        label: tr(\`notificacoes.channels.\${key}.label\`),
        desc: tr(\`notificacoes.channels.\${key}.desc\`),
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

  const roleLabel = (r: Role) => tr(\`roles.\${r}\`);

`;

s = s.replace(
  "const Definicoes = () => {\n  const queryClient = useQueryClient();",
  `const Definicoes = () => {\n${hooksBlock}  const queryClient = useQueryClient();`,
);

// Replace ROLE_LABEL usages
s = s.replace(/ROLE_LABEL\[/g, "roleLabel(");
s = s.replace(/roleLabel\(([^)]+)\]/g, "roleLabel($1)");

// Fix roleLabel(r as Role) patterns - was ROLE_LABEL[r as Role]
s = s.replace(/roleLabel\(\(u\.role \?\? "TEACHER"\) as Role\]/g, 'roleLabel((u.role ?? "TEACHER") as Role)');
s = s.replace(/roleLabel\(\(u\.role \?\? "TEACHER"\) as Role\)/g, 'roleLabel((u.role ?? "TEACHER") as Role)');

// Fix incorrect replacements: roleLabel(r) should stay, roleLabel[r] became roleLabel(r) but closing bracket wrong
// ROLE_LABEL[r] -> roleLabel(r)
s = s.replace(/roleLabel\((\w+)\]/g, "roleLabel($1)");

// formatCurrency
s = s.replace(
  /const formatCurrency = \(amount: number, currency: string\) => \{[\s\S]*?\};/,
  `const formatCurrency = (amount: number, currency: string) => {
    const locale = intlLocaleTagFromLng(i18n.language);
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
    } catch {
      return \`\${amount.toFixed(2)} \${currency}\`;
    }
  };`,
);

// statusBadge
s = s.replace(
  /const statusBadge = \(active: boolean \| null\) => \{[\s\S]*?return <span[\s\S]*?\{isActive \? "Ativo" : "Inativo"\}<\/span>;\n  \};/,
  `const statusBadge = (active: boolean | null) => {
    const isActive = active !== false;
    const cls = isActive
      ? "bg-pastel-green text-pastel-green-foreground"
      : "bg-pastel-pink text-pastel-pink-foreground";
    return (
      <span className={cn("rounded-full px-3 py-1 text-xs font-medium", cls)}>
        {isActive ? tr("utilizadores.status_active") : tr("utilizadores.status_inactive")}
      </span>
    );
  };`,
);

// Toast replacements
const toastMap = [
  ['showToast("error", "Verifique os campos do formulário.")', 'showToast("error", tr("validation.form_check"))'],
  ['showToast("success", "Informações da escola guardadas.")', 'showToast("success", tr("toasts.school_saved"))'],
  ['showToast("success", "Marca atualizada.")', 'showToast("success", tr("toasts.brand_saved"))'],
  ['showToast("error", "Ficheiro demasiado grande (máx. 2MB).")', 'showToast("error", tr("validation.logo_max_size"))'],
  ['showToast("success", "Logotipo carregado. Lembre-se de guardar.")', 'showToast("success", tr("toasts.logo_uploaded"))'],
  ['showToast("success", "Ano letivo atualizado.")', 'showToast("success", tr("toasts.academic_updated"))'],
  ['showToast("success", "Ano letivo ativo atualizado.")', 'showToast("success", tr("toasts.academic_active_updated"))'],
  ['showToast("success", "Ano letivo criado. Edite os dados conforme necessário.")', 'showToast("success", tr("toasts.academic_created"))'],
  ['? "Não é possível eliminar: existem turmas, matrículas ou propinas associadas a este ano letivo."', '? tr("validation.delete_year_blocked")'],
  ['"Sem permissão para eliminar este ano letivo. Apenas administradores podem fazê-lo."', 'tr("validation.delete_year_forbidden")'],
  ['showToast("success", "Ano letivo eliminado.")', 'showToast("success", tr("toasts.academic_deleted"))'],
  ['showToast("error", "Verifique os valores: 0 ≤ média mínima ≤ nota máxima.")', 'showToast("error", tr("validation.academic_values"))'],
  ['showToast("error", "Defina um valor de multa maior que zero.")', 'showToast("error", tr("validation.late_fee_positive"))'],
  ['showToast("error", "A percentagem da multa não pode exceder 100%.")', 'showToast("error", tr("validation.late_fee_pct_max"))'],
  ['showToast("success", "Critérios académicos guardados.")', 'showToast("success", tr("toasts.academic_settings_saved"))'],
  ['showToast("success", "Função atualizada.")', 'showToast("success", tr("toasts.role_updated"))'],
  ['showToast("success", value ? "Utilizador ativado." : "Utilizador desativado.")', 'showToast("success", value ? tr("toasts.user_activated") : tr("toasts.user_deactivated"))'],
  ['showToast("error", "O email é obrigatório (serve para iniciar sessão na Edukamba).")', 'showToast("error", tr("validation.email_required_login"))'],
  ['fx.message ?? "Não foi possível actualizar o email de login."', 'fx.message ?? tr("validation.update_email_failed")'],
  ['showToast("success", "Utilizador atualizado.")', 'showToast("success", tr("toasts.user_updated"))'],
  ['showToast("success", "Utilizador removido. Já não consegue aceder ao Edukamba.")', 'showToast("success", tr("toasts.user_removed"))'],
  ['showToast("success", "Permissões da função guardadas.")', 'showToast("success", tr("toasts.role_perms_saved"))'],
  ['showToast("error", "Não foi possível determinar a função deste utilizador.")', 'showToast("error", tr("validation.cannot_resolve_user_role"))'],
  ['showToast("error", "Administradores têm sempre acesso total à aplicação; não são guardadas permissões granulares.")', 'showToast("error", tr("validation.admin_always_full_access"))'],
  ['showToast("success", "Permissões personalizadas guardadas.")', 'showToast("success", tr("toasts.user_perms_saved"))'],
  ['"A função Administrador utiliza sempre acesso total na aplicação; não existem linhas personalizadas a remover."', 'tr("validation.admin_no_stored_perms")'],
  ['showToast("success", "Permissões da função repostas para os valores padrão da aplicação.")', 'showToast("success", tr("toasts.role_perms_reset"))'],
  ['showToast("error", "Esta conta tem acesso total; não há personalizações por módulo a remover.")', 'showToast("error", tr("validation.admin_user_full_access"))'],
  ['showToast("success", "Personalizações do utilizador removidas; aplicam-se de novo os valores herdados pela função.")', 'showToast("success", tr("toasts.user_perms_cleared"))'],
  ['showToast("error", "Sem utilizadores nesta função.")', 'showToast("error", tr("validation.users_required_for_notif"))'],
  ['showToast("success", `Preferências aplicadas a ${targets.length} utilizador(es).`)', 'showToast("success", tr("toasts.notif_prefs_applied", { count: targets.length }))'],
  ['showToast("success", "Ciclo de pagamento atualizado.")', 'showToast("success", tr("toasts.billing_cycle_updated"))'],
  ['showToast("error", "Selecione o ficheiro do comprovativo.")', 'showToast("error", tr("validation.proof_file_required"))'],
  ['showToast("success", "Comprovativo enviado. Aguarda validação.")', 'showToast("success", tr("toasts.proof_submitted"))'],
  ['const msg = e instanceof Error ? e.message : "Erro ao enviar comprovativo."', 'const msg = e instanceof Error ? e.message : tr("toasts.proof_error")'],
  ['showToast("error", "Não foi possível abrir o comprovativo.")', 'showToast("error", tr("toasts.proof_open_failed"))'],
];

for (const [from, to] of toastMap) {
  s = s.split(from).join(to);
}

// window.confirm
s = s.replace(
  /!window\.confirm\(\s*`Remover todas as permissões gravadas na base de dados para a função «\$\{ROLE_LABEL\[activeRole\]\}» nesta escola\?\\n\\n` \+\s*"Depois disto, todos os utilizadores com esta função voltam a usar apenas as regras padrão da aplicação para cada módulo\.",\s*\)/,
  `!window.confirm(tr("modals.confirm_clear_role.body", { role: roleLabel(activeRole) }))`,
);

s = s.replace(
  /!window\.confirm\(\s*`Remover todas as permissões personalizadas gravadas para \$\{targetUser\.full_name\}\? ` \+\s*"O utilizador voltará a seguir apenas a função \(e as regras padrão\) para cada módulo\.",\s*\)/,
  `!window.confirm(tr("modals.confirm_clear_user.body", { name: targetUser.full_name }))`,
);

// PermissionsTable - add hook and pass modules - simpler: add modules prop
s = s.replace(
  "const PermissionsTable = ({\n  perms,\n  onChange,\n  disabled,\n}: {\n  perms: Record<string, { module: string; can_read: boolean; can_write: boolean; can_delete: boolean }>;\n  onChange: (mod: PermissionModuleKey, key: \"can_read\" | \"can_write\" | \"can_delete\", value: boolean) => void;\n  disabled?: boolean;\n}) => (",
  `const PermissionsTable = ({\n  perms,\n  onChange,\n  disabled,\n  modules,\n}: {\n  perms: Record<string, { module: string; can_read: boolean; can_write: boolean; can_delete: boolean }>;\n  onChange: (mod: PermissionModuleKey, key: "can_read" | "can_write" | "can_delete", value: boolean) => void;\n  disabled?: boolean;\n  modules: { key: PermissionModuleKey; label: string; desc: string }[];\n}) => {\n  const { t: tr } = useTranslation("pages", { keyPrefix: "definicoes" });\n  return (`,
);

s = s.replace(
  '<th className="py-3 pl-5 pr-4 font-semibold">Módulo</th>\n          <th className="py-3 pr-4 font-semibold text-center">Ver</th>\n          <th className="py-3 pr-4 font-semibold text-center">Editar</th>\n          <th className="py-3 pr-5 font-semibold text-center">Apagar</th>',
  '{/* i18n headers */}\n          <th className="py-3 pl-5 pr-4 font-semibold">{tr("permissions_table.col_module")}</th>\n          <th className="py-3 pr-4 font-semibold text-center">{tr("permissions_table.col_read")}</th>\n          <th className="py-3 pr-4 font-semibold text-center">{tr("permissions_table.col_write")}</th>\n          <th className="py-3 pr-5 font-semibold text-center">{tr("permissions_table.col_delete")}</th>',
);

s = s.replace(/\{MODULES\.map\(\(m\) => \{/g, "{modules.map((m) => {");

s = s.replace(
  /  <\/div>\n\);\n\nexport default Definicoes;/,
  "  </div>\n  );\n};\n\nexport default Definicoes;",
);

// Add modules prop to PermissionsTable usages
s = s.replace(
  '<PermissionsTable\n                  perms={rolePerms}\n                  onChange={setRolePermField}',
  '<PermissionsTable\n                  modules={MODULES}\n                  perms={rolePerms}\n                  onChange={setRolePermField}',
);
s = s.replace(
  '<PermissionsTable perms={userPerms} onChange={setUserPermField}',
  '<PermissionsTable modules={MODULES} perms={userPerms} onChange={setUserPermField}',
);

// Remove unused moduleMeta import if MODULES no longer uses it
s = s.replace('import { moduleMeta } from "@/context/ModulesContext";\n', "");

fs.writeFileSync(path, s);
console.log("Definicoes.tsx script applied");
