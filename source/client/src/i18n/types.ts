export const LANGUAGE_CODES = [
  "ar",
  "en",
  "zh",
  "hi",
  "es",
  "fr",
  "pt",
  "ru",
  "bn",
  "ur",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export type TranslationCatalog = Readonly<Record<string, string>>;

export type TextDirection = "rtl" | "ltr";

export const DEFAULT_LANGUAGE: LanguageCode = "ar";

export const LANGUAGE_NATIVE_NAMES: Readonly<Record<LanguageCode, string>> = {
  ar: "العربية",
  en: "English",
  zh: "中文",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  pt: "Português",
  ru: "Русский",
  bn: "বাংলা",
  ur: "اردو",
};

export const RTL_LANGUAGES: ReadonlySet<LanguageCode> = new Set(["ar", "ur"]);

export interface LanguageSnapshot {
  language: LanguageCode;
  catalog: TranslationCatalog;
  isLoading: boolean;
  pendingLanguage: LanguageCode | null;
}
