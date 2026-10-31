import { describe, expect, it } from "vitest";
import type { Report } from "../../shared/athlete";
import { hasPdfMagic } from "./pdfReport";
import {
  DEMO_ASSESSMENT_NOTICE,
  escapeReportCsvCell,
  exportVerifiedReportHtml,
  formatArabicPercent,
  savedAssessmentOverall10,
} from "./verifiedReportExport";

function reportFixture(): Report {
  return {
    player: {
      id: 1,
      academyId: 1,
      sport: "football",
      gymnasticsCategory: "",
      academyName: "أكاديمية اختبار",
      name: "<لاعب>",
      age: 16,
      nationality: "سعودي",
      position: "مهاجم",
      foot: "أيمن",
      height: 175,
      weight: 65,
      region: "الرياض",
      photoKey: "../../not-local.jpg",
      overall: 0,
      improvement: 0,
      skills: [],
      discoverable: false,
      lastAnalysis: null,
      birthDate: "2010-01-01",
      jersey: 9,
      strengths: [],
      weaknesses: [],
      physicalTests: [],
      history: [],
      isDemo: true,
    },
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-31T23:59:59.999Z",
    skill: "",
    analyses: [],
    videos: [
      {
        id: 1,
        playerId: 1,
        title: "<img src=x>",
        skill: "التسديد",
        recordedAt: "2026-10-03T00:00:00.000Z",
        size: 1,
        mime: "video/mp4",
        createdAt: "2026-10-03T00:00:00.000Z",
        source: {
          url: "javascript:alert(1)",
          license: "CC BY",
          credit: "<script>غير موثوق</script>",
          description: "=HYPERLINK(\"https://unsafe.example\")",
        },
      },
    ],
    notes: [
      {
        id: 1,
        playerId: 1,
        playerName: "<لاعب>",
        text: "<b>نص غير موثوق</b>",
        createdAt: "2026-10-04T00:00:00.000Z",
        source: "coach",
      },
    ],
    coachAssessments: [
      {
        id: 1,
        playerId: 1,
        coachName: "اسم لا ينبغي تقديمه كمدرب حقيقي",
        coachPhotoKey: "",
        assessedAt: "2026-10-05T00:00:00.000Z",
        protocol: "مراجعة مهارات فردية",
        notes: "<img src=x onerror=alert(1)>",
        skills: [
          { name: "التسديد", score: 80 },
          { name: "التمرير", score: 60 },
        ],
        // Validated server-derived mean before report skill filtering.
        overall: 70,
        strengths: ["<قوة>"],
        development: ["<تطوير>"],
        exercises: [{ title: "تمرين", description: "<وصف>" }],
        isDemo: true,
      },
    ],
    isDemo: true,
  };
}

describe("verified PDF report helpers", () => {
  it("escapes untrusted saved fields and exposes saved coach mean as /10", () => {
    const html = exportVerifiedReportHtml(reportFixture());

    expect(html).toContain("&lt;script&gt;غير موثوق&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).toContain(DEMO_ASSESSMENT_NOTICE);
    expect(html).toContain("٧٫٠ / ١٠");
    expect(html).not.toContain("اسم لا ينبغي تقديمه كمدرب حقيقي");
  });

  it("keeps CSV formula escaping and uses Arabic percent glyphs", () => {
    expect(escapeReportCsvCell("=1+1")).toBe("\"'=1+1\"");
    expect(formatArabicPercent(80)).toContain("٨٠");
  });

  it("preserves the full server-derived mean when only one skill is selected", () => {
    const [assessment] = reportFixture().coachAssessments!;
    expect(savedAssessmentOverall10(assessment!)).toBe(7);
    expect(savedAssessmentOverall10({ ...assessment!, skills: [{ name: "التسديد", score: 80 }] })).toBe(7);
    expect(savedAssessmentOverall10({ skills: [{ name: "التسديد", score: 80 }] })).toBe(8);
  });

  it("recognizes only real PDF magic", () => {
    expect(hasPdfMagic(Buffer.from("%PDF-1.7\n"))).toBe(true);
    expect(hasPdfMagic(Buffer.from("<html>not a PDF</html>"))).toBe(false);
  });
});


describe("academy joining context in report exports", () => {
  it("includes joining date and chronological tenure in HTML and CSV", async () => {
    const { reportTenureRows, exportVerifiedReportCsv } = await import("./verifiedReportExport");
    const { formatAcademyTenure } = await import("../../shared/academy-tenure");
    const report = reportFixture();
    report.player.academyJoinDate = "2026-01-15";
    const current = report.coachAssessments![0]!;
    report.coachAssessments!.push({ ...current, id: 2, assessedAt: "2026-08-15T00:00:00.000Z" });
    const rows = reportTenureRows(report);
    expect(rows[0].tenure).toBe(formatAcademyTenure("2026-01-15", "2026-08-15"));
    expect(rows[1].tenure).toBe(formatAcademyTenure("2026-01-15", "2026-10-05"));
    expect(rows[0].tenure).not.toBe(rows[1].tenure);
    expect(exportVerifiedReportHtml(report)).toContain("مدة الانضمام وتطور الأداء");
    expect(exportVerifiedReportHtml(report)).toContain("2026-01-15");
    expect(exportVerifiedReportCsv(report)).toContain(rows[0].tenure);
    expect(exportVerifiedReportCsv(report)).toContain(rows[1].tenure);
  });
  it("keeps previous results before joining and unknown joining dates unmeasured", async () => {
    const { reportTenureRows } = await import("./verifiedReportExport");
    const report = reportFixture();
    report.player.academyJoinDate = "2026-10-10";
    expect(reportTenureRows(report)[0].tenure).toBe("قبل تاريخ الانضمام المدخل");
    report.player.academyJoinDate = "";
    expect(reportTenureRows(report)[0].tenure).toBe("لم يُحدد تاريخ الانضمام");
  });
});
