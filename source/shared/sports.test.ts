import { describe, expect, it } from "vitest";
import {
  ALL_SKILLS,
  FOOTBALL,
  GYMNASTICS,
  GYMNASTICS_APPARATUS,
  GYMNASTICS_INDICATORS,
  SPORTS,
  apparatusAllowedForCategory,
  apparatusForCategory,
  apparatusOrderForCategory,
  indicatorsFor,
  isSportId,
  skillsForSport,
  sportDefinition,
} from "./sports";

describe("sport configuration registry", () => {
  it("preserves legacy vocabulary and adds wing sides and goalkeeper skills", () => {
    expect(Object.keys(SPORTS).sort()).toEqual(["football", "gymnastics"]);
    expect(FOOTBALL.groups.map(group => group.name)).toEqual([
      "مهاجم",
      "وسط",
      "مدافع",
      "جناح",
      "جناح أيمن",
      "جناح أيسر",
      "حارس مرمى",
    ]);
    expect(skillsForSport("football")).toContain("التسديد");
    expect(skillsForSport("football")).toContain("التصدي");
    expect(skillsForSport("football")).toContain("التعامل مع الكرات العالية");
    expect(FOOTBALL.skills).toHaveLength(16);
    expect(isSportId("gymnastics")).toBe(true);
    expect(isSportId("swimming")).toBe(false);
  });

  it("uses the exact women's apparatus rotation order", () => {
    expect(apparatusOrderForCategory("womens_artistic")).toEqual([
      "vault",
      "uneven_bars",
      "balance_beam",
      "floor",
    ]);
    expect(
      apparatusForCategory("womens_artistic").map(apparatus => apparatus.id)
    ).toEqual(["vault", "uneven_bars", "balance_beam", "floor"]);
  });

  it("uses the exact men's apparatus rotation order", () => {
    expect(apparatusOrderForCategory("mens_artistic")).toEqual([
      "floor",
      "pommel_horse",
      "rings",
      "vault",
      "parallel_bars",
      "horizontal_bar",
    ]);
    expect(
      apparatusForCategory("mens_artistic").map(apparatus => apparatus.name)
    ).toEqual([
      "الحركات الأرضية",
      "حصان الحلق",
      "الحلق",
      "طاولة القفز",
      "المتوازي",
      "العقلة",
    ]);
  });

  it("prevents apparatus from the wrong category", () => {
    expect(apparatusAllowedForCategory("womens_artistic", "balance_beam")).toBe(
      true
    );
    expect(apparatusAllowedForCategory("womens_artistic", "rings")).toBe(false);
    expect(apparatusAllowedForCategory("mens_artistic", "uneven_bars")).toBe(
      false
    );
    expect(apparatusAllowedForCategory("mens_artistic", "pommel_horse")).toBe(
      true
    );
    expect(apparatusAllowedForCategory(null, "floor")).toBe(false);
    expect(apparatusAllowedForCategory("womens_artistic", "trampoline")).toBe(
      false
    );
  });

  it("defines roughly twenty provisional indicators per sport with unique codes", () => {
    for (const sport of [FOOTBALL, GYMNASTICS]) {
      expect(sport.indicators.length).toBeGreaterThanOrEqual(20);
      const codes = sport.indicators.map(indicator => indicator.code);
      expect(new Set(codes).size).toBe(codes.length);
      for (const indicator of sport.indicators) {
        expect(indicator.validationStatus).toBe("provisional_unvalidated");
        expect(indicator.units.length).toBeGreaterThan(0);
        expect(indicator.label.length).toBeGreaterThan(1);
        expect(indicator.sourceRefs.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every gymnastics indicator linked to real apparatus", () => {
    const apparatusIds = new Set(GYMNASTICS_APPARATUS.map(item => item.id));
    for (const indicator of GYMNASTICS_INDICATORS) {
      for (const apparatus of indicator.apparatus)
        expect(apparatusIds.has(apparatus)).toBe(true);
    }
  });

  it("scopes gymnastics indicators to the selected apparatus", () => {
    const ringsOnly = indicatorsFor("gymnastics", "rings");
    expect(ringsOnly.some(item => item.code === "gym.rings.support")).toBe(
      true
    );
    expect(ringsOnly.some(item => item.code === "gym.vault.run_speed")).toBe(
      false
    );
    expect(
      indicatorsFor("gymnastics", "vault").some(
        item => item.code === "gym.vault.board_rebound"
      )
    ).toBe(true);
    // Indicators with no apparatus restriction are available everywhere.
    expect(
      indicatorsFor("gymnastics", "vault").some(
        item => item.code === "gym.upper.push_up"
      )
    ).toBe(true);
  });

  it("keeps every apparatus name usable as a gymnastics session skill", () => {
    // The client records the apparatus name as the session skill; the server
    // rejects a skill outside the sport, so these lists must stay in sync.
    for (const apparatus of GYMNASTICS_APPARATUS)
      expect(skillsForSport("gymnastics")).toContain(apparatus.name);
    const names = GYMNASTICS_APPARATUS.map(item => item.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("exposes a backward-compatible union of all sport skills", () => {
    expect(ALL_SKILLS).toContain("التسديد");
    expect(ALL_SKILLS).toContain("الحلقات");
    expect(new Set(ALL_SKILLS).size).toBe(ALL_SKILLS.length);
    expect(sportDefinition("gymnastics").terminology.athlete).toBe(
      "لاعب جمباز"
    );
  });
});
