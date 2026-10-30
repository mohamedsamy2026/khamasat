
import type {
  Router,
  Request,
  Response,
  NextFunction,
} from "express";

import {
  and,
  asc,
  eq,
  lte,
} from "drizzle-orm";

import { z } from "zod";

import {
  academyLicenses,
  authorityMemberships,
  coachLicenses,
  licenseNotifications,
} from "../../drizzle/schema";

import { HttpError } from "../../shared/_core/errors";
import { getDb } from "../db";

import { requireAuthorityMember } from "./actor";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type NotificationType =
  | "expiring_soon"
  | "expired";

type LicenseTarget = {
  type: "academy" | "coach";
  id: number;
  licenseNumber: string;
  expiresAt: Date;
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const idSchema = z.coerce.number().int().positive();

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

async function database() {
  const db = await getDb();

  if (!db) {
    throw new HttpError(
      503,
      "قاعدة البيانات غير متاحة"
    );
  }

  return db;
}

function notificationType(
  expiresAt: Date,
  now: Date
): NotificationType {
  return expiresAt.getTime() <= now.getTime()
    ? "expired"
    : "expiring_soon";
}

function notificationMessage(
  license: LicenseTarget,
  type: NotificationType
): string {
  const label =
    license.type === "academy"
      ? "الأكاديمية"
      : "المدرب";

  const date = license.expiresAt
    .toISOString()
    .slice(0, 10);

  if (type === "expired") {
    return `انتهى ترخيص ${label} رقم ${license.licenseNumber} بتاريخ ${date}`;
  }

  return `اقترب انتهاء ترخيص ${label} رقم ${license.licenseNumber} بتاريخ ${date}`;
}

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

export function registerNotificationRoutes(
  router: Router
): void {
  /**
   * POST
   * /authorities/:authorityId/notifications/scan
   *
   * Admin-only scan.
   *
   * Creates notifications for authority
   * members based on real license records.
   */
  router.post(
    "/authorities/:authorityId/notifications/scan",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const db = await database();

      const now = new Date();

      const threshold = new Date(
        now.getTime() +
          30 * 24 * 60 * 60 * 1000
      );

      // Include active licenses that have
      // expired or will expire within 30 days.

      const [
        academyRows,
        coachRows,
        memberRows,
      ] = await Promise.all([
        db
          .select({
            id: academyLicenses.id,
            licenseNumber:
              academyLicenses.licenseNumber,
            expiresAt:
              academyLicenses.expiresAt,
          })
          .from(academyLicenses)
          .where(
            and(
              eq(
                academyLicenses.authorityId,
                authorityId
              ),
              eq(
                academyLicenses.status,
                "active"
              ),
              lte(
                academyLicenses.expiresAt,
                threshold
              )
            )
          ),

        db
          .select({
            id: coachLicenses.id,
            licenseNumber:
              coachLicenses.licenseNumber,
            expiresAt:
              coachLicenses.expiresAt,
          })
          .from(coachLicenses)
          .where(
            and(
              eq(
                coachLicenses.authorityId,
                authorityId
              ),
              eq(
                coachLicenses.status,
                "active"
              ),
              lte(
                coachLicenses.expiresAt,
                threshold
              )
            )
          ),

        db
          .select({
            userId: authorityMemberships.userId,
          })
          .from(authorityMemberships)
          .where(
            eq(
              authorityMemberships.authorityId,
              authorityId
            )
          ),
      ]);

      const licenses: LicenseTarget[] = [
        ...academyRows.map(row => ({
          ...row,
          type: "academy" as const,
        })),
        ...coachRows.map(row => ({
          ...row,
          type: "coach" as const,
        })),
      ];

      let created = 0;
      let skipped = 0;

      for (const license of licenses) {
        const type = notificationType(
          license.expiresAt,
          now
        );

        const message = notificationMessage(
          license,
          type
        );

        for (const member of memberRows) {
          const existingConditions = [
            eq(
              licenseNotifications.authorityId,
              authorityId
            ),
            eq(
              licenseNotifications.recipientUserId,
              member.userId
            ),
            eq(
              licenseNotifications.notificationType,
              type
            ),
          ];

          if (license.type === "academy") {
            existingConditions.push(
              eq(
                licenseNotifications.academyLicenseId,
                license.id
              )
            );
          } else {
            existingConditions.push(
              eq(
                licenseNotifications.coachLicenseId,
                license.id
              )
            );
          }

          const existing = await db
            .select({
              id: licenseNotifications.id,
            })
            .from(licenseNotifications)
            .where(
              and(...existingConditions)
            )
            .limit(1);

          if (existing.length > 0) {
            skipped++;
            continue;
          }

          await db
            .insert(licenseNotifications)
            .values({
              authorityId,
              academyLicenseId:
                license.type === "academy"
                  ? license.id
                  : null,
              coachLicenseId:
                license.type === "coach"
                  ? license.id
                  : null,
              recipientUserId: member.userId,
              notificationType: type,
              message,
              isRead: false,
            });

          created++;
        }
      }

      res.json({
        authorityId,
        checkedLicenses: licenses.length,
        recipients: memberRows.length,
        created,
        skipped,
      });
    })
  );

  /**
   * GET
   * /authorities/:authorityId/notifications
   *
   * Each user can only read their own
   * notifications within this authority.
   */
  router.get(
    "/authorities/:authorityId/notifications",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "read"
      );

      const db = await database();

      const notifications = await db
        .select({
          id: licenseNotifications.id,
          academyLicenseId:
            licenseNotifications.academyLicenseId,
          coachLicenseId:
            licenseNotifications.coachLicenseId,
          notificationType:
            licenseNotifications.notificationType,
          message:
            licenseNotifications.message,
          isRead:
            licenseNotifications.isRead,
          createdAt:
            licenseNotifications.createdAt,
        })
        .from(licenseNotifications)
        .where(
          and(
            eq(
              licenseNotifications.authorityId,
              authorityId
            ),
            eq(
              licenseNotifications.recipientUserId,
              actor.user.id
            )
          )
        )
        .orderBy(
          asc(licenseNotifications.createdAt)
        );

      res.json({
        authorityId,
        notifications,
        unreadCount: notifications.filter(
          notification => !notification.isRead
        ).length,
      });
    })
  );

  /**
   * PATCH
   * /authorities/:authorityId/notifications/:notificationId/read
   *
   * Mark only the authenticated user's
   * own notification as read.
   */
  router.patch(
    "/authorities/:authorityId/notifications/:notificationId/read",
    handle(async (req, res) => {
      const authorityId = parseId(
        req.params.authorityId
      );

      const notificationId = parseId(
        req.params.notificationId
      );

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "read"
      );

      const db = await database();

      const conditions = and(
        eq(
          licenseNotifications.id,
          notificationId
        ),
        eq(
          licenseNotifications.authorityId,
          authorityId
        ),
        eq(
          licenseNotifications.recipientUserId,
          actor.user.id
        )
      );

      const result = await db.transaction(
        async tx => {
          const rows = await tx
            .select({
              id: licenseNotifications.id,
              isRead: licenseNotifications.isRead,
            })
            .from(licenseNotifications)
            .where(conditions)
            .limit(1)
            .for("update");

          if (!rows[0]) {
            throw new HttpError(
              404,
              "الإشعار غير موجود"
            );
          }

          if (!rows[0].isRead) {
            await tx
              .update(licenseNotifications)
              .set({
                isRead: true,
              })
              .where(conditions);
          }

          return {
            id: notificationId,
            authorityId,
            isRead: true,
          };
        }
      );

      res.json(result);
    })
  );
}
