import { describe, expect, it } from "vitest";
import { preserveImplicitOptionValue } from "./LocalizedDOM";

describe("translated option values remain canonical", () => {
  it("freezes an implicit Arabic option value before translating its text", () => {
    expect(
      preserveImplicitOptionValue("option", { children: "اليمنى" })
    ).toEqual({ children: "اليمنى", value: "اليمنى" });
    expect(
      preserveImplicitOptionValue("option", { children: [14, " - ", 18] }).value
    ).toBe("14 - 18");
  });
  it("never replaces explicit IDs or input values", () => {
    expect(
      preserveImplicitOptionValue("option", {
        children: "كرة القدم",
        value: "football",
      }).value
    ).toBe("football");
    const input = { children: "نص", value: "قيمة محفوظة" };
    expect(preserveImplicitOptionValue("input", input)).toBe(input);
  });
});
