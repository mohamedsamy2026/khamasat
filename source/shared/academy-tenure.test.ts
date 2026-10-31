import { describe, expect, it } from "vitest";
import {
  calendarToday,
  formatAcademyTenure,
  getAcademyTenure,
  isValidCalendarDate,
} from "./academy-tenure";

describe("academy calendar tenure", () => {
  it("calculates complete years months and remaining days", () => {
    expect(getAcademyTenure("2024-01-15", "2026-10-31")).toMatchObject({
      years: 2,
      months: 9,
      days: 16,
      totalMonths: 33,
    });
    expect(formatAcademyTenure("2024-01-15", "2026-10-31")).toBe(
      "سنتان و9 أشهر و16 يومًا"
    );
  });
  it("clamps anniversaries at month end instead of rolling into March", () => {
    expect(getAcademyTenure("2025-01-31", "2025-02-28")).toMatchObject({
      months: 1,
      days: 0,
      totalDays: 28,
    });
    expect(getAcademyTenure("2024-02-29", "2025-02-28")).toMatchObject({
      years: 1,
      months: 0,
      days: 0,
      totalDays: 365,
    });
    expect(getAcademyTenure("2025-01-31", "2025-03-30")).toMatchObject({
      months: 1,
      days: 30,
    });
  });
  it("keeps unentered and before-joining history unmeasured", () => {
    expect(getAcademyTenure("", "2026-10-31")).toBeNull();
    expect(getAcademyTenure("2026-10-31", "2026-08-10")).toBeNull();
    expect(formatAcademyTenure("2026-10-31", "2026-08-10")).toBe(
      "قبل تاريخ الانضمام المدخل"
    );
    expect(formatAcademyTenure("", "2026-10-31")).toBe(
      "لم يُحدد تاريخ الانضمام"
    );
    expect(formatAcademyTenure("2026-10-31", "2026-10-31")).toBe(
      "يوم الانضمام"
    );
  });
  it("rejects impossible calendar dates", () => {
    expect(isValidCalendarDate("2025-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-04-31")).toBe(false);
    expect(isValidCalendarDate("2024-02-29")).toBe(true);
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
  });
  it("uses Riyadh civil dates without DST or UTC midnight drift", () => {
    expect(calendarToday(new Date("2026-10-30T22:00:00.000Z"))).toBe(
      "2026-10-31"
    );
    expect(getAcademyTenure("2026-01-01", "2026-01-02")?.totalDays).toBe(1);
  });
});
