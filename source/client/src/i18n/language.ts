import {
  DEFAULT_LANGUAGE,
  LANGUAGE_CODES,
  RTL_LANGUAGES,
  type LanguageCode,
  type LanguageSnapshot,
  type TextDirection,
  type TranslationCatalog,
} from "./types";

export const LANGUAGE_STORAGE_KEY = "athlete-language";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DocumentLike {
  documentElement: {
    lang: string;
    dir: string;
  };
}

export type CatalogLoader = (language: LanguageCode) => Promise<TranslationCatalog>;

type Listener = () => void;

const EMPTY_CATALOG: TranslationCatalog = Object.freeze({});
const INITIAL_SNAPSHOT: LanguageSnapshot = Object.freeze({
  language: DEFAULT_LANGUAGE,
  catalog: EMPTY_CATALOG,
  isLoading: false,
  pendingLanguage: null,
});
const TEMPLATE_PLACEHOLDER = /\{(\d+)\}/g;
const MAX_TEMPLATE_INPUT_LENGTH = 1_200;
const MAX_TEMPLATE_SOURCE_LENGTH = 700;
const MAX_TEMPLATE_TARGET_LENGTH = 900;
const MAX_TEMPLATE_CAPTURES = 4;
const MAX_TEMPLATE_CAPTURE_LENGTH = 360;
const MAX_EXACT_CAPTURE_TOKEN_LENGTH = 64;

type CompiledTemplate = {
  expression: RegExp;
  target: string;
  captureIndexes: readonly number[];
};

const compiledTemplateCache = new WeakMap<TranslationCatalog, readonly CompiledTemplate[]>();

function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);
}

function getBrowserStorage(): StorageLike | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function getBrowserDocument(): DocumentLike | undefined {
  if (typeof document === "undefined") return undefined;
  return document;
}

function asCatalog(value: unknown): TranslationCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_CATALOG;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[0] === "string" && typeof entry[1] === "string"
  );

  return entries.length > 0 ? Object.freeze(Object.fromEntries(entries)) : EMPTY_CATALOG;
}

function defaultCatalogLoader(_language: LanguageCode): Promise<TranslationCatalog> {
  return Promise.resolve(EMPTY_CATALOG);
}

/**
 * Returns a supported stored language or the Arabic source-language fallback.
 */
