import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
  type AthleteRouteFixture,
} from "./route-test-support";

// Isolated request fixture only: no JWT, cookies, users, or database connections.
const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => ({
      id: 7,
      openId: "notes-route-isolated-fixture",
      name: "مدرب اختبار معزول",
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

function requestHeaders(organizationId = 11): HeadersInit {
  return { "Content-Type": "application/json", "X-Organization-Id": String(organizationId) };
}

describe("isolated private note request boundaries", () => {
  it("persists an academy-private coach note with its explicit action and immutable original wording", async () => {
    const response = await fetch(`${baseUrl}/notes`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({
        playerId: 101,
        text: "راقب ثبات القدم الداعمة في المحاولة التالية",
        unlinkedGeneral: true,
        requiredAction: "سجّل ثلاث محاولات من زاوية جانبية",
        visibility: "academy_internal",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 701,
      playerId: 101,
      source: "coach",
      authorName: "مدرب اختبار معزول",
      text: "راقب ثبات القدم الداعمة في المحاولة التالية",
      originalText: "راقب ثبات القدم الداعمة في المحاولة التالية",
      requiredAction: "سجّل ثلاث محاولات من زاوية جانبية",
      visibility: "academy_internal",
      revisions: [],
    });
    expect(fixture.notes[0]).toMatchObject({
      source: "coach",
      originalText: "راقب ثبات القدم الداعمة في المحاولة التالية",
      requiredAction: "سجّل ثلاث محاولات من زاوية جانبية",
      visibility: "academy_internal",
      revisions: [],
    });
    expect(fixture.audit).toContainEqual(
      expect.objectContaining({ action: "note.created", entityId: 701 })
    );
  });

  it("retains originalText while recording the revised text and required action as a revision", async () => {
    fixture.notes = [
      {
        id: 701,
        playerId: 101,
        organizationId: 11,
        authorUserId: 7,
        analysisId: null,
        source: "coach",
        authorName: "مدرب سابق",
        text: "النص الأصلي غير المعدل",
        originalText: "النص الأصلي غير المعدل",
        requiredAction: "الإجراء الأول",
        visibility: "academy_internal",
        revisions: [],
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
    ];

    const response = await fetch(`${baseUrl}/notes/701`, {
      method: "PATCH",
      headers: requestHeaders(),
      body: JSON.stringify({
        text: "النص المعدل بعد المراجعة",
        requiredAction: "الإجراء المحدث",
      }),
    });

    expect(response.status).toBe(200);
    const note = await response.json();
    expect(note).toMatchObject({
      source: "coach",
      text: "النص المعدل بعد المراجعة",
      originalText: "النص الأصلي غير المعدل",
      requiredAction: "الإجراء المحدث",
      visibility: "academy_internal",
      revisions: [
        expect.objectContaining({
          text: "النص المعدل بعد المراجعة",
          requiredAction: "الإجراء المحدث",
          authorName: "مدرب اختبار معزول",
        }),
      ],
    });
    expect(note.revisions[0].editedAt).toEqual(expect.any(String));
    expect(fixture.notes[0]).toMatchObject({
      originalText: "النص الأصلي غير المعدل",
      text: "النص المعدل بعد المراجعة",
      requiredAction: "الإجراء المحدث",
    });
    expect(fixture.audit).toContainEqual(
      expect.objectContaining({ action: "note.updated", entityId: 701 })
    );
  });

  it("denies a club before it can create a private academy note", async () => {
    fixture.membership = {
      organizationId: 20,
      userId: 7,
      role: "staff",
      name: "نادي اختبار",
      type: "club",
      region: "الرياض",
      isDemo: false,
    };

    const response = await fetch(`${baseUrl}/notes`, {
      method: "POST",
      headers: requestHeaders(20),
      body: JSON.stringify({
        playerId: 101,
        text: "محاولة نادي غير مصرح بها",
        unlinkedGeneral: true,
        visibility: "academy_internal",
      }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("للأكاديمية");
    expect(fixture.writes.transactions).toBe(0);
    expect(fixture.notes).toHaveLength(0);
  });
});
