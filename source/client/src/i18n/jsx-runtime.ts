import {
  Fragment,
  jsx as reactJsx,
  jsxs as reactJsxs,
} from "react/jsx-runtime";
import type { JSX as ReactJSX } from "react";
import { LocalizedDOM } from "./LocalizedDOM";
import { localizeComponentChildren } from "./LocalizedText";

type JsxProps = Record<string, unknown> | null;

function splitRef(props: JsxProps) {
  if (!props || !("ref" in props)) {
    return { elementProps: props ?? {}, ref: undefined };
  }

  const { ref, ...elementProps } = props;
  return { elementProps, ref };
}

function localizeNativeElement(
  type: string,
  props: JsxProps,
  key: string | number | bigint | undefined,
  createElement: typeof reactJsx
) {
  const { elementProps, ref } = splitRef(props);
  return createElement(
    LocalizedDOM,
    { elementType: type, elementProps, ref },
    key
  );
}

/** Wrap native HTML/SVG JSX only; React components retain their original identity. */
export function jsx(
  type: unknown,
  props: JsxProps,
  key?: string | number | bigint
) {
  return typeof type === "string"
    ? localizeNativeElement(type, props, key, reactJsx)
    : reactJsx(type as never, localizeComponentChildren(type, props), key);
}

export function jsxs(
  type: unknown,
  props: JsxProps,
  key?: string | number | bigint
) {
  return typeof type === "string"
    ? localizeNativeElement(type, props, key, reactJsxs)
    : reactJsxs(type as never, localizeComponentChildren(type, props), key);
}

export { Fragment };

export namespace JSX {
  export type Element = ReactJSX.Element;
  export type ElementType = ReactJSX.ElementType;
  export interface ElementClass extends ReactJSX.ElementClass {}
  export interface ElementAttributesProperty
    extends ReactJSX.ElementAttributesProperty {}
  export interface ElementChildrenAttribute
    extends ReactJSX.ElementChildrenAttribute {}
  export interface IntrinsicAttributes extends ReactJSX.IntrinsicAttributes {}
  export interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  export type LibraryManagedAttributes<C, P> =
    ReactJSX.LibraryManagedAttributes<C, P>;
}
