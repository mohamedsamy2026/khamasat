import { FOOTBALL_SKILLS_BY_POSITION } from "./sports/football";
import { isSportId, skillsForSport } from "./sports";
import { catalogForPlayer } from "./demo-display";

/** Displayed whenever a skill has not received a coach score or a measurement. */
export const UNASSESSED_RATING_LABEL = "لم تُقيّم بعد";

export type CoachAssessmentSkill = {
  name: string;
  /** A submitted coach assessment (0–100), or null when deliberately unassessed. */
  score: number | null;
};

/**
 * An immutable, attributable coach assessment. `overall` is derived server-side
 * from the non-null entries in `skills`; it is never accepted from clients.
 */
export type CoachAssessment = {
  id: number;
  playerId: number;
  coachName: string;
  coachPhotoKey: string;
  assessedAt: string;
  protocol: string;
  notes: string;
  skills: CoachAssessmentSkill[];
  overall: number | null;
  /** Server-derived before report filtering; comparisons require the same measured set. */
  measuredSignature?: string;
  strengths: string[];
  development: string[];
  exercises: { title: string; description: string }[];
  isDemo: boolean;
};

export type CoachAssessmentInput = Omit<
  CoachAssessment,
  "id" | "playerId" | "coachName" | "coachPhotoKey" | "overall" | "isDemo" | "measuredSignature"
>;

export type CoachAssessmentSummary = {
  count: number;
  latestAssessedAt: string | null;
  coachName: string | null;
  protocol: string | null;
  /** Number of actually scored skill entries in the latest assessment. */
  assessedSkills: number;
  /** Server-derived mean from the latest assessment, or null when none were scored. */
  overall: number | null;
};

/**
 * The authoritative skill list for a player profile. Football applies the
 * position-aware subset; other registered sports retain their sport catalog.
 * Unknown sport/position pairs return no skills so callers fail closed.
 */
export function skillsForPlayer(
  sport: string,
  position: string,
  primaryApparatus?: string | null
): readonly string[] {
  if (!isSportId(sport)) return [];
  if (sport === "gymnastics") {
    // A declared primary apparatus is authoritative for new assessment and
    // media writes. Profiles without it retain the complete sport catalog for
    // backward-compatible existing records.
    if (primaryApparatus) {
      const apparatusSkills = catalogForPlayer(
        sport,
        position,
        primaryApparatus
      ).map(skill => skill.name);
      return apparatusSkills;
    }
    return skillsForSport(sport);
  }
  return Object.prototype.hasOwnProperty.call(
    FOOTBALL_SKILLS_BY_POSITION,
    position
  )
    ? FOOTBALL_SKILLS_BY_POSITION[
        position as keyof typeof FOOTBALL_SKILLS_BY_POSITION
      ]
    : [];
}

/**
 * Summarizes only the latest recorded coach assessment. It deliberately does
 * not infer a rating from historical assessments or from unassessed skills.
 */
export function coachAssessmentSummary(
  assessments: readonly CoachAssessment[]
): CoachAssessmentSummary {
  const latest = assessments.reduce<CoachAssessment | undefined>(
    (current, item) => {
      if (!current) return item;
      if (item.assessedAt > current.assessedAt) return item;
      if (item.assessedAt < current.assessedAt) return current;
      return item.id > current.id ? item : current;
    },
    undefined
  );
  if (!latest)
    return {
      count: 0,
      latestAssessedAt: null,
      coachName: null,
      protocol: null,
      assessedSkills: 0,
      overall: null,
    };
  const scores = latest.skills.flatMap(skill =>
    typeof skill.score === "number" && Number.isFinite(skill.score)
      ? [skill.score]
      : []
  );
  return {
    count: assessments.length,
    latestAssessedAt: latest.assessedAt,
    coachName: latest.coachName,
    protocol: latest.protocol,
    assessedSkills: scores.length,
    overall: scores.length
      ? Number(
          (
            scores.reduce((sum, score) => sum + score, 0) / scores.length
          ).toFixed(2)
        )
      : null,
  };
}