export function readStoredLanguage(storage?: StorageLike): LanguageCode {
  if (!storage) return DEFAULT_LANGUAGE;

  try {
    const stored = storage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguageCode(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function getLanguageDirection(language: LanguageCode): TextDirection {
  return RTL_LANGUAGES.has(language) ? "rtl" : "ltr";
}

function translateExactWithWhitespace(
  value: string,
  catalog: TranslationCatalog
): string {
  const direct = catalog[value];
  if (typeof direct === "string") return direct;

  const match = /^(\s*)(.*?)(\s*)$/su.exec(value);
  if (!match || !match[2]) return value;

  const translated = catalog[match[2]];
  return typeof translated === "string"
    ? `${match[1]}${translated}${match[3]}`
    : value;
}

function translateKnownUiToken(
  value: string,
  catalog: TranslationCatalog
): string {
  const exact = translateExactWithWhitespace(value, catalog);
  if (exact !== value) return exact;

  const numberThenLabel = /^(\s*)([\p{N}]+(?:[.,٫][\p{N}]+)?)(\s+)([^\p{N}\r\n]{1,32}?)(\s*)$/u.exec(
    value
  );
  const labelThenNumber = /^(\s*)([^\p{N}\r\n]{1,32}?)(\s+)([\p{N}]+(?:[.,٫][\p{N}]+)?)(\s*)$/u.exec(
    value
  );

  if (numberThenLabel) {
    const translated = translateExactWithWhitespace(numberThenLabel[4], catalog);
    return translated === numberThenLabel[4]
      ? value
      : `${numberThenLabel[1]}${numberThenLabel[2]}${numberThenLabel[3]}${translated}${numberThenLabel[5]}`;
  }

  if (labelThenNumber) {
    const translated = translateExactWithWhitespace(labelThenNumber[2], catalog);
    return translated === labelThenNumber[2]
      ? value
      : `${labelThenNumber[1]}${translated}${labelThenNumber[3]}${labelThenNumber[4]}${labelThenNumber[5]}`;
  }

  return value;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCompiledTemplates(catalog: TranslationCatalog): readonly CompiledTemplate[] {
  const cached = compiledTemplateCache.get(catalog);
  if (cached) return cached;

  const templates: CompiledTemplate[] = [];
  for (const [source, target] of Object.entries(catalog)) {
    if (
      source.length > MAX_TEMPLATE_SOURCE_LENGTH ||
      target.length > MAX_TEMPLATE_TARGET_LENGTH
    ) {
      continue;
    }

    const placeholders = Array.from(source.matchAll(TEMPLATE_PLACEHOLDER));
    if (!placeholders.length || placeholders.length > MAX_TEMPLATE_CAPTURES) continue;

    const captureIndexes = placeholders.map(match => Number(match[1]));
    const uniqueIndexes = new Set(captureIndexes);
    const targetIndexes = Array.from(target.matchAll(TEMPLATE_PLACEHOLDER)).map(match =>
      Number(match[1])
    );
    if (
      uniqueIndexes.size !== captureIndexes.length ||
      captureIndexes.some(index => index >= MAX_TEMPLATE_CAPTURES) ||
      !captureIndexes.every(index => targetIndexes.includes(index)) ||
      targetIndexes.some(index => !uniqueIndexes.has(index))
    ) {
      continue;
    }

    let expression = "^";
    let cursor = 0;
    for (const placeholder of placeholders) {
      const index = placeholder.index ?? 0;
      expression += escapeRegularExpression(source.slice(cursor, index));
      expression += `([\\s\\S]{0,${MAX_TEMPLATE_CAPTURE_LENGTH}}?)`;
      cursor = index + placeholder[0].length;
    }
    expression += `${escapeRegularExpression(source.slice(cursor))}$`;

    // A template with no literal text could match arbitrary user content.
    if (source.replace(TEMPLATE_PLACEHOLDER, "").trim().length === 0) continue;

    try {
      templates.push({
        expression: new RegExp(expression, "u"),
        target,
        captureIndexes,
      });
    } catch {
      // Ignore malformed local catalog entries; source text remains visible.
    }
  }

  templates.sort((left, right) => right.expression.source.length - left.expression.source.length);
  compiledTemplateCache.set(catalog, templates);
  return templates;
}

function translateExactUiCapture(
  value: string,
  catalog: TranslationCatalog
): string {
  // Captures are generally player names, notes, or server messages. Only a
  // short exact source key without sentence punctuation is treated as a known
  // display token; all other user-authored/free text stays unchanged.
  if (value.length > MAX_EXACT_CAPTURE_TOKEN_LENGTH || /[\r\n.!؟?!]/u.test(value)) {
    return value;
  }
  return translateExactWithWhitespace(value, catalog);
}

function translateWhitelistedTemplate(
  value: string,
  catalog: TranslationCatalog
): string {
  if (value.length > MAX_TEMPLATE_INPUT_LENGTH) return value;

  for (const template of getCompiledTemplates(catalog)) {
    const match = template.expression.exec(value);
    if (!match) continue;

    const captures: string[] = [];
    template.captureIndexes.forEach((captureIndex, groupIndex) => {
      captures[captureIndex] = match[groupIndex + 1] ?? "";
    });

    return template.target.replace(TEMPLATE_PLACEHOLDER, (placeholder, index) => {
      const capture = captures[Number(index)];
      return typeof capture === "string"
        ? translateExactUiCapture(capture, catalog)
        : placeholder;
    });
  }

  return value;
}

function translateComposedUnitTokens(
  value: string,
  catalog: TranslationCatalog
): string {
  // formatAcademyTenure produces at most three unit tokens joined by " و".
  // Every token and every joiner must resolve so prose cannot be partially
  // translated merely because it contains a number.
  const parts = value.split(/(\s+و)/u);
  if (parts.length < 3 || parts.length > 5 || parts.length % 2 === 0) {
    return value;
  }

  const localized = parts.map((part, index) =>
    index % 2 === 0
      ? translateKnownUiToken(part, catalog)
      : catalog[part] ??
        (() => {
          const leading = /^\s*/u.exec(part)?.[0] ?? "";
          const trailing = /\s*$/u.exec(part)?.[0] ?? "";
          const normalized = part.trim();
          const translated = catalog[normalized];
          return typeof translated === "string"
            ? `${leading}${translated}${trailing}`
            : part;
        })()
  );

  return localized.every((part, index) => part !== parts[index])
    ? localized.join("")
    : value;
}

/**
 * Translates exact catalog entries while preserving surrounding JSX whitespace.
 * A bounded number + short known UI fragment pattern covers strings such as
 * "3 لاعبين" without attempting to translate arbitrary user-authored prose.
 */
export function translateText(
  value: string,
  language: LanguageCode,
  catalog: TranslationCatalog
): string {
  if (language === DEFAULT_LANGUAGE || !value) return value;

  const token = translateKnownUiToken(value, catalog);
  if (token !== value) return token;

  const composed = translateComposedUnitTokens(value, catalog);
  return composed !== value
    ? composed
    : translateWhitelistedTemplate(value, catalog);
}

function translateDisplayChildren(
  children: unknown,
  language: LanguageCode,
  catalog: TranslationCatalog
): unknown {
  if (typeof children === "string") {
    return translateText(children, language, catalog);
  }

  if (Array.isArray(children)) {
    return children.map(child =>
      translateDisplayChildren(child, language, catalog)
    );
  }

  // React elements, render props, user data objects, numbers, and booleans are
  // intentionally left intact. Native descendants subscribe independently.
  return children;
}

const TRANSLATABLE_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt"] as const;

/**
 * Produces localized host-element props without changing inputs, identifiers,
 * routes, source URLs, event handlers, refs, or other serialized values.
 */
export function localizeDomProps<T extends Record<string, unknown>>(
  props: T,
  snapshot: Pick<LanguageSnapshot, "language" | "catalog">
): T {
  if (props["data-i18n-ignore"]) return props;

  let localized: Record<string, unknown> | null = null;
  const assign = (name: string, value: unknown) => {
    if (!localized) localized = { ...props };
    localized[name] = value;
  };

  if ("children" in props) {
    const children = translateDisplayChildren(
      props.children,
      snapshot.language,
      snapshot.catalog
    );
    if (children !== props.children) assign("children", children);
  }

  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const value = props[attribute];
    if (typeof value !== "string") continue;

    const translated = translateText(value, snapshot.language, snapshot.catalog);
    if (translated !== value) assign(attribute, translated);
  }

  return (localized ?? props) as T;
}

export interface LanguageStore {
  getSnapshot(): LanguageSnapshot;
  getServerSnapshot(): LanguageSnapshot;
  subscribe(listener: Listener): () => void;
  setLanguage(language: LanguageCode): Promise<void>;
  restorePersistedLanguage(): Promise<void>;
  setCatalogLoader(loader: CatalogLoader): void;
  syncDocumentLanguage(): void;
}

export interface LanguageStoreOptions {
  storage?: StorageLike;
  document?: DocumentLike;
  loadCatalog?: CatalogLoader;
}

/**
 * External locale store shared by localized native elements. Language changes do
 * not remount the application tree, so in-progress form state remains intact.
 */
export function createLanguageStore(options: LanguageStoreOptions = {}): LanguageStore {
  const storage = options.storage ?? getBrowserStorage();
  const documentTarget = options.document ?? getBrowserDocument();
  const listeners = new Set<Listener>();
  const catalogCache = new Map<LanguageCode, TranslationCatalog>();
  let loadCatalog = options.loadCatalog ?? defaultCatalogLoader;
  let snapshot = INITIAL_SNAPSHOT;
  let requestId = 0;

  const syncDocumentLanguage = () => {
    if (!documentTarget) return;
    documentTarget.documentElement.lang = snapshot.language;
    documentTarget.documentElement.dir = getLanguageDirection(snapshot.language);
  };

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const publish = (next: LanguageSnapshot) => {
    snapshot = next;
    syncDocumentLanguage();
    emit();
  };

  const persist = (language: LanguageCode) => {
    if (!storage) return;
    try {
      storage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Private browsing and storage restrictions must not block language use.
    }
  };

  syncDocumentLanguage();

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => INITIAL_SNAPSHOT,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setCatalogLoader(loader) {
      loadCatalog = loader;
      catalogCache.clear();
    },
    syncDocumentLanguage,
    async setLanguage(language) {
      if (!isLanguageCode(language)) return;

      if (language === DEFAULT_LANGUAGE) {
        requestId += 1;
        if (
          snapshot.language !== DEFAULT_LANGUAGE ||
          snapshot.isLoading ||
          snapshot.catalog !== EMPTY_CATALOG
        ) {
          publish({
            language: DEFAULT_LANGUAGE,
            catalog: EMPTY_CATALOG,
            isLoading: false,
            pendingLanguage: null,
          });
        }
        persist(DEFAULT_LANGUAGE);
        return;
      }

      if (snapshot.language === language && !snapshot.isLoading) {
        persist(language);
        return;
      }

      const activeRequest = ++requestId;
      publish({
        ...snapshot,
        isLoading: true,
        pendingLanguage: language,
      });

      let catalog = catalogCache.get(language);
      if (!catalog) {
        try {
          catalog = asCatalog(await loadCatalog(language));
          catalogCache.set(language, catalog);
        } catch {
          // A missing or malformed optional catalog falls back to source strings.
          catalog = EMPTY_CATALOG;
        }
      }

      if (activeRequest !== requestId) return;

      publish({
        language,
        catalog,
        isLoading: false,
        pendingLanguage: null,
      });
      persist(language);
    },
    async restorePersistedLanguage() {
      const storedLanguage = readStoredLanguage(storage);
      if (storedLanguage === snapshot.language && !snapshot.isLoading) {
        syncDocumentLanguage();
        return;
      }
      await this.setLanguage(storedLanguage);
    },
  };
}

export const languageStore = createLanguageStore();
