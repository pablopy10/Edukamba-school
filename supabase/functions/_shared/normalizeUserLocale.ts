export type UserLocale = "pt" | "en" | "fr";

/** Align with app + DB constraint `profiles.language` (ISO-like buckets). */
export function normalizeUserLocale(raw: string | null | undefined): UserLocale {
  const s = (raw ?? "pt").trim().toLowerCase();
  if (s.startsWith("en")) return "en";
  if (s.startsWith("fr")) return "fr";
  return "pt";
}
