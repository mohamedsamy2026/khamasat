export type OrganizationContext = {
  organizationId: number;
  type: "academy" | "club";
  role: "owner" | "staff";
  userId: number | null;
  actorKind?: "member" | "demo";
  workspaceAcademyId?: number;
  workspaceClubId?: number;
};

export type AccessStatus = "pending" | "approved" | "rejected" | "revoked";
export type AccessAction = "approve" | "reject" | "revoke";

export function isAcademy(context: OrganizationContext): boolean {
  return context.type === "academy";
}

export function isClub(context: OrganizationContext): boolean {
  return context.type === "club";
}

export function canManageOrganization(context: OrganizationContext): boolean {
  return context.role === "owner";
}

export function canManagePlayer(
  context: OrganizationContext,
  academyId: number
): boolean {
  return isAcademy(context) && context.organizationId === academyId;
}

export function canReadFullPlayer(
  context: OrganizationContext,
  academyId: number,
  hasActiveGrant: boolean
): boolean {
  if (context.actorKind === "demo") {
    return (
      context.workspaceAcademyId === academyId &&
      (isAcademy(context) || isClub(context))
    );
  }
  return (
    canManagePlayer(context, academyId) || (isClub(context) && hasActiveGrant)
  );
}

export function isDemoWorkspace(context: OrganizationContext): boolean {
  return context.actorKind === "demo";
}

export function isValidRequestTransition(
  status: AccessStatus,
  action: AccessAction
): boolean {
  if (action === "approve" || action === "reject") return status === "pending";
  return action === "revoke" && status === "approved";
}

export function nextRequestStatus(action: AccessAction): AccessStatus {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return "revoked";
}
