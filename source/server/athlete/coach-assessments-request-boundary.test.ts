import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
  testPlayer,
  type AthleteRouteFixture,
} from "./route-test-support";

const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../auth/middleware", () => ({
  authenticateLocalRequest: vi.fn(async () => ({
    id: 7,
    openId: "local:coach-assessment-test-user",
    name: "مدرب الاختبار",
    email: null,
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  })),
}));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixtureState.db) }));

import { registerAthleteRoutes } from "./index";

let fixture: AthleteRouteFixture;
let server: Server | undefined;
let baseUrl = "";

const validInput = {
  assessedAt: "2026-10-01T10:00:00.000Z",
  protocol: "تقييم مهارات فردية",
  notes: "ملاحظة مدرب موثقة",
  skills: [
    { name: "التسديد", score: 80 },
    { name: "التمرير", score: null },
    { name: "المراوغة", score: 60 },
  ],
  strengths: [],
  development: [],
  exercises: [],
};

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

function headers(organizationId = 11): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Organization-Id": String(organizationId),
  };
}

describe("coach assessment request boundaries", () => {
  it("records an academy assessment append-only and derives only the mean of scored skills", async () => {
    const response = await fetch(`${baseUrl}/players/101/coach-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(validInput),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 1001,
      playerId: 101,
      coachName: "مدرب الاختبار",
      coachPhotoKey: "",
      overall: 70,
      skills: validInput.skills,
      isDemo: false,
    });
    expect(fixture.coachAssessments).toHaveLength(1);
    expect(fixture.audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "coach_assessment.created" }),
      ])
    );

    const list = await fetch(`${baseUrl}/players/101/coach-assessments`, {
      headers: headers(),
    });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([
      expect.objectContaining({ id: 1001, overall: 70 }),
    ]);

    const mutation = await fetch(
      `${baseUrl}/players/101/coach-assessments/1001`,
      { method: "DELETE", headers: headers() }
    );
    expect(mutation.status).toBe(404);
    expect(fixture.coachAssessments).toHaveLength(1);
  });

  it("rejects client identity and overall fields, invalid ranges, future dates, and duplicate skills", async () => {
    for (const invalid of [
      { ...validInput, overall: 100 },
      {
        ...validInput,
        skills: [{ name: "التسديد", score: 101 }],
      },
      {
        ...validInput,
        assessedAt: "2099-01-01T00:00:00.000Z",
      },
      {
        ...validInput,
        skills: [
          { name: "التسديد", score: null },
          { name: "التسديد", score: null },
        ],
      },
      {
        ...validInput,
        skills: [{ name: "التسديد", score: null }],
      },
    ]) {
      const response = await fetch(`${baseUrl}/players/101/coach-assessments`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(invalid),
      });
      expect(response.status).toBe(400);
    }
    expect(fixture.coachAssessments).toHaveLength(0);
  });

  it("validates skills against the player position and denies club writes/read without approval", async () => {
    fixture.players = [testPlayer({ position: "حارس مرمى" })];
    const wrongSkill = await fetch(`${baseUrl}/players/101/coach-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(validInput),
    });
    expect(wrongSkill.status).toBe(400);

    fixture.membership = {
      organizationId: 20,
      userId: 7,
      role: "staff",
      name: "نادي اختبار",
      type: "club",
      region: "الرياض",
      isDemo: false,
      sports: ["football"],
    };
    const clubPost = await fetch(`${baseUrl}/players/101/coach-assessments`, {
      method: "POST",
      headers: headers(20),
      body: JSON.stringify(validInput),
    });
    expect(clubPost.status).toBe(403);

    const clubRead = await fetch(`${baseUrl}/players/101/coach-assessments`, {
      headers: headers(20),
    });
    expect(clubRead.status).toBe(403);
  });
});
