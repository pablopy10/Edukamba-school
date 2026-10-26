/**
 * Regras fiscais e códigos oficiais de isenção AGT para o setor da Educação (EduKamba).
 * Em conformidade com o Código do IVA de Angola (CIVA) - Artigo 12.º e tabela oficial de isenções AGT.
 */

export type EducationalServiceCategory =
  | "propina"
  | "matricula"
  | "extracurricular"
  | "transporte"
  | "refeicao"
  | "outro";

export interface EducationalTaxRule {
  category: EducationalServiceCategory;
  label: string;
  defaultTaxPercentage: number;
  taxCode: "ISE" | "NOR" | "RED";
  taxExemptionCode?: string;
  taxExemptionReason?: string;
  legalReference: string;
}

/**
 * Catálogo oficial de regras tributárias para escolas no EduKamba.
 */
export const EDUCATIONAL_TAX_RULES: Record<EducationalServiceCategory, EducationalTaxRule> = {
  propina: {
    category: "propina",
    label: "Propina / Serviços Educativos Regulares",
    defaultTaxPercentage: 0,
    taxCode: "ISE",
    taxExemptionCode: "M11",
    taxExemptionReason: "Isenção no domínio da educação (Artigo 12.º do CIVA)",
    legalReference: "Artigo 12.º, n.º 1 do Código do Imposto sobre o Valor Acrescentado (CIVA)",
  },
  matricula: {
    category: "matricula",
    label: "Taxa de Matrícula / Inscrição / Confirmação",
    defaultTaxPercentage: 0,
    taxCode: "ISE",
    taxExemptionCode: "M11",
    taxExemptionReason: "Isenção no domínio da educação (Artigo 12.º do CIVA)",
    legalReference: "Artigo 12.º, n.º 1 do Código do Imposto sobre o Valor Acrescentado (CIVA)",
  },
  extracurricular: {
    category: "extracurricular",
    label: "Atividades Extracurriculares / Desporto Escolar",
    defaultTaxPercentage: 0,
    taxCode: "ISE",
    taxExemptionCode: "M11",
    taxExemptionReason: "Isenção no domínio da educação e desporto escolar (Artigo 12.º do CIVA)",
    legalReference: "Artigo 12.º, n.º 1 do CIVA",
  },
  transporte: {
    category: "transporte",
    label: "Transporte Escolar",
    defaultTaxPercentage: 0,
    taxCode: "ISE",
    taxExemptionCode: "M04",
    taxExemptionReason: "Não sujeito nos termos do Código do IVA - Transporte Coletivo Escolar",
    legalReference: "Código do IVA e legislação de transportes de passageiros",
  },
  refeicao: {
    category: "refeicao",
    label: "Refeições / Cantina Escolar",
    defaultTaxPercentage: 0,
    taxCode: "ISE",
    taxExemptionCode: "M11",
    taxExemptionReason: "Isenção conexa à atividade educativa (Artigo 12.º do CIVA)",
    legalReference: "Artigo 12.º do CIVA - Serviços de cantina e alimentação conexos",
  },
  outro: {
    category: "outro",
    label: "Outros Serviços / Material Escolar / Uniformes",
    defaultTaxPercentage: 14,
    taxCode: "NOR",
    legalReference: "Taxa Geral de IVA (14%) nos termos do CIVA",
  },
};

/**
 * Identifica a categoria do serviço a partir do nome ou tipo de cobrança.
 */
export function detectEducationalCategory(description: string): EducationalServiceCategory {
  const norm = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (norm.includes("propina") || norm.includes("mensalidade") || norm.includes("trimestre") || norm.includes("servico educativo")) {
    return "propina";
  }
  if (norm.includes("matricula") || norm.includes("inscricao") || norm.includes("confirmacao") || norm.includes("vaga")) {
    return "matricula";
  }
  if (norm.includes("transporte") || norm.includes("carrinha") || norm.includes("onibus") || norm.includes("rota")) {
    return "transporte";
  }
  if (norm.includes("refeicao") || norm.includes("cantina") || norm.includes("almoco") || norm.includes("lanche") || norm.includes("alimentacao")) {
    return "refeicao";
  }
  if (norm.includes("extracurricular") || norm.includes("clube") || norm.includes("futebol") || norm.includes("natacao") || norm.includes("ballet") || norm.includes("robotica") || norm.includes("musica")) {
    return "extracurricular";
  }

  return "outro";
}

/**
 * Retorna as regras tributárias para uma linha da fatura com base na descrição informada.
 */
export function getTaxRuleForLine(description: string): EducationalTaxRule {
  const cat = detectEducationalCategory(description);
  return EDUCATIONAL_TAX_RULES[cat];
}
