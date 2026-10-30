import type { Router, Request, Response, NextFunction } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  academyAuthorityLinks,
  auditEvents,
  memberships,
  organizations,
  regulatoryAuthorities,
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

const positiveId = z.coerce.number().int().positive();

const linkInputSchema = z.object({
  academyId: positiveId,
  authorityId: positiveId,
}).strict();

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "revoke"]),
}).strict();

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

function parseId(value: unknown): number {
  const parsed = positiveId.safeParse(value);

  if (!parsed.success) {
    throw new HttpError(400, "المعرّف غير صالح");
  }

  return parsed.data;
}

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };
}

/** Convert MySQL duplicate-key races into a controlled response. */
function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: unknown;
    cause?: { code?: unknown };
  };
  return value.code === "ER_DUP_ENTRY" || value.cause?.code === "ER_DUP_ENTRY";
}

/**
 * An academy must have an actual owner membership.
 * Demo ownership alone never grants real permissions.
 */
async function requireAcademyOwner(
  userId: number,
  academyId: number
) {
  const db = await database();

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
      region: organizations.region,
      isDemo: organizations.isDemo,
      role: memberships.role,
    })
    .from(organizations)
    .innerJoin(
      memberships,
      eq(memberships.organizationId, organizations.id)
    )
    .where(
      and(
        eq(organizations.id, academyId),
        eq(memberships.userId, userId),
        eq(memberships.role, "owner")
      )
    )
    .limit(1);

  const academy = rows[0];

  if (!academy || academy.type !== "academy") {
    throw ForbiddenError(
      "لا تملك صلاحية ربط هذه الأكاديمية"
    );
  }

  if (
    academy.isDemo &&
    process.env.NODE_ENV === "production"
  ) {
    throw ForbiddenError(
      "لا يمكن ربط أكاديمية تجريبية بجهة تنظيمية في الإنتاج"
    );
  }

  return academy;
}

