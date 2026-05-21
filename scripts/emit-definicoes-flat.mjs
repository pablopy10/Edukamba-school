import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ORDER = [
  "professores",
  "alunos",
  "matriculas",
  "cursos",
  "turmas",
  "disciplinas",
  "educadores",
  "presencas",
  "horario",
  "avaliacoes",
  "notas",
  "eventos",
  "propinas",
  "extracurriculares",
  "transportes",
  "refeicoes",
  "pedidos",
  "material",
  "documentos",
  "financas",
  "relatorios",
  "timesheet",
];

/** @type {Record<string, { pt: { label: string; desc: string }; en: { label: string; desc: string }; fr: { label: string; desc: string } }>} */
const ROUTE_MODULES = {
  professores: {
    pt: { label: "Professores", desc: "Gestão dos professores e docentes da escola." },
    en: { label: "Teachers", desc: "Manage the school’s teachers and instructors." },
    fr: { label: "Enseignants", desc: "Gestion des enseignants et du personnel enseignant." },
  },
  alunos: {
    pt: { label: "Alunos", desc: "Lista, fichas e perfis dos alunos." },
    en: { label: "Students", desc: "Directory, records, and student profiles." },
    fr: { label: "Élèves", desc: "Liste, dossiers et profils des élèves." },
  },
  matriculas: {
    pt: { label: "Matrículas", desc: "Inscrições e renovações dos alunos." },
    en: { label: "Enrolments", desc: "Student enrolments and renewals." },
    fr: { label: "Inscriptions", desc: "Inscriptions et renouvellements des élèves." },
  },
  cursos: {
    pt: { label: "Cursos", desc: "Catálogo de cursos oferecidos." },
    en: { label: "Courses", desc: "Catalogue of courses offered." },
    fr: { label: "Cours", desc: "Catalogue des cours proposés." },
  },
  turmas: {
    pt: { label: "Turmas", desc: "Organização das turmas por ano e curso." },
    en: { label: "Classes", desc: "Class organization by year and course." },
    fr: { label: "Classes", desc: "Organisation des classes par année et par cours." },
  },
  disciplinas: {
    pt: { label: "Disciplinas", desc: "Disciplinas lecionadas em cada curso." },
    en: { label: "Subjects", desc: "Subjects taught in each course." },
    fr: { label: "Matières", desc: "Matières enseignées dans chaque cours." },
  },
  educadores: {
    pt: { label: "Educadores", desc: "Pessoal de apoio educativo." },
    en: { label: "Educators", desc: "Educational support staff." },
    fr: { label: "Éducateurs", desc: "Personnel d’accompagnement éducatif." },
  },
  presencas: {
    pt: { label: "Presenças", desc: "Registo diário de presenças dos alunos." },
    en: { label: "Attendance", desc: "Daily attendance for students." },
    fr: { label: "Présences", desc: "Suivi quotidien des présences des élèves." },
  },
  horario: {
    pt: { label: "Horário", desc: "Horário das turmas e dos professores." },
    en: { label: "Timetable", desc: "Timetables for classes and teachers." },
    fr: { label: "Emploi du temps", desc: "Emplois du temps des classes et des enseignants." },
  },
  avaliacoes: {
    pt: { label: "Avaliações", desc: "Testes, exames e trabalhos avaliados." },
    en: { label: "Assessments", desc: "Tests, exams, and graded work." },
    fr: { label: "Évaluations", desc: "Tests, examens et travaux notés." },
  },
  notas: {
    pt: { label: "Notas", desc: "Consulta de notas por turma e disciplina." },
    en: { label: "Grades", desc: "View grades by class and subject." },
    fr: { label: "Notes", desc: "Consultation des notes par classe et matière." },
  },
  eventos: {
    pt: { label: "Eventos", desc: "Eventos escolares e calendário institucional." },
    en: { label: "Events", desc: "School events and institutional calendar." },
    fr: { label: "Événements", desc: "Événements scolaires et calendrier institutionnel." },
  },
  propinas: {
    pt: { label: "Propinas", desc: "Regras de cobrança, lista de propinas, validação e lembretes." },
    en: { label: "School fees", desc: "Billing rules, fee list, validation, and reminders." },
    fr: { label: "Frais de scolarité", desc: "Règles de facturation, liste des échéances, validation et rappels." },
  },
  extracurriculares: {
    pt: { label: "Extracurriculares", desc: "Atividades fora do plano curricular." },
    en: { label: "Extracurricular", desc: "Activities outside the core curriculum." },
    fr: { label: "L’extrascolaire", desc: "Activités hors programme officiel." },
  },
  transportes: {
    pt: { label: "Transporte", desc: "Giros escolares, paragens, inscrições e mensalidade do transporte." },
    en: { label: "Transport", desc: "Routes, stops, enrolments, and transport billing." },
    fr: { label: "Transport", desc: "Services, arrêts, inscriptions et facturation du transport." },
  },
  refeicoes: {
    pt: { label: "Refeições", desc: "Planos do refeitório, regras de cobrança, inscrições e pagamentos." },
    en: { label: "Meals", desc: "Canteen plans, billing rules, sign‑ups, and payments." },
    fr: { label: "Restauration", desc: "Plans de cantine, règles de facturation, inscriptions et paiements." },
  },
  pedidos: {
    pt: { label: "Pedidos", desc: "Pedidos de ausência e aprovações." },
    en: { label: "Requests", desc: "Absence requests and approvals." },
    fr: { label: "Demandes", desc: "Demandes d’absence et approbations." },
  },
  material: {
    pt: { label: "Material", desc: "Stock e pedidos de material escolar." },
    en: { label: "Supplies", desc: "Inventory and supply requests." },
    fr: { label: "Matériel", desc: "Stock et demandes de fournitures." },
  },
  documentos: {
    pt: { label: "Documentos", desc: "Documentos escolares, pedidos de assinatura e formulários." },
    en: { label: "Documents", desc: "School documents, signature requests, and forms." },
    fr: { label: "Documents", desc: "Documents officiels, demandes de signature et formulaires." },
  },
  financas: {
    pt: { label: "Finanças", desc: "Despesas, receitas e gráficos de lucro." },
    en: { label: "Finance", desc: "Expenses, income, and profit insights." },
    fr: { label: "Finances", desc: "Dépenses, recettes et indicateurs de rentabilité." },
  },
  relatorios: {
    pt: { label: "Relatórios", desc: "Exportações e análises da escola." },
    en: { label: "Reports", desc: "Exports and school analytics." },
    fr: { label: "Rapports", desc: "Exports et analyses de l’établissement." },
  },
  timesheet: {
    pt: { label: "Timesheet", desc: "Controlo de horas dos funcionários." },
    en: { label: "Timesheet", desc: "Staff hour tracking." },
    fr: { label: "Timesheet", desc: "Suivi des heures du personnel." },
  },
};

const ADMIN_EXTRA = {
  modulos: {
    pt: { label: "Visibilidade de módulos", desc: "Ativar ou ocultar módulos do menu consoante o plano (administradores)." },
    en: { label: "Module visibility", desc: "Show or hide menu modules according to the plan (admins)." },
    fr: { label: "Visibilité des modules", desc: "Afficher ou masquer les modules du menu selon le forfait (administrateurs)." },
  },
  definicoes: {
    pt: { label: "Escola na cloud", desc: "Instituição, marca visual e SaaS (exclusivo de administradores)." },
    en: { label: "Cloud school settings", desc: "Institution, brand, and SaaS (admins only)." },
    fr: { label: "École dans le cloud", desc: "Institution, identité visuelle et SaaS (réservé aux administrateurs)." },
  },
};

function addModules(flatPt, flatEn, flatFr) {
  for (const key of ORDER) {
    const m = ROUTE_MODULES[key];
    flatPt[`modules.${key}.label`] = m.pt.label;
    flatPt[`modules.${key}.desc`] = m.pt.desc;
    flatEn[`modules.${key}.label`] = m.en.label;
    flatEn[`modules.${key}.desc`] = m.en.desc;
    flatFr[`modules.${key}.label`] = m.fr.label;
    flatFr[`modules.${key}.desc`] = m.fr.desc;
  }
  for (const key of ["modulos", "definicoes"]) {
    const m = ADMIN_EXTRA[key];
    flatPt[`modules.${key}.label`] = m.pt.label;
    flatPt[`modules.${key}.desc`] = m.pt.desc;
    flatEn[`modules.${key}.label`] = m.en.label;
    flatEn[`modules.${key}.desc`] = m.en.desc;
    flatFr[`modules.${key}.label`] = m.fr.label;
    flatFr[`modules.${key}.desc`] = m.fr.desc;
  }
}

/** @type {Record<string, { pt: string; en: string; fr: string }>} */
const ROLE_TR = {
  SUPER_ADMIN: { pt: "Super Admin", en: "Super Admin", fr: "Super admin" },
  ADMIN: { pt: "Administrador", en: "Administrator", fr: "Administrateur" },
  DIRECTOR: { pt: "Director", en: "Principal", fr: "Directeur" },
  SECRETARY: { pt: "Secretaria", en: "Secretary", fr: "Secrétariat" },
  TREASURER: { pt: "Tesoureiro", en: "Treasurer", fr: "Trésorier" },
  LIBRARIAN: { pt: "Bibliotecário", en: "Librarian", fr: "Bibliothécaire" },
  STOCK_MANAGER: { pt: "Gestor de stock", en: "Stock manager", fr: "Gestionnaire de stock" },
  RECEPTIONIST: { pt: "Rececionista", en: "Receptionist", fr: "Réceptionniste" },
  TEACHER: { pt: "Professor", en: "Teacher", fr: "Enseignant" },
  PARENT: { pt: "Encarregado", en: "Guardian", fr: "Responsable" },
  STUDENT: { pt: "Aluno", en: "Student", fr: "Élève" },
};

