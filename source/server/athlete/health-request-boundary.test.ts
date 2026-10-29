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
vi.mock("../auth/middleware", () => ({ authenticateLocalRequest: vi.fn(async () => ({ id: 7, openId: "local:isolated-test-user", name: "مالك أكاديمية الاختبار", email: null, loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() })) }));
vi.mock("../db", () => ({ getDb: vi.fn(async () => fixtureState.db) }));

import { registerAthleteRoutes } from "./index";

let fixture: AthleteRouteFixture;
let server: Server | undefined;
let baseUrl = "";

const academyOwner = {
  organizationId: 11,
  userId: 7,
  role: "owner" as const,
  name: "أكاديمية اختبار",
  type: "academy" as const,
  region: "الرياض",
  isDemo: false,
  sports: ["football", "gymnastics"],
};
const academyStaff = { ...academyOwner, role: "staff" as const };
const clubMembership = {
  organizationId: 20,
  userId: 7,
  role: "staff" as const,
  name: "نادي اختبار",
  type: "club" as const,
  region: "الرياض",
  isDemo: false,
  sports: ["football", "gymnastics"],
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

const healthPayload = {
  previousInjuries: "إصابة سابقة في أربطة الكاحل الأيسر",
  currentMedications: "لا يوجد",
  physiotherapy: "جلسة أسبوعية لمدة ستة أسابيع",
  otherNotes: "حساسية موثقة من إسفنج الملعب",
};

const emergencyPayload = {
  contactName: "ولي أمر اللاعب",
  relationship: "والد",
  phone: "+201000000000",
  alternatePhone: "+201111111111",
  notes: "متاح بعد السادسة مساءً",
};

describe("isolated sensitive athlete data boundaries", () => {
  it("denies health and emergency reads to academy staff who only see the player", async () => {
    fixture.membership = academyStaff;

    const health = await fetch(`${baseUrl}/players/101/health`, {
      headers: headers(),
    });
    expect(health.status).toBe(403);
    expect((await health.json()).error).toContain("صلاحية");

    const emergency = await fetch(`${baseUrl}/players/101/emergency-contact`, {
      headers: headers(),
    });
    expect(emergency.status).toBe(403);
    expect(fixture.healthProfiles).toHaveLength(0);
  });

  it("denies writes to non-owners, including the owning academy's staff", async () => {
    fixture.membership = academyStaff;

    const response = await fetch(`${baseUrl}/players/101/health`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(healthPayload),
    });

    expect(response.status).toBe(403);
    expect(fixture.healthProfiles).toHaveLength(0);
    expect(fixture.sensitiveGrants).toHaveLength(0);
  });

  it("lets the owning academy owner record health data and grants only the health scope", async () => {
    const saved = await fetch(`${baseUrl}/players/101/health`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(healthPayload),
    });

    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.profile).toMatchObject({
      playerId: 101,
      previousInjuries: healthPayload.previousInjuries,
      updatedByName: "مالك أكاديمية الاختبار",
    });
    expect(body.access.scopes).toEqual({ health: true, emergency: false });
    expect(fixture.sensitiveGrants).toEqual([
      expect.objectContaining({ scope: "health", organizationId: 11, active: true }),
    ]);

    // The health save never unlocks the emergency contact.
    const emergency = await fetch(`${baseUrl}/players/101/emergency-contact`, {
      headers: headers(),
    });
    expect(emergency.status).toBe(403);

    const readBack = await fetch(`${baseUrl}/players/101/health`, {
      headers: headers(),
    });
    expect(readBack.status).toBe(200);
    expect((await readBack.json()).profile.currentMedications).toBe(
      healthPayload.currentMedications
    );

    // The audit trail records field names, never their values.
    const audit = fixture.audit.find(
      event => event.action === "player.health_updated"
    );
    expect(audit).toBeDefined();
    expect(JSON.stringify(audit)).not.toContain(healthPayload.previousInjuries);
    expect(JSON.stringify(audit)).not.toContain(healthPayload.physiotherapy);
  });

  it("keeps the emergency contact behind its own explicit permission", async () => {
    fixture.sensitiveGrants = [
      {
        id: 1,
        playerId: 101,
        organizationId: 11,
        scope: "health",
        active: true,
        grantedAt: new Date("2026-10-01T00:00:00.000Z"),
        revokedAt: null,
      },
    ];

    const denied = await fetch(`${baseUrl}/players/101/emergency-contact`, {
      headers: headers(),
    });
    expect(denied.status).toBe(403);

    const saved = await fetch(`${baseUrl}/players/101/emergency-contact`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(emergencyPayload),
    });
    expect(saved.status).toBe(200);
    expect((await saved.json()).contact).toMatchObject({
      contactName: emergencyPayload.contactName,
      phone: emergencyPayload.phone,
    });
    expect(
      fixture.sensitiveGrants.map(grant => [grant.scope, grant.active])
    ).toEqual([
      ["health", true],
      ["emergency", true],
    ]);

    // A second save updates the same row instead of duplicating the contact.
    await fetch(`${baseUrl}/players/101/emergency-contact`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ ...emergencyPayload, relationship: "والدة" }),
    });
    expect(fixture.emergencyContacts).toHaveLength(1);
    expect(fixture.emergencyContacts[0].relationship).toBe("والدة");
  });

  it("validates emergency contact phone numbers on the server", async () => {
    const response = await fetch(`${baseUrl}/players/101/emergency-contact`, {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ ...emergencyPayload, phone: "abc" }),
    });
    expect(response.status).toBe(400);
    expect(fixture.emergencyContacts).toHaveLength(0);
  });

  it("never gives a club health data from its ordinary profile grant", async () => {
    fixture.membership = clubMembership;
    fixture.players = [testPlayer({ discoverable: true })];
    fixture.grants = [
      {
        id: 1,
        playerId: 101,
        clubId: 20,
        accessRequestId: 5,
        active: true,
        grantedAt: new Date("2026-10-01T00:00:00.000Z"),
        revokedAt: null,
      },
    ];
    fixture.healthProfiles = [
      {
        id: 1,
        playerId: 101,
        ...healthPayload,
        updatedByName: "الأكاديمية",
        updatedAt: new Date("2026-10-02T00:00:00.000Z"),
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    ];

    const health = await fetch(`${baseUrl}/players/101/health`, {
      headers: headers(20),
    });
    expect(health.status).toBe(403);
    expect((await health.json()).error).toContain("صلاحية");

    const emergency = await fetch(`${baseUrl}/players/101/emergency-contact`, {
      headers: headers(20),
    });
    expect(emergency.status).toBe(403);
    // A profile grant does not create a sensitive grant by itself.
    expect(fixture.sensitiveGrants).toHaveLength(0);
  });

  it("lets the owner grant a club one scope at a time, and only after profile approval", async () => {
    fixture.grants = [
      {
        id: 1,
        playerId: 101,
        clubId: 20,
        accessRequestId: 5,
        active: true,
        grantedAt: new Date("2026-10-01T00:00:00.000Z"),
        revokedAt: null,
      },
    ];
    fixture.healthProfiles = [
      {
        id: 1,
        playerId: 101,
        ...healthPayload,
        updatedByName: "الأكاديمية",
        updatedAt: new Date("2026-10-02T00:00:00.000Z"),
        createdAt: new Date("2026-10-02T00:00:00.000Z"),
      },
    ];

    const unrelated = await fetch(`${baseUrl}/players/101/sensitive-access`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        organizationId: 21,
        scope: "health",
        action: "grant",
      }),
    });
    expect(unrelated.status).toBe(403);
    expect(unrelated.ok).toBe(false);

    const granted = await fetch(`${baseUrl}/players/101/sensitive-access`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        organizationId: 20,
        scope: "health",
        action: "grant",
      }),
    });
    expect(granted.status).toBe(200);

    fixture.membership = clubMembership;
    const clubHealth = await fetch(`${baseUrl}/players/101/health`, {
      headers: headers(20),
    });
    expect(clubHealth.status).toBe(200);
    expect((await clubHealth.json()).profile.previousInjuries).toBe(
      healthPayload.previousInjuries
    );
    const clubEmergency = await fetch(
      `${baseUrl}/players/101/emergency-contact`,
      { headers: headers(20) }
    );
    expect(clubEmergency.status).toBe(403);

    // Revoking health does not silently open or close the emergency scope.
    fixture.membership = academyOwner;
    const revoked = await fetch(`${baseUrl}/players/101/sensitive-access`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        organizationId: 20,
        scope: "health",
        action: "revoke",
      }),
    });
    expect(revoked.status).toBe(200);
    fixture.membership = clubMembership;
    const afterRevoke = await fetch(`${baseUrl}/players/101/health`, {
      headers: headers(20),
    });
    expect(afterRevoke.status).toBe(403);
  });

  it("refuses to let a club or another academy manage grants", async () => {
    fixture.membership = clubMembership;
    const asClub = await fetch(`${baseUrl}/players/101/sensitive-access`, {
      method: "POST",
      headers: headers(20),
      body: JSON.stringify({
        organizationId: 20,
        scope: "health",
        action: "grant",
      }),
    });
    expect(asClub.status).toBe(403);

    fixture.membership = {
      ...academyOwner,
      organizationId: 12,
      name: "أكاديمية أخرى",
    };
    const otherAcademy = await fetch(`${baseUrl}/players/101/health`, {
      method: "PUT",
      headers: headers(12),
      body: JSON.stringify(healthPayload),
    });
    expect(otherAcademy.status).toBe(403);
    expect(fixture.healthProfiles).toHaveLength(0);
  });
});
