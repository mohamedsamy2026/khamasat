import { FOOTBALL } from "./football";
import {
  GYMNASTICS,
  GYMNASTICS_APPARATUS,
  GYMNASTICS_CATEGORIES,
} from "./gymnastics";
import {
  SPORT_IDS,
  type GymnasticsCategory,
  type GymnasticsCategoryId,
  type SportDefinition,
  type SportId,
  type StrengthIndicator,
} from "./types";

export * from "./types";
export { FOOTBALL } from "./football";
export {
  GYMNASTICS,
  GYMNASTICS_APPARATUS,
  GYMNASTICS_CATEGORIES,
  GYMNASTICS_INDICATORS,
  MENS_APPARATUS_ORDER,
  WOMENS_APPARATUS_ORDER,
} from "./gymnastics";
export { FOOTBALL_INDICATORS } from "./football";

export const SPORTS: Record<SportId, SportDefinition> = {
  football: FOOTBALL,
  gymnastics: GYMNASTICS,
};

export const DEFAULT_SPORT: SportId = "football";

export function isSportId(value: unknown): value is SportId {
  return (
    typeof value === "string" &&
    (SPORT_IDS as readonly string[]).includes(value)
  );
}

export function sportDefinition(id: SportId): SportDefinition {
  return SPORTS[id];
}

/** Skills permitted for a sport. Used by server validation, not only the UI. */
export function skillsForSport(id: SportId): readonly string[] {
  return SPORTS[id].skills;
}

export function isSkillForSport(id: SportId, skill: string): boolean {
  return SPORTS[id].skills.includes(skill);
}

export function groupsForSport(id: SportId): readonly string[] {
  return SPORTS[id].groups.map(group => group.name);
}

export function isGroupForSport(id: SportId, group: string): boolean {
  return groupsForSport(id).includes(group);
}

export function isGymnasticsCategoryId(
  value: unknown
): value is GymnasticsCategoryId {
  return GYMNASTICS_CATEGORIES.some(category => category.id === value);
}

export function gymnasticsCategory(
  id: GymnasticsCategoryId
): GymnasticsCategory {
  const category = GYMNASTICS_CATEGORIES.find(item => item.id === id);
  if (!category) throw new Error(`Unknown gymnastics category ${id}`);
  return category;
}

export function gymnasticsCategoryName(id: GymnasticsCategoryId): string {
  return gymnasticsCategory(id).name;
}

/** Apparatus ids allowed for a category, in the authoritative rotation order. */
export function apparatusOrderForCategory(
  id: GymnasticsCategoryId
): readonly string[] {
  return gymnasticsCategory(id).apparatusOrder;
}

export function apparatusById(
  id: string
): (typeof GYMNASTICS_APPARATUS)[number] | undefined {
  return GYMNASTICS_APPARATUS.find(apparatus => apparatus.id === id);
}

export function apparatusName(id: string): string {
  return apparatusById(id)?.name ?? id;
}

/**
 * True only when the apparatus exists *and* belongs to the athlete's category.
 * Preventing incompatible apparatus in the wrong category is enforced on the
 * server with this same helper.
 */
export function apparatusAllowedForCategory(
  category: string | null | undefined,
  apparatus: string
): boolean {
  if (!category || !isGymnasticsCategoryId(category)) return false;
  if (!apparatusById(apparatus)) return false;
  return apparatusOrderForCategory(category).includes(apparatus);
}

export function apparatusForCategory(
  category: GymnasticsCategoryId
): Array<(typeof GYMNASTICS_APPARATUS)[number]> {
  return apparatusOrderForCategory(category).flatMap(id => {
    const apparatus = apparatusById(id);
    return apparatus ? [apparatus] : [];
  });
}

export function indicatorForSport(
  sport: SportId,
  code: string
): StrengthIndicator | undefined {
  return SPORTS[sport].indicators.find(indicator => indicator.code === code);
}

/** Indicators that may be recorded for a sport, optionally scoped to apparatus. */
export function indicatorsFor(
  sport: SportId,
  apparatus?: string | null
): readonly StrengthIndicator[] {
  const indicators = SPORTS[sport].indicators;
  if (apparatus === undefined || apparatus === null || apparatus === "")
    return indicators;
  return indicators.filter(
    indicator =>
      indicator.apparatus.length === 0 ||
      indicator.apparatus.includes(apparatus)
  );
}

export function indicatorAppliesToApparatus(
  sport: SportId,
  code: string,
  apparatus: string | null | undefined
): boolean {
  const indicator = indicatorForSport(sport, code);
  if (!indicator) return false;
  if (!apparatus) return indicator.apparatus.length === 0;
  return (
    indicator.apparatus.length === 0 || indicator.apparatus.includes(apparatus)
  );
}

/** Union of every sport's skills, for backward-compatible read paths. */
export const ALL_SKILLS: readonly string[] = [
  ...new Set(SPORT_IDS.flatMap(id => [...SPORTS[id].skills])),
];

/** Position labels across sports, used for backwards-compatible filters. */
export const ALL_GROUPS: readonly string[] = [
  ...new Set(SPORT_IDS.flatMap(id => groupsForSport(id))),
];
