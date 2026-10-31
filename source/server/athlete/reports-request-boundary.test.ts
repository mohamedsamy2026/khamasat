import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
  testPlayer,
  testVideo,
  validPoseResult,
  type AthleteRouteFixture,
} from "./route-test-support";

// Isolated request fixtures only: no actual SDK identity, cookies, or database.
const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../auth/middleware", () => ({ authenticateLocalRequest: vi.fn(async () => ({ id: 7, openId: "local:isolated-test-user", name: "Ù‡ÙˆÙŠØ© Ø§Ø®ØªØ¨Ø§Ø± Ù…Ø¹Ø²ÙˆÙ„Ø©", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })) }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixtureState.db) }));
import { registerAthleteRoutes } from "./index";

let fixture: AthleteRouteFixture;
let server: Server | undefined;
let baseUrl = "";

function reportFixture(): AthleteRouteFixture {
  return createAthleteRouteFixture({
    players: [
      testPlayer({
        history: [
          {
            date: "2026-10-01T00:00:00.000Z",
            label: "2026-10",
            score: 8,
            skill: "التسديد",
          },
        ],
      }),
    ],
    analyses: [
      {
        id: 501,
        playerId: 101,
        videoId: 301,
        skill: "التسديد",
        isDemo: true,
        score: 8.5,
        metrics: [],
        jointAngles: [],
        observations: [],
        exercises: [],
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    ],
    videos: [testVideo()],
    notes: [
      {
        id: 701,
        playerId: 101,
        organizationId: 11,
        authorUserId: 7,
        text: "ملاحظة اختبار",
        createdAt: new Date("2026-10-03T00:00:00.000Z"),
      },
    ],
  });
}

beforeEach(async () => {
  fixture = reportFixture();
  fixtureState.db = createAthleteRouteDb(fixture);
  const app = express();
  registerAthleteRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/athlete`;
});

afterEach(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close(error => (error ? reject(error) : resolve()))
    );
  server = undefined;
});

function headers(): HeadersInit {
  return { "X-Organization-Id": "11" };
}

describe("isolated report and export request boundaries", () => {
  it("returns the default all-skills report and treats the UI all selection as the same unfiltered scope", async () => {
    const defaultReport = await fetch(`${baseUrl}/reports/101`, { headers: headers() });
    expect(defaultReport.status).toBe(200);
    expect(await defaultReport.json()).toMatchObject({
      player: { id: 101 },
      skill: "",
      isDemo: false,
      analyses: [expect.objectContaining({ id: 501 })],
      videos: [expect.objectContaining({ id: 301 })],
      notes: [expect.objectContaining({ id: 701 })],
    });

    const allSkills = await fetch(`${baseUrl}/reports/101?skill=all`, {
      headers: headers(),
    });
    expect(allSkills.status).toBe(200);
    expect((await allSkills.json()).skill).toBe("");
  });

  it("rejects impossible date filters before building a report", async () => {
    const response = await fetch(`${baseUrl}/reports/101?from=2026-02-30`, {
      headers: headers(),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("التاريخ");
  });

  it("exports both HTML and CSV privately with their real generated contents", async () => {
    const html = await fetch(`${baseUrl}/reports/101/export?format=html&skill=all`, {
      headers: headers(),
    });
    expect(html.status).toBe(200);
    expect(html.headers.get("cache-control")).toBe("private, no-store");
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(html.headers.get("content-disposition")).toContain(
      "athlete-report-101.html"
    );
    expect(await html.text()).toContain("لا تستخدم أمثلة العرض القديمة");

    const csv = await fetch(`${baseUrl}/reports/101/export?format=csv&skill=all`, {
      headers: headers(),
    });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain(
      "athlete-report-101.csv"
    );
    expect(await csv.text()).toContain("ملاحظة اختبار");
  });

  it("escapes imported video source and note text in HTML and neutralizes CSV formula prefixes", async () => {
    fixture.videos = [
      testVideo({
        title: "<img src=x onerror=alert(1)>",
        source: {
          url: "https://media.example.test/<clip>",
          license: "CC BY 4.0",
          credit: "<script>غير موثوق</script>",
          description: "=HYPERLINK(\"https://unsafe.example\")",
        },
      }),
    ];
    fixture.notes[0]!.text = "=1+1";
    fixture.analyses[0] = {
      ...fixture.analyses[0],
      isDemo: false,
      poseResult: validPoseResult(),
    };

    const html = await fetch(`${baseUrl}/reports/101/export?format=html`, {
      headers: headers(),
    });
    const htmlText = await html.text();
    expect(htmlText).toContain("&lt;script&gt;غير موثوق&lt;/script&gt;");
    expect(htmlText).not.toContain("<script>غير موثوق</script>");
    expect(htmlText).toContain("ملخص الوضعية");
    expect(htmlText).toContain("السلسلة الزمنية المحفوظة");

    const csv = await fetch(`${baseUrl}/reports/101/export?format=csv`, {
      headers: headers(),
    });
    const csvText = await csv.text();
    expect(csvText).toContain("'=1+1");
    expect(csvText).toContain("'=HYPERLINK");
  });

  it("denies reports and exports for a player owned by another academy", async () => {
    fixture.players = [testPlayer({ academyId: 12 })];

    const report = await fetch(`${baseUrl}/reports/101`, { headers: headers() });
    expect(report.status).toBe(403);

    const exported = await fetch(`${baseUrl}/reports/101/export?format=csv`, {
      headers: headers(),
    });
    expect(exported.status).toBe(403);
  });
});
