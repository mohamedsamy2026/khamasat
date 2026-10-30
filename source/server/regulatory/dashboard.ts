
import type {
  Router,
  Request,
  Response,
  NextFunction,
} from "express";

import {
  and,
  eq,
  inArray,
} from "drizzle-orm";

import { z } from "zod";

import {
  academyAuthorityLinks,
  academyLicenses,
  coaches,
  coachLicenses,
  licenseNotifications,
  organizations,
  regulatoryReports,
} from "../../drizzle/schema";

import { HttpError } from "../../shared/_core/errors";
import { getDb } from "../db";
import { requireAuthorityMember } from "./actor";

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const idSchema = z.coerce.number().int().positive();

function parseId(value: unknown): number {
  const parsed = idSchema.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(
      400,
      "معرّف الجهة التنظيمية غير صالح"
    );
  }

  return parsed.data;
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

type LicenseStatus =
  | "active"
  | "suspended"
  | "revoked";

type LicenseRow = {
  status: LicenseStatus;
  expiresAt: Date;
};

function calculateLicenseStats(
  licenses: LicenseRow[],
  now: Date
) {
  const stats = {
    total: licenses.length,
    active: 0,
    expiringSoon: 0,
    expired: 0,
    suspended: 0,
    revoked: 0,
  };

  const thirtyDays =
    30 * 24 * 60 * 60 * 1000;

  for (const license of licenses) {
    if (license.status === "suspended") {
      stats.suspended++;
      continue;
    }

    if (license.status === "revoked") {
      stats.revoked++;
      continue;
    }

    const remaining =
      new Date(license.expiresAt).getTime() -
      now.getTime();

    if (remaining <= 0) {
      stats.expired++;
    } else if (remaining <= thirtyDays) {
      stats.expiringSoon++;
    } else {
      stats.active++;
    }
  }

  return stats;
}

// --------------------------------------------------
// DASHBOARD ROUTE
// --------------------------------------------------

export function registerDashboardRoutes(
  router: Router
): void {
  router.get(
    "/authorities/:authorityId/dashboard",
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

      const now = new Date();

      // --------------------------------------------
      // 1. APPROVED REAL ACADEMIES
      // --------------------------------------------

      const academyRows = await db
        .select({
          id: organizations.id,
          academy: organizations,
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
              academyAuthorityLinks.status,
              "approved"
            ),
            eq(organizations.type, "academy"),
            eq(organizations.isDemo, false)
          )
        );

      const academyMap = new Map(
        academyRows.map(row => [
          row.id,
          row.academy,
        ])
      );

      const academyIds = [
        ...academyMap.keys(),
      ];

      // --------------------------------------------
      // 2. COACHES
      // --------------------------------------------

      const coachRows =
        academyIds.length > 0
          ? await db
              .select({
                id: coaches.id,
                academyId: coaches.academyId,
                status: coaches.status,
              })
              .from(coaches)
              .where(
                inArray(
                  coaches.academyId,
                  academyIds
                )
              )
          : [];

      const coachIds = coachRows.map(
        coach => coach.id
      );

      const coachesStats = {
        total: coachRows.length,
        active: coachRows.filter(
          coach => coach.status === "active"
        ).length,
        inactive: coachRows.filter(
          coach => coach.status === "inactive"
        ).length,
      };

      // --------------------------------------------
      // 3. LICENSES
      // --------------------------------------------

      const academyLicenseRows =
        academyIds.length > 0
          ? await db
              .select({
                status: academyLicenses.status,
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
                  inArray(
                    academyLicenses.academyId,
                    academyIds
                  )
                )
              )
          : [];

      const coachLicenseRows =
        coachIds.length > 0
          ? await db
              .select({
                status: coachLicenses.status,
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
                  inArray(
                    coachLicenses.coachId,
                    coachIds
                  )
                )
              )
          : [];

      const academyLicenseStats =
        calculateLicenseStats(
          academyLicenseRows,
          now
        );

      const coachLicenseStats =
        calculateLicenseStats(
          coachLicenseRows,
          now
        );

      const totalLicenseStats =
        calculateLicenseStats(
          [
            ...academyLicenseRows,
            ...coachLicenseRows,
          ],
          now
        );

      // --------------------------------------------
      // 4. REPORTS
      // --------------------------------------------

      const reportRows =
        academyIds.length > 0
          ? await db
              .select({
                status: regulatoryReports.status,
              })
              .from(regulatoryReports)
              .where(
                and(
                  eq(
                    regulatoryReports.authorityId,
                    authorityId
                  ),
                  inArray(
                    regulatoryReports.academyId,
                    academyIds
                  )
                )
              )
          : [];

      const reportsStats = {
        total: reportRows.length,
        submitted: 0,
        underReview: 0,
        reviewed: 0,
        returned: 0,
      };

      for (const report of reportRows) {
        switch (report.status) {
          case "submitted":
            reportsStats.submitted++;
            break;
          case "under_review":
            reportsStats.underReview++;
            break;
          case "reviewed":
            reportsStats.reviewed++;
            break;
          case "returned":
            reportsStats.returned++;
            break;
        }
      }

      // --------------------------------------------
      // 5. NOTIFICATIONS
      // --------------------------------------------

      const notificationRows = await db
        .select({
          id: licenseNotifications.id,
          isRead: licenseNotifications.isRead,
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
        );

      const notificationsStats = {
        total: notificationRows.length,
        unread: notificationRows.filter(
          notification => !notification.isRead
        ).length,
      };

      // --------------------------------------------
      // 6. REGION DISTRIBUTION
      // --------------------------------------------

      const regionCounts =
        new Map<string, number>();

      for (const academy of academyMap.values()) {
        // Read only fields actually present
        // on the organization record.
        const record = academy as Record<
          string,
          unknown
        >;

        const regionValue =
          record.region ??
          record.city;

        const region =
          typeof regionValue === "string" &&
          regionValue.trim().length > 0
            ? regionValue.trim()
            : "غير محدد";

        regionCounts.set(
          region,
          (regionCounts.get(region) ?? 0) + 1
        );
      }

      const byRegion = [
        ...regionCounts.entries(),
      ]
        .map(([region, count]) => ({
          region,
          count,
        }))
        .sort(
          (a, b) =>
            b.count - a.count ||
            a.region.localeCompare(b.region)
        );

      // --------------------------------------------
      // 7. RESPONSE
      // --------------------------------------------

      res.json({
        authority: {
          id: actor.authority.id,
          name: actor.authority.name,
          region: actor.authority.region,
        },

        generatedAt: now.toISOString(),

        academies: {
          official: academyIds.length,
          byRegion,
        },

        coaches: coachesStats,

        licenses: {
          total: totalLicenseStats,
          academies: academyLicenseStats,
          coaches: coachLicenseStats,
        },

        reports: reportsStats,

        notifications: notificationsStats,
      });
    })
  );
}
