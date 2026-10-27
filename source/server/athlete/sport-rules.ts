import { BadRequestError } from "../../shared/_core/errors";
import {
  apparatusAllowedForCategory,
  apparatusById,
  groupsForSport,
  gymnasticsCategory,
  isGymnasticsCategoryId,
  isSkillForSport,
  type GymnasticsCategoryId,
  type SportId,
} from "../../shared/sports";

/**
 * Pure sport/group rules shared by the player routes. Kept separate from the
 * HTTP handlers so the same rules can be unit tested directly.
 */

export type PlayerSportFields = {
  sport: SportId;
  gymnasticsCategory?: string | "";
  position: string;
};

export type NormalizedSportFields = {
  sport: SportId;
  gymnasticsCategory: "" | GymnasticsCategoryId;
  position: string;
};

/**
 * Derives the stored group from the sport: gymnastics stores the category name
 * as the athlete's group, other sports store the selected position. This makes
 * an inconsistent (sport, group, category) triple impossible to persist.
 */
export function normalizePlayerSport(
  input: PlayerSportFields
): NormalizedSportFields {
  if (input.sport === "gymnastics") {
    if (
      !input.gymnasticsCategory ||
      !isGymnasticsCategoryId(input.gymnasticsCategory)
    )
      throw BadRequestError("اختر فئة الجمباز (سيدات أو رجال) لهذا اللاعب");
    return {
      sport: "gymnastics",
      gymnasticsCategory: input.gymnasticsCategory,
      position: gymnasticsCategory(input.gymnasticsCategory).name,
    };
  }
  if (input.gymnasticsCategory)
    throw BadRequestError("فئة الجمباز لا تُستخدم مع رياضة أخرى");
  if (!groupsForSport(input.sport).includes(input.position))
    throw BadRequestError("المركز المحدد لا يتبع الرياضة المختارة");
  return {
    sport: input.sport,
    gymnasticsCategory: "",
    position: input.position,
  };
}

export function organizationSupportsSport(
  sports: readonly string[],
  sport: SportId
): boolean {
  return sports.includes(sport);
}

/**
 * Changing the sport of an athlete who already has recorded sessions or
 * standardized assessments would silently reinterpret stored data, so it is
 * rejected instead of rewritten.
 */
export function assertSportChangeAllowed(
  currentSport: SportId,
  nextSport: SportId,
  recordedRecords: number
): void {
  if (currentSport === nextSport) return;
  if (recordedRecords > 0)
    throw BadRequestError(
      "لا يمكن تغيير رياضة لاعب لديه جلسات أو تقييمات محفوظة؛ أنشئ ملفًا جديدًا للرياضة الأخرى"
    );
}

export function assertSkillBelongsToSport(sport: SportId, skill: string): void {
  if (!isSkillForSport(sport, skill))
    throw BadRequestError("المهارة المحددة لا تتبع رياضة اللاعب");
}

/**
 * Gymnastics apparatus must exist and belong to the athlete's category order.
 * An empty apparatus is only valid for sports without apparatus.
 */
export function assertApparatusForSport(
  sport: SportId,
  category: string | "",
  apparatus: string
): void {
  if (sport !== "gymnastics") {
    if (apparatus) throw BadRequestError("هذه الرياضة لا تستخدم أجهزة الجمباز");
    return;
  }
  if (!category) throw BadRequestError("ملف اللاعب لا يحدد فئة الجمباز");
  if (!apparatus) throw BadRequestError("اختر جهاز الجمباز لهذا التقييم");
  if (!apparatusById(apparatus))
    throw BadRequestError("جهاز الجمباز المحدد غير معروف");
  if (!apparatusAllowedForCategory(category, apparatus))
    throw BadRequestError(
      "هذا الجهاز غير متاح لفئة اللاعب؛ راجع ترتيب أجهزة الفئة"
    );
}
