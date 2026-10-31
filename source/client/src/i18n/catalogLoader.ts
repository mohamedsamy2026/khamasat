import type { LanguageCode, TranslationCatalog } from "./types";

// Catalogs are supplied as Arabic source-string -> target-string JSON files by
// the application. Nothing is fetched from an external translation service.
const catalogModules = import.meta.glob<TranslationCatalog>("./locales/*.json", {
  import: "default",
});

export async function loadBundledCatalog(
  language: LanguageCode
): Promise<TranslationCatalog> {
  if (language === "ar") return {};

  const load = catalogModules[`./locales/${language}.json`];
  if (!load) return {};

  const catalog = await load();
  return catalog && typeof catalog === "object" ? catalog : {};
}
