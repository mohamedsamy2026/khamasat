
import type {
  Router,
  Request,
  Response,
  NextFunction,
} from "express";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  academyAuthorityLinks,
  auditEvents,
  memberships,
  organizations,
  regulatoryReports,
} from "../../drizzle/schema";

import { HttpError } from "../../shared/_core/errors";
import { getDb } from "../db";

import {
  requireAuthorityMember,
  requireLocalUser,
} from "./actor";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type Database = NonNullable<
  Awaited<ReturnType<typeof getDb>>
>;

type DatabaseTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

type ReportStatus =
  | "submitted"
  | "under_review"
  | "reviewed"
  | "returned";

type ReviewAction =
  | "start_review"
  | "approve"
  | "return";

// --------------------------------------------------
// VALIDATION
// --------------------------------------------------

const idSchema = z.coerce
  .number()
  .int()
  .positive();

const reportTypes = [
  "performance",
  "compliance",
  "annual",
  "other",
] as const;

const submitReportSchema = z
  .object({
    academyId: idSchema,
    authorityId: idSchema,

    title: z
      .string()
      .trim()
      .min(3)
      .max(255),

    reportType: z.enum(reportTypes),

    content: z.record(
      z.string(),
      z.unknown()
    ),
  })
  .strict();

const reviewReportSchema = z
  .object({
    action: z.enum([
      "start_review",
      "approve",
      "return",
    ]),
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
    throw new HttpError(
      400,
      "المعرّف غير صالح"
    );
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
      "Database did not return an insert ID"
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

// --------------------------------------------------
// ACADEMY AUTHORIZATION
// --------------------------------------------------

/**
 * Only the academy owner can submit reports.
 *
 * The academy must:
 * - Be a real academy, not a demo
 * - Have an approved authority link
 * - Belong to the authenticated owner
 */
async function requireAcademyOwner(
  db: Database | DatabaseTransaction,
  academyId: number,
  authorityId: number,
  userId: number
): Promise<void> {
  const rows = await db
    .select({
      academyId: organizations.id,
    })
    .from(memberships)
    .innerJoin(
      organizations,
      eq(
        organizations.id,
        memberships.organizationId
      )
    )
    .innerJoin(
      academyAuthorityLinks,
      eq(
        academyAuthorityLinks.academyId,
        organizations.id
      )
    )
    .where(
      and(
        eq(memberships.userId, userId),

        eq(
          memberships.organizationId,
          academyId
        ),

        eq(memberships.role, "owner"),

        eq(organizations.type, "academy"),

        eq(organizations.isDemo, false),

        eq(
          academyAuthorityLinks.authorityId,
          authorityId
        ),

        eq(
          academyAuthorityLinks.status,
          "approved"
        )
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new HttpError(
      403,
      "لا تملك صلاحية إرسال تقارير لهذه الأكاديمية أو أنها غير معتمدة"
    );
  }
}

// --------------------------------------------------
// REPORT STATUS TRANSITIONS
// --------------------------------------------------

function nextReportStatus(
  current: ReportStatus,
  action: ReviewAction
): ReportStatus {
  if (action === "start_review") {
    if (current !== "submitted") {
      throw new HttpError(
        409,
        "يمكن بدء مراجعة التقارير المرسلة فقط"
      );
    }

    return "under_review";
  }

  if (action === "approve") {
    if (
      current !== "submitted" &&
      current !== "under_review"
    ) {
      throw new HttpError(
        409,
        "لا يمكن اعتماد التقرير في حالته الحالية"
      );
    }

    return "reviewed";
  }

  if (action === "return") {
    if (
      current !== "submitted" &&
      current !== "under_review"
    ) {
      throw new HttpError(
        409,
        "لا يمكن إعادة التقرير في حالته الحالية"
      );
    }

    return "returned";
  }

  throw new HttpError(
    400,
    "عملية المراجعة غير صالحة"
  );
}

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

export function registerReportRoutes(
  router: Router
): void {

  // ------------------------------------------------
  // POST /academy-reports
  // ------------------------------------------------

  router.post(
    "/academy-reports",
    handle(async (req, res) => {
      const user = await requireLocalUser(req);

      const input = submitReportSchema.parse(
        req.body
      );

      const db = await database();

      // Create an independent JSON snapshot.
      // Its content cannot be modified via
      // the report review endpoints.

      const snapshot = JSON.parse(
        JSON.stringify(input.content)
      ) as Record<string, unknown>;

      const reportId = await db.transaction(
        async tx => {
          await requireAcademyOwner(
            tx,
            input.academyId,
            input.authorityId,
            user.id
          );

          const inserted = await tx
            .insert(regulatoryReports)
            .values({
              academyId: input.academyId,
              authorityId: input.authorityId,

              title: input.title,

              reportType: input.reportType,

              content: snapshot,

              status: "submitted",

              submittedByUserId: user.id,
            });

          const id = getInsertId(inserted);

          await tx
            .insert(auditEvents)
            .values({
              organizationId: input.academyId,

              actorUserId: user.id,

              entityType: "regulatory_report",

              entityId: id,

              action:
                "regulatory_report.submitted",

              metadata: {
                authorityId: input.authorityId,
                reportType: input.reportType,
              },
            });

          return id;
        }
      );

      res.status(201).json({
        id: reportId,

        academyId: input.academyId,

        authorityId: input.authorityId,

        title: input.title,

        reportType: input.reportType,

        status: "submitted",
      });
    })
  );

  // ------------------------------------------------
  // GET /authorities/:authorityId/reports
  // ------------------------------------------------

  router.get(
    "/authorities/:authorityId/reports",
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

      const reports = await db
        .select({
          id: regulatoryReports.id,

          academyId:
            regulatoryReports.academyId,

          title:
            regulatoryReports.title,

          reportType:
            regulatoryReports.reportType,

          content:
            regulatoryReports.content,

          status:
            regulatoryReports.status,

          submittedByUserId:
            regulatoryReports.submittedByUserId,

          submittedAt:
            regulatoryReports.submittedAt,

          reviewedByUserId:
            regulatoryReports.reviewedByUserId,

          reviewedAt:
            regulatoryReports.reviewedAt,
        })
        .from(regulatoryReports)
        .where(
          eq(
            regulatoryReports.authorityId,
            authorityId
          )
        )
        .orderBy(
          desc(regulatoryReports.submittedAt)
        );

      res.json({
        authorityId,
        reports,
      });
    })
  );

  // ------------------------------------------------
  // PATCH /authorities/:authorityId/reports/:reportId
  // ------------------------------------------------

  router.patch(
    "/authorities/:authorityId/reports/:reportId",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const reportId = parseId(
        req.params.reportId
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "review"
      );

      const input = reviewReportSchema.parse(
        req.body
      );

      const db = await database();

      const result = await db.transaction(
        async tx => {
          const rows = await tx
            .select({
              id: regulatoryReports.id,

              academyId:
                regulatoryReports.academyId,

              status:
                regulatoryReports.status,
            })
            .from(regulatoryReports)
            .where(
              and(
                eq(
                  regulatoryReports.id,
                  reportId
                ),

                eq(
                  regulatoryReports.authorityId,
                  authorityId
                )
              )
            )
            .limit(1)
            .for("update");

          const report = rows[0];

          if (!report) {
            throw new HttpError(
              404,
              "التقرير غير موجود"
            );
          }

          const previousStatus =
            report.status as ReportStatus;

          const newStatus = nextReportStatus(
            previousStatus,
            input.action
          );

          await tx
            .update(regulatoryReports)
            .set({
              status: newStatus,

              reviewedByUserId:
                input.action === "start_review"
                  ? null
                  : actor.user.id,

              reviewedAt:
                input.action === "start_review"
                  ? null
                  : new Date(),
            })
            .where(
              and(
                eq(
                  regulatoryReports.id,
                  reportId
                ),

                eq(
                  regulatoryReports.authorityId,
                  authorityId
                )
              )
            );

          await tx
            .insert(auditEvents)
            .values({
              organizationId:
                report.academyId,

              actorUserId:
                actor.user.id,

              entityType:
                "regulatory_report",

              entityId:
                reportId,

              action:
                `regulatory_report.${input.action}`,

              metadata: {
                authorityId,
                previousStatus,
                newStatus,
              },
            });

          return {
            id: reportId,

            authorityId,

            academyId:
              report.academyId,

            status: newStatus,
          };
        }
      );

      res.json(result);
    })
  );
}
