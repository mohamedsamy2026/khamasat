
import type { Request } from "express";
import { and, eq } from "drizzle-orm";

import {
  authorityMemberships,
  regulatoryAuthorities,
  type User,
} from "../../drizzle/schema";

import {
  ForbiddenError,
  HttpError,
} from "../../shared/_core/errors";

import { authenticateLocalRequest } from "../auth/middleware";
import { getDb } from "../db";

export type AuthorityRole =
  | "admin"
  | "reviewer"
  | "viewer";

export type AuthorityPermission =
  | "read"
  | "review"
  | "manage";

export type AuthorityActor = {
  user: User;
  authority: {
    id: number;
    name: string;
    code: string;
    region: string;
  };
  role: AuthorityRole;
};

const PERMISSIONS: Record<
  AuthorityRole,
  readonly AuthorityPermission[]
> = {
  admin: ["read", "review", "manage"],
  reviewer: ["read", "review"],
  viewer: ["read"],
};

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

/**
 * Requires a valid independent local session.
 *
 * Anonymous demo tokens are never accepted as
 * regulatory authority authentication.
 */
export async function requireLocalUser(
  req: Request
): Promise<User> {
  const user = await authenticateLocalRequest(req);

  if (!user) {
    throw new HttpError(
      401,
      "يجب تسجيل الدخول للوصول إلى هذه الخدمة"
    );
  }

  return user;
}

/**
 * Checks that the user belongs to the selected
 * regulatory authority and has the required role.
 */
export async function requireAuthorityMember(
  req: Request,
  authorityId: number,
  permission: AuthorityPermission = "read"
): Promise<AuthorityActor> {
  const user = await requireLocalUser(req);

  if (
    !Number.isSafeInteger(authorityId) ||
    authorityId <= 0
  ) {
    throw new HttpError(
      400,
      "معرّف الجهة التنظيمية غير صالح"
    );
  }

  const db = await database();

  const rows = await db
    .select({
      authorityId: regulatoryAuthorities.id,
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
        eq(authorityMemberships.authorityId, authorityId)
      )
    )
    .limit(1);

  const membership = rows[0];

  if (!membership) {
    throw ForbiddenError(
      "لا تملك صلاحية الوصول إلى هذه الجهة التنظيمية"
    );
  }

  if (membership.status !== "active") {
    throw ForbiddenError(
      "الجهة التنظيمية موقوفة حاليًا"
    );
  }

  const role = membership.role as AuthorityRole;

  if (!PERMISSIONS[role]?.includes(permission)) {
    throw ForbiddenError(
      "لا تملك الصلاحية المطلوبة لتنفيذ هذه العملية"
    );
  }

  return {
    user,
    authority: {
      id: membership.authorityId,
      name: membership.name,
      code: membership.code,
      region: membership.region,
    },
    role,
  };
}