export function registerAcademyRoutes(router: Router) {
  /**
   * List academy links within one regulatory authority.
   * Includes pending/rejected links for administration,
   * but does not return player or health records.
   */
  router.get(
    "/authorities/:authorityId/academies",
    handle(async (req, res) => {
      const authorityId = parseId(req.params.authorityId);

      await requireAuthorityMember(
        req,
        authorityId,
        "read"
      );

      const db = await database();

      const rows = await db
        .select({
          linkId: academyAuthorityLinks.id,
          academyId: organizations.id,
          academyName: organizations.name,
          region: organizations.region,
          isDemo: organizations.isDemo,
          status: academyAuthorityLinks.status,
          approvedAt: academyAuthorityLinks.approvedAt,
          createdAt: academyAuthorityLinks.createdAt,
        })
        .from(academyAuthorityLinks)
        .innerJoin(
          organizations,
          eq(academyAuthorityLinks.academyId, organizations.id)
        )
        .where(
          and(
            eq(academyAuthorityLinks.authorityId, authorityId),
            eq(organizations.type, "academy")
          )
        )
        .orderBy(asc(organizations.name));

      res.json({
        authorityId,
        academies: rows,
        officialAcademies: rows.filter(
          row =>
            row.status === "approved" &&
            !row.isDemo
        ).length,
      });
    })
  );

  /**
   * Only the academy owner can request a link.
   * Requests never grant data access automatically.
   */
  router.post(
    "/academy-links",
    handle(async (req, res) => {
      const user = await requireLocalUser(req);
      const input = linkInputSchema.parse(req.body);

      await requireAcademyOwner(
        user.id,
        input.academyId
      );

      const db = await database();

      const authorityRows = await db
        .select({
          id: regulatoryAuthorities.id,
          status: regulatoryAuthorities.status,
        })
        .from(regulatoryAuthorities)
        .where(
          eq(regulatoryAuthorities.id, input.authorityId)
        )
        .limit(1);

      if (
        !authorityRows[0] ||
        authorityRows[0].status !== "active"
      ) {
        throw new HttpError(
          404,
          "الجهة التنظيمية غير متاحة"
        );
      }

      let result: { linkId: number };
      try {
        result = await db.transaction(async tx => {
        const rows = await tx
          .select()
          .from(academyAuthorityLinks)
          .where(
            and(
              eq(
                academyAuthorityLinks.academyId,
                input.academyId
              ),
              eq(
                academyAuthorityLinks.authorityId,
                input.authorityId
              )
            )
          )
          .limit(1)
          .for("update");

        const existing = rows[0];

        if (
          existing &&
          ["pending", "approved"].includes(existing.status)
        ) {
          throw new HttpError(
            409,
            "يوجد طلب ربط نشط بالفعل"
          );
        }

        let linkId: number;

        if (existing) {
          linkId = existing.id;

          await tx
            .update(academyAuthorityLinks)
            .set({
              status: "pending",
              approvedByUserId: null,
              approvedAt: null,
            })
            .where(eq(academyAuthorityLinks.id, linkId));
        } else {
          const inserted = await tx
            .insert(academyAuthorityLinks)
            .values({
              academyId: input.academyId,
              authorityId: input.authorityId,
              status: "pending",
            });

          const first = Array.isArray(inserted)
            ? inserted[0]
            : inserted;

          linkId = Number(
            (first as { insertId?: unknown }).insertId
          );

          if (!Number.isSafeInteger(linkId) || linkId <= 0) {
            throw new Error("Failed to create academy link");
          }
        }

        await tx.insert(auditEvents).values({
          organizationId: input.academyId,
          actorUserId: user.id,
          entityType: "academy_authority_link",
          entityId: linkId,
          action: "academy_authority_link.requested",
          metadata: {
            academyId: input.academyId,
            authorityId: input.authorityId,
          },
        });

        return { linkId };
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new HttpError(409, "يوجد طلب ربط لهذه الأكاديمية والجهة بالفعل");
        }
        throw error;
      }

      res.status(201).json({
        linkId: result.linkId,
        academyId: input.academyId,
        authorityId: input.authorityId,
        status: "pending",
      });
    })
  );

  /**
   * Only a regulatory admin may approve,
   * reject or revoke a link.
   */
  router.patch(
    "/authorities/:authorityId/academy-links/:linkId",
    handle(async (req, res) => {
      const authorityId = parseId(req.params.authorityId);
      const linkId = parseId(req.params.linkId);
      const input = actionSchema.parse(req.body);

      const actor = await requireAuthorityMember(
        req,
        authorityId,
        "manage"
      );

      const db = await database();

      const result = await db.transaction(async tx => {
        const rows = await tx
          .select()
          .from(academyAuthorityLinks)
          .where(
            and(
              eq(academyAuthorityLinks.id, linkId),
              eq(
                academyAuthorityLinks.authorityId,
                authorityId
              )
            )
          )
          .limit(1)
          .for("update");

        const link = rows[0];

        if (!link) {
          throw new HttpError(
            404,
            "طلب الربط غير موجود"
          );
        }

        const allowed =
          (input.action === "approve" &&
            link.status === "pending") ||
          (input.action === "reject" &&
            link.status === "pending") ||
          (input.action === "revoke" &&
            link.status === "approved");

        if (!allowed) {
          throw new HttpError(
            409,
            "لا يمكن تنفيذ الإجراء على حالة الربط الحالية"
          );
        }

        const academyRows = await tx
          .select({
            id: organizations.id,
            type: organizations.type,
            isDemo: organizations.isDemo,
          })
          .from(organizations)
          .where(eq(organizations.id, link.academyId))
          .limit(1);

        const academy = academyRows[0];

        if (!academy || academy.type !== "academy") {
          throw ForbiddenError(
            "المؤسسة المرتبطة ليست أكاديمية صالحة"
          );
        }

        if (
          input.action === "approve" &&
          academy.isDemo &&
          process.env.NODE_ENV === "production"
        ) {
          throw ForbiddenError(
            "لا يمكن اعتماد أكاديمية تجريبية في الإنتاج"
          );
        }

        const newStatus =
          input.action === "approve"
            ? "approved"
            : input.action === "reject"
              ? "rejected"
              : "revoked";

        await tx
          .update(academyAuthorityLinks)
          .set({
            status: newStatus,
            approvedByUserId:
              input.action === "approve"
                ? actor.user.id
                : null,
            approvedAt:
              input.action === "approve"
                ? new Date()
                : null,
          })
          .where(eq(academyAuthorityLinks.id, linkId));

        await tx.insert(auditEvents).values({
          organizationId: link.academyId,
          actorUserId: actor.user.id,
          entityType: "academy_authority_link",
          entityId: linkId,
          action: `academy_authority_link.${input.action}`,
          metadata: {
            academyId: link.academyId,
            authorityId,
            previousStatus: link.status,
            newStatus,
          },
        });

        return {
          linkId,
          academyId: link.academyId,
          authorityId,
          status: newStatus,
        };
      });

      res.json(result);
    })
  );
}
