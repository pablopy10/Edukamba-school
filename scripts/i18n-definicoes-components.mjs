import fs from "fs";

// TermsAndHolidaysManager
{
  let s = fs.readFileSync("src/components/definicoes/TermsAndHolidaysManager.tsx", "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { useEffect, useState } from "react";',
      'import { useEffect, useMemo, useState } from "react";\nimport { useTranslation } from "react-i18next";\nimport { intlLocaleTagFromLng } from "@/lib/intlLocale";',
    );
    s = s.replace(
      /const TERM_DEFAULTS = \[[\s\S]*?\];\n\nconst fmtRange/,
      `const fmtRange`,
    );
    s = s.replace(
      "export const TermsAndHolidaysManager = ({ schoolId, academicYearId, isAdmin }: Props) => {",
      `export const TermsAndHolidaysManager = ({ schoolId, academicYearId, isAdmin }: Props) => {
  const { t: tr, i18n } = useTranslation("pages", { keyPrefix: "definicoes" });
  const TERM_DEFAULTS = useMemo(
    () => [
      { term_number: 1, name: tr("terms.defaults.term1") },
      { term_number: 2, name: tr("terms.defaults.term2") },
      { term_number: 3, name: tr("terms.defaults.term3") },
    ],
    [tr],
  );`,
    );
    s = s.replace(
      /const fmtRange = \(a: string, b: string\) => \{[\s\S]*?\};/,
      `const fmtRange = (a: string, b: string) => {
  const locale = intlLocaleTagFromLng(i18n.language);
  const f = (x: string) =>
    new Date(x + "T00:00:00").toLocaleDateString(locale, { day: "2-digit", month: "short" });
  return \`\${f(a)} → \${f(b)}\`;
};`,
    );
    const pairs = [
      ['toast({ title: "Preencha todos os campos do trimestre.", variant: "destructive" });', 'toast({ title: tr("validation.terms_fields"), variant: "destructive" });'],
      ['toast({ title: "A data de início deve ser anterior à data de fim.", variant: "destructive" });', 'toast({ title: tr("validation.dates_order"), variant: "destructive" });'],
      ['toast({ title: "Erro ao guardar trimestre", description: error.message, variant: "destructive" });', 'toast({ title: tr("toasts.term_error_title"), description: error.message, variant: "destructive" });'],
      ['toast({ title: `${draft.name} guardado` });', 'toast({ title: tr("toasts.term_saved_title", { name: draft.name }) });'],
      ['if (!confirm(`Remover ${existing.name}?`)) return;', 'if (!confirm(tr("terms.confirm_remove_term", { name: existing.name }))) return;'],
      ['toast({ title: "Erro", description: error.message, variant: "destructive" });', 'toast({ title: tr("toasts.generic_error_title"), description: error.message, variant: "destructive" });'],
      ['toast({ title: "Trimestre removido" });', 'toast({ title: tr("toasts.term_removed") });'],
      ['toast({ title: "Preencha nome e datas.", variant: "destructive" });', 'toast({ title: tr("validation.holiday_fields"), variant: "destructive" });'],
      ['toast({ title: editingHoliday.id ? "Férias atualizadas" : "Férias criadas" });', 'toast({ title: editingHoliday.id ? tr("toasts.holiday_updated") : tr("toasts.holiday_created") });'],
      ['if (!confirm("Remover este período de férias?")) return;', 'if (!confirm(tr("terms.confirm_remove_holiday"))) return;'],
      ['toast({ title: "Férias removidas" });', 'toast({ title: tr("toasts.holidays_removed") });'],
      ["Selecione (ou crie) um ano letivo acima para configurar trimestres e férias específicos desse ano.", '{tr("terms.banner_select_year")}'],
      ["As datas abaixo aplicam-se apenas ao ano letivo atualmente selecionado. Cada ano letivo\n          (ex.: 2025/2026, 2026/2027) tem a sua própria configuração.", '{tr("terms.banner_year_scope")}'],
      [">Trimestres<", ">{tr(\"terms.terms_heading\")}<"],
      ['1º · 2º · 3º', '{tr("terms.terms_badge")}'],
      ["Configure as datas dos três trimestres do ano letivo. Cada avaliação será automaticamente\n          associada ao trimestre correspondente à sua data.", '{tr("terms.terms_help")}'],
      ['{term_number}º', '{term_number}{tr("terms.term_ordinal_suffix")}'],
      ['>Nome<', '>{tr("terms.label_name")}<'],
      ['>Início<', '>{tr("terms.label_start")}<'],
      ['>Fim<', '>{tr("terms.label_end")}<'],
      ['{existing ? "Atualizar" : "Guardar"}', '{existing ? tr("shared.atualizar") : tr("shared.guardar")}'],
      ['title="Remover trimestre"', 'title={tr("terms.btn_remove_term_title")}'],
      [">Férias dos alunos<", ">{tr('terms.holidays_heading')}<"],
      ['Adicionar férias', '{tr("terms.btn_add_holiday")}'],
      ["Marque períodos de férias para serem visíveis no calendário académico (Natal, Páscoa, Verão, etc.).", '{tr("terms.holidays_help")}'],
      ["Sem períodos de férias configurados.", '{tr("terms.holidays_empty")}'],
      ['title="Editar"', 'title={tr("terms.action_edit_title")}'],
      ['title="Remover"', 'title={tr("terms.action_remove_title")}'],
      ['{editingHoliday.id ? "Editar férias" : "Novas férias"}', '{editingHoliday.id ? tr("terms.editor_edit_title") : tr("terms.editor_new_title")}'],
      ['placeholder="Ex: Férias do Natal"', 'placeholder={tr("terms.placeholder_holiday_name")}'],
      ['>Descrição (opcional)<', '>{tr("terms.field_description")}<'],
      ['placeholder="Notas internas sobre estas férias"', 'placeholder={tr("terms.placeholder_holiday_notes")}'],
      ['Cancelar', '{tr("shared.cancel")}'],
      ['Guardar', '{tr("shared.guardar")}'],
    ];
    for (const [a, b] of pairs) s = s.split(a).join(b);
    fs.writeFileSync("src/components/definicoes/TermsAndHolidaysManager.tsx", s);
    console.log("TermsAndHolidaysManager done");
  }
}

// NewAcademicYearWizard - similar script in file...
