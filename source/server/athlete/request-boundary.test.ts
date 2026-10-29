import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Test-only fixtures. No tokens are minted and no real account/database is used.
const fixture = vi.hoisted(() => ({
  role: "staff",
  organizationId: 11,
  db: null as any,
}));
vi.mock("../auth/middleware", () => ({ authenticateLocalRequest: vi.fn(async () => ({ id: 7, openId: "local:isolated-test-user", name: "Ù‡ÙˆÙŠØ© Ø§Ø®ØªØ¨Ø§Ø± Ù…Ø¹Ø²ÙˆÙ„Ø©", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })) }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixture.db) }));
import { registerAthleteRoutes } from "./index";

function query(rows: unknown[]) {
  const builder: any = {};
  for (const name of ["from", "innerJoin", "where", "limit", "for", "orderBy"])
    builder[name] = () => builder;
  builder.then = (
    resolve: (value: unknown[]) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject);
  return builder;
}
const now = new Date("2026-10-25T00:00:00Z");
const pending = {
  id: 41,
  playerId: 101,
  academyId: 11,
  clubId: 20,
  status: "pending",
  message: "طلب اختبار",
  reason: null,
  createdAt: now,
  updatedAt: now,
};
let server: Server | undefined;
let transaction: ReturnType<typeof vi.fn>;
let update: ReturnType<typeof vi.fn>;
let endpoint = "";

beforeEach(async () => {
  fixture.role = "staff";
  fixture.organizationId = 11;
  let outerSelect = 0;
  let innerSelect = 0;
  update = vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => []) })),
  }));
  const tx = {
    select: vi.fn(() => {
      const replies = [
        [pending],
        [{ academyId: 11 }],
        [],
        [{ ...pending, status: "approved" }],
      ];
      return query(replies[innerSelect++] ?? []);
    }),
    update,
    insert: vi.fn(() => ({ values: vi.fn(async () => []) })),
  };
  transaction = vi.fn(
    async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)
  );
  fixture.db = {
    select: vi.fn(() => {
      if (outerSelect++ === 0)
        return query([
          {
            organizationId: fixture.organizationId,
            userId: 7,
            role: fixture.role,
            name: "أكاديمية اختبار",
            type: "academy",
            region: "الرياض",
            isDemo: true,
          },
        ]);
      return query([{ name: "سجل افتراضي" }]);
    }),
    transaction,
  };
  const app = express();
  registerAthleteRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/athlete/requests/41`;
});
afterEach(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close(error => (error ? reject(error) : resolve()))
    );
});

function decide() {
  return fetch(endpoint, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Organization-Id": String(fixture.organizationId),
    },
    body: JSON.stringify({ action: "approve" }),
  });
}

describe("access-request route authorization boundary", () => {
  it("rejects staff with 403 before any transaction or grant write", async () => {
    const response = await decide();
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("مالك الأكاديمية");
    expect(transaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("allows the owning academy owner to approve", async () => {
    fixture.role = "owner";
    const response = await decide();
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("approved");
    expect(transaction).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalled();
  });
  it("rejects an owner of a different academy before request or grant changes", async () => {
    fixture.role = "owner";
    fixture.organizationId = 12;
    const response = await decide();
    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });
});
