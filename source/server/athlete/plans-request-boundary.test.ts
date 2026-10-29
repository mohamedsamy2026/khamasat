import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
  testPlayer,
  validPoseResult,
  type AthleteRouteFixture,
} from "./route-test-support";

// Isolated request fixture only: no JWT, cookies, real users, or database.
const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../auth/middleware", () => ({ authenticateLocalRequest: vi.fn(async () => ({ id: 7, openId: "local:isolated-test-user", name: "Ù‡ÙˆÙŠØ© Ø§Ø®ØªØ¨Ø§Ø± Ù…Ø¹Ø²ÙˆÙ„Ø©", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })) }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixtureState.db) }));

import { registerAthleteRoutes } from "./index";

let fixture: AthleteRouteFixture;
let server: Server | undefined;
let baseUrl = "";

beforeEach(async () => {
  fixture = createAthleteRouteFixture();
  fixture.players = [testPlayer()];
  // A real pose session with no recorded evaluation snapshot: the server must
  // re-evaluate it against the catalog, where every rule is null today.
  fixture.analyses = [
    {
      id: 501,
      playerId: 101,
      videoId: null,
      skill: "التسديد",
      method: "pose",
      isDemo: false,
      metrics: [],
      poseResult: validPoseResult(),
      evaluationSnapshot: null,
      context: {},
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
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

function headers(): HeadersInit {
  return { "Content-Type": "application/json", "X-Organization-Id": "11" };
}

function planBody(developmentId: string) {
  return {
    playerId: 101,
    analysisId: 501,
    developmentId,
    name: "خطة اختبار",
    goal: "هدف تجريبي",
    steps: ["خطوة أولى"],
    tools: "",
    sets: 3,
    repetitions: 10,
    durationSeconds: null,
    restSeconds: 60,
    progression: "زيادة تدريجية",
    reassessAt: "2026-11-01T00:00:00.000Z",
    reassessMethod: "إعادة القياس",
    reassessIndicatorCode: "joint.left_knee.angle2d",
    reviewed: false,
  };
}

describe("exercise plan indicator regression (null rules)", () => {
  it("refuses a plan for an indicator that has no documented criterion", async () => {
    const response = await fetch(`${baseUrl}/exercise-plans`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(planBody("joint.left_knee.angle2d.development")),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("جانب تطوير موثق"),
    });
    expect(fixture.exercisePlans).toHaveLength(0);
  });

  it("keeps the analysis readable when no indicator has a rule", async () => {
    const response = await fetch(`${baseUrl}/analyses?playerId=101`, {
      headers: headers(),
    });
    expect(response.status).toBe(200);
    const [analysis] = await response.json();
    expect(analysis.evaluation.development).toEqual([]);
    const measurements = analysis.evaluation.measurements as Array<{
      assessment: string;
      rule: unknown;
    }>;
    expect(measurements.length).toBeGreaterThan(0);
    // No criterion exists, so nothing may become a strength or a development.
    expect(
      measurements.every(
        measurement =>
          measurement.rule === null &&
          !["strength", "development"].includes(measurement.assessment)
      )
    ).toBe(true);
    expect(
      measurements.some(
        measurement => measurement.assessment === "measurement_only"
      )
    ).toBe(true);
  });

  it("rejects a plan whose analysis belongs to another player", async () => {
    fixture.analyses[0]!.playerId = 999;
    const response = await fetch(`${baseUrl}/exercise-plans`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(planBody("any.development")),
    });
    expect(response.status).toBe(400);
    expect(fixture.exercisePlans).toHaveLength(0);
  });
});
