import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { AppLocale } from "@/i18n/constants";
import { LOCALE_PREF_CAP_KEY, LOCALE_STORAGE_KEY, normalizeAppLocale } from "@/i18n/constants";

export async function persistLocale(locale: AppLocale): Promise<void> {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Preferences.set({ key: LOCALE_PREF_CAP_KEY, value: locale });
  } catch {
    /* ignore */
  }
}

/** Cold-start hint on native before Supabase profile hydration (best-effort). */
export async function readNativePersistedLocale(): Promise<AppLocale | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { value } = await Preferences.get({ key: LOCALE_PREF_CAP_KEY });
    if (!value) return null;
    return normalizeAppLocale(value);
  } catch {
    return null;
  }
}
