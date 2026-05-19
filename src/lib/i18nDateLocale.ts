/** BCP 47 tag for short/medium dates from app language (pt / en / fr). */
export function dateLocaleTag(language: string | undefined): string {
  if (language?.startsWith("fr")) return "fr-FR";
  if (language?.startsWith("en")) return "en-GB";
  return "pt-PT";
}
