import { createHash } from "node:crypto";
import type { Request } from "express";
import { and, eq, gt, inArray } from "drizzle-orm";
import { demoSessions, organizations } from "../../drizzle/schema";
import { ForbiddenError, HttpError } from "../../shared/_core/errors";
import type { Membership } from "../../shared/athlete";
import { getDb } from "../db";
import { sdk, type AuthenticatedUser } from "../_core/sdk";
import type { OrganizationContext } from "./policy";

export type OrganizationMembership = OrganizationContext & {
  name: string;
  region: string;
  isDemo: boolean;
};

export type MemberActor = {
  kind: "member";
  id: number;
  user: AuthenticatedUser;
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

export const DEMO_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function demoTokenFromRequest(req: Request): string | null {
  const header = req.header("X-Demo-Token")?.trim();
  if (header && opaqueToken.test(header)) return header;
  const cookie = req.headers.cookie;
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== DEMO_COOKIE || rawValue.length === 0) continue;
    try {
      const value = decodeURIComponent(rawValue.join("=")).trim();
      if (opaqueToken.test(value)) return value;
    } catch {
      return null;
    }
  }
  return null;
}

export function demoTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function demoCookieName(): string {
  return DEMO_COOKIE;
}

export function actorUserId(actor: Actor): number | null {
  return actor.id;
}

/** Never invent an identity for an anonymous demo capability. */
export function actorDisplayName(actor: Actor): string {
  if (actor.kind === "demo") return "مدرب العرض—غير موثق";
  const name = actor.user.name?.trim();
  return name || "مستخدم موثّق";
}

export function isGuestActor(actor: Actor): actor is GuestActor {
  return actor.kind === "demo";
}

export function asMembership(
  row: Pick<
    OrganizationMembership,
    "organizationId" | "name" | "type" | "role" | "region" | "isDemo"
  >
): Membership {
  return {
    organizationId: row.organizationId,
    name: row.name,
    type: row.type,
    role: row.role,
    region: row.region,
    isDemo: Boolean(row.isDemo),
  };
}

export async function optionalUser(
  req: Request
): Promise<AuthenticatedUser | null> {
  // Do not ask the SDK to authenticate an otherwise anonymous demo-cookie request.
  const onlyDemoCookie =
    !req.headers.authorization &&
    Boolean(req.headers.cookie) &&
    (req.headers.cookie ?? "")
      .split(";")
      .every(part => part.trim().startsWith(`${DEMO_COOKIE}=`));
  if (!req.headers.authorization && (!req.headers.cookie || onlyDemoCookie))
    return null;
  try {
    const user = await sdk.authenticateRequest(req);
    return user.isCron ? null : user;
  } catch (error) {
    if (
      error instanceof HttpError &&
      (error.statusCode === 401 || error.statusCode === 403)
    )
      return null;
    throw error;
  }
}

export async function requireUser(req: Request): Promise<AuthenticatedUser> {
  const user = await sdk.authenticateRequest(req);
  if (user.isCron) throw ForbiddenError("هذه الواجهة متاحة للمستخدمين فقط");
  return user;
}

/** Resolves only a server-issued, unexpired opaque demo capability. */
export async function getGuestActorForToken(
  token: string
): Promise<GuestActor | null> {
  if (!opaqueToken.test(token)) return null;
  const db = await getDb();
  if (!db) throw new HttpError(503, "قاعدة البيانات غير متاحة حاليًا");
  const sessions = await db
    .select()
    .from(demoSessions)
    .where(
      and(
        eq(demoSessions.tokenHash, demoTokenHash(token)),
        gt(demoSessions.expiresAt, new Date())
      )
    )
    .limit(1);
  const session = sessions[0];
  if (!session) return null;
  const orgRows = await db
    .select()
    .from(organizations)
    .where(inArray(organizations.id, [session.academyId, session.clubId]));
  const academy = orgRows.find(
    row => row.id === session.academyId && row.type === "academy" && row.isDemo
  );
  const club = orgRows.find(
    row => row.id === session.clubId && row.type === "club" && row.isDemo
  );
  // The capability IDs, not the generic isDemo flag, fence this workspace.
  if (!academy || !club) return null;
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
        actorKind: "demo",
        workspaceAcademyId: academy.id,
        workspaceClubId: club.id,
      },
    ],
  };
}

export async function getGuestActor(req: Request): Promise<GuestActor | null> {
  const token = demoTokenFromRequest(req);
  return token ? getGuestActorForToken(token) : null;
}

/** Demo capabilities may replace a missing SDK identity, never impersonate one. */
export async function requireActor(req: Request): Promise<Actor> {
  if (req.header("X-Demo-Token") !== undefined) {
    const token = req.header("X-Demo-Token")?.trim() ?? "";
    const guest = opaqueToken.test(token)
      ? await getGuestActorForToken(token)
      : null;
    if (!guest)
      throw ForbiddenError("جلسة العرض التجريبي غير صالحة أو انتهت مدتها");
    return guest;
  }
  try {
    const user = await requireUser(req);
    return { kind: "member", id: user.id, user };
  } catch (error) {
    if (
      !(error instanceof HttpError) ||
      (error.statusCode !== 401 && error.statusCode !== 403)
    )
      throw error;
  }
  const guest = await getGuestActor(req);
  if (guest) return guest;
  throw ForbiddenError("يلزم تسجيل الدخول أو جلسة عرض تجريبية صالحة");
}
