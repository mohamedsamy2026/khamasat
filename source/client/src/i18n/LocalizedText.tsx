import { createElement, useSyncExternalStore } from "react";
import { languageStore, translateText } from "./language";

export function LocalizedText({ value }: { value: string }) {
  const snapshot = useSyncExternalStore(
    languageStore.subscribe,
    languageStore.getSnapshot,
    languageStore.getServerSnapshot
  );
  return translateText(value, snapshot.language, snapshot.catalog);
}

/** Libraries such as Wouter render their own anchors outside our JSX runtime. */
export function localizeComponentChildren(
  type: unknown,
  props: Record<string, unknown> | null
) {
  if (!props || typeof type === "symbol" || props["data-i18n-ignore"])
    return props;
  const wrap = (child: unknown, index: number) =>
    typeof child === "string" && /[\u0600-\u06ff]/.test(child)
      ? createElement(LocalizedText, { value: child, key: `ui-text-${index}` })
      : child;
  const children = Array.isArray(props.children)
    ? props.children.map(wrap)
    : wrap(props.children, 0);
  return children === props.children ? props : { ...props, children };
}
