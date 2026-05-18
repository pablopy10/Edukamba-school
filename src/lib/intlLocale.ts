import { normalizeAppLocale } from "@/i18n/constants";

/** Locale tag for `Intl` / `toLocaleString` from UI language (`pt` → `pt-PT`, etc.). */
export function intlLocaleTag(localeOrLng: string | null | undefined): string {
  const locale = normalizeAppLocale(localeOrLng ?? undefined);
  if (locale === "en") return "en-GB";
  if (locale === "fr") return "fr-FR";
  return "pt-PT";
}

/** Resolve tag from `i18next` language string (`normalizeAppLocale`). */
export function intlLocaleTagFromLng(i18nLanguage: string): string {
  return intlLocaleTag(normalizeAppLocale(i18nLanguage));
}
