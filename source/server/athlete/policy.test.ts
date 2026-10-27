import { describe, expect, it } from "vitest";
import {
  canManageOrganization,
  canManagePlayer,
  canReadFullPlayer,
  isValidRequestTransition,
  type OrganizationContext,
} from "./policy";

const academy: OrganizationContext = {
  organizationId: 11,
  type: "academy",
  role: "staff",
  userId: 7,
};
const owner: OrganizationContext = { ...academy, role: "owner" };
const club: OrganizationContext = {
  organizationId: 20,
  type: "club",
  role: "owner",
  userId: 8,
};

describe("athlete access policy", () => {
  it("never grants academy player management across organizations", () => {
    expect(canManagePlayer(academy, 11)).toBe(true);
    expect(canManagePlayer(academy, 12)).toBe(false);
    expect(canManagePlayer(club, 11)).toBe(false);
  });

  it("requires an active independent grant for club full-profile access", () => {
    expect(canReadFullPlayer(club, 11, false)).toBe(false);
    expect(canReadFullPlayer(club, 11, true)).toBe(true);
    expect(canReadFullPlayer(academy, 11, false)).toBe(true);
  });

  it("limits organization changes to the owner membership", () => {
    expect(canManageOrganization(academy)).toBe(false);
    expect(canManageOrganization(owner)).toBe(true);
  });

  it("only permits valid access-request state transitions", () => {
    expect(isValidRequestTransition("pending", "approve")).toBe(true);
    expect(isValidRequestTransition("pending", "reject")).toBe(true);
    expect(isValidRequestTransition("approved", "revoke")).toBe(true);
    expect(isValidRequestTransition("rejected", "approve")).toBe(false);
    expect(isValidRequestTransition("pending", "revoke")).toBe(false);
  });
});
