import type { SensitiveScope } from "../../shared/health";
import { isAcademy, type OrganizationContext } from "./policy";

/**
 * Sensitive-data policy.
 *
 * Invariants enforced here and re-checked in the routes:
 *  1. Only an owner of the athlete's *owning* academy may write health or
 *     emergency-contact data, or manage the grants for it.
 *  2. Reading requires an active, scope-specific grant row. An organization
 *     that can see the ordinary player profile has no implicit access.
 *  3. `health` and `emergency` are independent: one grant never implies the
 *     other, and a grant for a club is only created by an explicit owner action.
 *  4. A club's ordinary profile grant (approved access request) never creates a
 *     sensitive grant, and revoking the profile grant revokes the sensitive
 *     ones for that club as well.
 */
export function canWriteSensitiveData(
  context: OrganizationContext,
  academyId: number
): boolean {
  return (
    isAcademy(context) &&
    context.organizationId === academyId &&
    context.role === "owner"
  );
}

export function canManageSensitiveGrants(
  context: OrganizationContext,
  academyId: number
): boolean {
  return canWriteSensitiveData(context, academyId);
}

export function hasActiveGrant(
  grants: ReadonlyArray<{ scope: SensitiveScope; active: boolean }>,
  scope: SensitiveScope
): boolean {
  return grants.some(grant => grant.scope === scope && grant.active);
}

export function canReadSensitiveData(
  grants: ReadonlyArray<{ scope: SensitiveScope; active: boolean }>,
  scope: SensitiveScope
): boolean {
  return hasActiveGrant(grants, scope);
}

/**
 * A grant may only target the owning academy itself or a club that already
 * holds an active profile grant. This blocks granting a stranger organization
 * access to sensitive data.
 */
export function isGrantableOrganization(input: {
  granteeOrganizationId: number;
  granteeType: "academy" | "club";
  academyId: number;
  hasActiveProfileGrant: boolean;
}): boolean {
  if (
    input.granteeOrganizationId === input.academyId &&
    input.granteeType === "academy"
  )
    return true;
  return input.granteeType === "club" && input.hasActiveProfileGrant;
}

/** Empty scope record: deny by default for every scope. */
export function emptyScopeState(): Record<SensitiveScope, boolean> {
  return { health: false, emergency: false };
}
