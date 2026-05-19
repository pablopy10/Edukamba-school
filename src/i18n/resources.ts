import pt from "@/locales/pt/common.json";
import en from "@/locales/en/common.json";
import fr from "@/locales/fr/common.json";
import ptPages from "@/locales/pt/pages.json";
import enPages from "@/locales/en/pages.json";
import frPages from "@/locales/fr/pages.json";
import ptPedidos from "@/locales/pt/pedidos.json";
import enPedidos from "@/locales/en/pedidos.json";
import frPedidos from "@/locales/fr/pedidos.json";
import ptMaterial from "@/locales/pt/material.json";
import enMaterial from "@/locales/en/material.json";
import frMaterial from "@/locales/fr/material.json";
import ptTransportes from "@/locales/pt/transportes.json";
import enTransportes from "@/locales/en/transportes.json";
import frTransportes from "@/locales/fr/transportes.json";
import ptRefeicoes from "@/locales/pt/refeicoes.json";
import enRefeicoes from "@/locales/en/refeicoes.json";
import frRefeicoes from "@/locales/fr/refeicoes.json";
import ptDomainChargeRules from "@/locales/pt/domain_charge_rules.json";
import enDomainChargeRules from "@/locales/en/domain_charge_rules.json";
import frDomainChargeRules from "@/locales/fr/domain_charge_rules.json";
import ptPagamentosEmbedded from "@/locales/pt/pagamentos_embedded.json";
import enPagamentosEmbedded from "@/locales/en/pagamentos_embedded.json";
import frPagamentosEmbedded from "@/locales/fr/pagamentos_embedded.json";
import ptModuleAuthorizations from "@/locales/pt/module_authorizations.json";
import enModuleAuthorizations from "@/locales/en/module_authorizations.json";
import frModuleAuthorizations from "@/locales/fr/module_authorizations.json";
import ptFinancas from "@/locales/pt/financas.json";
import enFinancas from "@/locales/en/financas.json";
import frFinancas from "@/locales/fr/financas.json";
import ptRelatorios from "@/locales/pt/relatorios.json";
import enRelatorios from "@/locales/en/relatorios.json";
import frRelatorios from "@/locales/fr/relatorios.json";
import ptTimesheet from "@/locales/pt/timesheet.json";
import enTimesheet from "@/locales/en/timesheet.json";
import frTimesheet from "@/locales/fr/timesheet.json";
import ptDocumentos from "@/locales/pt/documentos.json";
import enDocumentos from "@/locales/en/documentos.json";
import frDocumentos from "@/locales/fr/documentos.json";
import ptChat from "@/locales/pt/chat.json";
import enChat from "@/locales/en/chat.json";
import frChat from "@/locales/fr/chat.json";
import ptNotificacoes from "@/locales/pt/notificacoes.json";
import enNotificacoes from "@/locales/en/notificacoes.json";
import frNotificacoes from "@/locales/fr/notificacoes.json";

const mergePages = (
  base: typeof ptPages,
  extras: {
    pedidos: typeof ptPedidos;
    material: typeof ptMaterial;
    transportes: typeof ptTransportes;
    refeicoes: typeof ptRefeicoes;
    domain_charge_rules: typeof ptDomainChargeRules;
    pagamentos_embedded: typeof ptPagamentosEmbedded;
    module_authorizations: typeof ptModuleAuthorizations;
    financas: typeof ptFinancas;
    relatorios: typeof ptRelatorios;
    timesheet: typeof ptTimesheet;
    documentos: typeof ptDocumentos;
    chat: typeof ptChat;
    notificacoes: typeof ptNotificacoes;
  },
) => ({ ...base, ...extras });

export const resources = {
  pt: {
    common: pt,
    pages: mergePages(ptPages, {
      pedidos: ptPedidos,
      material: ptMaterial,
      transportes: ptTransportes,
      refeicoes: ptRefeicoes,
      domain_charge_rules: ptDomainChargeRules,
      pagamentos_embedded: ptPagamentosEmbedded,
      module_authorizations: ptModuleAuthorizations,
      financas: ptFinancas,
      relatorios: ptRelatorios,
      timesheet: ptTimesheet,
      documentos: ptDocumentos,
      chat: ptChat,
      notificacoes: ptNotificacoes,
    }),
  },
  en: {
    common: en,
    pages: mergePages(enPages, {
      pedidos: enPedidos,
      material: enMaterial,
      transportes: enTransportes,
      refeicoes: enRefeicoes,
      domain_charge_rules: enDomainChargeRules,
      pagamentos_embedded: enPagamentosEmbedded,
      module_authorizations: enModuleAuthorizations,
      financas: enFinancas,
      relatorios: enRelatorios,
      timesheet: enTimesheet,
      documentos: enDocumentos,
      chat: enChat,
      notificacoes: enNotificacoes,
    }),
  },
  fr: {
    common: fr,
    pages: mergePages(frPages, {
      pedidos: frPedidos,
      material: frMaterial,
      transportes: frTransportes,
      refeicoes: frRefeicoes,
      domain_charge_rules: frDomainChargeRules,
      pagamentos_embedded: frPagamentosEmbedded,
      module_authorizations: frModuleAuthorizations,
      financas: frFinancas,
      relatorios: frRelatorios,
      timesheet: frTimesheet,
      documentos: frDocumentos,
      chat: frChat,
      notificacoes: frNotificacoes,
    }),
  },
} as const;
