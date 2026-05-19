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

const mergePages = (
  base: typeof ptPages,
  extras: {
    pedidos: typeof ptPedidos;
    material: typeof ptMaterial;
    transportes: typeof ptTransportes;
    refeicoes: typeof ptRefeicoes;
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
    }),
  },
  en: {
    common: en,
    pages: mergePages(enPages, {
      pedidos: enPedidos,
      material: enMaterial,
      transportes: enTransportes,
      refeicoes: enRefeicoes,
    }),
  },
  fr: {
    common: fr,
    pages: mergePages(frPages, {
      pedidos: frPedidos,
      material: frMaterial,
      transportes: frTransportes,
      refeicoes: frRefeicoes,
    }),
  },
} as const;
