import type { AppLocale } from "@/i18n/constants";
import { normalizeAppLocale } from "@/i18n/constants";
import i18n from "@/i18n/config";
import { persistLocale } from "@/lib/localePersistence";
import { setOneSignalLanguageTag as setNativeLang } from "@/lib/oneSignalNative";
import { setOneSignalLanguageTag as setWebLang } from "@/lib/oneSignalWeb";

/** Applies locale across i18n strings, durable storage (web + Capacitor) and OneSignal segmentation tags. */
export async function syncAppLocale(raw: string | null | undefined): Promise<AppLocale> {
  const locale = normalizeAppLocale(raw);
  await i18n.changeLanguage(locale);
  await persistLocale(locale);
  await Promise.all([setWebLang(locale), setNativeLang(locale)]);
  return locale;
}
