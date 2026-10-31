import { describe, expect, it } from "vitest";
import { Fragment, isValidElement } from "react";
import { localizeComponentChildren } from "./LocalizedText";

describe("library component display text", () => {
  it("wraps only display children and preserves refs, IDs, hrefs and handlers", () => {
    const ref = { current: null },
      onClick = () => {};
    const props = {
      children: "عرض الملف",
      ref,
      onClick,
      href: "/players/13",
      value: "football",
    };
    const result = localizeComponentChildren(() => null, props)!;
    expect(isValidElement(result.children)).toBe(true);
    expect(result.ref).toBe(ref);
    expect(result.onClick).toBe(onClick);
    expect(result.href).toBe("/players/13");
    expect(result.value).toBe("football");
  });
  it("preserves fragments and explicit ignored content", () => {
    const props = { children: "عرض الملف" };
    expect(localizeComponentChildren(Fragment, props)).toBe(props);
    const ignored = { children: "نص أصلي", "data-i18n-ignore": true };
    expect(localizeComponentChildren(() => null, ignored)).toBe(ignored);
  });
});
