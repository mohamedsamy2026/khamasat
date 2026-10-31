import { createElement, useSyncExternalStore } from "react";
import { languageStore, translateText } from "./language";
import { LANGUAGE_CODES, LANGUAGE_NATIVE_NAMES } from "./types";

const STATUS_ID = "language-selector-status";

/**
 * Always-mounted locale control. Native language names are intentionally not
 * translated, so users can recognize each language in its own script.
 */
export function LanguageSelector() {
  const snapshot = useSyncExternalStore(
    languageStore.subscribe,
    languageStore.getSnapshot,
    languageStore.getServerSnapshot
  );
  const label = translateText("اللغة", snapshot.language, snapshot.catalog);
  const loadingLabel = translateText(
    "جارٍ تحميل اللغة…",
    snapshot.language,
    snapshot.catalog
  );
  const selectedLanguage = snapshot.pendingLanguage ?? snapshot.language;

  return createElement(
    "div",
    { className: "language-selector-wrap", "data-i18n-ignore": true },
    createElement(
      "label",
      { className: "language-selector-label", htmlFor: "language-selector" },
      label
    ),
    createElement(
      "select",
      {
        id: "language-selector",
        className: "language-selector",
        "data-testid": "language-selector",
        value: selectedLanguage,
        disabled: snapshot.isLoading,
        "aria-label": label,
        "aria-describedby": STATUS_ID,
        onChange: (event: { currentTarget: HTMLSelectElement }) => {
          void languageStore.setLanguage(
            event.currentTarget.value as (typeof LANGUAGE_CODES)[number]
          );
        },
      },
      LANGUAGE_CODES.map(language =>
        createElement(
          "option",
          { key: language, value: language },
          LANGUAGE_NATIVE_NAMES[language]
        )
      )
    ),
    createElement(
      "span",
      {
        id: STATUS_ID,
        className: "language-selector-status",
        role: "status",
        "aria-live": "polite",
      },
      snapshot.isLoading ? loadingLabel : ""
    )
  );
}
