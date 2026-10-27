import { describe, expect, it } from "vitest";
import { HttpError } from "../../shared/_core/errors";
import {
  assertApparatusForSport,
  assertSkillBelongsToSport,
  assertSportChangeAllowed,
  normalizePlayerSport,
  organizationSupportsSport,
} from "./sport-rules";

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return (error as HttpError).message;
  }
  throw new Error("Expected the rule to reject the input");
}

describe("sport assignment rules", () => {
  it("derives the stored group from the sport instead of trusting the client", () => {
    expect(
      normalizePlayerSport({
        sport: "gymnastics",
        gymnasticsCategory: "mens_artistic",
        position: "مهاجم",
      })
    ).toEqual({
      sport: "gymnastics",
      gymnasticsCategory: "mens_artistic",
      position: "الجمباز الفني — رجال",
    });
    expect(
      normalizePlayerSport({
        sport: "football",
        gymnasticsCategory: "",
        position: "وسط",
      })
    ).toEqual({
      sport: "football",
      gymnasticsCategory: "",
      position: "وسط",
    });
  });

  it("rejects invalid sport/category/group combinations", () => {
    expect(
      messageOf(() =>
        normalizePlayerSport({
          sport: "gymnastics",
          gymnasticsCategory: "",
          position: "مهاجم",
        })
      )
    ).toContain("فئة الجمباز");
    expect(
      messageOf(() =>
        normalizePlayerSport({
          sport: "football",
          gymnasticsCategory: "womens_artistic",
          position: "مهاجم",
        })
      )
    ).toContain("لا تُستخدم");
  });

  it("overrides an inconsistent client group with the category group", () => {
    // The client cannot smuggle a football position into a gymnastics profile.
    expect(
      normalizePlayerSport({
        sport: "gymnastics",
        gymnasticsCategory: "womens_artistic",
        position: "مدافع",
      }).position
    ).toBe("الجمباز الفني — سيدات");
    // A football player cannot keep a gymnastics category label as position.
    expect(
      messageOf(() =>
        normalizePlayerSport({
          sport: "football",
          gymnasticsCategory: "",
          position: "الجمباز الفني — سيدات",
        })
      )
    ).toContain("المركز");
  });

  it("requires the organization to operate the sport", () => {
    expect(organizationSupportsSport(["football", "gymnastics"], "gymnastics")).toBe(
      true
    );
    expect(organizationSupportsSport(["football"], "gymnastics")).toBe(false);
  });

  it("blocks a silent sport change once sessions exist", () => {
    expect(() =>
      assertSportChangeAllowed("football", "gymnastics", 2)
    ).toThrowError(HttpError);
    expect(() => assertSportChangeAllowed("football", "gymnastics", 0)).not.toThrow();
    expect(() => assertSportChangeAllowed("football", "football", 5)).not.toThrow();
  });

  it("validates skills against the athlete's sport", () => {
    expect(() => assertSkillBelongsToSport("football", "التسديد")).not.toThrow();
    expect(() => assertSkillBelongsToSport("football", "الحلقات")).toThrowError(
      HttpError
    );
    expect(() => assertSkillBelongsToSport("gymnastics", "الحلقات")).not.toThrow();
  });

  it("accepts only apparatus allowed for the athlete's gymnastics category", () => {
    expect(() =>
      assertApparatusForSport("gymnastics", "womens_artistic", "balance_beam")
    ).not.toThrow();
    expect(() =>
      assertApparatusForSport("gymnastics", "womens_artistic", "pommel_horse")
    ).toThrowError(HttpError);
    expect(() =>
      assertApparatusForSport("gymnastics", "", "floor")
    ).toThrowError(HttpError);
    expect(() =>
      assertApparatusForSport("gymnastics", "mens_artistic", "")
    ).toThrowError(HttpError);
    expect(() => assertApparatusForSport("football", "", "")).not.toThrow();
    expect(() =>
      assertApparatusForSport("football", "", "rings")
    ).toThrowError(HttpError);
  });
});
