import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { demoSessions, organizations, players } from "../../drizzle/schema";
import { HttpError } from "../../shared/_core/errors";

const token = "a".repeat(43);
const state = vi.hoisted(() => ({ db: null as any, sdkUser: null as any }));
vi.mock("../_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(async () => {
      if (state.sdkUser) return state.sdkUser;
      throw new HttpError(401, "not authenticated");
    }),
  },
}));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("./demoVideoFixture", () => ({
  ensureLicensedDemoShootingFixture: vi.fn(async () => ({
    playerId: 1,
    videoId: 1,
    created: false,
  })),
}));
import { getGuestActorForToken, requireActor } from "./actor";
import { registerAthleteRoutes } from "./index";
import { sdk } from "../_core/sdk";
import { ensureLicensedDemoShootingFixture } from "./demoVideoFixture";

const academy = { id: 501, name: "أكاديمية العرض", type: "academy", region: "الرياض", isDemo: true };
const club = { id: 502, name: "نادي العرض", type: "club", region: "الرياض", isDemo: true };
const foreignPlayer = {
  id: 999, academyId: 777, name: "لاعب مساحة أخرى", age: 16, nationality: "سعودي",
  position: "مهاجم", foot: "أيمن", height: 175, weight: 64, region: "الرياض",
  photoKey: "", overall: 7, improvement: 0, skills: [], discoverable: true, lastAnalysisAt: null,
  birthDate: "2010-01-01", jersey: 9, strengths: [], weaknesses: [], physicalTests: [], history: [],
};

function isolatedDb() {
  return {
    select(selection?: Record<string, unknown>) {
      let table: unknown;
      const chain: any = {
        from(value: unknown) { table = value; return chain; },
        innerJoin: () => chain,
        where: () => chain,
        limit: () => chain,
        orderBy: () => chain,
        for: () => chain,
        then(resolve: (rows: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
          const rows = table === demoSessions
            ? [{ id: 1, tokenHash: "stored-only-hash", academyId: academy.id, clubId: club.id, expiresAt: new Date("2030-01-01"), lastSeenAt: new Date(), createdAt: new Date() }]
            : table === organizations
              ? [academy, club]
              : table === players
                ? selection && "player" in selection
                  ? [{ player: foreignPlayer, academyName: "أكاديمية أخرى" }]
                  : [foreignPlayer]
                : [];
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

let server: Server | undefined;
let endpoint = "";

beforeEach(async () => {
  state.db = isolatedDb();
  state.sdkUser = null;
  vi.mocked(sdk.authenticateRequest).mockClear();
  vi.mocked(ensureLicensedDemoShootingFixture).mockClear();
  const app = express();
  registerAthleteRoutes(app);
  server = createServer(app);
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/athlete`;
});

afterEach(async () => {
  if (server)
    await new Promise<void>((resolve, reject) => server!.close(error => (error ? reject(error) : resolve())));
  server = undefined;
});

describe("anonymous demo capability boundary", () => {
  it("resolves a guest only into its two server-issued workspace organizations without attaching the independent fixture", async () => {
    const guest = await getGuestActorForToken(token);
    expect(guest).toMatchObject({ kind: "demo", id: null, academyId: 501, clubId: 502 });
    expect(guest?.memberships.map(item => item.organizationId)).toEqual([501, 502]);
    expect(ensureLicensedDemoShootingFixture).not.toHaveBeenCalled();
  });

  it("denies a request when neither the SDK nor a demo capability authenticates it", async () => {
    await expect(requireActor({ headers: {}, header: () => undefined } as any)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("uses an explicit valid demo token before an SDK-authenticated browser cookie", async () => {
    state.sdkUser = {
      id: 7,
      openId: "member-cookie-test-only",
      name: "عضو اختبار",
      email: null,
      role: "user",
    };
    const actor = await requireActor({
      headers: { cookie: "manus_session=real-member-cookie" },
      header(name: string) {
        return name.toLowerCase() === "x-demo-token" ? token : undefined;
      },
    } as any);

    expect(actor).toMatchObject({ kind: "demo", id: null, academyId: 501, clubId: 502 });
    expect(sdk.authenticateRequest).not.toHaveBeenCalled();
  });

  it("does not log the opaque token while resuming a valid capability", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await fetch(`${endpoint}/session`, { headers: { "X-Demo-Token": token } });
    expect(response.status).toBe(200);
    expect((await response.json()).user).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("denies a demo guest attempting to read a player from another workspace", async () => {
    const response = await fetch(`${endpoint}/players/999`, {
      headers: { "X-Demo-Token": token, "X-Organization-Id": "501" },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("مساحة العرض");
  });
});
