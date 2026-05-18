export const APP_LOCALES = ["pt", "en", "fr"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const FALLBACK_LOCALE: AppLocale = "pt";

/** Must match `i18next-browser-languagedetector` + manual persistence (web + Capacitor). */
export const LOCALE_STORAGE_KEY = "edukamba.locale";

/** Native Preferences key (Capacitor). */
export const LOCALE_PREF_CAP_KEY = "edukamba_locale";

export function normalizeAppLocale(raw: string | null | undefined): AppLocale {
  const s = (raw ?? FALLBACK_LOCALE).trim().toLowerCase();
  if (s.startsWith("en")) return "en";
  if (s.startsWith("fr")) return "fr";
  return "pt";
}
