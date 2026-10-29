import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { MAX_VIDEO_BYTES } from "../../shared/athlete";
import {
  createAthleteRouteDb,
  createAthleteRouteFixture,
  testVideo,
  type AthleteRouteFixture,
} from "./route-test-support";

// Isolated request fixtures only: no actual SDK identity, cookies, or database.
const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock("../auth/middleware", () => ({ authenticateLocalRequest: vi.fn(async () => ({ id: 7, openId: "local:isolated-test-user", name: "Ù‡ÙˆÙŠØ© Ø§Ø®ØªØ¨Ø§Ø± Ù…Ø¹Ø²ÙˆÙ„Ø©", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })) }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixtureState.db) }));
import { registerAthleteRoutes } from "./index";

const mp4 = Buffer.from([
  0x00,
  0x00,
  0x00,
  0x0c,
  0x66,
  0x74,
  0x79,
  0x70,
  0x69,
  0x73,
  0x6f,
  0x6d,
]);
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

function organizationHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("X-Organization-Id", "11");
  return headers;
}

describe("isolated private-video request boundaries", () => {
  it("accepts matching MP4 bytes, persists metadata/chunks in one transaction, and records a private audit event", async () => {
    const response = await fetch(
      `${baseUrl}/videos?playerId=101&skill=${encodeURIComponent("التسديد")}&name=${encodeURIComponent("جلسة تدريب")}&recordedAt=2026-10-01T00%3A00%3A00.000Z&sourceURL=${encodeURIComponent("https://media.example.test/licensed-drill.mp4")}&sourceCredit=${encodeURIComponent("أرشيف مرخّص")}&sourceLicense=${encodeURIComponent("CC BY 4.0")}&sourceDescription=${encodeURIComponent("مرجع للمقطع فقط")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/mp4" }),
        body: mp4,
      }
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 302,
      playerId: 101,
      size: mp4.length,
      mime: "video/mp4",
      analysisStatus: "not_analyzed",
      latestAnalysisId: null,
      source: {
        url: "https://media.example.test/licensed-drill.mp4",
        credit: "أرشيف مرخّص",
        license: "CC BY 4.0",
        description: "مرجع للمقطع فقط",
      },
    });
    expect(fixture.writes.transactions).toBe(1);
    expect(fixture.videos).toHaveLength(1);
    expect(fixture.chunks).toHaveLength(1);
    expect(Buffer.from(fixture.chunks[0]!.data)).toEqual(mp4);
    expect(fixture.audit).toContainEqual(
      expect.objectContaining({ action: "video.private_uploaded", entityId: 302 })
    );
    expect(fixture.audit).toContainEqual(
      expect.objectContaining({ metadata: expect.objectContaining({ hasSource: true }) })
    );
  });

  it("allows multiple private clips for the same player and skill without a uniqueness restriction", async () => {
    const first = await fetch(
      `${baseUrl}/videos?playerId=101&skill=${encodeURIComponent("التسديد")}&name=${encodeURIComponent("محاولة أولى")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/mp4" }),
        body: mp4,
      }
    );
    const second = await fetch(
      `${baseUrl}/videos?playerId=101&skill=${encodeURIComponent("التسديد")}&name=${encodeURIComponent("محاولة ثانية")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/mp4" }),
        body: mp4,
      }
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(fixture.videos).toEqual([
      expect.objectContaining({ id: 302, playerId: 101, skill: "التسديد" }),
      expect.objectContaining({ id: 303, playerId: 101, skill: "التسديد" }),
    ]);
  });

  it("rejects non-HTTPS or incomplete source metadata before creating video rows", async () => {
    const unsafe = await fetch(
      `${baseUrl}/videos?playerId=101&sourceURL=${encodeURIComponent("javascript:alert(1)")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/mp4" }),
        body: mp4,
      }
    );
    expect(unsafe.status).toBe(400);

    const incomplete = await fetch(
      `${baseUrl}/videos?playerId=101&sourceCredit=${encodeURIComponent("مورد")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/mp4" }),
        body: mp4,
      }
    );
    expect(incomplete.status).toBe(400);
    expect(fixture.writes.transactions).toBe(0);
    expect(fixture.videos).toHaveLength(0);
  });

  it("accepts the exact 10 MiB limit but rejects an oversized raw body before any write", async () => {
    const exactLimit = Buffer.alloc(MAX_VIDEO_BYTES);
    exactLimit.write("ftyp", 4, "ascii");
    const accepted = await fetch(
      `${baseUrl}/videos?playerId=101&skill=${encodeURIComponent("التسديد")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/mp4" }),
        body: exactLimit,
      }
    );
    expect(accepted.status).toBe(201);
    expect(fixture.videos[0]?.size).toBe(MAX_VIDEO_BYTES);

    fixture = createAthleteRouteFixture();
    fixtureState.db = createAthleteRouteDb(fixture);
    const oversized = await fetch(
      `${baseUrl}/videos?playerId=101&skill=${encodeURIComponent("التسديد")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/mp4" }),
        body: Buffer.alloc(MAX_VIDEO_BYTES + 1),
      }
    );
    expect(oversized.status).toBe(413);
    expect(fixture.writes.transactions).toBe(0);
    expect(fixture.videos).toHaveLength(0);
  });

  it("rejects a body whose declared MIME type does not match its magic bytes", async () => {
    const response = await fetch(
      `${baseUrl}/videos?playerId=101&skill=${encodeURIComponent("التسديد")}`,
      {
        method: "POST",
        headers: organizationHeaders({ "Content-Type": "video/webm" }),
        body: mp4,
      }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("لا يطابق");
    expect(fixture.writes.transactions).toBe(0);
  });

  it("returns 404 for absent content, then permits an active club grant and rejects the same club after revocation", async () => {
    const missing = await fetch(`${baseUrl}/videos/999/content`, {
      headers: organizationHeaders(),
    });
    expect(missing.status).toBe(404);

    fixture.membership = {
      organizationId: 20,
      userId: 7,
      role: "staff",
      name: "نادي اختبار",
      type: "club",
      region: "الرياض",
      isDemo: false,
    };
    fixture.videos = [testVideo({ title: "../../غير-موثوق.mp4", size: mp4.length })];
    fixture.chunks = [{ videoId: 301, chunkIndex: 0, data: mp4 }];
    fixture.grants = [{ id: 1, playerId: 101, clubId: 20, active: true }];

    const permitted = await fetch(`${baseUrl}/videos/301/content`, {
      headers: new Headers({
        "X-Organization-Id": "20",
        Range: "bytes=4-7",
      }),
    });
    expect(permitted.status).toBe(206);
    expect(permitted.headers.get("cache-control")).toBe("private, no-store");
    expect(permitted.headers.get("content-range")).toBe(
      `bytes 4-7/${mp4.length}`
    );
    expect(permitted.headers.get("content-disposition")).toBe(
      'inline; filename="video-301.mp4"'
    );
    expect(Buffer.from(await permitted.arrayBuffer())).toEqual(mp4.subarray(4, 8));

    fixture.grants = [];
    const revoked = await fetch(`${baseUrl}/videos/301/content`, {
      headers: organizationHeaders({ "X-Organization-Id": "20" }),
    });
    expect(revoked.status).toBe(403);
  });
});
