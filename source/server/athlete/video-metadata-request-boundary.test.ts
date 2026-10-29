import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
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

function savedPoseAnalysis(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 501,
    playerId: 101,
    videoId: 301,
    skill: "التسديد",
    isDemo: false,
    score: null,
    poseResult: validPoseResult(),
    metrics: [],
    jointAngles: [],
    observations: [],
    exercises: [],
    createdAt: new Date("2026-10-02T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(async () => {
  fixture = createAthleteRouteFixture();
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

describe("private video metadata and saved analysis state", () => {
  it("reports completed only for a persisted, non-demo pose result linked to that exact uploaded video", async () => {
    fixture.videos = [
      testVideo({
        source: {
          url: "https://media.example.test/licensed-drill.mp4",
          license: "CC BY 4.0",
          credit: "مصدر مرخّص",
          description: "مقطع تدريبي مرخّص للفيديو فقط",
        },
      }),
      testVideo({ id: 302, title: "لقطة ثانية", recordedAt: new Date("2026-10-03T00:00:00.000Z") }),
    ];
    fixture.analyses = [
      savedPoseAnalysis({
        id: 900,
        isDemo: true,
        createdAt: new Date("2026-10-04T00:00:00.000Z"),
      }),
      savedPoseAnalysis(),
      savedPoseAnalysis({
        id: 901,
        videoId: 302,
        isDemo: true,
        createdAt: new Date("2026-10-05T00:00:00.000Z"),
      }),
    ];

    const listed = await fetch(`${baseUrl}/videos?playerId=101`, {
      headers: { "X-Organization-Id": "11" },
    });
    expect(listed.status).toBe(200);
    const videos = await listed.json();
    expect(videos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 301,
          analysisStatus: "completed",
          latestAnalysisId: 501,
          latestAnalysisMethod: "pose",
          analysisAt: "2026-10-02T10:00:00.000Z",
          source: {
            url: "https://media.example.test/licensed-drill.mp4",
            license: "CC BY 4.0",
            credit: "مصدر مرخّص",
            description: "مقطع تدريبي مرخّص للفيديو فقط",
          },
        }),
        expect.objectContaining({
          id: 302,
          analysisStatus: "not_analyzed",
          latestAnalysisId: null,
          latestAnalysisMethod: null,
          analysisAt: null,
        }),
      ])
    );

    const metadata = await fetch(`${baseUrl}/videos/301`, {
      headers: { "X-Organization-Id": "11" },
    });
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      id: 301,
      analysisStatus: "completed",
      latestAnalysisId: 501,
      latestAnalysisMethod: "pose",
    });
  });

  it("gives both list and metadata routes only to a club with an active player grant", async () => {
    fixture.videos = [testVideo()];
    fixture.membership = {
      organizationId: 20,
      userId: 7,
      role: "staff",
      name: "نادي اختبار",
      type: "club",
      region: "الرياض",
      isDemo: false,
    };
    fixture.grants = [{ id: 1, playerId: 101, clubId: 20, active: true }];

    const headers = { "X-Organization-Id": "20" };
    expect(
      (await fetch(`${baseUrl}/videos?playerId=101`, { headers })).status
    ).toBe(200);
    expect((await fetch(`${baseUrl}/videos/301`, { headers })).status).toBe(200);

    fixture.grants = [];
    expect(
      (await fetch(`${baseUrl}/videos?playerId=101`, { headers })).status
    ).toBe(403);
    expect((await fetch(`${baseUrl}/videos/301`, { headers })).status).toBe(403);
  });
});
