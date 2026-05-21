import fs from "fs";

// NewAcademicYearWizard
{
  let s = fs.readFileSync("src/components/definicoes/NewAcademicYearWizard.tsx", "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { useEffect, useMemo, useState } from "react";',
      'import { useEffect, useMemo, useState } from "react";\nimport { useTranslation } from "react-i18next";',
    );
    s = s.replace(
      "export const NewAcademicYearWizard = ({ schoolId, isAdmin }: Props) => {",
      `export const NewAcademicYearWizard = ({ schoolId, isAdmin }: Props) => {
  const { t: tr } = useTranslation("pages", { keyPrefix: "definicoes" });`,
    );
    s = s.replace(
      /const computedSteps = useMemo<WizardStep\[\]>\(\(\) => \{[\s\S]*?\}, \[options\]\);/,
      `const computedSteps = useMemo<WizardStep[]>(() => {
    const list: WizardStep[] = [{ key: "create", label: tr("wizard.step_create"), state: "pending" }];
    if (options.courses) list.push({ key: "courses", label: tr("wizard.step_validate_courses"), state: "pending" });
    if (options.subjects) list.push({ key: "subjects", label: tr("wizard.step_validate_subjects"), state: "pending" });
    if (options.classrooms) list.push({ key: "classrooms", label: tr("wizard.step_clone_classrooms"), state: "pending" });
    if (options.fee_rules) list.push({ key: "fee_rules", label: tr("wizard.step_clone_fee_rules"), state: "pending" });
    list.push({ key: "finish", label: tr("wizard.step_finish"), state: "pending" });
    return list;
  }, [options, tr]);`,
    );
    const pairs = [
      ['toast({ title: "Escola não encontrada", variant: "destructive" });', 'toast({ title: tr("validation.wizard_school_missing"), variant: "destructive" });'],
      ['toast({ title: "Indique o nome do ano letivo", variant: "destructive" });', 'toast({ title: tr("validation.wizard_year_label"), variant: "destructive" });'],
      ['toast({ title: "Datas inválidas", description: "A data de fim deve ser posterior à de início.", variant: "destructive" });', 'toast({ title: tr("validation.wizard_dates"), description: tr("validation.wizard_dates_desc"), variant: "destructive" });'],
      ['toast({ title: "Escolha o ano de origem", description: "É necessário um ano anterior para clonar turmas/preços.", variant: "destructive" });', 'toast({ title: tr("validation.wizard_source_required"), description: tr("validation.wizard_source_desc"), variant: "destructive" });'],
      ['toast({ title: "Novo ano letivo criado", description: `${label.trim()} pronto a usar.` });', 'toast({ title: tr("toasts.wizard_done"), description: tr("toasts.wizard_done_desc", { label: label.trim() }) });'],
      ['toast({ title: "Erro na migração", description: e?.message ?? String(e), variant: "destructive" });', 'toast({ title: tr("toasts.wizard_error"), description: e?.message ?? String(e), variant: "destructive" });'],
      ['<Label htmlFor="ny-label">Nome do ano</Label>', '<Label htmlFor="ny-label">{tr("wizard.labels.year_name")}</Label>'],
      ['placeholder="Ex.: 2026/2027"', 'placeholder={tr("wizard.placeholders.year_name")}'],
      ['<Label htmlFor="ny-start">Data de início</Label>', '<Label htmlFor="ny-start">{tr("wizard.labels.start")}</Label>'],
      ['<Label htmlFor="ny-end">Data de fim</Label>', '<Label htmlFor="ny-end">{tr("wizard.labels.end")}</Label>'],
      ['<h4 className="text-sm font-semibold text-foreground">Wizard de clonagem</h4>', '<h4 className="text-sm font-semibold text-foreground">{tr("wizard.clone_title")}</h4>'],
      ['<Label>Ano de origem</Label>', '<Label>{tr("wizard.source_year")}</Label>'],
      ['placeholder={years.length === 0 ? "Sem anos disponíveis" : "Seleccionar ano..."}', 'placeholder={years.length === 0 ? tr("wizard.source_placeholder_none") : tr("wizard.source_placeholder")}'],
      ['{y.is_active ? " · ativo" : ""}', '{y.is_active ? tr("shared.active_suffix") : ""}'],
      ['Origem: <span className="font-medium text-foreground">{sourceYear.label}</span>', '{tr("wizard.source_caption")} <span className="font-medium text-foreground">{sourceYear.label}</span>'],
      ['<span className="text-sm text-foreground">Definir como ano letivo ativo</span>', '<span className="text-sm text-foreground">{tr("wizard.set_active")}</span>'],
      ['label="Estrutura de Níveis e Cursos"', 'label={tr("wizard.opt_courses_label")}'],
      ['description="Mantém os cursos da escola (1ª Classe, 2ª Classe, etc.)."', 'description={tr("wizard.opt_courses_desc")}'],
      ['label="Turmas"', 'label={tr("wizard.opt_classrooms_label")}'],
      ['description="Copia nomes, períodos e níveis. Sem alunos."', 'description={tr("wizard.opt_classrooms_desc")}'],
      ['label="Regras de cobrança"', 'label={tr("wizard.opt_fee_rules_label")}'],
      ['description="Replica valores, recorrências e alvos (inclui turmas clonadas quando aplicável)."', 'description={tr("wizard.opt_fee_rules_desc")}'],
      ['label="Disciplinas por Classe"', 'label={tr("wizard.opt_subjects_label")}'],
      ['description="Garante a matriz curricular existente."', 'description={tr("wizard.opt_subjects_desc")}'],
      ['Progresso da migração', '{tr("wizard.progress_title")}'],
      ['Migração concluída', '{tr("wizard.result_title")}'],
      ['<span className="block text-xs text-muted-foreground">Cursos</span>', '<span className="block text-xs text-muted-foreground">{tr("wizard.result_courses")}</span>'],
      ['<span className="block text-xs text-muted-foreground">Disciplinas</span>', '<span className="block text-xs text-muted-foreground">{tr("wizard.result_subjects")}</span>'],
      ['<span className="block text-xs text-muted-foreground">Turmas clonadas</span>', '<span className="block text-xs text-muted-foreground">{tr("wizard.result_classrooms")}</span>'],
      ['<span className="block text-xs text-muted-foreground">Regras de cobrança</span>', '<span className="block text-xs text-muted-foreground">{tr("wizard.result_fee_rules")}</span>'],
      ['Limpar', '{tr("wizard.btn_clear")}'],
      ['<Loader2 className="mr-2 h-4 w-4 animate-spin" /> A migrar...', '<Loader2 className="mr-2 h-4 w-4 animate-spin" /> {tr("wizard.btn_running")}'],
      ['<Calendar className="mr-2 h-4 w-4" /> Criar e migrar', '<Calendar className="mr-2 h-4 w-4" /> {tr("wizard.btn_run")}'],
    ];
    for (const [a, b] of pairs) s = s.split(a).join(b);
    fs.writeFileSync("src/components/definicoes/NewAcademicYearWizard.tsx", s);
    console.log("wizard done");
  }
}

