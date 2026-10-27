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
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => ({
      id: 7,
      openId: "isolated-test-user",
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

function postAnalysis(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/analyses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": "11",
    },
    body: JSON.stringify(body),
  });
}

describe("isolated analysis request boundaries", () => {
  it("rejects a new analysis without a positive linked video before a transaction writes anything", async () => {
    const response = await postAnalysis({
      playerId: 101,
      skill: "التسديد",
      pose: validPoseResult(),
    });

    expect(response.status).toBe(400);
    expect(fixture.writes.transactions).toBe(0);
    expect(fixture.analyses).toHaveLength(0);
  });

  it("returns 404 for a non-existent linked video and 403 for a video owned by a different player", async () => {
    const nonexistent = await postAnalysis({
      playerId: 101,
      skill: "التسديد",
      videoId: 999,
      pose: validPoseResult(),
    });
    expect(nonexistent.status).toBe(404);
    expect(fixture.writes.transactions).toBe(0);

    fixture.videos = [testVideo({ playerId: 999 })];
    const crossPlayer = await postAnalysis({
      playerId: 101,
      skill: "التسديد",
      videoId: 301,
      pose: validPoseResult(),
    });
    expect(crossPlayer.status).toBe(403);
    expect(fixture.writes.transactions).toBe(0);

    fixture.players[0]!.academyId = 12;
    const otherAcademy = await postAnalysis({
      playerId: 101,
      skill: "التسديد",
      videoId: 301,
      pose: validPoseResult(),
    });
    expect(otherAcademy.status).toBe(403);
    expect(fixture.writes.transactions).toBe(0);
  });

  it("lets an authorized academy staff member persist a linked pose analysis without simulated history", async () => {
    fixture.videos = [testVideo()];
    fixture.membership!.role = "staff";
    fixture.players[0]!.history = [
      {
        date: "2026-09-01T00:00:00.000Z",
        label: "2026-09",
        score: 7,
        skill: "التسديد",
      },
    ];

    const created = await postAnalysis({
      playerId: 101,
      skill: "التسديد",
      videoId: 301,
      pose: validPoseResult(),
    });

    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      id: 501,
      playerId: 101,
      videoId: 301,
      skill: "التسديد",
      isDemo: false,
      score: null,
      method: "pose",
    });
    expect(fixture.writes.transactions).toBe(1);
    expect(fixture.analyses).toHaveLength(1);
    expect(fixture.analyses[0]).toMatchObject({
      id: 501,
      videoId: 301,
      isDemo: false,
      score: null,
    });
    expect(fixture.players[0]!.history).toHaveLength(1);
    expect(fixture.players[0]!.lastAnalysisAt).toBeInstanceOf(Date);
    expect(fixture.writes.playerUpdates).toEqual([
      expect.objectContaining({ lastAnalysisAt: expect.any(Date) }),
    ]);
    expect(fixture.audit).toContainEqual(
      expect.objectContaining({
        action: "analysis.pose_created",
        entityId: 501,
        metadata: expect.objectContaining({ videoId: 301 }),
      })
    );

    const listed = await fetch(`${baseUrl}/analyses?playerId=101`, {
      headers: { "X-Organization-Id": "11" },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([
      expect.objectContaining({ id: 501, videoId: 301, isDemo: false }),
    ]);
  });
});
