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

// Isolated request fixture only: no JWT, cookies, users, or database connections.
const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../auth/middleware", () => ({ authenticateLocalRequest: vi.fn(async () => ({ id: 7, openId: "local:isolated-test-user", name: "مدرب جمباز معزول", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })) }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixtureState.db) }));

import { registerAthleteRoutes } from "./index";

let fixture: AthleteRouteFixture;
let server: Server | undefined;
let baseUrl = "";

const academyMembership = {
  organizationId: 11,
  userId: 7,
  role: "owner" as const,
  name: "أكاديمية اختبار",
  type: "academy" as const,
  region: "الرياض",
  isDemo: false,
  sports: ["football", "gymnastics"],
};

const gymnast = testPlayer({
  sport: "gymnastics",
  gymnasticsCategory: "womens_artistic",
  position: "الجمباز الفني — سيدات",
  age: 15,
  height: 152,
  weight: 42,
});

beforeEach(async () => {
  fixture = createAthleteRouteFixture();
  fixture.players = [gymnast];
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

describe("gymnastics section request boundaries", () => {
  it("returns the women's apparatus rotation in order with apparatus-scoped indicators", async () => {
    const response = await fetch(
      `${baseUrl}/gymnastics/context?playerId=101`,
      { headers: headers() }
    );

    expect(response.status).toBe(200);
    const context = await response.json();
    expect(context.category).toBe("womens_artistic");
    expect(context.apparatusOrder).toEqual([
      "floor",
      "vault",
      "balance_beam",
      "uneven_bars",
    ]);
    expect(
      context.apparatus.map((item: { id: string; order: number }) => [
        item.id,
        item.order,
      ])
    ).toEqual([
      ["floor", 1],
      ["vault", 2],
      ["balance_beam", 3],
      ["uneven_bars", 4],
    ]);
    expect(context.apparatus.map((item: { id: string }) => item.id)).not.toContain(
      "pommel_horse"
    );
    for (const apparatus of context.apparatus) {
      expect(apparatus.indicators.length).toBeGreaterThan(0);
      expect(apparatus.indicators[0].validationStatus).toBe(
        "provisional_unvalidated"
      );
    }
  });

  it("rejects the gymnastics context for a player from another sport", async () => {
    fixture.players = [testPlayer()];
    const response = await fetch(
      `${baseUrl}/gymnastics/context?playerId=101`,
      { headers: headers() }
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("الجمباز");
  });

  it("refuses a gymnastics player without a category", async () => {
    fixture.players = [
      testPlayer({ sport: "gymnastics", gymnasticsCategory: "", position: "" }),
    ];
    const response = await fetch(
      `${baseUrl}/gymnastics/context?playerId=101`,
      { headers: headers() }
    );
    expect(response.status).toBe(409);
  });

  it("records a standardized provisional assessment for the athlete's apparatus", async () => {
    const response = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "floor",
        skill: "الحركات الأرضية",
        indicators: [
          {
            code: "gym.core.hollow_body",
            value: 45,
            unit: "ثانية",
            note: "ثبات مسجل في نهاية الوحدة التدريبية",
          },
        ],
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.sessionKey).toMatch(/^as_[a-z0-9]{16}$/);
    expect(body.assessments).toHaveLength(1);
    expect(body.assessments[0]).toMatchObject({
      playerId: 101,
      sport: "gymnastics",
      apparatus: "floor",
      apparatusName: "الحركات الأرضية",
      indicatorCode: "gym.core.hollow_body",
      unit: "ثانية",
      value: 45,
      criterionStatus: "provisional_unvalidated",
      authorName: "مدرب جمباز معزول",
    });
    expect(fixture.assessments).toHaveLength(1);
    const audit = fixture.audit.find(
      event => event.action === "player.physical_assessment_recorded"
    );
    expect(audit).toMatchObject({
      metadata: expect.objectContaining({
        apparatus: "floor",
        criterionStatus: "provisional_unvalidated",
      }),
    });

    const listed = await fetch(
      `${baseUrl}/physical-assessments?playerId=101&apparatus=floor`,
      { headers: headers() }
    );
    expect(listed.status).toBe(200);
    expect(await listed.json()).toHaveLength(1);
  });

  it("blocks apparatus that belongs to the other gymnastics category", async () => {
    const response = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "pommel_horse",
        indicators: [{ code: "gym.pommel.support_circle", value: 10, unit: "تكرار" }],
      }),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("غير متاح لفئة اللاعب");
    expect(fixture.assessments).toHaveLength(0);
  });

  it("rejects unknown indicators and units that the catalog does not declare", async () => {
    const unknownIndicator = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "floor",
        indicators: [{ code: "gym.not_a_real_indicator", value: 1, unit: "ثانية" }],
      }),
    });
    expect(unknownIndicator.status).toBe(400);

    const wrongUnit = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "floor",
        indicators: [{ code: "gym.core.hollow_body", value: 1, unit: "كغ" }],
      }),
    });
    expect(wrongUnit.status).toBe(400);
    expect((await wrongUnit.json()).error).toContain("وحدة القياس");
    expect(fixture.assessments).toHaveLength(0);
  });

  it("rejects an indicator restricted to another apparatus", async () => {
    const response = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "floor",
        indicators: [{ code: "gym.rings.support", value: 20, unit: "ثانية" }],
      }),
    });
    expect(response.status).toBe(400);
  });

  it("does not allow apparatus for a sport without apparatus", async () => {
    fixture.players = [testPlayer()];
    const response = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "floor",
        indicators: [
          { code: "football.power.vertical_jump", value: 40, unit: "سم" },
        ],
      }),
    });
    expect(response.status).toBe(400);
  });

  it("accepts a football standardized indicator without apparatus", async () => {
    fixture.players = [testPlayer()];
    const response = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        playerId: 101,
        indicators: [
          { code: "football.power.vertical_jump", value: 44, unit: "سم" },
          { code: "football.speed.sprint_30m", value: 4.2, unit: "ثانية" },
        ],
      }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.assessments).toHaveLength(2);
    expect(body.assessments[0].criterionStatus).toBe(
      "provisional_unvalidated"
    );
  });

  it("denies assessment writes to a club and to another academy", async () => {
    fixture.membership = { ...academyMembership, organizationId: 20, type: "club", name: "نادي اختبار" };
    const asClub = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(20),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "floor",
        indicators: [{ code: "gym.core.hollow_body", value: 20, unit: "ثانية" }],
      }),
    });
    expect(asClub.status).toBe(403);

    fixture.membership = {
      ...academyMembership,
      organizationId: 12,
      name: "أكاديمية أخرى",
    };
    const otherAcademy = await fetch(`${baseUrl}/physical-assessments`, {
      method: "POST",
      headers: headers(12),
      body: JSON.stringify({
        playerId: 101,
        apparatus: "floor",
        indicators: [{ code: "gym.core.hollow_body", value: 20, unit: "ثانية" }],
      }),
    });
    expect(otherAcademy.status).toBe(403);
    expect(fixture.assessments).toHaveLength(0);
  });

  it("deletes a recorded assessment and audits the deletion", async () => {
    fixture.assessments = [
      {
        id: 901,
        playerId: 101,
        sport: "gymnastics",
        apparatus: "floor",
        indicatorCode: "gym.core.hollow_body",
        indicatorLabel: "ثبات وضعية الجسم المجوف",
        value: 20,
        unit: "ثانية",
        recordedAt: new Date("2026-10-10T00:00:00.000Z"),
      },
    ];

    const response = await fetch(`${baseUrl}/physical-assessments/901`, {
      method: "DELETE",
      headers: headers(),
    });

    expect(response.status).toBe(204);
    expect(fixture.assessments).toHaveLength(0);
    expect(fixture.audit).toContainEqual(
      expect.objectContaining({ action: "player.physical_assessment_deleted" })
    );
  });
});