// Billing
{
  let s = fs.readFileSync("src/components/definicoes/BillingEncargadosDiscountsPanel.tsx", "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { useCallback, useEffect, useState } from "react";',
      'import { useCallback, useEffect, useState } from "react";\nimport { useTranslation } from "react-i18next";\nimport { intlLocaleTagFromLng } from "@/lib/intlLocale";',
    );
    s = s.replace(
      /const fmtAOA = \(n: number\) =>[\s\S]*?\.format\(n \|\| 0\);\n\n/,
      "",
    );
    s = s.replace(
      "export function BillingEncargadosDiscountsPanel({ schoolId }: { schoolId: string | null }) {",
      `export function BillingEncargadosDiscountsPanel({ schoolId }: { schoolId: string | null }) {
  const { t: tr, i18n } = useTranslation("pages", { keyPrefix: "definicoes" });
  const fmtAOA = (n: number) =>
    new Intl.NumberFormat(intlLocaleTagFromLng(i18n.language), {
      style: "currency",
      currency: "AOA",
      maximumFractionDigits: 0,
    }).format(n || 0);`,
    );
    const pairs = [
      ['toast({ title: "Erro a guardar", description: error.message, variant: "destructive" });', 'toast({ title: tr("toasts.billing_save_error"), description: error.message, variant: "destructive" });'],
      ['toast({ title: "Preferências de cobrança guardadas" });', 'toast({ title: tr("toasts.billing_prefs_saved") });'],
      ['toast({ title: editingFamily ? "Regra atualizada" : "Regra criada" });', 'toast({ title: editingFamily ? tr("toasts.billing_rule_saved") : tr("toasts.billing_rule_created") });'],
      ['toast({ title: "Erro a apagar", description: error.message, variant: "destructive" });', 'toast({ title: tr("toasts.billing_delete_error"), description: error.message, variant: "destructive" });'],
      ['toast({ title: "Regra apagada" });', 'toast({ title: tr("toasts.billing_rule_deleted") });'],
      ['title: "Ano letivo em falta",\n        description: "Seleccione o ano letivo activo no cabeçalho da app antes de criar um desconto."', 'title: tr("validation.year_required_discount"),\n        description: tr("validation.year_required_discount_desc")'],
      ['toast({ title: "Selecciona um aluno", variant: "destructive" });', 'toast({ title: tr("validation.student_required"), variant: "destructive" });'],
      ['toast({ title: "Indica uma percentagem ou um valor fixo", variant: "destructive" });', 'toast({ title: tr("validation.discount_value_required"), variant: "destructive" });'],
      ['toast({ title: editingDiscount ? "Desconto atualizado" : "Desconto criado" });', 'toast({ title: editingDiscount ? tr("toasts.billing_discount_saved") : tr("toasts.billing_discount_created") });'],
      ['toast({ title: "Desconto removido" });', 'toast({ title: tr("toasts.billing_discount_removed") });'],
      ['<CardTitle className="text-base">Cobrança aos encarregados</CardTitle>', '<CardTitle className="text-base">{tr("billing.panel_title")}</CardTitle>'],
      ['Defina como os encarregados interagem com os pagamentos na plataforma. Com comprovativo, o IBAN da escola aparece nos emails de lembrete.', '{tr("billing.panel_desc")}'],
      ['<Label htmlFor="def-pay-mode">Modo de cobrança</Label>', '<Label htmlFor="def-pay-mode">{tr("billing.field_mode")}</Label>'],
      ['Comprovativo na app / transferência (IBAN + validação pela escola)', '{tr("billing.mode_proof")}'],
      ['Pagamento presencial na escola (sem envio de ficheiros pelos encarregados)', '{tr("billing.mode_in_person")}'],
      ['<Label htmlFor="def-school-iban">IBAN da escola</Label>', '<Label htmlFor="def-school-iban">{tr("billing.field_iban")}</Label>'],
      ['placeholder="Ex.: AO06 ..."', 'placeholder={tr("billing.iban_placeholder")}'],
      ['Guardar definições', '{tr("billing.btn_save_prefs")}'],
      ['Aparece no email quando está activo o modo com comprovativo. Opcional mas fortemente recomendado.', '{tr("billing.iban_help")}'],
      ['<TabsTrigger value="family">Descontos por familiar</TabsTrigger>', '<TabsTrigger value="family">{tr("billing.tab_family")}</TabsTrigger>'],
      ['<TabsTrigger value="overrides">Descontos por aluno</TabsTrigger>', '<TabsTrigger value="overrides">{tr("billing.tab_overrides")}</TabsTrigger>'],
      ['<CardTitle>Desconto automático por familiar</CardTitle>', '<CardTitle>{tr("billing.family_card_title")}</CardTitle>'],
      ['Quando um educador tem vários filhos na escola, aplica-se um desconto.', '{tr("billing.family_card_desc")}'],
      ['<Plus className="h-4 w-4" /> Nova regra', '<Plus className="h-4 w-4" /> {tr("billing.btn_new_rule")}'],
      ['Sem regras definidas.', '{tr("billing.family_empty")}'],
      ['<th className="px-2 py-2">Posição do familiar</th>', '<th className="px-2 py-2">{tr("billing.th_sibling_pos")}</th>'],
      ['<th className="px-2 py-2">Desconto</th>', '<th className="px-2 py-2">{tr("billing.th_discount")}</th>'],
      ['<th className="px-2 py-2 text-right">Acções</th>', '<th className="px-2 py-2 text-right">{tr("billing.th_actions")}</th>'],
      ['{f.sibling_position}º filho ou superior', '{tr("billing.sibling_row", { n: f.sibling_position })}'],
      ['<CardTitle>Descontos manuais por aluno</CardTitle>', '<CardTitle>{tr("billing.overrides_title")}</CardTitle>'],
      ['Sobrepõe a regra automática em casos especiais.', '{tr("billing.overrides_desc")}'],
      ['Ano letivo do desconto: usa o ano seleccionado no cabeçalho da app{selectedYearId ? "" : " (nenhum seleccionado)"}.', '{tr("billing.overrides_year_hint", { suffix: selectedYearId ? "" : tr("billing.overrides_year_none") })}'],
      ['<Plus className="h-4 w-4" /> Novo desconto', '<Plus className="h-4 w-4" /> {tr("billing.btn_new_discount")}'],
      ['Sem descontos manuais.', '{tr("billing.overrides_empty")}'],
      ['<th className="px-2 py-2">Aluno</th>', '<th className="px-2 py-2">{tr("billing.th_student")}</th>'],
      ['<th className="px-2 py-2">Motivo</th>', '<th className="px-2 py-2">{tr("billing.th_reason")}</th>'],
      ['{d.student?.full_name ?? "—"}', '{d.student?.full_name ?? tr("shared.em_dash")}'],
      ['{d.reason ?? "—"}', '{d.reason ?? tr("shared.em_dash")}'],
      ['{editingFamily ? "Editar regra" : "Nova regra de família"}', '{editingFamily ? tr("billing.dialog_family_edit") : tr("billing.dialog_family_new")}'],
      ['Aplica-se a alunos com o mesmo educador.', '{tr("billing.dialog_family_desc")}'],
      ['<Label>A partir do … familiar</Label>', '<Label>{tr("billing.field_from_sibling")}</Label>'],
      ['2 = aplicar ao 2º filho em diante; 3 = só ao 3º em diante; etc.', '{tr("billing.field_from_sibling_help")}'],
      ['<Label>Desconto (%)</Label>', '<Label>{tr("billing.field_discount_pct")}</Label>'],
      ['Cancelar', '{tr("shared.cancel")}'],
      ['Guardar', '{tr("shared.guardar")}'],
      ['{editingDiscount ? "Editar desconto" : "Novo desconto manual"}', '{editingDiscount ? tr("billing.dialog_discount_edit") : tr("billing.dialog_discount_new")}'],
      ['Sobrepõe a regra automática para um aluno específico.', '{tr("billing.dialog_discount_desc")}'],
      ['<Label>Aluno</Label>', '<Label>{tr("billing.field_student")}</Label>'],
      ['placeholder="Selecciona um aluno"', 'placeholder={tr("billing.select_student")}'],
      ['<Label>Desconto %</Label>', '<Label>{tr("billing.field_discount_pct_short")}</Label>'],
      ['<Label>Ou valor fixo</Label>', '<Label>{tr("billing.field_fixed_amount")}</Label>'],
      ['<Label>Motivo</Label>', '<Label>{tr("billing.th_reason")}</Label>'],
      ['placeholder="Ex.: bolsa de mérito"', 'placeholder={tr("billing.reason_placeholder")}'],
      ['<AlertDialogTitle>Apagar regra?</AlertDialogTitle>', '<AlertDialogTitle>{tr("billing.confirm_delete_rule_title")}</AlertDialogTitle>'],
      ['<AlertDialogDescription>Esta acção não pode ser desfeita.</AlertDialogDescription>', '<AlertDialogDescription>{tr("billing.confirm_delete_rule_desc")}</AlertDialogDescription>'],
      ['<AlertDialogAction onClick={() => void confirmDeleteFamily()}>Apagar</AlertDialogAction>', '<AlertDialogAction onClick={() => void confirmDeleteFamily()}>{tr("billing.confirm_delete_rule_action")}</AlertDialogAction>'],
      ['<AlertDialogTitle>Remover desconto?</AlertDialogTitle>', '<AlertDialogTitle>{tr("billing.confirm_delete_discount_title")}</AlertDialogTitle>'],
      ['<AlertDialogAction onClick={() => void confirmDeleteDiscount()}>Remover</AlertDialogAction>', '<AlertDialogAction onClick={() => void confirmDeleteDiscount()}>{tr("billing.confirm_delete_discount_action")}</AlertDialogAction>'],
    ];
    for (const [a, b] of pairs) s = s.split(a).join(b);
    fs.writeFileSync("src/components/definicoes/BillingEncargadosDiscountsPanel.tsx", s);
    console.log("billing done");
  }
}
