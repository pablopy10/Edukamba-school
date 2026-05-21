import fs from "fs";

const path = "src/pages/Definicoes.tsx";
let s = fs.readFileSync(path, "utf8");

const pairs = [
  ['!window.confirm(\n        `Remover todas as permissões gravadas na base de dados para a função «${roleLabel(activeRole)}» nesta escola?\\n\\n` +\n          "Depois disto, todos os utilizadores com esta função voltam a usar apenas as regras padrão da aplicação para cada módulo.",\n      )', '!window.confirm(tr("modals.confirm_clear_role.body", { role: roleLabel(activeRole) }))'],
  ['!window.confirm(\n        `Remover todas as permissões personalizadas gravadas para ${targetUser.full_name}? ` +\n          "O utilizador voltará a seguir apenas a função (e as regras padrão) para cada módulo.",\n      )', '!window.confirm(tr("modals.confirm_clear_user.body", { name: targetUser.full_name }))'],
  ['<h1 className="text-2xl font-bold tracking-tight text-foreground">Definições</h1>', '<h1 className="text-2xl font-bold tracking-tight text-foreground">{tr("page_header.title")}</h1>'],
  ['Faça a gestão das definições gerais da escola, marca, utilizadores e permissões.', '{tr("page_header.subtitle")}'],
  ['Como director gere utilizadores e permissões. Alterações à marca, dados da instituição e fatura Edukamba ficam apenas com o administrador.', '{tr("page_header.director_notice")}'],
  ['title="Informações da Escola" desc="Estes dados são usados em documentos, faturas e na app."', 'title={tr("escola.section_title")} desc={tr("escola.section_desc")}'],
  ['label="Nome da escola"', 'label={tr("escola.field_name")}'],
  ['label="NIF / Tax ID"', 'label={tr("escola.field_nif")}'],
  ['label="Morada"', 'label={tr("escola.field_address")}'],
  ['title="Marca e Identidade Visual" desc="Logotipo e cores que aparecem em toda a app."', 'title={tr("marca.section_title")} desc={tr("marca.section_desc")}'],
  ['<p className="text-sm font-semibold text-foreground">Logotipo</p>', '<p className="text-sm font-semibold text-foreground">{tr("marca.logo_title")}</p>'],
  ['PNG ou SVG · até 2MB', '{tr("marca.logo_hint")}'],
  ['alt="Logo"', 'alt={tr("shared.logo_alt")}'],
  ['Carregar', '{tr("shared.carregar")}'],
  ['label="Cor primária"', 'label={tr("marca.primary_color")}'],
  ['label="Cor secundária"', 'label={tr("marca.secondary_color")}'],
  ['title="Anos letivos"\n              desc="Crie, edite ou elimine os anos letivos da escola. O ano selecionado é usado em toda a aplicação para filtrar a informação."', 'title={tr("academico.years.section_title")}\n              desc={tr("academico.years.section_desc")}'],
  ['label="Ano em edição"', 'label={tr("academico.years.field_editing_year")}'],
  ['placeholder="Sem anos letivos criados"', 'placeholder={tr("academico.years.placeholder_no_years")}'],
  ['{y.label}{y.is_active ? " · ativo" : ""}', '{y.label}{y.is_active ? tr("shared.active_suffix") : ""}'],
  ['Novo ano letivo', '{tr("academico.years.btn_new")}'],
  ['? "Não é possível eliminar o ano letivo ativo."\n                        : "Eliminar ano letivo"', '? tr("academico.years.title_cannot_delete_active")\n                        : tr("academico.years.title_delete")'],
  ['Eliminar', '{tr("academico.years.btn_delete")}'],
  ['Sem anos letivos criados. Clique em <span className="font-semibold text-foreground">"Novo ano letivo"</span> para começar.', '{tr("academico.years.empty_state")}'],
  ['label="Ano letivo"', 'label={tr("academico.years.field_year_label")}'],
  ['label="Início"', 'label={tr("academico.years.field_start")}'],
  ['label="Fim"', 'label={tr("academico.years.field_end")}'],
  ['Tornar ativo', '{tr("academico.years.btn_make_active")}'],
  ['Guardar Alterações', '{tr("shared.save_changes")}'],
  ['title="Trimestres e Férias"\n              desc="Defina as datas dos 1º, 2º e 3º trimestres e marque os períodos de férias dos alunos."', 'title={tr("academico.terms_holidays.section_title")}\n              desc={tr("academico.terms_holidays.section_desc")}'],
  ['title="Configuração de Novo Ano Letivo"\n              desc="Crie o próximo ciclo escolar e clone automaticamente a estrutura do ano anterior — turmas, cursos e tabela de preços — sem trabalho manual."', 'title={tr("academico.wizard.section_title")}\n              desc={tr("academico.wizard.section_desc")}'],
  ['title="Quadro de Honra"\n              desc="Defina a média mínima para um aluno ser considerado no Quadro de Honra e a nota máxima da escala usada pela escola."', 'title={tr("academico.honor_roll.section_title")}\n              desc={tr("academico.honor_roll.section_desc")}'],
  ['label="Média mínima do Quadro de Honra"', 'label={tr("academico.honor_roll.field_min_avg")}'],
  ['label="Nota máxima da escala"', 'label={tr("academico.honor_roll.field_max_grade")}'],
  ['title="Multas por Atraso de Propinas"\n              desc="Aplicada automaticamente no dia 11 de cada mês a propinas vencidas e ainda não pagas. Pode ser um valor fixo (Kz) ou uma percentagem do valor da propina."', 'title={tr("academico.late_fees.section_title")}\n              desc={tr("academico.late_fees.section_desc")}'],
  ['label="Cobrar multa por atraso?"', 'label={tr("academico.late_fees.field_charge")}'],
  ['<option value="no">Não cobrar</option>', '<option value="no">{tr("academico.late_fees.opt_no")}</option>'],
  ['<option value="yes">Sim, cobrar multa</option>', '<option value="yes">{tr("academico.late_fees.opt_yes")}</option>'],
  ['label="Tipo de multa"', 'label={tr("academico.late_fees.field_type")}'],
  ['<option value="fixed">Valor fixo (Kz)</option>', '<option value="fixed">{tr("academico.late_fees.type_fixed")}</option>'],
  ['<option value="percentage">Percentagem (%)</option>', '<option value="percentage">{tr("academico.late_fees.type_percentage")}</option>'],
  ['? "Percentagem da multa (%)"\n                      : "Valor da multa (Kz)"', '? tr("academico.late_fees.field_value_pct")\n                      : tr("academico.late_fees.field_value_fixed")'],
  ['A multa é aplicada uma única vez por propina em atraso, no dia 11. As propinas pagas antes do\n                vencimento ou já regularizadas não são afetadas.', '{tr("academico.late_fees.help")}'],
  ['title="Custos de Matrícula"\n              desc="Valores únicos cobrados ao matricular um aluno (nova matrícula) ou ao renovar a matrícula num novo ano letivo. Definir 0 para não cobrar."', 'title={tr("academico.enrollment_fees.section_title")}\n              desc={tr("academico.enrollment_fees.section_desc")}'],
  ['label="Custo da matrícula nova (Kz)"', 'label={tr("academico.enrollment_fees.field_new")}'],
  ['label="Custo da renovação de matrícula (Kz)"', 'label={tr("academico.enrollment_fees.field_renewal")}'],
  ['Quando uma matrícula é criada e fica ativa, o custo correspondente é gerado automaticamente em\n                Pagamentos &rsaquo; Matrículas. Os encarregados de educação podem anexar o comprovativo para\n                validação pela administração.', '{tr("academico.enrollment_fees.help")}'],
  ['<h2 className="text-lg font-bold text-foreground">Utilizadores</h2>', '<h2 className="text-lg font-bold text-foreground">{tr("utilizadores.section_title")}</h2>'],
  ['? `A mostrar ${filteredUsers.length} de ${users.length}`\n                  : `Total: ${users.length}`', '? tr("utilizadores.summary_filtered", { shown: filteredUsers.length, total: users.length })\n                  : tr("utilizadores.summary_total", { count: users.length })'],
  ['aria-label="Pesquisar utilizadores"', 'aria-label={tr("utilizadores.search_aria")}'],
  ['placeholder="Nome, email, telefone ou função…"', 'placeholder={tr("utilizadores.search_placeholder")}'],
  ['Novo utilizador', '{tr("utilizadores.btn_new")}'],
  ['<th className="py-4 pl-5 pr-4 font-semibold">Nome</th>', '<th className="py-4 pl-5 pr-4 font-semibold">{tr("utilizadores.col_name")}</th>'],
  ['<th className="py-4 pr-4 font-semibold">Telefone</th>', '<th className="py-4 pr-4 font-semibold">{tr("utilizadores.col_phone")}</th>'],
  ['<th className="py-4 pr-4 font-semibold">Função</th>', '<th className="py-4 pr-4 font-semibold">{tr("utilizadores.col_role")}</th>'],
  ['<th className="py-4 pr-4 font-semibold">Estado</th>', '<th className="py-4 pr-4 font-semibold">{tr("utilizadores.col_status")}</th>'],
  ['<th className="py-4 pr-5 font-semibold text-right">Acções</th>', '<th className="py-4 pr-5 font-semibold text-right">{tr("utilizadores.col_actions")}</th>'],
  ['{u.phone || "—"}', '{u.phone || tr("shared.em_dash")}'],
  ['title="Editar"', 'title={tr("utilizadores.action_edit_title")}'],
  ['title="Remover"', 'title={tr("utilizadores.action_remove_title")}'],
  ['Sem utilizadores.', '{tr("utilizadores.empty")}'],
  ['Nenhum utilizador corresponde à pesquisa.', '{tr("utilizadores.empty_search")}'],
  ['title="Permissões" desc="Por função ou por utilizador pode editar e gravar. No separador «Permissões personalizadas» pode apagar o que foi gravado e voltar aos padrões herdados."', 'title={tr("permissoes.section_title")} desc={tr("permissoes.section_desc")}'],
  ['Por Função', '{tr("permissoes.tab_role")}'],
  ['Por Utilizador', '{tr("permissoes.tab_user")}'],
  ['Permissões personalizadas', '{tr("permissoes.tab_custom")}'],
  ['Administradores têm sempre todas as permissões.', '{tr("permissoes.admin_always_full")}'],
  ['Aqui pode apagar na base de dados as permissões que foram gravadas anteriormente para uma{" "}\n                  <strong className="text-foreground">função</strong> ou para um <strong className="text-foreground">utilizador</strong>.\n                  Ao remover esses registos, a aplicação volta a usar as <strong className="text-foreground">regras padrão por função</strong> ou a\n                  combinação <strong className="text-foreground">função mais herança do utilizador</strong>, como antes de gravar nos outros separadores.', '{tr("permissoes.custom_intro")}'],
  ['<h3 className="text-base font-semibold text-foreground">Permissões personalizadas por função</h3>', '<h3 className="text-base font-semibold text-foreground">{tr("permissoes.custom_role_title")}</h3>'],
  ['Remove todas as linhas guardadas para a função escolhida nesta escola («Por função»). Os valores definidos pela aplicação para cada função voltam a aplicar‑se por omissão.', '{tr("permissoes.custom_role_desc")}'],
  ['<span>Registos gravados nesta escola para esta função: a carregar…</span>', '<span>{tr("permissoes.custom_role_count_loading")}</span>'],
  ['<span>Sem registos aplicáveis: administradores têm sempre acesso total na aplicação.</span>', '<span>{tr("permissoes.custom_role_count_admin_none")}</span>'],
  ['Registos gravados nesta escola para esta função:', '{tr("permissoes.custom_role_count", { count: storedRolePermRows })}'],
  ['Remover personalização da função', '{tr("permissoes.btn_clear_role")}'],
  ['<h3 className="text-base font-semibold text-foreground">Permissões personalizadas por utilizador</h3>', '<h3 className="text-base font-semibold text-foreground">{tr("permissoes.custom_user_title")}</h3>'],
  ['Remove as sobrescritas gravadas para o utilizador («Por utilizador»). Voltam a aplicar‑se apenas a função e as regras padrão, sem sobrescritas por módulo.', '{tr("permissoes.custom_user_desc")}'],
  ['label="Utilizador"', 'label={tr("permissoes.field_user")}'],
  ['<option value="">— Selecione —</option>', '<option value="">{tr("shared.select_placeholder")}</option>'],
  ['<span>Selecione um utilizador para ver quantas permissões personalizadas estão gravadas.</span>', '<span>{tr("permissoes.custom_user_hint_select")}</span>'],
  ['<span>Registos personalizados para este utilizador: a carregar…</span>', '<span>{tr("permissoes.custom_user_count_loading")}</span>'],
  ['Registos personalizados para este utilizador:', '{tr("permissoes.custom_user_count", { count: storedUserPermRows })}'],
  ['Remover personalização do utilizador', '{tr("permissoes.btn_clear_user")}'],
  ['title="Notificações" desc="Configure que notificações são enviadas aos utilizadores de cada função."', 'title={tr("notificacoes.section_title")} desc={tr("notificacoes.section_desc")}'],
  ['Será aplicado a {memoizedUsersForNotif} utilizador(es) ativo(s) com a função {roleLabel(notifRole)}.', '{tr("notificacoes.apply_hint", { count: memoizedUsersForNotif, role: roleLabel(notifRole) })}'],
  ['title="Encarregados e descontos"\n              desc="Modo de cobrança dos encarregados na app, descontos por número de dependentes na família e descontos manuais por aluno (afectam a geração de propinas)."', 'title={tr("faturacao.billing_discounts.section_title")}\n              desc={tr("faturacao.billing_discounts.section_desc")}'],
  ['title="Ciclo de Pagamento" desc="Escolha como prefere ser cobrado pela plataforma."', 'title={tr("faturacao.cycle.section_title")} desc={tr("faturacao.cycle.section_desc")}'],
  ['{c === "SEMESTRAL" ? "Semestral" : "Anual"}', '{c === "SEMESTRAL" ? tr("faturacao.cycle.semestral_title") : tr("faturacao.cycle.anual_title")}'],
  ['{c === "SEMESTRAL" ? "Pagamento a cada 6 meses" : "Pagamento uma vez por ano"}', '{c === "SEMESTRAL" ? tr("faturacao.cycle.semestral_desc") : tr("faturacao.cycle.anual_desc")}'],
  ['Selecionado', '{tr("faturacao.cycle.selected")}'],
  ['<h2 className="text-lg font-bold text-foreground">Faturas da Escola</h2>', '<h2 className="text-lg font-bold text-foreground">{tr("faturacao.invoices.section_title")}</h2>'],
  ['Pagamentos efetuados pela escola à plataforma Edukamba.', '{tr("faturacao.invoices.section_desc")}'],
  ['<th className="py-4 pl-5 pr-4 font-semibold">Nº</th>', '<th className="py-4 pl-5 pr-4 font-semibold">{tr("faturacao.invoices.col_number")}</th>'],
  ['<th className="py-4 pr-4 font-semibold">Emissão</th>', '<th className="py-4 pr-4 font-semibold">{tr("faturacao.invoices.col_issue")}</th>'],
  ['<th className="py-4 pr-4 font-semibold">Vencimento</th>', '<th className="py-4 pr-4 font-semibold">{tr("faturacao.invoices.col_due")}</th>'],
  ['<th className="py-4 pr-4 font-semibold">Valor</th>', '<th className="py-4 pr-4 font-semibold">{tr("faturacao.invoices.col_amount")}</th>'],
  ['<th className="py-4 pr-4 font-semibold">Estado</th>', '<th className="py-4 pr-4 font-semibold">{tr("faturacao.invoices.col_status")}</th>'],
  ['<th className="py-4 pr-5 font-semibold text-right">Ações</th>', '<th className="py-4 pr-5 font-semibold text-right">{tr("faturacao.invoices.col_actions")}</th>'],
  ['? "Pago"\n                              : inv.status === "overdue"\n                                ? "Em atraso"\n                                : inv.status === "submitted"\n                                  ? "A validar"\n                                  : "Pendente"', '? tr("faturacao.invoices.status_paid")\n                              : inv.status === "overdue"\n                                ? tr("faturacao.invoices.status_overdue")\n                                : inv.status === "submitted"\n                                  ? tr("faturacao.invoices.status_submitted")\n                                  : tr("faturacao.invoices.status_pending")'],
  ['Ver comprovativo', '{tr("faturacao.invoices.btn_view_proof")}'],
  ['{inv.proof_url ? "Substituir" : "Anexar comprovativo"}', '{inv.proof_url ? tr("faturacao.invoices.btn_replace_proof") : tr("faturacao.invoices.btn_attach_proof")}'],
  ['Sem faturas registadas.', '{tr("faturacao.invoices.empty")}'],
  ['<h2 className="text-lg font-bold text-foreground">Acesso restrito</h2>', '<h2 className="text-lg font-bold text-foreground">{tr("auditoria.restricted_title")}</h2>'],
  ['Apenas administradores ou diretores da escola podem consultar os logs de auditoria.', '{tr("auditoria.restricted_desc")}'],
  ['<h3 className="text-lg font-bold text-foreground">Editar Utilizador</h3>', '<h3 className="text-lg font-bold text-foreground">{tr("modals.edit_user.title")}</h3>'],
  ['label="Nome completo" icon={UsersIcon}', 'label={tr("modals.edit_user.field_name")} icon={UsersIcon}'],
  ['label="Email (início de sessão)" icon={Mail}', 'label={tr("modals.edit_user.field_email")} icon={Mail}'],
  ['Ao alterar, este passa a ser o email utilizado para iniciar sessão em todo o Edukamba.', '{tr("modals.edit_user.email_help")}'],
  ['label="Telefone" icon={Phone}', 'label={tr("modals.edit_user.field_phone")} icon={Phone}'],
  ['Cancelar', '{tr("shared.cancel")}'],
  ['Guardar', '{tr("shared.guardar")}'],
  ['<h3 className="text-lg font-bold text-foreground">Anexar comprovativo</h3>', '<h3 className="text-lg font-bold text-foreground">{tr("modals.proof.title")}</h3>'],
  ['Fatura <span className="font-medium text-foreground">{proofInvoice.invoice_number}</span> ·{" "}', '{tr("modals.proof.invoice_line", { number: proofInvoice.invoice_number, amount: formatCurrency(Number(proofInvoice.amount), proofInvoice.currency) })}'],
  ['label="Método de pagamento" icon={CreditCard}', 'label={tr("modals.proof.field_method")} icon={CreditCard}'],
  ['<option value="transferencia">Transferência bancária</option>', '<option value="transferencia">{tr("modals.proof.method_transfer")}</option>'],
  ['<option value="multibanco">Multibanco</option>', '<option value="multibanco">{tr("modals.proof.method_mb")}</option>'],
  ['<option value="mbway">MB WAY</option>', '<option value="mbway">{tr("modals.proof.method_mbway")}</option>'],
  ['<option value="numerario">Numerário</option>', '<option value="numerario">{tr("modals.proof.method_cash")}</option>'],
  ['<option value="outro">Outro</option>', '<option value="outro">{tr("modals.proof.method_other")}</option>'],
  ['label="Ficheiro do comprovativo" icon={FileText}', 'label={tr("modals.proof.field_file")} icon={FileText}'],
  ['label="Notas (opcional)"', 'label={tr("modals.proof.field_notes")}'],
  ['placeholder="Referência da transferência, data, etc."', 'placeholder={tr("modals.proof.notes_placeholder")}'],
  ['Enviar para validação', '{tr("modals.proof.btn_submit")}'],
  ['<h3 className="text-lg font-bold text-foreground">Remover utilizador</h3>', '<h3 className="text-lg font-bold text-foreground">{tr("modals.remove_user.title")}</h3>'],
  ['O utilizador será desativado e perderá imediatamente o acesso ao Edukamba. Esta ação pode ser revertida\n                reativando o utilizador.', '{tr("modals.remove_user.body")}'],
  ['Remover', '{tr("shared.remover")}'],
  ['<h3 className="text-lg font-bold text-foreground">Eliminar ano letivo</h3>', '<h3 className="text-lg font-bold text-foreground">{tr("modals.delete_year.title")}</h3>'],
  ['Vai eliminar o ano letivo{" "}', '{tr("modals.delete_year.body", { label: years.find((y) => y.id === confirmDeleteYearId)?.label ?? "" }).split(years.find((y) => y.id === confirmDeleteYearId)?.label ?? "")[0]}'],
  ['Eliminar', '{tr("shared.eliminar")}'],
];

