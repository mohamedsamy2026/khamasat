import { describe, expect, it } from "vitest";
import { LocalizedDOM } from "./LocalizedDOM";
import {
  LANGUAGE_STORAGE_KEY,
  createLanguageStore,
  getLanguageDirection,
  localizeDomProps,
  translateText,
} from "./language";
import { jsx } from "./jsx-runtime";
import { LANGUAGE_CODES, type TranslationCatalog } from "./types";

const catalog: TranslationCatalog = {
  "لوحة التحكم": "Dashboard",
  "لاعب": "player",
  "سنتان": "two years",
  "أشهر": "months",
  "يومًا": "days",
  "و": "and ",
  "عرض ملف {0} التجريبي": "View demo profile {0}",
  "الأكاديمية": "Academy",
  "التقييم {0} {1}": "Rating {0} {1}",
  "اختيار اللغة": "Choose language",
  "العنوان": "Title",
  "وصف الصورة": "Image description",
};

describe("i18n text resolver", () => {
  it("uses exact Arabic source keys, preserves JSX whitespace, and falls back safely", () => {
    expect(translateText("  لوحة التحكم\n", "en", catalog)).toBe("  Dashboard\n");
    expect(translateText("نص كتبه المدرب", "en", catalog)).toBe("نص كتبه المدرب");
    expect(translateText("لوحة التحكم", "ar", catalog)).toBe("لوحة التحكم");
  });

  it("handles a number plus a known short UI fragment without touching free prose", () => {
    expect(translateText("  3 لاعب ", "en", catalog)).toBe("  3 player ");
    expect(translateText("3 لاعب مميز", "en", catalog)).toBe("3 لاعب مميز");
    expect(translateText("سنتان و9 أشهر و16 يومًا", "en", catalog)).toBe(
      "two years and 9 months and 16 days"
    );
  });

  it("uses only anchored local templates and preserves free-text captures", () => {
    expect(translateText("عرض ملف أحمد التجريبي", "en", catalog)).toBe(
      "View demo profile أحمد"
    );
    expect(translateText("عرض ملف الأكاديمية التجريبي", "en", catalog)).toBe(
      "View demo profile Academy"
    );
    expect(translateText("التقييم 8 ملاحظة خاصة للمدرب", "en", catalog)).toBe(
      "Rating 8 ملاحظة خاصة للمدرب"
    );
    expect(translateText("قبل عرض ملف أحمد التجريبي", "en", catalog)).toBe(
      "قبل عرض ملف أحمد التجريبي"
    );
  });
});

describe("i18n DOM props", () => {
  it("translates display text and safe display attributes only", () => {
    const props = {
      children: ["لوحة التحكم", { userAuthored: "ملاحظة المدرب" }],
      title: "العنوان",
      "aria-label": "اختيار اللغة",
      placeholder: "لوحة التحكم",
      alt: "وصف الصورة",
      value: "مهاجم",
      name: "position",
      key: "player-7",
      href: "/players/7",
      src: "/api/videos/7",
      "data-player-id": "7",
    };

    const localized = localizeDomProps(props, { language: "en", catalog });

    expect(localized.children).toEqual(["Dashboard", { userAuthored: "ملاحظة المدرب" }]);
    expect(localized.title).toBe("Title");
    expect(localized["aria-label"]).toBe("Choose language");
    expect(localized.placeholder).toBe("Dashboard");
    expect(localized.alt).toBe("Image description");
    expect(localized.value).toBe("مهاجم");
    expect(localized.name).toBe("position");
    expect(localized.key).toBe("player-7");
    expect(localized.href).toBe("/players/7");
    expect(localized.src).toBe("/api/videos/7");
    expect(localized["data-player-id"]).toBe("7");
  });

  it("keeps a JSX key and native element props when routing a host tag through the wrapper", () => {
    const element = jsx(
      "button",
      { children: "لوحة التحكم", value: "مهاجم", "data-player-id": "7" },
      "player-7"
    );

    expect(element.type).toBe(LocalizedDOM);
    expect(element.key).toBe("player-7");
    expect((element.props as { elementProps: Record<string, unknown> }).elementProps).toMatchObject({
      children: "لوحة التحكم",
      value: "مهاجم",
      "data-player-id": "7",
    });
  });
});

describe("i18n language store", () => {
  it("uses RTL only for Arabic and Urdu", () => {
    for (const language of LANGUAGE_CODES) {
      expect(getLanguageDirection(language)).toBe(
        language === "ar" || language === "ur" ? "rtl" : "ltr"
      );
    }
  });

  it("loads before changing the active language, persists the choice, and updates html language metadata", async () => {
    const storage = new Map<string, string>([[LANGUAGE_STORAGE_KEY, "en"]]);
    const documentTarget = { documentElement: { lang: "", dir: "" } };
    let resolveCatalog: ((catalog: TranslationCatalog) => void) | undefined;
    const store = createLanguageStore({
      storage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
      document: documentTarget,
      loadCatalog: language =>
        language === "en"
          ? new Promise(resolve => {
              resolveCatalog = resolve;
            })
          : Promise.resolve(catalog),
    });

    const restoring = store.restorePersistedLanguage();
    expect(store.getSnapshot()).toMatchObject({
      language: "ar",
      isLoading: true,
      pendingLanguage: "en",
    });
    expect(documentTarget.documentElement).toEqual({ lang: "ar", dir: "rtl" });

    resolveCatalog?.(catalog);
    await restoring;

    expect(store.getSnapshot()).toMatchObject({
      language: "en",
      catalog,
      isLoading: false,
      pendingLanguage: null,
    });
    expect(storage.get(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(documentTarget.documentElement).toEqual({ lang: "en", dir: "ltr" });

    await store.setLanguage("ur");
    expect(storage.get(LANGUAGE_STORAGE_KEY)).toBe("ur");
    expect(documentTarget.documentElement).toEqual({ lang: "ur", dir: "rtl" });
  });
});