function addRoles(flatPt, flatEn, flatFr) {
  for (const [k, v] of Object.entries(ROLE_TR)) {
    flatPt[`roles.${k}`] = v.pt;
    flatEn[`roles.${k}`] = v.en;
    flatFr[`roles.${k}`] = v.fr;
  }
}

/** @type {Record<string, { pt: string; en: string; fr: string }>} */
const AUDIT_TABLES = {
  students: { pt: "Alunos", en: "Students", fr: "Élèves" },
  teachers: { pt: "Professores", en: "Teachers", fr: "Enseignants" },
  guardians: { pt: "Encarregados", en: "Guardians", fr: "Responsables légaux" },
  classrooms: { pt: "Turmas", en: "Classes", fr: "Classes" },
  courses: { pt: "Cursos", en: "Courses", fr: "Cours" },
  subjects: { pt: "Disciplinas", en: "Subjects", fr: "Matières" },
  enrollments: { pt: "Matrículas", en: "Enrolments", fr: "Inscriptions" },
  academic_years: { pt: "Anos lectivos", en: "Academic years", fr: "Années scolaires" },
  academic_terms: { pt: "Períodos", en: "Terms", fr: "Périodes" },
  schedules: { pt: "Horários", en: "Schedules", fr: "Horaires" },
  time_slots: { pt: "Blocos horários", en: "Time slots", fr: "Créneaux" },
  assessments: { pt: "Avaliações", en: "Assessments", fr: "Évaluations" },
  grades: { pt: "Notas", en: "Grades", fr: "Notes" },
  attendance: { pt: "Presenças", en: "Attendance", fr: "Présences" },
  events: { pt: "Eventos", en: "Events", fr: "Événements" },
  extracurricular_activities: { pt: "Actividades extracurriculares", en: "Extracurricular activities", fr: "Activités extrascolaires" },
  extracurricular_enrollments: { pt: "Inscrições extracurriculares", en: "Extracurricular enrolments", fr: "Inscriptions extrascolaires" },
  payments: { pt: "Pagamentos", en: "Payments", fr: "Paiements" },
  student_fees: { pt: "Mensalidades", en: "Fees", fr: "Frais récurrents" },
  fee_rules: { pt: "Regras de cobranças", en: "Billing rules", fr: "Règles de facturation" },
  fee_categories: { pt: "Categorias de propinas", en: "Fee categories", fr: "Catégories de frais" },
  family_discount_rules: { pt: "Descontos por familiar", en: "Family discounts", fr: "Remises familiales" },
  activity_fees: { pt: "Taxas de actividades", en: "Activity fees", fr: "Frais d’activités" },
  transport_fees: { pt: "Taxas de transporte", en: "Transport fees", fr: "Frais de transport" },
  expenses: { pt: "Despesas", en: "Expenses", fr: "Dépenses" },
  recurring_expenses: { pt: "Despesas recorrentes", en: "Recurring expenses", fr: "Dépenses récurrentes" },
  expense_categories: { pt: "Categorias de despesa", en: "Expense categories", fr: "Catégories de dépense" },
  materials: { pt: "Materiais", en: "Supplies", fr: "Matériels" },
  material_requests: { pt: "Pedidos de material", en: "Supply requests", fr: "Demandes de matériel" },
  transport_routes: { pt: "Rotas de transporte", en: "Routes", fr: "Itinéraires" },
  transport_stops: { pt: "Paragens de transporte", en: "Stops", fr: "Arrêts" },
  transport_enrollments: { pt: "Inscrições em transporte", en: "Transport enrolments", fr: "Inscriptions transport" },
  school_settings: { pt: "Definições da escola", en: "School settings", fr: "Paramètres de l’établissement" },
  schools: { pt: "Escola", en: "School", fr: "École" },
  module_authorization_submissions: { pt: "Autorizações (submissões)", en: "Authorisations (submissions)", fr: "Autorisations (soumissions)" },
};

function addAudit(flatPt, flatEn, flatFr) {
  for (const [k, v] of Object.entries(AUDIT_TABLES)) {
    flatPt[`audit.tables.${k}`] = v.pt;
    flatEn[`audit.tables.${k}`] = v.en;
    flatFr[`audit.tables.${k}`] = v.fr;
  }
  const actions = {
    INSERT: { pt: "Criação", en: "Create", fr: "Création" },
    UPDATE: { pt: "Alteração", en: "Update", fr: "Modification" },
    DELETE: { pt: "Eliminação", en: "Delete", fr: "Suppression" },
  };
  for (const [k, v] of Object.entries(actions)) {
    flatPt[`audit.actions.${k}`] = v.pt;
    flatEn[`audit.actions.${k}`] = v.en;
    flatFr[`audit.actions.${k}`] = v.fr;
  }
  flatPt["audit.diff.fields_defined"] = "{{count}} campos definidos";
  flatEn["audit.diff.fields_defined"] = "{{count}} fields set";
  flatFr["audit.diff.fields_defined"] = "{{count}} champs définis";
  flatPt["audit.diff.record_deleted"] = "Registo eliminado";
  flatEn["audit.diff.record_deleted"] = "Record deleted";
  flatFr["audit.diff.record_deleted"] = "Enregistrement supprimé";
  flatPt["audit.diff.no_relevant"] = "Sem alterações relevantes";
  flatEn["audit.diff.no_relevant"] = "No relevant changes";
  flatFr["audit.diff.no_relevant"] = "Pas de changements pertinents";
}

/** Triple helper */
function T(pt, en, fr) {
  return { pt, en, fr };
}

