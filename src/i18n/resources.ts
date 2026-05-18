import pt from "@/locales/pt/common.json";
import en from "@/locales/en/common.json";
import fr from "@/locales/fr/common.json";
import ptPages from "@/locales/pt/pages.json";
import enPages from "@/locales/en/pages.json";
import frPages from "@/locales/fr/pages.json";

export const resources = {
  pt: { common: pt, pages: ptPages },
  en: { common: en, pages: enPages },
  fr: { common: fr, pages: frPages },
} as const;
