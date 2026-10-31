import { createElement, Fragment, useEffect, type ReactNode } from "react";
import { languageStore } from "./language";

/** Initializes the persisted browser locale once without remounting children. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void languageStore.restorePersistedLanguage();
  }, []);

  return createElement(Fragment, null, children);
}
