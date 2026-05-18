import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { FALLBACK_LOCALE, LOCALE_STORAGE_KEY } from "@/i18n/constants";
import { resources } from "@/i18n/resources";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: ["pt", "en", "fr"],
    ns: ["common"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    /** PT por omissão: só mudamos língua com escolha explícita (Perfil / `profiles.language`) ou chave em localStorage. */
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
    },
  });

export default i18n;
