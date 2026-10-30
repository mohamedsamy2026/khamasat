
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
  academyLicenses,
  auditEvents,
  coaches,
  coachLicenses,
  organizations,
} from "../../drizzle/schema";

import {
  ForbiddenError,
  HttpError,
} from "../../shared/_core/errors";

import { getDb } from "../db";
import { requireAuthorityMember } from "./actor";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type Database = NonNullable<
  Awaited<ReturnType<typeof getDb>>
>;

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type LicenseType = "academy" | "coach";

type LicenseStatus =
  | "active"
  | "suspended"
  | "revoked";

type EffectiveLicenseStatus =
  | LicenseStatus
  | "expired"
  | "expiring_soon";

// --------------------------------------------------
// VALIDATION
// --------------------------------------------------

const idSchema = z.coerce.number().int().positive();

const dateSchema = z
  .string()
  .datetime({ offset: true })
  .transform(value => new Date(value));

const licenseFields = {
  licenseNumber: z.string().trim().min(1).max(100),
  issuedAt: dateSchema,
  expiresAt: dateSchema,
};

const academyLicenseBody = z
  .object({
    academyId: idSchema,
    ...licenseFields,
  })
  .strict()
  .refine(
    value => value.expiresAt > value.issuedAt,
    {
      path: ["expiresAt"],
      message:
        "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار",
    }
  );

const coachLicenseBody = z
  .object({
    coachId: idSchema,
    ...licenseFields,
  })
  .strict()
  .refine(
    value => value.expiresAt > value.issuedAt,
    {
      path: ["expiresAt"],
      message:
        "تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار",
    }
  );

const statusBody = z
  .object({
    action: z.enum(["suspend", "revoke"]),
  })
  .strict();

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

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
  const result = idSchema.safeParse(value);

  if (!result.success) {
    throw new HttpError(400, "معرّف غير صالح");
  }

  return result.data;
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

function duplicateKey(error: unknown): boolean {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  const dbError = error as {
    code?: unknown;
    cause?: {
      code?: unknown;
    };
  };

  return (
    dbError.code === "ER_DUP_ENTRY" ||
    dbError.cause?.code === "ER_DUP_ENTRY"
  );
}

function effectiveState(
  status: LicenseStatus,
  expiresAt: Date
): EffectiveLicenseStatus {
  if (status !== "active") {
    return status;
  }

  const remaining =
    expiresAt.getTime() - Date.now();

  if (remaining <= 0) {
    return "expired";
  }

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  if (remaining <= thirtyDays) {
    return "expiring_soon";
  }

  return "active";
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
      "Database did not return an insert result"
    );
  }

  const id = Number(header.insertId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(
      "Database did not return a valid insert ID"
    );
  }

  return id;
}


