import { describe, expect, it } from "vitest";
import {
  analysisInputSchema,
  exportQuerySchema,
  isoDate,
  playerInputSchema,
  reportQuerySchema,
  videoQuerySchema,
} from "./validation";
import { validPoseResult } from "./route-test-support";

const player = {
  name: "لاعب تجريبي",
  sport: "football",
  age: 16,
  nationality: "سعودي",
  position: "مهاجم",
  foot: "أيمن",
  height: 175,
  weight: 64,
  birthDate: "2010-10-15",
  jersey: 10,
  region: "الرياض",
  discoverable: true,
  physicalTests: [{ name: "سرعة 30م", value: "", unit: "" }],
};

describe("athlete input validation", () => {
  it("accepts intentionally blank physical-test values for a newly created player", () => {
    expect(playerInputSchema.safeParse(player).success).toBe(true);
  });

  it("requires a registered sport and keeps the sport/group pair consistent", () => {
    expect(playerInputSchema.safeParse({ ...player, sport: undefined }).success).toBe(
      false
    );
    expect(playerInputSchema.safeParse({ ...player, sport: "swimming" }).success).toBe(
      false
    );
    // A football player cannot claim a gymnastics category.
    expect(
      playerInputSchema.safeParse({
        ...player,
        gymnasticsCategory: "womens_artistic",
      }).success
    ).toBe(false);
    // A football position is not valid for gymnastics.
    expect(
      playerInputSchema.safeParse({ ...player, sport: "gymnastics" }).success
    ).toBe(false);
    // Gymnastics requires a category and derives its group from it.
    expect(
      playerInputSchema.safeParse({
        ...player,
        sport: "gymnastics",
        gymnasticsCategory: "womens_artistic",
        position: "مهاجم",
      }).success
    ).toBe(false);
    expect(
      playerInputSchema.safeParse({
        ...player,
        sport: "gymnastics",
        gymnasticsCategory: "womens_artistic",
        position: "الجمباز الفني — سيدات",
      }).success
    ).toBe(true);
  });

  it("rejects a birth date inconsistent with the stated age", () => {
    expect(
      playerInputSchema.safeParse({ ...player, birthDate: "2000-01-01" })
        .success
    ).toBe(false);
  });

  it("requires a positive uploaded video id for every newly created analysis", () => {
    expect(
      analysisInputSchema.safeParse({ playerId: 101, skill: "التسديد" }).success
    ).toBe(false);
    expect(
      analysisInputSchema.safeParse({
        playerId: 101,
        skill: "التسديد",
        videoId: 301,
        pose: validPoseResult(),
      }).data
    ).toMatchObject({ videoId: 301 });
  });

  it("accepts the all-skills selection used by report and export controls", () => {
    expect(
      reportQuerySchema.parse({
        from: "2026-06-01",
        to: "2026-10-25",
        skill: "all",
      }).skill
    ).toBeUndefined();
    expect(
      exportQuerySchema.parse({ skill: "all", format: "html" }).skill
    ).toBeUndefined();
  });

  it("rejects impossible calendar dates instead of creating invalid report ranges", () => {
    expect(isoDate.safeParse("2026-99-01").success).toBe(false);
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
    expect(isoDate.safeParse("2026-02-28").success).toBe(true);
  });

  it("validates video title, recorded date, and HTTPS-only source metadata", () => {
    expect(
      videoQuerySchema.safeParse({
        playerId: 101,
        name: "مقطع مرخّص",
        recordedAt: "2026-10-01T10:20:30.000Z",
        sourceURL: "https://media.example.test/clip.mp4",
        sourceCredit: "أرشيف مرخّص",
        sourceLicense: "CC BY 4.0",
        sourceDescription: "مصدر المقطع فقط",
      }).success
    ).toBe(true);
    expect(
      videoQuerySchema.safeParse({ playerId: 101, recordedAt: "2026-02-30" })
        .success
    ).toBe(false);
    expect(
      videoQuerySchema.safeParse({
        playerId: 101,
        sourceURL: "javascript:alert(1)",
      }).success
    ).toBe(false);
    expect(
      videoQuerySchema.safeParse({
        playerId: 101,
        sourceCredit: "مورد بلا رابط",
      }).success
    ).toBe(false);
  });
});
