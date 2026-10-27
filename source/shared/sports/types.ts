/**
 * Sport configuration contract.
 *
 * Every sport owns its terminology, its athlete groupings (positions for ball
 * sports, categories for artistic sports), its skill list and its provisional
 * physical-indicator catalog. Shared components consume these definitions and
 * must not hard-code one sport's vocabulary.
 *
 * Scientific status: every indicator below is declared `provisional` and is
 * pending an external scientific review. Nothing in this file defines a
 * performance threshold, a score or a normative standard. See
 * docs/sports-scientific-validation.md.
 */

export const SPORT_IDS = ["football", "gymnastics"] as const;
export type SportId = (typeof SPORT_IDS)[number];

export type SportTerminology = {
  athlete: string;
  athletes: string;
  group: string;
  groups: string;
  position: string;
  positions: string;
  analysisContext: string;
};

export type MeasurementType =
  | "repetitions"
  | "duration"
  | "angle"
  | "load"
  | "distance"
  | "speed"
  | "level";

export type StrengthIndicator = {
  /** Stable identifier. Never rename an existing code; add a new code instead. */
  code: string;
  label: string;
  definition: string;
  group: string;
  measurementType: MeasurementType;
  /** Units the recorder may select for this indicator. */
  units: readonly string[];
  /** Apparatus ids this indicator applies to. Empty means all of the sport. */
  apparatus: readonly string[];
  /** Indicators stay provisional until the external scientific review closes. */
  validationStatus: "provisional_unvalidated";
  sourceRefs: readonly string[];
};

export type ApparatusDefinition = {
  id: string;
  name: string;
  englishName: string;
  description: string;
};

export type GymnasticsCategoryId = "womens_artistic" | "mens_artistic";

export type GymnasticsCategory = {
  id: GymnasticsCategoryId;
  name: string;
  /** The authoritative apparatus order for this category. */
  apparatusOrder: readonly string[];
};

export type SportGroup = {
  /** Stored value; must be unique inside the sport. */
  id: string;
  name: string;
};

export type SportDefinition = {
  id: SportId;
  name: string;
  terminology: SportTerminology;
  /** Selectable groups (positions). Non-empty for every sport. */
  groups: readonly SportGroup[];
  /** Skills/events a video or session may be attributed to. */
  skills: readonly string[];
  indicators: readonly StrengthIndicator[];
  /** Present for artistic sports; empty for others. */
  apparatus: readonly ApparatusDefinition[];
  categories: readonly GymnasticsCategory[];
  notes: readonly string[];
};