/**
 * Accepts either a normal Drizzle database connection
 * or a Drizzle transaction.
 *
 * The caller must already have authority membership.
 *
 * Only real, approved academies are eligible.
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

  if (!rows.length) {
    throw ForbiddenError(
      "الأكاديمية غير معتمدة لدى الجهة أو أنها تجريبية"
    );
  }
}

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

export function registerLicenseRoutes(
  router: Router
): void {
  /**
   * GET /authorities/:authorityId/licenses
   *
   * Lists academy and coach licenses.
   */
  router.get(
    "/authorities/:authorityId/licenses",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      await requireAuthorityMember(
        req,
        authorityId,
        "read"
      );

      const db = await database();

      const [academyRows, coachRows] =
        await Promise.all([
          db
            .select({
              id: academyLicenses.id,
              academyId: academyLicenses.academyId,
              licenseNumber:
                academyLicenses.licenseNumber,
              issuedAt: academyLicenses.issuedAt,
              expiresAt: academyLicenses.expiresAt,
              status: academyLicenses.status,
            })
            .from(academyLicenses)
            .where(
              eq(
                academyLicenses.authorityId,
                authorityId
              )
            )
            .orderBy(
              asc(academyLicenses.expiresAt)
            ),

          db
            .select({
              id: coachLicenses.id,
              coachId: coachLicenses.coachId,
              licenseNumber:
                coachLicenses.licenseNumber,
              issuedAt: coachLicenses.issuedAt,
              expiresAt: coachLicenses.expiresAt,
              status: coachLicenses.status,
            })
            .from(coachLicenses)
            .where(
              eq(
                coachLicenses.authorityId,
                authorityId
              )
            )
            .orderBy(
              asc(coachLicenses.expiresAt)
            ),
        ]);

      res.json({
        authorityId,

        academyLicenses: academyRows.map(
          license => ({
            ...license,
            effectiveStatus: effectiveState(
              license.status,
              license.expiresAt
            ),
          })
        ),

        coachLicenses: coachRows.map(
          license => ({
            ...license,
            effectiveStatus: effectiveState(
              license.status,
              license.expiresAt
            ),
          })
        ),
      });
    })
  );

  /**
   * POST /authorities/:authorityId/academy-licenses
   *
   * Issues a license only to an approved,
   * non-demo academy.
   */
  router.post(
    "/authorities/:authorityId/academy-licenses",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const input = academyLicenseBody.parse(
        req.body
      );

      const db = await database();

      try {
        const licenseId = await db.transaction(
          async tx => {
            await requireApprovedAcademy(
              tx,
              authorityId,
              input.academyId
            );

            const inserted = await tx
              .insert(academyLicenses)
              .values({
                academyId: input.academyId,
                authorityId,
                licenseNumber: input.licenseNumber,
                issuedAt: input.issuedAt,
                expiresAt: input.expiresAt,
                status: "active",
              });

            const id = getInsertId(inserted);

            await tx.insert(auditEvents).values({
              organizationId: input.academyId,
              actorUserId: actor.user.id,
              entityType: "academy_license",
              entityId: id,
              action: "academy_license.created",
              metadata: {
                authorityId,
                licenseNumber: input.licenseNumber,
              },
            });

            return id;
          }
        );

        res.status(201).json({
          id: licenseId,
          authorityId,
          academyId: input.academyId,
          type: "academy",
          status: "active",
        });
      } catch (error) {
        if (duplicateKey(error)) {
          throw new HttpError(
            409,
            "رقم الترخيص مستخدم لدى هذه الجهة"
          );
        }

        throw error;
      }
    })
  );

  /**
   * POST /authorities/:authorityId/coach-licenses
   *
   * The coach must belong to an approved,
   * non-demo academy.
   */
  router.post(
    "/authorities/:authorityId/coach-licenses",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const input = coachLicenseBody.parse(
        req.body
      );

      const db = await database();

      try {
        const licenseId = await db.transaction(
          async tx => {
            const coachRows = await tx
              .select({
                id: coaches.id,
                academyId: coaches.academyId,
              })
              .from(coaches)
              .where(
                eq(coaches.id, input.coachId)
              )
              .limit(1)
              .for("update");

            const coach = coachRows[0];

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

            const inserted = await tx
              .insert(coachLicenses)
              .values({
                coachId: input.coachId,
                authorityId,
                licenseNumber: input.licenseNumber,
                issuedAt: input.issuedAt,
                expiresAt: input.expiresAt,
                status: "active",
              });

            const id = getInsertId(inserted);

            await tx.insert(auditEvents).values({
              organizationId: coach.academyId,
              actorUserId: actor.user.id,
              entityType: "coach_license",
              entityId: id,
              action: "coach_license.created",
              metadata: {
                authorityId,
                coachId: input.coachId,
                licenseNumber: input.licenseNumber,
              },
            });

            return id;
          }
        );

        res.status(201).json({
          id: licenseId,
          authorityId,
          coachId: input.coachId,
          type: "coach",
          status: "active",
        });
      } catch (error) {
        if (duplicateKey(error)) {
          throw new HttpError(
            409,
            "رقم الترخيص مستخدم لدى هذه الجهة"
          );
        }

        throw error;
      }
    })
  );

  /**
   * PATCH /authorities/:authorityId/licenses/:type/:licenseId
   *
   * Suspends or revokes an active license.
   */
  router.patch(
    "/authorities/:authorityId/licenses/:type/:licenseId",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const licenseId = parseId(
        req.params.licenseId
      );

      const type = req.params.type;

      if (
        type !== "academy" &&
        type !== "coach"
      ) {
        throw new HttpError(
          400,
          "نوع الترخيص غير صالح"
        );
      }

      const input = statusBody.parse(
        req.body
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const newStatus =
        input.action === "suspend"
          ? "suspended"
          : "revoked";

      const db = await database();

      const result = await db.transaction(
        async tx => {
          let academyId: number | null = null;
          let previousStatus: LicenseStatus;

          if (type === "academy") {
            const rows = await tx
              .select()
              .from(academyLicenses)
              .where(
                and(
                  eq(
                    academyLicenses.id,
                    licenseId
                  ),
                  eq(
                    academyLicenses.authorityId,
                    authorityId
                  )
                )
              )
              .limit(1)
              .for("update");

            const license = rows[0];

            if (!license) {
              throw new HttpError(
                404,
                "الترخيص غير موجود"
              );
            }

            if (license.status !== "active") {
              throw new HttpError(
                409,
                "لا يمكن تعديل ترخيص موقوف أو ملغى"
              );
            }

            previousStatus = license.status;
            academyId = license.academyId;

            await tx
              .update(academyLicenses)
              .set({
                status: newStatus,
              })
              .where(
                and(
                  eq(
                    academyLicenses.id,
                    licenseId
                  ),
                  eq(
                    academyLicenses.authorityId,
                    authorityId
                  )
                )
              );
          } else {
            const rows = await tx
              .select()
              .from(coachLicenses)
              .where(
                and(
                  eq(
                    coachLicenses.id,
                    licenseId
                  ),
                  eq(
                    coachLicenses.authorityId,
                    authorityId
                  )
                )
              )
              .limit(1)
              .for("update");

            const license = rows[0];

            if (!license) {
              throw new HttpError(
                404,
                "الترخيص غير موجود"
              );
            }

            if (license.status !== "active") {
              throw new HttpError(
                409,
                "لا يمكن تعديل ترخيص موقوف أو ملغى"
              );
            }

            previousStatus = license.status;

            const parent = await tx
              .select({
                academyId: coaches.academyId,
              })
              .from(coaches)
              .where(
                eq(coaches.id, license.coachId)
              )
              .limit(1);

            academyId = parent[0]?.academyId ?? null;

            await tx
              .update(coachLicenses)
              .set({
                status: newStatus,
              })
              .where(
                and(
                  eq(
                    coachLicenses.id,
                    licenseId
                  ),
                  eq(
                    coachLicenses.authorityId,
                    authorityId
                  )
                )
              );
          }

          await tx.insert(auditEvents).values({
            organizationId: academyId,
            actorUserId: actor.user.id,
            entityType:
              type === "academy"
                ? "academy_license"
                : "coach_license",
            entityId: licenseId,
            action: `license.${input.action}`,
            metadata: {
              authorityId,
              previousStatus,
              newStatus,
            },
          });

          return {
            id: licenseId,
            authorityId,
            type: type as LicenseType,
            status: newStatus,
          };
        }
      );

      res.json(result);
    })
  );
}