// Fix delete year modal manually - the above split is wrong, skip last broken one
pairs.pop();

for (const [from, to] of pairs) {
  if (!s.includes(from)) {
    // try without strict match for some
    continue;
  }
  s = s.split(from).join(to);
}

// Delete year modal - custom fix
s = s.replace(
  /<h3 className="text-lg font-bold text-foreground">Eliminar ano letivo<\/h3>\s*<p className="mt-2 text-sm text-muted-foreground">\s*Vai eliminar o ano letivo\{" "\}\s*<span className="font-semibold text-foreground">\s*\{years\.find\(\(y\) => y\.id === confirmDeleteYearId\)\?\.label\}\s*<\/span>\s*\. Só é possível eliminar se não existirem turmas, matrículas, avaliações ou outros dados associados\.\s*<\/p>/,
  `<h3 className="text-lg font-bold text-foreground">{tr("modals.delete_year.title")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {tr("modals.delete_year.body", {
                  label: years.find((y) => y.id === confirmDeleteYearId)?.label ?? "",
                })}
              </p>`,
);

// Proof invoice line fix if broken
s = s.replace(
  /<p className="mt-1 text-sm text-muted-foreground">\s*\{tr\("modals\.proof\.invoice_line"[\s\S]*?<\/p>/,
  `<p className="mt-1 text-sm text-muted-foreground">
                {tr("modals.proof.invoice_line", {
                  number: proofInvoice.invoice_number,
                  amount: formatCurrency(Number(proofInvoice.amount), proofInvoice.currency),
                })}
              </p>`,
);

fs.writeFileSync(path, s);
console.log("JSX replacements done");
