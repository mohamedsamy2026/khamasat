import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
  testPlayer,
  testVideo,
  type AthleteRouteFixture,
} from "./route-test-support";

// Isolated request fixture only: no JWT, cookies, real users, or database.
const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => ({
      id: 7,
      openId: "sport-route-isolated-fixture",
      name: "مدرب اختبار الرياضة",
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

const footballPlayerInput = {
  name: "مهاجم اختبار",
  sport: "football",
  age: 18,
  nationality: "سعودي",
  position: "مهاجم",
  foot: "اليمنى",
  height: 178,
  weight: 72,
  birthDate: "2008-01-01",
  jersey: 11,
  region: "الرياض",
  discoverable: true,
};

const gymnastInput = {
  ...footballPlayerInput,
  name: "لاعبة جمباز اختبار",
  sport: "gymnastics",
  gymnasticsCategory: "womens_artistic",
  position: "الجمباز الفني — سيدات",
  age: 15,
  height: 152,
  weight: 42,
  birthDate: "2011-01-01",
  jersey: 4,
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

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Organization-Id": "11",
  };
}

describe("sport assignment boundaries", () => {
  it("rejects a sport the organization has not enabled", async () => {
    fixture.membership!.sports = ["football"];
    const response = await fetch(`${baseUrl}/players`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(gymnastInput),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("غير مفعّلة"),
    });
    expect(fixture.players).toHaveLength(1);
  });

  it("creates a consistently labelled gymnastics player", async () => {
    const response = await fetch(`${baseUrl}/players`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(gymnastInput),
    });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created).toMatchObject({
      sport: "gymnastics",
      gymnasticsCategory: "womens_artistic",
      position: "الجمباز الفني — سيدات",
    });
  });

  it("rejects a football position on a gymnastics player", async () => {
    const response = await fetch(`${baseUrl}/players`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...gymnastInput, position: "مهاجم" }),
    });
    expect(response.status).toBe(400);
    expect(fixture.players).toHaveLength(1);
  });

  it("rejects a gymnastics category on a football player", async () => {
    const response = await fetch(`${baseUrl}/players`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        ...footballPlayerInput,
        gymnasticsCategory: "womens_artistic",
      }),
    });
    expect(response.status).toBe(400);
  });

  it("filters the player list by sport server-side", async () => {
    fixture.players = [
      testPlayer({ id: 101, sport: "football", position: "مهاجم" }),
      testPlayer({
        id: 102,
        name: "لاعبة جمباز",
        sport: "gymnastics",
        gymnasticsCategory: "womens_artistic",
        position: "الجمباز الفني — سيدات",
      }),
    ];
    const response = await fetch(`${baseUrl}/players?sport=gymnastics`, {
      headers: headers(),
    });
    expect(response.status).toBe(200);
    const rows = await response.json();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 102,
      sport: "gymnastics",
      gymnasticsCategory: "womens_artistic",
    });
  });

  it("blocks a sport switch once sessions are recorded", async () => {
    fixture.analyses = [
      {
        id: 501,
        playerId: 101,
        videoId: 301,
        skill: "التسديد",
        method: "pose",
        isDemo: false,
        metrics: [],
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ];
    fixture.videos = [testVideo()];
    const response = await fetch(`${baseUrl}/players/101`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        ...footballPlayerInput,
        sport: "gymnastics",
        gymnasticsCategory: "mens_artistic",
        position: "الجمباز الفني — رجال",
      }),
    });
    expect(response.status).toBe(400);
    expect(fixture.players[0]).toMatchObject({
      sport: "football",
      position: "مهاجم",
    });
  });

  it("keeps organization sports non-empty and validated", async () => {
    const empty = await fetch(`${baseUrl}/organizations/current`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ sports: [] }),
    });
    expect(empty.status).toBe(400);

    const unknown = await fetch(`${baseUrl}/organizations/current`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ sports: ["swimming"] }),
    });
    expect(unknown.status).toBe(400);

    const ok = await fetch(`${baseUrl}/organizations/current`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ sports: ["football", "gymnastics"] }),
    });
    expect(ok.status).toBe(200);
    await expect(ok.json()).resolves.toMatchObject({
      sports: ["football", "gymnastics"],
    });
  });
});
