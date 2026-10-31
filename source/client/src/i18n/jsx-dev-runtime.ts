import { Fragment, jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import type { JSX as ReactJSX } from "react";
import { LocalizedDOM } from "./LocalizedDOM";
import { localizeComponentChildren } from "./LocalizedText";

type JsxProps = Record<string, unknown> | null;
type ReactJsxDevArgs = Parameters<typeof reactJsxDEV>;

function splitRef(props: JsxProps) {
  if (!props || !("ref" in props)) {
    return { elementProps: props ?? {}, ref: undefined };
  }

  const { ref, ...elementProps } = props;
  return { elementProps, ref };
}

export function jsxDEV(
  type: unknown,
  props: JsxProps,
  key: string | number | bigint | undefined,
  isStaticChildren: boolean,
  source: ReactJsxDevArgs[4],
  self: ReactJsxDevArgs[5]
) {
  if (typeof type !== "string") {
    return reactJsxDEV(
      type as never,
      localizeComponentChildren(type, props),
      key,
      isStaticChildren,
      source,
      self
    );
  }

  const { elementProps, ref } = splitRef(props);
  return reactJsxDEV(
    LocalizedDOM,
    { elementType: type, elementProps, ref },
    key,
    isStaticChildren,
    source,
    self
  );
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
