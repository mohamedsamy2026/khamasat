
import { createHash } from "node:crypto";
import type { Request } from "express";
import { and, eq, gt, inArray } from "drizzle-orm";

import {
  demoSessions,
  organizations,
  type User,
} from "../../drizzle/schema";

import {
  ForbiddenError,
  HttpError,
} from "../../shared/_core/errors";

import type { Membership } from "../../shared/athlete";
import type { SportId } from "../../shared/sports/types";

import { getDb } from "../db";
import { authenticateLocalRequest } from "../auth/middleware";
import type { OrganizationContext } from "./policy";

export type OrganizationMembership = OrganizationContext & {
  name: string;
  region: string;
  isDemo: boolean;
  sports: SportId[];
};

export type MemberActor = {
  kind: "member";
  id: number;
  user: User;
};

export type GuestActor = {
  kind: "demo";
  id: null;
  token: string;
  academyId: number;
  clubId: number;
  memberships: [OrganizationMembership, OrganizationMembership];
};

export type Actor = MemberActor | GuestActor;

const DEMO_COOKIE = "athlete_demo_token";

const opaqueToken = /^[A-Za-z0-9_-]{43}$/;

export const DEMO_SESSION_MAX_AGE_MS =
  30 * 24 * 60 * 60 * 1000;

// ----------------------------------------
// DEMO TOKEN
// ----------------------------------------

export function demoTokenFromRequest(
  req: Request
): string | null {
  const header = req.header("X-Demo-Token")?.trim();

  if (header && opaqueToken.test(header)) {
    return header;
  }

  const cookie = req.headers.cookie;

  if (!cookie) {
    return null;
  }

  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");

    if (rawKey !== DEMO_COOKIE || rawValue.length === 0) {
      continue;
    }

    try {
      const value = decodeURIComponent(
        rawValue.join("=")
      ).trim();

      if (opaqueToken.test(value)) {
        return value;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function demoTokenHash(token: string): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export function demoCookieName(): string {
  return DEMO_COOKIE;
}

// ----------------------------------------
// ACTOR HELPERS
// ----------------------------------------

export function actorUserId(actor: Actor): number | null {
  return actor.id;
}

export function actorDisplayName(actor: Actor): string {
  if (actor.kind === "demo") {
    return "مدرب العرض—غير موثق";
  }

  const name = actor.user.name?.trim();

  return name || "مستخدم موثّق";
}

export function isGuestActor(
  actor: Actor
): actor is GuestActor {
  return actor.kind === "demo";
}

export function asMembership(
  row: Pick<
    OrganizationMembership,
    | "organizationId"
    | "name"
    | "type"
    | "role"
    | "region"
    | "isDemo"
  > & {
    sports?: readonly string[];
  }
): Membership {
  return {
    organizationId: row.organizationId,
    name: row.name,
    type: row.type,
    role: row.role,
    region: row.region,
    isDemo: Boolean(row.isDemo),
    sports: (row.sports ?? []).filter(
      (sport): sport is SportId =>
        sport === "football" ||
        sport === "gymnastics"
    ),
  };
}

// ----------------------------------------
// LOCAL AUTHENTICATION
// ----------------------------------------

/**
 * Returns the authenticated local user,
 * or null when no valid local session exists.
 *
 * Demo sessions are handled separately.
 */
export async function optionalUser(
  req: Request
): Promise<User | null> {
  return authenticateLocalRequest(req);
}

/**
 * Requires a valid local authentication session.
 * No Manus OAuth or SDK dependency.
 */
export async function requireUser(
  req: Request
): Promise<User> {
  const user = await authenticateLocalRequest(req);

  if (!user) {
    throw new HttpError(
      401,
      "يلزم تسجيل الدخول للوصول إلى هذه الواجهة"
    );
  }

  return user;
}

// ----------------------------------------
// DEMO ACTOR
// ----------------------------------------

/**
 * Resolves only a server-issued,
 * unexpired demo session.
 */
export async function getGuestActorForToken(
  token: string
): Promise<GuestActor | null> {
  if (!opaqueToken.test(token)) {
    return null;
  }

  const db = await getDb();

  if (!db) {
    throw new HttpError(
      503,
      "قاعدة البيانات غير متاحة حاليًا"
    );
  }

  const sessions = await db
    .select()
    .from(demoSessions)
    .where(
      and(
        eq(
          demoSessions.tokenHash,
          demoTokenHash(token)
        ),
        gt(
          demoSessions.expiresAt,
          new Date()
        )
      )
    )
    .limit(1);

  const session = sessions[0];

  if (!session) {
    return null;
  }

  const orgRows = await db
    .select()
    .from(organizations)
    .where(
      inArray(
        organizations.id,
        [session.academyId, session.clubId]
      )
    );

  const academy = orgRows.find(
    (row) =>
      row.id === session.academyId &&
      row.type === "academy" &&
      row.isDemo
  );

  const club = orgRows.find(
    (row) =>
      row.id === session.clubId &&
      row.type === "club" &&
      row.isDemo
  );

  // Demo access is restricted to the
  // exact academy and club in the session.
  if (!academy || !club) {
    return null;
  }

  return {
    kind: "demo",
    id: null,
    token,
    academyId: academy.id,
    clubId: club.id,

    memberships: [
      {
        organizationId: academy.id,
        userId: null,
        type: "academy",
        role: "owner",
        name: academy.name,
        region: academy.region,
        isDemo: true,
        sports: academy.sports,
        actorKind: "demo",
        workspaceAcademyId: academy.id,
        workspaceClubId: club.id,
      },
      {
        organizationId: club.id,
        userId: null,
        type: "club",
        role: "owner",
        name: club.name,
        region: club.region,
        isDemo: true,
        sports: club.sports,
        actorKind: "demo",
        workspaceAcademyId: academy.id,
        workspaceClubId: club.id,
      },
    ],
  };
}

export async function getGuestActor(
  req: Request
): Promise<GuestActor | null> {
  const token = demoTokenFromRequest(req);

  return token
    ? getGuestActorForToken(token)
    : null;
}

// ----------------------------------------
// REQUEST ACTOR
// ----------------------------------------

/**
 * Resolves a real member or demo actor.
 *
 * Explicit demo tokens must be valid.
 * Local users are authenticated using
 * the independent MySQL session system.
 */
export async function requireActor(
  req: Request
): Promise<Actor> {
  // An explicit demo token must never
  // silently fall back to a member.
  if (req.header("X-Demo-Token") !== undefined) {
    const token =
      req.header("X-Demo-Token")?.trim() ?? "";

    const guest = opaqueToken.test(token)
      ? await getGuestActorForToken(token)
      : null;

    if (!guest) {
      throw ForbiddenError(
        "جلسة العرض التجريبي غير صالحة أو انتهت مدتها"
      );
    }

    return guest;
  }

  // Try independent local authentication.
  const user = await optionalUser(req);

  if (user) {
    return {
      kind: "member",
      id: user.id,
      user,
    };
  }

  // Preserve the existing demo-cookie flow.
  const guest = await getGuestActor(req);

  if (guest) {
    return guest;
  }

  throw ForbiddenError(
    "يلزم تسجيل الدخول أو جلسة عرض تجريبية صالحة"
  );
}
