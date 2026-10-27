import type { SportId } from "./sports/types";

/**
 * A standardized physical-indicator record.
 *
 * Selection comes from the sport configuration; the free-text legacy
 * `physicalTests` array stays readable for historical rows but is no longer the
 * entry point for new assessments.
 */
export type PhysicalAssessmentCriterionStatus = "provisional_unvalidated";

export type PhysicalAssessment = {
  id: number;
  playerId: number;
  sport: SportId;
  /** Gymnastics only; empty for sports without apparatus. */
  apparatus: string;
  apparatusName: string;
  /** Optional element/skill the assessment belongs to. */
  skill: string;
  indicatorCode: string;
  indicatorLabel: string;
  indicatorGroup: string;
  indicatorVersion: string;
  value: number;
  unit: string;
  note: string;
  criterionStatus: PhysicalAssessmentCriterionStatus;
  sessionKey: string;
  recordedAt: string;
  authorName: string;
  createdAt: string;
};

export type PhysicalAssessmentInput = {
  playerId: number;
  apparatus?: string;
  skill?: string;
  sessionKey?: string;
  recordedAt?: string;
  indicators: Array<{
    code: string;
    value: number;
    unit: string;
    note?: string;
  }>;
};

export const PHYSICAL_INDICATOR_VERSION = "sport-indicators-provisional-v1";

export const PROVISIONAL_CRITERION_LABEL =
  "مؤشر مسودة — بانتظار المراجعة العلمية، ولا يحمل عتبة أو تصنيفًا";

/** Stable, collision-resistant grouping key for one recorded assessment batch. */
export function assessmentSessionKey(
  random: () => number = Math.random
): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "as_";
  for (let index = 0; index < 16; index += 1) {
    key += alphabet[Math.floor(random() * alphabet.length)] ?? "0";
  }
  return key;
}
