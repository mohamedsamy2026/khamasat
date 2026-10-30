
import express, {
  Router,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  authorityMemberships,
  regulatoryAuthorities,
  users,
} from "../../drizzle/schema";

import {
  ForbiddenError,
  HttpError,
} from "../../shared/_core/errors";

import { getDb } from "../db";

import {
  requireAuthorityMember,
  requireLocalUser,
} from "./actor";
import { registerAcademyRoutes } from "./academies";
import { registerLicenseRoutes } from "./licenses";
import { registerCoachRoutes } from "./coaches";
import { registerReportRoutes } from "./reports";
import { registerNotificationRoutes } from "./notifications";
import { registerDashboardRoutes } from "./dashboard";
const positiveId = z.coerce.number().int().positive();

const memberInputSchema = z.object({
  userId: positiveId,
  role: z.enum(["admin", "reviewer", "viewer"]),
}).strict();

type AsyncHandler = (
  req: Request,
  res: Response
) => Promise<void>;

function asyncRoute(handler: AsyncHandler) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    void handler(req, res).catch(next);
  };
}

async function database() {
  const db = await getDb();

  if (!db) {
    throw new HttpError(
      503,
      "قاعدة البيانات غير متاحة حاليًا"
    );
  }

  return db;
}

function authorityIdFromRequest(req: Request): number {
  const result = positiveId.safeParse(
    req.params.authorityId
  );

  if (!result.success) {
    throw new HttpError(
      400,
      "معرّف الجهة التنظيمية غير صالح"
    );
  }

  return result.data;
}

function regulatoryError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) {
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({
      error:
        error.issues[0]?.message ??
        "البيانات المرسلة غير صالحة",
    });
    return;
  }

  console.error(
    "[Regulatory API]",
    error instanceof Error ? error.message : error
  );

  res.status(500).json({
    error: "حدث خطأ داخلي في الخادم",
  });
}

export function registerRegulatoryRoutes(
  app: Express
): void {


 const router = Router();

registerAcademyRoutes(router);
registerLicenseRoutes(router);
registerCoachRoutes(router);
registerReportRoutes(router);
registerNotificationRoutes(router);
registerDashboardRoutes(router);
  /**
   * List only authorities belonging to
   * the authenticated local user.
   */
  router.get(
    "/me",
    asyncRoute(async (req, res) => {
      const user = await requireLocalUser(req);
      const db = await database();

      const rows = await db
        .select({
          id: regulatoryAuthorities.id,
          name: regulatoryAuthorities.name,
          code: regulatoryAuthorities.code,
          region: regulatoryAuthorities.region,
          status: regulatoryAuthorities.status,
          role: authorityMemberships.role,
        })
        .from(authorityMemberships)
        .innerJoin(
          regulatoryAuthorities,
          eq(
            authorityMemberships.authorityId,
            regulatoryAuthorities.id
          )
        )
        .where(
          and(
            eq(authorityMemberships.userId, user.id),
            eq(regulatoryAuthorities.status, "active")
          )
        )
        .orderBy(asc(regulatoryAuthorities.name));

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        authorities: rows,
      });
    })
  );

  /**
   * Return one authority only if the
   * user belongs to it.
   */
  router.get(
    "/authorities/:authorityId",
    asyncRoute(async (req, res) => {
      const authorityId = authorityIdFromRequest(req);

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "read"
      );

      res.json({
        authority: actor.authority,
        role: actor.role,
      });
    })
  );

  /**
   * Only an authority admin may list
   * its assigned members.
   */
  router.get(
    "/authorities/:authorityId/members",
    asyncRoute(async (req, res) => {
      const authorityId = authorityIdFromRequest(req);

      await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const db = await database();

      const members = await db
        .select({
          id: authorityMemberships.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          role: authorityMemberships.role,
          createdAt: authorityMemberships.createdAt,
        })
        .from(authorityMemberships)
        .innerJoin(
          users,
          eq(authorityMemberships.userId, users.id)
        )
        .where(
          eq(
            authorityMemberships.authorityId,
            authorityId
          )
        )
        .orderBy(asc(authorityMemberships.id));

      res.json({ members });
    })
  );

  /**
   * Add an existing user as a member.
   * Never create or promote users through
   * a public registration endpoint.
   */
  router.post(
    "/authorities/:authorityId/members",
    asyncRoute(async (req, res) => {
      const authorityId = authorityIdFromRequest(req);

      await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const input = memberInputSchema.parse(req.body);

      const db = await database();

      const existingUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!existingUsers.length) {
        throw new HttpError(
          404,
          "المستخدم المطلوب غير موجود"
        );
      }

      const existingMemberships = await db
        .select({ id: authorityMemberships.id })
        .from(authorityMemberships)
        .where(
          and(
            eq(
              authorityMemberships.authorityId,
              authorityId
            ),
            eq(
              authorityMemberships.userId,
              input.userId
            )
          )
        )
        .limit(1);

      if (existingMemberships.length) {
        throw new HttpError(
          409,
          "المستخدم عضو في هذه الجهة التنظيمية بالفعل"
        );
      }

      try {
        await db.insert(authorityMemberships).values({
          authorityId,
          userId: input.userId,
          role: input.role,
        });
      } catch (error) {
        // The database unique constraint is the
        // final defense against concurrent inserts.
        const dbError = error as {
          code?: string;
          cause?: { code?: string };
        };

        if (
          dbError.code === "ER_DUP_ENTRY" ||
          dbError.cause?.code === "ER_DUP_ENTRY"
        ) {
          throw new HttpError(
            409,
            "المستخدم عضو في هذه الجهة التنظيمية بالفعل"
          );
        }

        throw error;
      }

      res.status(201).json({
        success: true,
        membership: {
          authorityId,
          userId: input.userId,
          role: input.role,
        },
      });
    })
  );

  app.use(
    "/api/regulatory",
    express.json({ limit: "1mb" }),
    router
  );

  app.use("/api/regulatory", regulatoryError);
}
