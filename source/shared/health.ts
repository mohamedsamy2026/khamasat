/**
 * Athlete health profile and emergency contact.
 *
 * These two data sets are treated as sensitive and are protected by two
 * *independent* explicit permissions (`health` and `emergency`). Holding an
 * ordinary player-profile permission never implies either of them.
 */

export const SENSITIVE_SCOPES = ["health", "emergency"] as const;
export type SensitiveScope = (typeof SENSITIVE_SCOPES)[number];

export const SENSITIVE_SCOPE_LABELS: Record<SensitiveScope, string> = {
  health: "الملف الصحي",
  emergency: "جهة الاتصال في الطوارئ",
};

export const HEALTH_FIELD_LIMITS = {
  previousInjuries: 2000,
  chronicDiseases: 2000,
  currentMedications: 2000,
  physiotherapy: 2000,
  availableExams: 2000,
  otherNotes: 2000,
} as const;

export const EMERGENCY_CONTACT_LIMITS = {
  contactName: 140,
  relationship: 80,
  phone: 32,
  alternatePhone: 32,
  notes: 500,
} as const;

export type HealthProfile = {
  playerId: number;
  previousInjuries: string;
  chronicDiseases: string;
  currentMedications: string;
  physiotherapy: string;
  availableExams: string;
  otherNotes: string;
  updatedByName: string;
  updatedAt: string;
  createdAt: string;
};

export type EmergencyContact = {
  playerId: number;
  contactName: string;
  relationship: string;
  phone: string;
  alternatePhone: string;
  notes: string;
  updatedByName: string;
  updatedAt: string;
  createdAt: string;
};

export type SensitiveGrant = {
  id: number;
  playerId: number;
  organizationId: number;
  organizationName: string;
  organizationType: "academy" | "club";
  scope: SensitiveScope;
  active: boolean;
  grantedAt: string;
  revokedAt: string | null;
};

export type SensitiveAccessState = {
  playerId: number;
  /** Whether the *requesting* organization currently holds each scope. */
  scopes: Record<SensitiveScope, boolean>;
  canManageGrants: boolean;
  canWrite: boolean;
  /** Only returned to an organization allowed to manage grants. */
  grants?: SensitiveGrant[];
  /** Organizations that are eligible to receive an explicit grant. */
  candidates?: Array<{
    organizationId: number;
    name: string;
    type: "academy" | "club";
    reason: string;
  }>;
};

export type HealthProfileResponse = {
  profile: HealthProfile | null;
  access: SensitiveAccessState;
};

export type EmergencyContactResponse = {
  contact: EmergencyContact | null;
  access: SensitiveAccessState;
};

export function hasSensitiveScope(
  scopes: Partial<Record<SensitiveScope, boolean>> | undefined,
  scope: SensitiveScope
): boolean {
  return scopes?.[scope] === true;
}

/** Health and emergency permissions are never interchangeable. */
export function isSensitiveScope(value: unknown): value is SensitiveScope {
  return (
    typeof value === "string" &&
    (SENSITIVE_SCOPES as readonly string[]).includes(value)
  );
}
