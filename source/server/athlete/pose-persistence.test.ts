import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { poseResultSchema } from "./validation";
import { normalizePoseResult } from "./poseNormalization";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
  testVideo,
  validPoseResult,
  type AthleteRouteFixture,
} from "./route-test-support";

// Isolated route fixture: no SDK credential, token, or managed database is used.
const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => ({
      id: 7,
      openId: "pose-persistence-test-only",
      name: "هوية اختبار معزولة",
      email: null,
      role: "user",
    })),
  },
}));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixtureState.db) }));
import { registerAthleteRoutes } from "./index";

let fixture: AthleteRouteFixture;
let server: Server | undefined;
let baseUrl = "";

beforeEach(async () => {
  fixture = createAthleteRouteFixture({ videos: [testVideo()] });
  fixture.players[0]!.history = [
    {
      date: "2026-09-01T00:00:00.000Z",
      label: "2026-09",
      score: 7,
      skill: "التسديد",
    },
  ];
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

describe("pose-backed analysis persistence", () => {
  it("accepts a bounded 90-degree pose calculated from explicit 2D geometry", () => {
    const pose = validPoseResult();
    expect(pose.frames[0]!.angles.left_elbow).toBe(90);
    expect(poseResultSchema.parse(pose)).toMatchObject({
      detectedFrames: 1,
      joints: [expect.objectContaining({ key: "left_elbow", mean: 90 })],
    });
  });

  it("persists only observed joint metrics with the client pose and no simulated score/history", async () => {
    const pose = validPoseResult();
    const normalized = normalizePoseResult(pose);
    const response = await fetch(`${baseUrl}/analyses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Organization-Id": "11",
      },
      body: JSON.stringify({
        playerId: 101,
        videoId: 301,
        skill: "التسديد",
        pose,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 501,
      isDemo: false,
      score: null,
      method: "pose",
      pose: normalized,
      metrics: [
        expect.objectContaining({
          name: "المرفق الأيسر",
          value: 90,
          unit: "درجة",
        }),
      ],
      jointAngles: [{ name: "المرفق الأيسر", angle: 90 }],
    });
    expect(fixture.analyses).toHaveLength(1);
    expect(fixture.analyses[0]).toMatchObject({
      videoId: 301,
      isDemo: false,
      score: null,
      poseResult: normalized,
      metrics: [{ name: "المرفق الأيسر", value: 90, unit: "درجة" }],
    });
    expect(fixture.players[0]!.history).toHaveLength(1);
    expect(fixture.writes.playerUpdates).toEqual([
      expect.objectContaining({ lastAnalysisAt: expect.any(Date) }),
    ]);
    expect(fixture.audit).toContainEqual(
      expect.objectContaining({
        action: "analysis.pose_created",
        actorUserId: 7,
      })
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
      analysisAt: expect.any(String),
    });
  });
});
