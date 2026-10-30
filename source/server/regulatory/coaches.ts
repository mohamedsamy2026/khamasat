
import type {
  Router,
  Request,
  Response,
  NextFunction,
} from "express";

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  academyAuthorityLinks,
  auditEvents,
  coaches,
  organizations,
} from "../../drizzle/schema";

import {
  ForbiddenError,
  HttpError,
} from "../../shared/_core/errors";

import { getDb } from "../db";
import { requireAuthorityMember } from "./actor";

// -----------------------------------------------
// TYPES
// -----------------------------------------------

type Database = NonNullable<
  Awaited<ReturnType<typeof getDb>>
>;

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

// -----------------------------------------------
// VALIDATION
// -----------------------------------------------

const idSchema = z.coerce.number().int().positive();

const coachFields = {
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(30).nullable().optional(),
  specialization: z
    .string()
    .trim()
    .min(2)
    .max(200),
};

const createCoachSchema = z
  .object(coachFields)
  .strict();

const updateCoachSchema = z
  .object({
    ...coachFields,
    status: z.enum(["active", "inactive"]),
  })
  .partial()
  .strict()
  .refine(
    data => Object.keys(data).length > 0,
    "يجب إرسال حقل واحد على الأقل"
  );

// -----------------------------------------------
// HELPERS
// -----------------------------------------------

function handle(
  fn: (req: Request, res: Response) => Promise<void>
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    void fn(req, res).catch(next);
  };
}

function parseId(value: unknown): number {
  const parsed = idSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "المعرّف غير صالح"
    );
  }

  return parsed.data;
}

async function database(): Promise<Database> {
  const db = await getDb();

  if (!db) {
    throw new HttpError(
      503,
      "قاعدة البيانات غير متاحة"
    );
  }

  return db;
}

function getInsertId(
  result: Awaited<
    ReturnType<
      ReturnType<Database["insert"]>["values"]
    >
  >
): number {
  const header = result[0];

  if (!header || !("insertId" in header)) {
    throw new Error(
      "Missing database insert ID"
    );
  }

  const id = Number(header.insertId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(
      "Invalid database insert ID"
    );
  }

  return id;
}

/**
 * Verify the academy belongs to the authority,
 * is approved, and is not a demo organization.
 */
async function requireApprovedAcademy(
  db: Database | DatabaseTransaction,
  authorityId: number,
  academyId: number
): Promise<void> {
  const rows = await db
    .select({
      id: organizations.id,
    })
    .from(academyAuthorityLinks)
    .innerJoin(
      organizations,
      eq(
        organizations.id,
        academyAuthorityLinks.academyId
      )
    )
    .where(
      and(
        eq(
          academyAuthorityLinks.authorityId,
          authorityId
        ),
        eq(
          academyAuthorityLinks.academyId,
          academyId
        ),
        eq(
          academyAuthorityLinks.status,
          "approved"
        ),
        eq(organizations.type, "academy"),
        eq(organizations.isDemo, false)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw ForbiddenError(
      "الأكاديمية غير معتمدة لدى هذه الجهة أو أنها تجريبية"
    );
  }
}

// -----------------------------------------------
// ROUTES
// -----------------------------------------------

export function registerCoachRoutes(
  router: Router
): void {
  /**
   * GET
   * /authorities/:authorityId/academies/:academyId/coaches
   */
  router.get(
    "/authorities/:authorityId/academies/:academyId/coaches",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const academyId = parseId(
        req.params.academyId
      );

      await requireAuthorityMember(
        req,
        authorityId,
        "read"
      );

      const db = await database();

      await requireApprovedAcademy(
        db,
        authorityId,
        academyId
      );

      const rows = await db
        .select({
          id: coaches.id,
          academyId: coaches.academyId,
          name: coaches.name,
          email: coaches.email,
          phone: coaches.phone,
          specialization: coaches.specialization,
          status: coaches.status,
        })
        .from(coaches)
        .where(
          eq(coaches.academyId, academyId)
        )
        .orderBy(asc(coaches.name));

      res.json({
        authorityId,
        academyId,
        coaches: rows,
      });
    })
  );

  /**
   * POST
   * /authorities/:authorityId/academies/:academyId/coaches
   *
   * Requires manage permission.
   */
  router.post(
    "/authorities/:authorityId/academies/:academyId/coaches",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const academyId = parseId(
        req.params.academyId
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const input = createCoachSchema.parse(
        req.body
      );

      const db = await database();

      const coachId = await db.transaction(
        async tx => {
          await requireApprovedAcademy(
            tx,
            authorityId,
            academyId
          );

          const inserted = await tx
            .insert(coaches)
            .values({
              academyId,
              name: input.name,
              email: input.email,
              phone: input.phone ?? null,
              specialization:
                input.specialization,
              status: "active",
            });

          const id = getInsertId(inserted);

          await tx.insert(auditEvents).values({
            organizationId: academyId,
            actorUserId: actor.user.id,
            entityType: "coach",
            entityId: id,
            action: "coach.created",
            metadata: {
              authorityId,
              academyId,
            },
          });

          return id;
        }
      );

      res.status(201).json({
        id: coachId,
        authorityId,
        academyId,
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        specialization:
          input.specialization,
        status: "active",
      });
    })
  );

  /**
   * PATCH
   * /authorities/:authorityId/coaches/:coachId
   *
   * Requires manage permission.
   * The coach must belong to an approved
   * academy connected to the same authority.
   */
  router.patch(
    "/authorities/:authorityId/coaches/:coachId",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const coachId = parseId(
        req.params.coachId
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const input = updateCoachSchema.parse(
        req.body
      );

      const db = await database();

      const result = await db.transaction(
        async tx => {
          const rows = await tx
            .select({
              id: coaches.id,
              academyId: coaches.academyId,
              name: coaches.name,
              email: coaches.email,
              phone: coaches.phone,
              specialization:
                coaches.specialization,
              status: coaches.status,
            })
            .from(coaches)
            .where(
              eq(coaches.id, coachId)
            )
            .limit(1)
            .for("update");

          const coach = rows[0];

          if (!coach) {
            throw new HttpError(
              404,
              "المدرب غير موجود"
            );
          }

          await requireApprovedAcademy(
            tx,
            authorityId,
            coach.academyId
          );

          await tx
            .update(coaches)
            .set(input)
            .where(
              and(
                eq(coaches.id, coachId),
                eq(
                  coaches.academyId,
                  coach.academyId
                )
              )
            );

          await tx.insert(auditEvents).values({
            organizationId: coach.academyId,
            actorUserId: actor.user.id,
            entityType: "coach",
            entityId: coachId,
            action: "coach.updated",
            metadata: {
              authorityId,
              updatedFields:
                Object.keys(input),
            },
          });

          return {
            id: coachId,
            authorityId,
            academyId: coach.academyId,
            updatedFields:
              Object.keys(input),
          };
        }
      );

      res.json({
        ...result,
        success: true,
      });
    })
  );
}
