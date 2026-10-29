
import { createHash, randomBytes } from "node:crypto";
import { eq, and, gt, isNull } from "drizzle-orm";
import { authSessions, users } from "../../drizzle/schema";
import { getDb } from "../db";

export const AUTH_COOKIE_NAME = "athlete_session";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthSession(userId: number) {
  const db = await getDb();

  if (!db) {
    throw new Error("Database unavailable");
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(authSessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return {
    token,
    expiresAt,
  };
}

export async function getSessionUser(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const db = await getDb();

  if (!db) {
    throw new Error("Database unavailable");
  }

  const rows = await db
    .select({ user: users })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(
      and(
        eq(authSessions.tokenHash, hashToken(token)),
        gt(authSessions.expiresAt, new Date()),
        isNull(authSessions.revokedAt)
      )
    )
    .limit(1);

  return rows[0]?.user ?? null;
}

export async function revokeAuthSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return;
  }

  const db = await getDb();

  if (!db) {
    throw new Error("Database unavailable");
  }

  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(eq(authSessions.tokenHash, hashToken(token)));
}

export const AUTH_COOKIE_MAX_AGE = SESSION_DURATION_MS;
