
import { randomUUID } from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { authCredentials, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { hashPassword, verifyPassword } from "./password";
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  createAuthSession,
  getSessionUser,
  revokeAuthSession,
} from "./session";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
}

function readSessionToken(req: Request): string | null {
  const cookieHeader = req.headers.cookie ?? "";

  const sessionCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));

  return sessionCookie
    ? sessionCookie.slice(AUTH_COOKIE_NAME.length + 1)
    : null;
}

function checkOrigin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const origin = req.get("origin");

  if (origin) {
    try {
      const expectedOrigin = process.env.APP_ORIGIN
        ? new URL(process.env.APP_ORIGIN).origin
        : `${req.protocol}://${req.get("host")}`;

      if (new URL(origin).origin !== expectedOrigin) {
        res.status(403).json({ error: "Invalid request origin" });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid request origin" });
      return;
    }
  }

  next();
}

export function registerAuthRoutes(app: Express) {
  // REGISTER
  app.post(
    "/api/auth/register",
    checkOrigin,
    authLimiter,
    async (req, res) => {
      try {
        const parsed = registerSchema.safeParse(req.body);

        if (!parsed.success) {
          res.status(400).json({
            error: "Invalid registration data",
          });
          return;
        }

        const { name, password } = parsed.data;
        const email = normalizeEmail(parsed.data.email);

        const db = await getDb();

        if (!db) {
          res.status(503).json({
            error: "Database unavailable",
          });
          return;
        }

        // Existing Manus accounts must not be claimed
        // simply by using the same email address.
        const existingUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUsers.length > 0) {
          res.status(409).json({
            error: "Account already exists or requires migration",
          });
          return;
        }

        const existingCredentials = await db
          .select({ id: authCredentials.id })
          .from(authCredentials)
          .where(eq(authCredentials.email, email))
          .limit(1);

        if (existingCredentials.length > 0) {
          res.status(409).json({
            error: "Account already exists",
          });
          return;
        }

        const passwordHash = await hashPassword(password);
        const openId = `local:${randomUUID()}`;

        const user = await db.transaction(async (tx) => {
          await tx.insert(users).values({
            openId,
            name,
            email,
            loginMethod: "local",
          });

          const createdUsers = await tx
            .select()
            .from(users)
            .where(eq(users.openId, openId))
            .limit(1);

          const createdUser = createdUsers[0];

          if (!createdUser) {
            throw new Error("User creation failed");
          }

          await tx.insert(authCredentials).values({
            userId: createdUser.id,
            email,
            passwordHash,
          });

          return createdUser;
        });

        const session = await createAuthSession(user.id);

        setAuthCookie(res, session.token);

        res.status(201).json({
          success: true,
          user: publicUser(user),
        });
      } catch (error) {
        console.error("[Auth] Registration failed", error);

        res.status(500).json({
          error: "Registration failed",
        });
      }
    }
  );

  // LOGIN
  app.post(
    "/api/auth/login",
    checkOrigin,
    authLimiter,
    async (req, res) => {
      try {
        const parsed = loginSchema.safeParse(req.body);

        if (!parsed.success) {
          res.status(400).json({
            error: "Invalid login data",
          });
          return;
        }

        const email = normalizeEmail(parsed.data.email);
        const password = parsed.data.password;

        const db = await getDb();

        if (!db) {
          res.status(503).json({
            error: "Database unavailable",
          });
          return;
        }

        const rows = await db
          .select({
            user: users,
            passwordHash: authCredentials.passwordHash,
          })
          .from(authCredentials)
          .innerJoin(
            users,
            eq(authCredentials.userId, users.id)
          )
          .where(eq(authCredentials.email, email))
          .limit(1);

        const account = rows[0];

        if (!account) {
          res.status(401).json({
            error: "Invalid email or password",
          });
          return;
        }

        const validPassword = await verifyPassword(
          account.passwordHash,
          password
        );

        if (!validPassword) {
          res.status(401).json({
            error: "Invalid email or password",
          });
          return;
        }

        const session = await createAuthSession(account.user.id);

        setAuthCookie(res, session.token);

        res.json({
          success: true,
          user: publicUser(account.user),
        });
      } catch (error) {
        console.error("[Auth] Login failed", error);

        res.status(500).json({
          error: "Login failed",
        });
      }
    }
  );

  // CURRENT USER
  app.get("/api/auth/me", async (req, res) => {
    try {
      const token = readSessionToken(req);

      if (!token) {
        res.json({ user: null });
        return;
      }

      const user = await getSessionUser(token);

      res.json({
        user: user ? publicUser(user) : null,
      });
    } catch (error) {
      console.error("[Auth] Session check failed", error);

      res.status(500).json({
        error: "Authentication check failed",
      });
    }
  });

  // LOGOUT
  app.post("/api/auth/logout", checkOrigin, async (req, res) => {
    try {
      const token = readSessionToken(req);

      if (token) {
        await revokeAuthSession(token);
      }

      res.clearCookie(AUTH_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
      });

      res.json({ success: true });
    } catch (error) {
      console.error("[Auth] Logout failed", error);

      res.status(500).json({
        error: "Logout failed",
      });
    }
  });
}
