import {
  createElement,
  forwardRef,
  useSyncExternalStore,
  type ElementType,
} from "react";
import { languageStore, localizeDomProps } from "./language";

export interface LocalizedDOMProps {
  elementType: string;
  elementProps: Record<string, unknown>;
}

export function preserveImplicitOptionValue(
  elementType: string,
  props: Record<string, unknown>
): Record<string, unknown> {
  if (elementType !== "option" || props.value !== undefined) return props;
  const children = props.children;
  if (typeof children === "string" || typeof children === "number")
    return { ...props, value: String(children) };
  if (
    Array.isArray(children) &&
    children.every(
      child => typeof child === "string" || typeof child === "number"
    )
  )
    return { ...props, value: children.join("") };
  return props;
}

/**
 * React host wrapper used only by the custom JSX runtime. It preserves the
 * original host type and ref while subscribing to locale changes independently
 * from feature components, avoiding app-tree remounts and DOM mutation.
 */
export const LocalizedDOM = forwardRef<unknown, LocalizedDOMProps>(
  ({ elementType, elementProps }, forwardedRef) => {
    const snapshot = useSyncExternalStore(
      languageStore.subscribe,
      languageStore.getSnapshot,
      languageStore.getServerSnapshot
    );
    const props = localizeDomProps(
      preserveImplicitOptionValue(elementType, elementProps),
      snapshot
    );

    return createElement(
      elementType as ElementType,
      {
        ...props,
        ref: forwardedRef,
      } as Record<string, unknown>
    );
  }
);

LocalizedDOM.displayName = "LocalizedDOM";