function buildCore() {
  /** @type {Record<string,string>} */
  const pt = {};
  const en = {};
  const fr = {};

  const put = (key, triple) => {
    pt[key] = triple.pt;
    en[key] = triple.en;
    fr[key] = triple.fr;
  };

  // page_header
  put(
    "page_header.title",
    T("Definições", "Settings", "Paramètres"),
  );
  put(
    "page_header.subtitle",
    T(
      "Faça a gestão das definições gerais da escola, marca, utilizadores e permissões.",
      "Manage your school’s general settings, brand, users, and permissions.",
      "Gérez les réglages généraux de l’établissement, l’identité visuelle, les utilisateurs et les permissions.",
    ),
  );
  put(
    "page_header.director_notice",
    T(
      "Como director gere utilizadores e permissões. Alterações à marca, dados da instituição e fatura Edukamba ficam apenas com o administrador.",
      "As principal you manage users and permissions. Brand, institution data, and Edukamba invoicing remain admin-only.",
      "En tant que directeur, vous gérez les utilisateurs et les permissions. La marque, les données de l’institution et la facturation Edukamba restent réservées à l’administrateur.",
    ),
  );

  // tabs
  const tabs = {
    escola: T("Escola", "School", "École"),
    marca: T("Marca", "Brand", "Marque"),
    academico: T("Académico", "Academic", "Académique"),
    utilizadores: T("Utilizadores", "Users", "Utilisateurs"),
    permissoes: T("Permissões", "Permissions", "Permissions"),
    notificacoes: T("Notificações", "Notifications", "Notifications"),
    faturacao: T("Faturação", "Billing", "Facturation"),
    auditoria: T("Auditoria", "Audit", "Audit"),
  };
  for (const [k, v] of Object.entries(tabs)) put(`tabs.${k}`, v);

  // shared
  put("shared.save_changes", T("Guardar Alterações", "Save changes", "Enregistrer les modifications"));
  put("shared.cancel", T("Cancelar", "Cancel", "Annuler"));
  put("shared.guardar", T("Guardar", "Save", "Enregistrer"));
  put("shared.atualizar", T("Atualizar", "Update", "Mettre à jour"));
  put("shared.carregar", T("Carregar", "Upload", "Téléverser"));
  put("shared.eliminar", T("Eliminar", "Delete", "Supprimer"));
  put("shared.remover", T("Remover", "Remove", "Retirer"));
  put("shared.active_suffix", T(" · ativo", " · active", " · actif"));
  put("shared.em_dash", T("—", "—", "—"));
  put("shared.select_placeholder", T("— Selecione —", "— Select —", "— Sélectionner —"));
  put("shared.logo_alt", T("Logo", "Logo", "Logo"));
  put("shared.nao_aplicavel", T("—", "—", "—"));

  // escola
  put("escola.section_title", T("Informações da Escola", "School information", "Informations sur l’école"));
  put(
    "escola.section_desc",
    T("Estes dados são usados em documentos, faturas e na app.", "These details appear on documents, invoices, and in the app.", "Ces données figurent sur les documents, les factures et dans l’application."),
  );
  put("escola.field_name", T("Nome da escola", "School name", "Nom de l’école"));
  put("escola.field_nif", T("NIF / Tax ID", "Tax ID", "N° fiscal / ID fiscal"));
  put("escola.field_address", T("Morada", "Address", "Adresse"));

  // marca
  put("marca.section_title", T("Marca e Identidade Visual", "Brand & visual identity", "Marque et identité visuelle"));
  put("marca.section_desc", T("Logotipo e cores que aparecem em toda a app.", "Logo and colors shown across the app.", "Logo et couleurs affichés dans toute l’application."));
  put("marca.logo_title", T("Logotipo", "Logo", "Logo"));
  put("marca.logo_hint", T("PNG ou SVG · até 2MB", "PNG or SVG · up to 2MB", "PNG ou SVG · jusqu’à 2 Mo"));
  put("marca.primary_color", T("Cor primária", "Primary colour", "Couleur principale"));
  put("marca.secondary_color", T("Cor secundária", "Secondary colour", "Couleur secondaire"));

  // academico — years
  put("academico.years.section_title", T("Anos letivos", "Academic years", "Années scolaires"));
  put(
    "academico.years.section_desc",
    T(
      "Crie, edite ou elimine os anos letivos da escola. O ano selecionado é usado em toda a aplicação para filtrar a informação.",
      "Create, edit, or delete academic years. The selected year filters data across the app.",
      "Créez, modifiez ou supprimez les années scolaires. L’année sélectionnée filtre les données dans toute l’application.",
    ),
  );
  put("academico.years.field_editing_year", T("Ano em edição", "Year being edited", "Année en cours d’édition"));
  put("academico.years.placeholder_no_years", T("Sem anos letivos criados", "No academic years yet", "Aucune année scolaire créée"));
  put("academico.years.btn_new", T("Novo ano letivo", "New academic year", "Nouvelle année scolaire"));
  put("academico.years.btn_delete", T("Eliminar", "Delete", "Supprimer"));
  put("academico.years.title_cannot_delete_active", T("Não é possível eliminar o ano letivo ativo.", "You can’t delete the active academic year.", "Impossible de supprimer l’année scolaire active."));
  put("academico.years.title_delete", T("Eliminar ano letivo", "Delete academic year", "Supprimer l’année scolaire"));
  put("academico.years.empty_state", T("Sem anos letivos criados. Clique em \"Novo ano letivo\" para começar.", "No academic years yet. Click “New academic year” to start.", "Aucune année scolaire. Cliquez sur « Nouvelle année scolaire » pour commencer."));
  put("academico.years.field_year_label", T("Ano letivo", "Academic year", "Année scolaire"));
  put("academico.years.field_start", T("Início", "Start", "Début"));
  put("academico.years.field_end", T("Fim", "End", "Fin"));
  put("academico.years.btn_make_active", T("Tornar ativo", "Make active", "Définir comme active"));
  put("academico.terms_holidays.section_title", T("Trimestres e Férias", "Terms & holidays", "Trimestres et vacances"));
  put(
    "academico.terms_holidays.section_desc",
    T(
      "Defina as datas dos 1º, 2º e 3º trimestres e marque os períodos de férias dos alunos.",
      "Set dates for terms 1–3 and add student holiday periods.",
      "Définissez les dates des 1er, 2e et 3e trimestres et les périodes de vacances des élèves.",
    ),
  );
  put("academico.wizard.section_title", T("Configuração de Novo Ano Letivo", "New academic year setup", "Configuration d’une nouvelle année scolaire"));
  put(
    "academico.wizard.section_desc",
    T(
      "Crie o próximo ciclo escolar e clone automaticamente a estrutura do ano anterior — turmas, cursos e tabela de preços — sem trabalho manual.",
      "Create the next school year and clone the previous structure—classes, courses, and pricing—automatically.",
      "Créez le prochain cycle et clonez automatiquement la structure de l’année précédente (classes, cours et tarifs).",
    ),
  );
  put("academico.honor_roll.section_title", T("Quadro de Honra", "Honour roll", "Tableau d’honneur"));
  put(
    "academico.honor_roll.section_desc",
    T(
      "Defina a média mínima para um aluno ser considerado no Quadro de Honra e a nota máxima da escala usada pela escola.",
      "Set the minimum average for honour roll and the top of the school’s grading scale.",
      "Définissez la moyenne minimale pour le tableau d’honneur et la note maximale de l’échelle.",
    ),
  );
  put("academico.honor_roll.field_min_avg", T("Média mínima do Quadro de Honra", "Minimum honour-roll average", "Moyenne minimale pour le tableau d’honneur"));
  put("academico.honor_roll.field_max_grade", T("Nota máxima da escala", "Maximum grade on scale", "Note maximale de l’échelle"));
  put("academico.late_fees.section_title", T("Multas por Atraso de Propinas", "Late fee penalties", "Pénalités de retard sur les frais"));
  put(
    "academico.late_fees.section_desc",
    T(
      "Aplicada automaticamente no dia 11 de cada mês a propinas vencidas e ainda não pagas. Pode ser um valor fixo (Kz) ou uma percentagem do valor da propina.",
      "Applied automatically on the 11th for overdue unpaid fees—fixed amount (Kz) or a percentage of the fee.",
      "Appliquée automatiquement le 11 de chaque mois pour les échéances impayées—montant fixe (Kz) ou pourcentage.",
    ),
  );
  put("academico.late_fees.field_charge", T("Cobrar multa por atraso?", "Charge a late penalty?", "Appliquer une pénalité de retard ?"));
  put("academico.late_fees.opt_no", T("Não cobrar", "Don’t charge", "Ne pas facturer"));
  put("academico.late_fees.opt_yes", T("Sim, cobrar multa", "Yes, charge penalty", "Oui, appliquer une pénalité"));
  put("academico.late_fees.field_type", T("Tipo de multa", "Penalty type", "Type de pénalité"));
  put("academico.late_fees.type_fixed", T("Valor fixo (Kz)", "Fixed amount (Kz)", "Montant fixe (Kz)"));
  put("academico.late_fees.type_percentage", T("Percentagem (%)", "Percentage (%)", "Pourcentage (%)"));
  put("academico.late_fees.field_value_pct", T("Percentagem da multa (%)", "Penalty percentage (%)", "Pourcentage de pénalité (%)"));
  put("academico.late_fees.field_value_fixed", T("Valor da multa (Kz)", "Penalty amount (Kz)", "Montant de la pénalité (Kz)"));
  put(
    "academico.late_fees.help",
    T(
      "A multa é aplicada uma única vez por propina em atraso, no dia 11. As propinas pagas antes do vencimento ou já regularizadas não são afetadas.",
      "The penalty applies once per overdue fee on the 11th. On-time or settled fees are unaffected.",
      "La pénalité s’applique une fois par échéance en retard le 11. Les paiements à temps ne sont pas impactés.",
    ),
  );
  put("academico.enrollment_fees.section_title", T("Custos de Matrícula", "Enrolment costs", "Frais d’inscription"));
  put(
    "academico.enrollment_fees.section_desc",
    T(
      "Valores únicos cobrados ao matricular um aluno (nova matrícula) ou ao renovar a matrícula num novo ano letivo. Definir 0 para não cobrar.",
      "One-off amounts for new enrolments or renewals. Set 0 to waive.",
      "Montants uniques pour une nouvelle inscription ou un renouvellement. Mettez 0 pour ne pas facturer.",
    ),
  );
  put("academico.enrollment_fees.field_new", T("Custo da matrícula nova (Kz)", "New enrolment fee (Kz)", "Frais de nouvelle inscription (Kz)"));
  put("academico.enrollment_fees.field_renewal", T("Custo da renovação de matrícula (Kz)", "Renewal fee (Kz)", "Frais de renouvellement (Kz)"));
  put(
    "academico.enrollment_fees.help",
    T(
      "Quando uma matrícula é criada e fica ativa, o custo correspondente é gerado automaticamente em Pagamentos › Matrículas. Os encarregados de educação podem anexar o comprovativo para validação pela administração.",
      "When an enrolment becomes active, the charge is created under Payments › Enrolments. Guardians can attach proof for admin validation.",
      "Lorsqu’une inscription devient active, les frais sont créés dans Paiements › Inscriptions. Les responsables peuvent joindre une preuve pour validation.",
    ),
  );

  // utilizadores
  put("utilizadores.section_title", T("Utilizadores", "Users", "Utilisateurs"));
  put("utilizadores.summary_total", T("Total: {{count}}", "Total: {{count}}", "Total : {{count}}"));
  put("utilizadores.summary_filtered", T("A mostrar {{shown}} de {{total}}", "Showing {{shown}} of {{total}}", "Affichage de {{shown}} sur {{total}}"));
  put("utilizadores.search_aria", T("Pesquisar utilizadores", "Search users", "Rechercher des utilisateurs"));
  put("utilizadores.search_placeholder", T("Nome, email, telefone ou função…", "Name, email, phone, or role…", "Nom, e-mail, téléphone ou fonction…"));
  put("utilizadores.btn_new", T("Novo utilizador", "New user", "Nouvel utilisateur"));
  put("utilizadores.col_name", T("Nome", "Name", "Nom"));
  put("utilizadores.col_phone", T("Telefone", "Phone", "Téléphone"));
  put("utilizadores.col_role", T("Função", "Role", "Fonction"));
  put("utilizadores.col_status", T("Estado", "Status", "État"));
  put("utilizadores.col_actions", T("Acções", "Actions", "Actions"));
  put("utilizadores.status_active", T("Ativo", "Active", "Actif"));
  put("utilizadores.status_inactive", T("Inativo", "Inactive", "Inactif"));
  put("utilizadores.empty", T("Sem utilizadores.", "No users.", "Aucun utilisateur."));
  put("utilizadores.empty_search", T("Nenhum utilizador corresponde à pesquisa.", "No users match your search.", "Aucun utilisateur ne correspond à la recherche."));
  put("utilizadores.action_edit_title", T("Editar", "Edit", "Modifier"));
  put("utilizadores.action_remove_title", T("Remover", "Remove", "Retirer"));

  // permissoes
  put("permissoes.section_title", T("Permissões", "Permissions", "Permissions"));
  put(
    "permissoes.section_desc",
    T(
      "Por função ou por utilizador pode editar e gravar. No separador «Permissões personalizadas» pode apagar o que foi gravado e voltar aos padrões herdados.",
      "Edit and save by role or user. Under “Custom permissions” you can clear saved rows and return to inherited defaults.",
      "Modifiez et enregistrez par fonction ou par utilisateur. Sous « Permissions personnalisées », vous pouvez effacer et revenir aux valeurs héritées.",
    ),
  );
  put("permissoes.tab_role", T("Por Função", "By role", "Par fonction"));
  put("permissoes.tab_user", T("Por Utilizador", "By user", "Par utilisateur"));
  put("permissoes.tab_custom", T("Permissões personalizadas", "Custom permissions", "Permissions personnalisées"));
  put("permissoes.admin_always_full", T("Administradores têm sempre todas as permissões.", "Administrators always have full access.", "Les administrateurs ont toujours tous les accès."));
  put(
    "permissoes.custom_intro",
    T(
      "Aqui pode apagar na base de dados as permissões que foram gravadas anteriormente para uma função ou para um utilizador. Ao remover esses registos, a aplicação volta a usar as regras padrão por função ou a combinação função mais herança do utilizador, como antes de gravar nos outros separadores.",
      "Here you can delete saved permission rows for a role or a user. After removal, the app falls back to default role rules—or role plus inherited user rules—as before other tabs were saved.",
      "Ici vous pouvez supprimer les permissions enregistrées pour une fonction ou un utilisateur. Après suppression, l’application revient aux règles par défaut ou à la combinaison héritée.",
    ),
  );
  put("permissoes.custom_role_title", T("Permissões personalizadas por função", "Custom permissions by role", "Permissions personnalisées par fonction"));
  put(
    "permissoes.custom_role_desc",
    T(
      "Remove todas as linhas guardadas para a função escolhida nesta escola («Por função»). Os valores definidos pela aplicação para cada função voltam a aplicar‑se por omissão.",
      "Deletes all saved rows for the selected role at this school (“By role”). App defaults apply again.",
      "Supprime toutes les lignes enregistrées pour la fonction sélectionnée. Les valeurs par défaut de l’application s’appliquent à nouveau.",
    ),
  );
  put(
    "permissoes.custom_role_count_loading",
    T("Registos gravados nesta escola para esta função: a carregar…", "Saved rows for this role: loading…", "Enregistrements pour cette fonction : chargement…"),
  );
  put(
    "permissoes.custom_role_count_admin_none",
    T("Sem registos aplicáveis: administradores têm sempre acesso total na aplicação.", "No applicable rows: admins always have full access.", "Aucun enregistrement : les administrateurs ont toujours l’accès complet."),
  );
  put(
    "permissoes.custom_role_count",
    T("Registos gravados nesta escola para esta função: {{count}}.", "Saved rows for this role at this school: {{count}}.", "Enregistrements pour cette fonction : {{count}}."),
  );
  put("permissoes.btn_clear_role", T("Remover personalização da função", "Clear role overrides", "Réinitialiser la fonction"));
  put("permissoes.custom_user_title", T("Permissões personalizadas por utilizador", "Custom permissions by user", "Permissions personnalisées par utilisateur"));
  put(
    "permissoes.custom_user_desc",
    T(
      "Remove as sobrescritas gravadas para o utilizador («Por utilizador»). Voltam a aplicar‑se apenas a função e as regras padrão, sem sobrescritas por módulo.",
      "Removes overrides saved for the user (“By user”). Only the role defaults apply, with no per-module overrides.",
      "Supprime les surcharges enregistrées pour l’utilisateur. Seules les règles de la fonction s’appliquent.",
    ),
  );
  put("permissoes.field_user", T("Utilizador", "User", "Utilisateur"));
  put(
    "permissoes.custom_user_hint_select",
    T("Selecione um utilizador para ver quantas permissões personalizadas estão gravadas.", "Select a user to see how many custom rows are saved.", "Sélectionnez un utilisateur pour voir le nombre de permissions personnalisées."),
  );
  put(
    "permissoes.custom_user_count_loading",
    T("Registos personalizados para este utilizador: a carregar…", "Custom rows for this user: loading…", "Enregistrements personnalisés : chargement…"),
  );
  put(
    "permissoes.custom_user_count",
    T("Registos personalizados para este utilizador: {{count}}.", "Custom rows for this user: {{count}}.", "Enregistrements personnalisés : {{count}}."),
  );
  put("permissoes.btn_clear_user", T("Remover personalização do utilizador", "Clear user overrides", "Réinitialiser l’utilisateur"));

  // notificacoes
  put("notificacoes.section_title", T("Notificações", "Notifications", "Notifications"));
  put(
    "notificacoes.section_desc",
    T("Configure que notificações são enviadas aos utilizadores de cada função.", "Choose which notifications are sent to users in each role.", "Choisissez les notifications envoyées pour chaque fonction."),
  );
  put(
    "notificacoes.apply_hint",
    T(
      "Será aplicado a {{count}} utilizador(es) ativo(s) com a função {{role}}.",
      "Will apply to {{count}} active user(s) with role {{role}}.",
      "S’appliquera à {{count}} utilisateur(s) actif(s) avec le rôle {{role}}.",
    ),
  );

  const channels = {
    welcome_email: T("Email de boas-vindas", "Welcome email", "E-mail de bienvenue"),
    enrollment: T("Confirmação de matrícula", "Enrolment confirmation", "Confirmation d’inscription"),
    grade_published: T("Notas publicadas", "Grades published", "Notes publiées"),
    event_reminder: T("Lembretes de eventos", "Event reminders", "Rappels d’événements"),
    absence_alert: T("Alertas de faltas", "Absence alerts", "Alertes d’absence"),
    invoice_issued: T("Faturas emitidas", "Invoices issued", "Factures émises"),
    new_message: T("Nova mensagem no chat", "New chat message", "Nouveau message"),
    complaint_update: T("Atualização de reclamações", "Complaint updates", "Mises à jour des réclamations"),
    material_request: T("Pedidos de material", "Supply requests", "Demandes de matériel"),
    absence_request: T("Pedidos de ausência", "Absence requests", "Demandes d’absence"),
  };
  const channelDesc = {
    welcome_email: T("Enviado quando um utilizador é criado.", "Sent when a user is created.", "Envoyé lors de la création d’un utilisateur."),
    enrollment: T("Enviado ao concluir a matrícula.", "Sent when enrolment completes.", "Envoyé à la fin de l’inscription."),
    grade_published: T("Notificar quando notas forem lançadas.", "Notify when grades are published.", "Notifier lors de la publication des notes."),
    event_reminder: T("Enviar 1 dia antes do evento.", "Send one day before the event.", "Envoyer 1 jour avant l’événement."),
    absence_alert: T("Notificar encarregado em caso de falta.", "Notify guardian if absent.", "Notifier le responsable en cas d’absence."),
    invoice_issued: T("Email automático ao emitir fatura.", "Automatic e-mail when an invoice is issued.", "E-mail automatique à l’émission d’une facture."),
    new_message: T("Notificação ao receber uma mensagem.", "Notification when a message arrives.", "Notification à la réception d’un message."),
    complaint_update: T("Quando o estado de uma reclamação muda.", "When a complaint status changes.", "Lorsque le statut d’une réclamation change."),
    material_request: T("Notificar admin de novos pedidos.", "Notify admins of new requests.", "Notifier les administrateurs des nouvelles demandes."),
    absence_request: T("Notificar admin de novos pedidos.", "Notify admins of new requests.", "Notifier les administrateurs des nouvelles demandes."),
  };
  for (const k of Object.keys(channels)) {
    put(`notificacoes.channels.${k}.label`, channels[k]);
    put(`notificacoes.channels.${k}.desc`, channelDesc[k]);
  }

  // faturacao
  put("faturacao.billing_discounts.section_title", T("Encarregados e descontos", "Guardians & discounts", "Responsables et remises"));
  put(
    "faturacao.billing_discounts.section_desc",
    T(
      "Modo de cobrança dos encarregados na app, descontos por número de dependentes na família e descontos manuais por aluno (afectam a geração de propinas).",
      "How guardians pay in the app, sibling discounts, and per-student overrides (affect fee generation).",
      "Mode de recouvrement auprès des responsables, remises famille et remises manuelles par élève (impactent les frais).",
    ),
  );
  put("faturacao.cycle.section_title", T("Ciclo de Pagamento", "Payment cycle", "Cycle de paiement"));
  put(
    "faturacao.cycle.section_desc",
    T("Escolha como prefere ser cobrado pela plataforma.", "Choose how you prefer to be billed by the platform.", "Choisissez la fréquence de facturation par la plateforme."),
  );
  put("faturacao.cycle.semestral_title", T("Semestral", "Semestral", "Semestriel"));
  put("faturacao.cycle.semestral_desc", T("Pagamento a cada 6 meses", "Billed every 6 months", "Paiement tous les 6 mois"));
  put("faturacao.cycle.anual_title", T("Anual", "Annual", "Annuel"));
  put("faturacao.cycle.anual_desc", T("Pagamento uma vez por ano", "Billed once a year", "Paiement une fois par an"));
  put("faturacao.cycle.selected", T("Selecionado", "Selected", "Sélectionné"));
  put("faturacao.invoices.section_title", T("Faturas da Escola", "School invoices", "Factures de l’établissement"));
  put(
    "faturacao.invoices.section_desc",
    T("Pagamentos efetuados pela escola à plataforma Edukamba.", "Payments made by the school to the Edukamba platform.", "Paiements effectués par l’établissement à la plateforme Edukamba."),
  );
  put("faturacao.invoices.col_number", T("Nº", "No.", "N°"));
  put("faturacao.invoices.col_issue", T("Emissão", "Issued", "Émission"));
  put("faturacao.invoices.col_due", T("Vencimento", "Due", "Échéance"));
  put("faturacao.invoices.col_amount", T("Valor", "Amount", "Montant"));
  put("faturacao.invoices.col_status", T("Estado", "Status", "État"));
  put("faturacao.invoices.col_actions", T("Ações", "Actions", "Actions"));
  put("faturacao.invoices.status_paid", T("Pago", "Paid", "Payé"));
  put("faturacao.invoices.status_overdue", T("Em atraso", "Overdue", "En retard"));
  put("faturacao.invoices.status_submitted", T("A validar", "Pending validation", "En validation"));
  put("faturacao.invoices.status_pending", T("Pendente", "Pending", "En attente"));
  put("faturacao.invoices.btn_view_proof", T("Ver comprovativo", "View proof", "Voir la preuve"));
  put("faturacao.invoices.btn_replace_proof", T("Substituir", "Replace", "Remplacer"));
  put("faturacao.invoices.btn_attach_proof", T("Anexar comprovativo", "Attach proof", "Joindre une preuve"));
  put("faturacao.invoices.empty", T("Sem faturas registadas.", "No invoices yet.", "Aucune facture enregistrée."));

  // auditoria restricted
  put("auditoria.restricted_title", T("Acesso restrito", "Restricted access", "Accès restreint"));
  put(
    "auditoria.restricted_desc",
    T(
      "Apenas administradores ou diretores da escola podem consultar os logs de auditoria.",
      "Only school administrators or principals can view audit logs.",
      "Seuls les administrateurs ou directeurs peuvent consulter les journaux d’audit.",
    ),
  );

  // permissions_table
  put("permissions_table.col_module", T("Módulo", "Module", "Module"));
  put("permissions_table.col_read", T("Ver", "View", "Voir"));
  put("permissions_table.col_write", T("Editar", "Edit", "Modifier"));
  put("permissions_table.col_delete", T("Apagar", "Delete", "Supprimer"));

  // terms (TermsAndHolidaysManager)
  put("terms.defaults.term1", T("1º Trimestre", "1st term", "1er trimestre"));
  put("terms.defaults.term2", T("2º Trimestre", "2nd term", "2e trimestre"));
  put("terms.defaults.term3", T("3º Trimestre", "3rd term", "3e trimestre"));
  put(
    "terms.banner_select_year",
    T(
      "Selecione (ou crie) um ano letivo acima para configurar trimestres e férias específicos desse ano.",
      "Select (or create) an academic year above to configure that year’s terms and holidays.",
      "Sélectionnez (ou créez) une année scolaire ci-dessus pour configurer trimestres et vacances.",
    ),
  );
  put(
    "terms.banner_year_scope",
    T(
      "As datas abaixo aplicam-se apenas ao ano letivo atualmente selecionado. Cada ano letivo (ex.: 2025/2026, 2026/2027) tem a sua própria configuração.",
      "The dates below apply only to the selected academic year. Each year has its own configuration.",
      "Les dates ci-dessous concernent uniquement l’année sélectionnée. Chaque année a sa propre configuration.",
    ),
  );
  put("terms.terms_heading", T("Trimestres", "Terms", "Trimestres"));
  put("terms.terms_badge", T("1º · 2º · 3º", "1st · 2nd · 3rd", "1er · 2e · 3e"));
  put(
    "terms.terms_help",
    T(
      "Configure as datas dos três trimestres do ano letivo. Cada avaliação será automaticamente associada ao trimestre correspondente à sua data.",
      "Set the three term dates. Each assessment is linked to the term matching its date.",
      "Définissez les trois trimestres. Chaque évaluation est rattachée au trimestre correspondant à sa date.",
    ),
  );
  put("terms.label_name", T("Nome", "Name", "Nom"));
  put("terms.label_start", T("Início", "Start", "Début"));
  put("terms.label_end", T("Fim", "End", "Fin"));
  put("terms.term_ordinal_suffix", T("º", "°", "ᵉ"));
  put("terms.btn_remove_term_title", T("Remover trimestre", "Remove term", "Supprimer le trimestre"));
  put("terms.holidays_heading", T("Férias dos alunos", "Student holidays", "Vacances des élèves"));
  put("terms.btn_add_holiday", T("Adicionar férias", "Add holiday", "Ajouter des vacances"));
  put(
    "terms.holidays_help",
    T(
      "Marque períodos de férias para serem visíveis no calendário académico (Natal, Páscoa, Verão, etc.).",
      "Add holiday periods visible in the academic calendar (Christmas, Easter, summer, etc.).",
      "Ajoutez des périodes visibles dans le calendrier (Noël, Pâques, été, etc.).",
    ),
  );
  put("terms.holidays_empty", T("Sem períodos de férias configurados.", "No holiday periods configured.", "Aucune période de vacances configurée."));
  put("terms.action_edit_title", T("Editar", "Edit", "Modifier"));
  put("terms.action_remove_title", T("Remover", "Remove", "Retirer"));
  put("terms.editor_new_title", T("Novas férias", "New holiday", "Nouvelles vacances"));
  put("terms.editor_edit_title", T("Editar férias", "Edit holiday", "Modifier les vacances"));
  put("terms.field_description", T("Descrição (opcional)", "Description (optional)", "Description (facultatif)"));
  put("terms.placeholder_holiday_name", T("Ex: Férias do Natal", "E.g., Christmas break", "Ex. : Vacances de Noël"),
  );
  put("terms.placeholder_holiday_notes", T("Notas internas sobre estas férias", "Internal notes about this break", "Notes internes sur cette période"));

  // wizard (NewAcademicYearWizard)
  put("wizard.labels.year_name", T("Nome do ano", "Year name", "Nom de l’année"));
  put("wizard.placeholders.year_name", T("Ex.: 2026/2027", "E.g., 2026/2027", "Ex. : 2026/2027"));
  put("wizard.labels.start", T("Data de início", "Start date", "Date de début"));
  put("wizard.labels.end", T("Data de fim", "End date", "Date de fin"));
  put("wizard.clone_title", T("Wizard de clonagem", "Cloning wizard", "Assistant de clonage"));
  put("wizard.source_year", T("Ano de origem", "Source year", "Année source"));
  put("wizard.source_placeholder_none", T("Sem anos disponíveis", "No years available", "Aucune année disponible"));
  put("wizard.source_placeholder", T("Seleccionar ano...", "Select year…", "Sélectionner une année…"));
  put("wizard.source_caption", T("Origem:", "Source:", "Source :"));
  put("wizard.set_active", T("Definir como ano letivo ativo", "Set as active academic year", "Définir comme année scolaire active"));
  put("wizard.opt_courses_label", T("Estrutura de Níveis e Cursos", "Levels & courses structure", "Structure des niveaux et cours"));
  put("wizard.opt_courses_desc", T("Mantém os cursos da escola (1ª Classe, 2ª Classe, etc.).", "Keeps the school’s courses (Grade 1, Grade 2, etc.).", "Conserve les cours de l’école (1re classe, 2e classe, etc.)."));
  put("wizard.opt_classrooms_label", T("Turmas", "Classes", "Classes"));
  put(
    "wizard.opt_classrooms_desc",
    T(
      "Copia nomes, períodos e níveis. Sem alunos.",
      "Copies names, periods, and levels. No pupils.",
      "Copie les noms, les périodes et les niveaux. Sans élèves.",
    ),
  );
  put("wizard.opt_fee_rules_label", T("Regras de cobrança", "Billing rules", "Règles de facturation"));
  put(
    "wizard.opt_fee_rules_desc",
    T(
      "Replica valores, recorrências e alvos (inclui turmas clonadas quando aplicável).",
      "Copies amounts, recurrence, and targets (includes cloned classes where applicable).",
      "Réplique montants, récurrence et cibles (y compris les classes clonées le cas échéant).",
    ),
  );
  put("wizard.opt_subjects_label", T("Disciplinas por Classe", "Subjects by class", "Matières par classe"));
  put(
    "wizard.opt_subjects_desc",
    T("Garante a matriz curricular existente.", "Keeps the existing curriculum matrix.", "Préserve la matrice curriculaire existante."),
  );
  put("wizard.progress_title", T("Progresso da migração", "Migration progress", "Progression de la migration"));
  put("wizard.step_create", T("Criar ano letivo", "Create academic year", "Créer l’année scolaire"));
  put("wizard.step_validate_courses", T("Validar cursos", "Validate courses", "Valider les cours"));
  put("wizard.step_validate_subjects", T("Validar disciplinas", "Validate subjects", "Valider les matières"));
  put("wizard.step_clone_classrooms", T("Clonar turmas", "Clone classes", "Cloner les classes"));
  put("wizard.step_clone_fee_rules", T("Clonar regras de cobrança", "Clone billing rules", "Cloner les règles de facturation"));
  put("wizard.step_finish", T("Finalizar", "Finish", "Terminer"));
  put("wizard.result_title", T("Migração concluída", "Migration complete", "Migration terminée"));
  put("wizard.result_courses", T("Cursos", "Courses", "Cours"));
  put("wizard.result_subjects", T("Disciplinas", "Subjects", "Matières"));
  put("wizard.result_classrooms", T("Turmas clonadas", "Classes cloned", "Classes clonées"));
  put("wizard.result_fee_rules", T("Regras de cobrança", "Billing rules", "Règles de facturation"));
  put("wizard.btn_clear", T("Limpar", "Reset", "Effacer"));
  put("wizard.btn_run", T("Criar e migrar", "Create & migrate", "Créer et migrer"));
  put("wizard.btn_running", T("A migrar…", "Migrating…", "Migration…"));

  // billing (BillingEncargadosDiscountsPanel)
  put("billing.panel_title", T("Cobrança aos encarregados", "Guardian billing", "Recouvrement auprès des responsables"));
  put(
    "billing.panel_desc",
    T(
      "Defina como os encarregados interagem com os pagamentos na plataforma. Com comprovativo, o IBAN da escola aparece nos emails de lembrete.",
      "Choose how guardians handle payments in the app. With proof mode, the school IBAN appears in reminder emails.",
      "Définissez comment les responsables gèrent les paiements dans l’app. Avec justificatif, l’IBAN figure dans les e-mails de rappel.",
    ),
  );
  put("billing.field_mode", T("Modo de cobrança", "Billing mode", "Mode de recouvrement"));
  put(
    "billing.mode_proof",
    T(
      "Comprovativo na app / transferência (IBAN + validação pela escola)",
      "Proof in app / bank transfer (IBAN + school validation)",
      "Justificatif dans l’app / virement (IBAN + validation par l’école)",
    ),
  );
  put(
    "billing.mode_in_person",
    T(
      "Pagamento presencial na escola (sem envio de ficheiros pelos encarregados)",
      "Pay in person at school (no file uploads from guardians)",
      "Paiement sur place (pas d’envoi de fichiers par les responsables)",
    ),
  );
  put("billing.field_iban", T("IBAN da escola", "School IBAN", "IBAN de l’établissement"));
  put("billing.iban_placeholder", T("Ex.: AO06 ...", "E.g., AO06 …", "Ex. : AO06 …"));
  put("billing.btn_save_prefs", T("Guardar definições", "Save settings", "Enregistrer les paramètres"));
  put(
    "billing.iban_help",
    T(
      "Aparece no email quando está activo o modo com comprovativo. Opcional mas fortemente recomendado.",
      "Shown in e-mails when proof mode is active. Optional but strongly recommended.",
      "Affiché dans l’e-mail lorsque le mode justificatif est actif. Optionnel mais recommandé.",
    ),
  );
  put("billing.tab_family", T("Descontos por familiar", "Family discounts", "Remises familiales"));
  put("billing.tab_overrides", T("Descontos por aluno", "Per-student discounts", "Remises par élève"));
  put("billing.family_card_title", T("Desconto automático por familiar", "Automatic family discount", "Remise familiale automatique"));
  put(
    "billing.family_card_desc",
    T(
      "Quando um educador tem vários filhos na escola, aplica-se um desconto.",
      "When a guardian has several children at the school, a discount applies.",
      "Lorsqu’un responsable a plusieurs enfants dans l’école, une remise s’applique.",
    ),
  );
  put("billing.btn_new_rule", T("Nova regra", "New rule", "Nouvelle règle"));
  put("billing.family_empty", T("Sem regras definidas.", "No rules defined.", "Aucune règle définie."));
  put("billing.th_sibling_pos", T("Posição do familiar", "Sibling position", "Position dans la fratrie"));
  put("billing.th_discount", T("Desconto", "Discount", "Remise"));
  put("billing.th_actions", T("Acções", "Actions", "Actions"));
  put("billing.sibling_row", T("{{n}}º filho ou superior", "{{n}}th child or higher", "{{n}}e enfant ou suivant"));
  put("billing.overrides_title", T("Descontos manuais por aluno", "Manual per-student discounts", "Remises manuelles par élève"));
  put("billing.overrides_desc", T("Sobrepõe a regra automática em casos especiais.", "Overrides the automatic rule for special cases.", "Remplace la règle automatique dans les cas particuliers."));
  put(
    "billing.overrides_year_hint",
    T(
      "Ano letivo do desconto: usa o ano seleccionado no cabeçalho da app{{suffix}}.",
      "Discount academic year: uses the header year{{suffix}}.",
      "Année du rabais : utilise l’année sélectionnée dans l’en-tête{{suffix}}.",
    ),
  );
  put("billing.overrides_year_none", T(" (nenhum seleccionado)", " (none selected)", " (aucune sélectionnée)"));
  put("billing.btn_new_discount", T("Novo desconto", "New discount", "Nouvelle remise"));
  put("billing.overrides_empty", T("Sem descontos manuais.", "No manual discounts.", "Aucune remise manuelle."));
  put("billing.th_student", T("Aluno", "Student", "Élève"));
  put("billing.th_reason", T("Motivo", "Reason", "Motif"));
  put("billing.dialog_family_edit", T("Editar regra", "Edit rule", "Modifier la règle"));
  put("billing.dialog_family_new", T("Nova regra de família", "New family rule", "Nouvelle règle familiale"));
  put("billing.dialog_family_desc", T("Aplica-se a alunos com o mesmo educador.", "Applies to pupils with the same guardian.", "S’applique aux élèves ayant le même responsable."));
  put("billing.field_from_sibling", T("A partir do … familiar", "From sibling no.", "À partir du … membre"));
  put("billing.field_from_sibling_help", T("2 = aplicar ao 2º filho em diante; 3 = só ao 3º em diante; etc.", "2 = from 2nd child onward; 3 = from 3rd onward; etc.", "2 = à partir du 2e enfant ; 3 = à partir du 3e ; etc."));
  put("billing.field_discount_pct", T("Desconto (%)", "Discount (%)", "Remise (%)"));
  put("billing.dialog_discount_edit", T("Editar desconto", "Edit discount", "Modifier la remise"));
  put("billing.dialog_discount_new", T("Novo desconto manual", "New manual discount", "Nouvelle remise manuelle"));
  put("billing.dialog_discount_desc", T("Sobrepõe a regra automática para um aluno específico.", "Overrides the automatic rule for one student.", "Remplace la règle automatique pour un élève donné."));
  put("billing.field_student", T("Aluno", "Student", "Élève"));
  put("billing.select_student", T("Selecciona um aluno", "Select a student", "Sélectionnez un élève"));
  put("billing.field_discount_pct_short", T("Desconto %", "Discount %", "Remise %"));
  put("billing.field_fixed_amount", T("Ou valor fixo", "Or fixed amount", "Ou montant fixe"));
  put("billing.reason_placeholder", T("Ex.: bolsa de mérito", "E.g., merit bursary", "Ex. : bourse au mérite"));
  put("billing.confirm_delete_rule_title", T("Apagar regra?", "Delete rule?", "Supprimer la règle ?"));
  put("billing.confirm_delete_rule_desc", T("Esta acção não pode ser desfeita.", "This action cannot be undone.", "Cette action est irréversible."));
  put("billing.confirm_delete_rule_action", T("Apagar", "Delete", "Supprimer"));
  put("billing.confirm_delete_discount_title", T("Remover desconto?", "Remove discount?", "Retirer la remise ?"));
  put("billing.confirm_delete_discount_action", T("Remover", "Remove", "Retirer"));

  // audit panel chrome (AuditLogsPanel)
  put("audit.panel_title", T("Logs de auditoria", "Audit logs", "Journaux d’audit"));
  put(
    "audit.panel_subtitle",
    T(
      "Histórico de criação, alteração e eliminação de dados em toda a escola. Os registos são guardados durante 12 meses.",
      "History of creates, updates, and deletes across the school. Records are kept for 12 months.",
      "Historique des créations, modifications et suppressions. Conservation 12 mois.",
    ),
  );
  put("audit.search_placeholder", T("Procurar por nome do utilizador...", "Search by user name…", "Rechercher par nom d’utilisateur…"));
  put("audit.filter_table", T("Tabela", "Table", "Table"));
  put("audit.filter_table_all", T("Todas as tabelas", "All tables", "Toutes les tables"));
  put("audit.filter_action", T("Acção", "Action", "Action"));
  put("audit.filter_action_all", T("Todas as acções", "All actions", "Toutes les actions"));
  put("audit.date_from", T("Data inicial", "Start date", "Date de début"));
  put("audit.date_to", T("Data final", "End date", "Date de fin"));
  put("audit.clear_dates", T("Limpar datas", "Clear dates", "Effacer les dates"));
  put("audit.refresh", T("Actualizar", "Refresh", "Actualiser"));
  put("audit.empty", T("Sem registos para os filtros seleccionados.", "No records for the selected filters.", "Aucun enregistrement pour ces filtres."));
  put("audit.th_datetime", T("Data/Hora", "Date/time", "Date/heure"));
  put("audit.th_user", T("Utilizador", "User", "Utilisateur"));
  put("audit.th_action", T("Acção", "Action", "Action"));
  put("audit.th_table", T("Tabela", "Table", "Table"));
  put("audit.th_summary", T("Resumo", "Summary", "Résumé"));
  put("audit.th_details", T("Detalhes", "Details", "Détails"));
  put("audit.system_user", T("Sistema", "System", "Système"));
  put("audit.btn_view", T("Ver", "View", "Voir"));
  put("audit.records_count", T("{{count}} registo(s)", "{{count}} record(s)", "{{count}} enregistrement(s)"));
  put("audit.page_indicator", T("Página {{current}} de {{total}}", "Page {{current}} of {{total}}", "Page {{current}} sur {{total}}"));
  put("audit.dialog_title", T("Detalhes do registo", "Record details", "Détails de l’enregistrement"));
  put("audit.before", T("Antes", "Before", "Avant"));
  put("audit.after", T("Depois", "After", "Après"));
  put("audit.record_id", T("ID do registo", "Record ID", "ID de l’enregistrement"));

  // invite (InviteStaffUserDialog)
  put("invite.title", T("Novo utilizador", "New user", "Nouvel utilisateur"));
  put(
    "invite.description",
    T(
      "Um único pedido ao servidor gere os dois fluxos: com convite envia email; com password cria a conta logo (sem mensagem “convite”). Ajustar módulos: separador Permissões.",
      "One server call handles both flows: invite sends e-mail; password creates the account immediately (no “invite” wording). Adjust modules in Permissions.",
      "Un seul appel gère les deux flux : invitation par e-mail ou création immédiate avec mot de passe. Modules : onglet Permissions.",
    ),
  );
  put("invite.field_full_name", T("Nome completo", "Full name", "Nom complet"));
  put("invite.placeholder_name", T("Maria Silva", "Maria Silva", "Maria Silva"));
  put("invite.field_email", T("Email", "Email", "E-mail"));
  put("invite.placeholder_email", T("nome@escola.edu", "name@school.edu", "nom@ecole.edu"));
  put("invite.field_phone", T("Telefone (opcional)", "Phone (optional)", "Téléphone (facultatif)"));
  put("invite.placeholder_phone", T("(244) 923 …", "(244) 923 …", "(244) 923 …"));
  put("invite.field_role", T("Função", "Role", "Fonction"));
  put("invite.select_role", T("Seleccionar função", "Select role", "Sélectionner une fonction"));
  put("invite.field_password", T("Password inicial *", "Initial password *", "Mot de passe initial *"));
  put("invite.placeholder_password", T("Mínimo 6 caracteres", "At least 6 characters", "Au moins 6 caractères"));
  put(
    "invite.password_help",
    T("O utilizador receberá um email com as credenciais de acesso.", "The user will receive an e-mail with login credentials.", "L’utilisateur recevra un e-mail avec ses identifiants."),
  );
  put("invite.btn_create", T("Criar utilizador", "Create user", "Créer l’utilisateur"));

  // modals
  put("modals.edit_user.title", T("Editar Utilizador", "Edit user", "Modifier l’utilisateur"));
  put("modals.edit_user.field_name", T("Nome completo", "Full name", "Nom complet"));
  put("modals.edit_user.field_email", T("Email (início de sessão)", "Email (sign-in)", "E-mail (connexion)"));
  put(
    "modals.edit_user.email_help",
    T(
      "Ao alterar, este passa a ser o email utilizado para iniciar sessão em todo o Edukamba.",
      "After changing, this becomes the sign-in email across Edukamba.",
      "Après modification, il devient l’e-mail de connexion pour tout Edukamba.",
    ),
  );
  put("modals.edit_user.field_phone", T("Telefone", "Phone", "Téléphone"));
  put("modals.proof.title", T("Anexar comprovativo", "Attach proof", "Joindre une preuve"));
  put("modals.proof.invoice_line", T("Fatura {{number}} · {{amount}}", "Invoice {{number}} · {{amount}}", "Facture {{number}} · {{amount}}"));
  put("modals.proof.field_method", T("Método de pagamento", "Payment method", "Moyen de paiement"));
  put("modals.proof.method_transfer", T("Transferência bancária", "Bank transfer", "Virement bancaire"));
  put("modals.proof.method_mb", T("Multibanco", "ATM reference", "Multibanco"));
  put("modals.proof.method_mbway", T("MB WAY", "MB WAY", "MB WAY"));
  put("modals.proof.method_cash", T("Numerário", "Cash", "Espèces"));
  put("modals.proof.method_other", T("Outro", "Other", "Autre"));
  put("modals.proof.field_file", T("Ficheiro do comprovativo", "Proof file", "Fichier du justificatif"));
  put("modals.proof.field_notes", T("Notas (opcional)", "Notes (optional)", "Notes (facultatif)"));
  put("modals.proof.notes_placeholder", T("Referência da transferência, data, etc.", "Transfer reference, date, etc.", "Référence de virement, date, etc."));
  put("modals.proof.btn_submit", T("Enviar para validação", "Submit for validation", "Envoyer pour validation"));
  put("modals.remove_user.title", T("Remover utilizador", "Remove user", "Retirer l’utilisateur"));
  put(
    "modals.remove_user.body",
    T(
      "O utilizador será desativado e perderá imediatamente o acesso ao Edukamba. Esta ação pode ser revertida reativando o utilizador.",
      "The user will be deactivated and lose Edukamba access immediately. You can undo this by reactivating the user.",
      "L’utilisateur sera désactivé et perdra l’accès immédiatement. Réversible en réactivant le compte.",
    ),
  );
  put("modals.delete_year.title", T("Eliminar ano letivo", "Delete academic year", "Supprimer l’année scolaire"));
  put(
    "modals.delete_year.body",
    T(
      "Vai eliminar o ano letivo {{label}}. Só é possível eliminar se não existirem turmas, matrículas, avaliações ou outros dados associados.",
      "You will delete {{label}}. You can only delete if no classes, enrolments, assessments, or other linked data exist.",
      "Vous supprimez {{label}}. Impossible s’il reste des classes, inscriptions, évaluations ou données liées.",
    ),
  );
  put("modals.confirm_clear_role.title", T("Limpar permissões da função", "Clear role permissions", "Réinitialiser les permissions de la fonction"));
  put(
    "modals.confirm_clear_role.body",
    T(
      "Remover todas as permissões gravadas na base de dados para a função «{{role}}» nesta escola?\n\nDepois disto, todos os utilizadores com esta função voltam a usar apenas as regras padrão da aplicação para cada módulo.",
      "Remove all saved permissions for role “{{role}}” at this school?\n\nUsers with this role will fall back to the app defaults per module.",
      "Supprimer toutes les permissions enregistrées pour « {{role}} » dans cette école ?\n\nLes utilisateurs reviennent aux valeurs par défaut par module.",
    ),
  );
  put(
    "modals.confirm_clear_user.body",
    T(
      "Remover todas as permissões personalizadas gravadas para {{name}}? O utilizador voltará a seguir apenas a função (e as regras padrão) para cada módulo.",
      "Remove all custom permissions saved for {{name}}? The user will follow only their role defaults per module.",
      "Supprimer toutes les permissions personnalisées pour {{name}} ? L’utilisateur suivra uniquement les règles de la fonction.",
    ),
  );

  // validation
  put("validation.school_name_required", T("Nome obrigatório", "Name is required", "Le nom est obligatoire"));
  put("validation.form_check", T("Verifique os campos do formulário.", "Please check the form fields.", "Vérifiez les champs du formulaire."));
  put("validation.academic_values", T("Verifique os valores: 0 ≤ média mínima ≤ nota máxima.", "Check values: 0 ≤ min average ≤ max grade.", "Vérifiez : 0 ≤ moyenne min ≤ note max."));
  put("validation.late_fee_positive", T("Defina um valor de multa maior que zero.", "Set a late penalty greater than zero.", "Indiquez une pénalité supérieure à zéro."));
  put("validation.late_fee_pct_max", T("A percentagem da multa não pode exceder 100%.", "The penalty percentage cannot exceed 100%.", "Le pourcentage ne peut pas dépasser 100 %."));
  put("validation.proof_file_required", T("Selecione o ficheiro do comprovativo.", "Select the proof file.", "Sélectionnez le fichier du justificatif."));
  put("validation.email_required_login", T("O email é obrigatório (serve para iniciar sessão na Edukamba).", "Email is required (used to sign in to Edukamba).", "L’e-mail est obligatoire (connexion Edukamba)."));
  put("validation.users_required_for_notif", T("Sem utilizadores nesta função.", "No users in this role.", "Aucun utilisateur pour cette fonction."));
  put("validation.year_required_discount", T("Ano letivo em falta", "Academic year missing", "Année scolaire manquante"));
  put(
    "validation.year_required_discount_desc",
    T(
      "Seleccione o ano letivo activo no cabeçalho da app antes de criar um desconto.",
      "Select the active academic year in the app header before creating a discount.",
      "Sélectionnez l’année active dans l’en-tête avant de créer une remise.",
    ),
  );
  put("validation.student_required", T("Selecciona um aluno", "Select a student", "Sélectionnez un élève"));
  put("validation.discount_value_required", T("Indica uma percentagem ou um valor fixo", "Enter a percentage or fixed amount", "Indiquez un pourcentage ou un montant fixe"));
  put("validation.invite_name", T("Nome obrigatório", "Name is required", "Le nom est obligatoire"));
  put("validation.invite_email", T("Email obrigatório", "Email is required", "L’e-mail est obligatoire"));
  put("validation.invite_password", T("Password (mín. 6 caracteres)", "Password (min. 6 characters)", "Mot de passe (min. 6 caractères)"));
  put("validation.wizard_school_missing", T("Escola não encontrada", "School not found", "École introuvable"));
  put("validation.wizard_year_label", T("Indique o nome do ano letivo", "Enter the academic year name", "Indiquez le nom de l’année"));
  put("validation.wizard_dates", T("Datas inválidas", "Invalid dates", "Dates invalides"));
  put("validation.wizard_dates_desc", T("A data de fim deve ser posterior à de início.", "The end date must be after the start date.", "La date de fin doit être postérieure au début."));
  put(
    "validation.wizard_source_required",
    T("Escolha o ano de origem", "Choose the source year", "Choisissez l’année source"),
  );
  put(
    "validation.wizard_source_desc",
    T("É necessário um ano anterior para clonar turmas/preços.", "You need a previous year to clone classes/pricing.", "Une année source est nécessaire pour cloner classes/tarifs."),
  );
  put("validation.terms_fields", T("Preencha todos os campos do trimestre.", "Fill in all term fields.", "Remplissez tous les champs du trimestre."));
  put("validation.dates_order", T("A data de início deve ser anterior à data de fim.", "Start date must be before end date.", "La date de début doit précéder la fin."));
  put("validation.holiday_fields", T("Preencha nome e datas.", "Fill in name and dates.", "Renseignez le nom et les dates."));
  put("validation.logo_max_size", T("Ficheiro demasiado grande (máx. 2MB).", "File too large (max 2MB).", "Fichier trop volumineux (max 2 Mo)."));
  put("validation.cannot_resolve_user_role", T("Não foi possível determinar a função deste utilizador.", "Could not determine this user’s role.", "Impossible de déterminer le rôle de cet utilisateur."));
  put(
    "validation.admin_always_full_access",
    T(
      "Administradores têm sempre acesso total à aplicação; não são guardadas permissões granulares.",
      "Administrators always have full access; granular permissions are not stored.",
      "Les administrateurs ont toujours l’accès complet ; pas de permissions granulaires stockées.",
    ),
  );
  put(
    "validation.admin_no_stored_perms",
    T(
      "A função Administrador utiliza sempre acesso total na aplicação; não existem linhas personalizadas a remover.",
      "The Administrator role always has full access; there are no custom rows to remove.",
      "La fonction Administrateur a toujours l’accès complet ; aucune ligne à supprimer.",
    ),
  );
  put(
    "validation.admin_user_full_access",
    T("Esta conta tem acesso total; não há personalizações por módulo a remover.", "This account has full access; there are no per-module overrides to remove.", "Compte à accès complet ; aucune surcharge par module."),
  );
  put(
    "validation.delete_year_blocked",
    T(
      "Não é possível eliminar: existem turmas, matrículas ou propinas associadas a este ano letivo.",
      "Cannot delete: classes, enrolments, or fees are linked to this year.",
      "Suppression impossible : classes, inscriptions ou frais liés à cette année.",
    ),
  );
  put(
    "validation.delete_year_forbidden",
    T(
      "Sem permissão para eliminar este ano letivo. Apenas administradores podem fazê-lo.",
      "You may not delete this academic year. Only administrators can do that.",
      "Vous ne pouvez pas supprimer cette année. Réservé aux administrateurs.",
    ),
  );
  put(
    "validation.update_email_failed",
    T("Não foi possível actualizar o email de login.", "Could not update the login email.", "Impossible de mettre à jour l’e-mail de connexion."),
  );

  // toasts (Definições + child components)
  const toast = (key, triple) => put(`toasts.${key}`, triple);
  toast("school_saved", T("Informações da escola guardadas.", "School information saved.", "Informations de l’école enregistrées."));
  toast("brand_saved", T("Marca atualizada.", "Brand updated.", "Marque mise à jour."));
  toast("logo_uploaded", T("Logotipo carregado. Lembre-se de guardar.", "Logo uploaded. Remember to save.", "Logo téléversé. Pensez à enregistrer."));
  toast("academic_updated", T("Ano letivo atualizado.", "Academic year updated.", "Année scolaire mise à jour."));
  toast("academic_active_updated", T("Ano letivo ativo atualizado.", "Active academic year updated.", "Année active mise à jour."));
  toast("academic_created", T("Ano letivo criado. Edite os dados conforme necessário.", "Academic year created. Edit details as needed.", "Année créée. Modifiez les données si besoin."));
  toast("academic_deleted", T("Ano letivo eliminado.", "Academic year deleted.", "Année scolaire supprimée."));
  toast("academic_settings_saved", T("Critérios académicos guardados.", "Academic criteria saved.", "Critères académiques enregistrés."));
  toast("role_updated", T("Função atualizada.", "Role updated.", "Fonction mise à jour."));
  toast("user_activated", T("Utilizador ativado.", "User activated.", "Utilisateur activé."));
  toast("user_deactivated", T("Utilizador desativado.", "User deactivated.", "Utilisateur désactivé."));
  toast("user_updated", T("Utilizador atualizado.", "User updated.", "Utilisateur mis à jour."));
  toast(
    "user_removed",
    T("Utilizador removido. Já não consegue aceder ao Edukamba.", "User removed. They can no longer access Edukamba.", "Utilisateur retiré. Plus d’accès à Edukamba."),
  );
  toast("role_perms_saved", T("Permissões da função guardadas.", "Role permissions saved.", "Permissions de la fonction enregistrées."));
  toast("user_perms_saved", T("Permissões personalizadas guardadas.", "Custom permissions saved.", "Permissions personnalisées enregistrées."));
  toast(
    "role_perms_reset",
    T("Permissões da função repostas para os valores padrão da aplicação.", "Role permissions restored to app defaults.", "Permissions de la fonction réinitialisées."),
  );
  toast(
    "user_perms_cleared",
    T(
      "Personalizações do utilizador removidas; aplicam-se de novo os valores herdados pela função.",
      "User overrides removed; inherited role defaults apply again.",
      "Surcharges utilisateur supprimées ; retour aux valeurs héritées.",
    ),
  );
  toast(
    "notif_prefs_applied",
    T("Preferências aplicadas a {{count}} utilizador(es).", "Preferences applied to {{count}} user(s).", "Préférences appliquées à {{count}} utilisateur(s)."),
  );
  toast("billing_cycle_updated", T("Ciclo de pagamento atualizado.", "Billing cycle updated.", "Cycle de paiement mis à jour."));
  toast("proof_submitted", T("Comprovativo enviado. Aguarda validação.", "Proof submitted. Pending validation.", "Justificatif envoyé. En attente de validation."));
  toast("proof_error", T("Erro ao enviar comprovativo.", "Could not upload the proof.", "Erreur d’envoi du justificatif."));
  toast("proof_open_failed", T("Não foi possível abrir o comprovativo.", "Could not open the proof.", "Impossible d’ouvrir le justificatif."));
  toast("term_saved_title", T("{{name}} guardado", "{{name}} saved", "{{name}} enregistré"));
  toast("term_removed", T("Trimestre removido", "Term removed", "Trimestre supprimé"));
  toast("term_error_title", T("Erro ao guardar trimestre", "Could not save term", "Erreur d’enregistrement du trimestre"));
  toast("holiday_updated", T("Férias atualizadas", "Holidays updated", "Vacances mises à jour"));
  toast("holiday_created", T("Férias criadas", "Holidays created", "Vacances créées"));
  toast("holidays_removed", T("Férias removidas", "Holidays removed", "Vacances supprimées"));
  toast("generic_error_title", T("Erro", "Error", "Erreur"));
  toast("wizard_done", T("Novo ano letivo criado", "New academic year created", "Nouvelle année créée"));
  toast("wizard_done_desc", T("{{label}} pronto a usar.", "{{label}} is ready to use.", "{{label}} est prête à l’emploi."));
  toast("wizard_error", T("Erro na migração", "Migration error", "Erreur de migration"));
  toast("billing_prefs_saved", T("Preferências de cobrança guardadas", "Billing preferences saved", "Préférences de recouvrement enregistrées"));
  toast("billing_save_error", T("Erro a guardar", "Could not save", "Erreur d’enregistrement"));
  toast("billing_rule_saved", T("Regra atualizada", "Rule updated", "Règle mise à jour"));
  toast("billing_rule_created", T("Regra criada", "Rule created", "Règle créée"));
  toast("billing_rule_deleted", T("Regra apagada", "Rule deleted", "Règle supprimée"));
  toast("billing_delete_error", T("Erro a apagar", "Could not delete", "Erreur de suppression"));
  toast("billing_discount_saved", T("Desconto atualizado", "Discount updated", "Remise mise à jour"));
  toast("billing_discount_created", T("Desconto criado", "Discount created", "Remise créée"));
  toast("billing_discount_removed", T("Desconto removido", "Discount removed", "Remise retirée"));
  toast("invite_created", T("Utilizador criado", "User created", "Utilisateur créé"));
  toast(
    "invite_created_desc",
    T("Credenciais enviadas por email para {{email}}.", "Credentials emailed to {{email}}.", "Identifiants envoyés à {{email}}."),
  );
  toast("invite_error", T("Erro ao convidar", "Could not invite", "Erreur d’invitation"));

  put("terms.confirm_remove_term", T("Remover {{name}}?", "Remove {{name}}?", "Supprimer {{name}} ?"));
  put("terms.confirm_remove_holiday", T("Remover este período de férias?", "Remove this holiday period?", "Supprimer cette période de vacances ?"));

  addModules(pt, en, fr);
  addRoles(pt, en, fr);
  addAudit(pt, en, fr);

  return { pt, en, fr };
}

function sortKeys(obj) {
  return Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
}

const { pt, en, fr } = buildCore();
const outPt = sortKeys(pt);
const outEn = sortKeys(en);
const outFr = sortKeys(fr);

if (Object.keys(outPt).length !== Object.keys(outEn).length || Object.keys(outPt).length !== Object.keys(outFr).length) {
  console.error("Key count mismatch", Object.keys(outPt).length, Object.keys(outEn).length, Object.keys(outFr).length);
  process.exit(1);
}

for (const [lng, data] of [
  ["pt", outPt],
  ["en", outEn],
  ["fr", outFr],
]) {
  const p = path.join(__dirname, `definicoes-${lng}-flat.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

console.log(`Wrote definicoes-*-flat.json with ${Object.keys(outPt).length} keys each.`);
