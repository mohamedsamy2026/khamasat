import type { SportDefinition, StrengthIndicator } from "./types";

/** Canonical display vocabulary for new football screens. */
export const CANONICAL_OUTFIELD_SKILLS = [
  "التسديد",
  "التمرير",
  "المراوغة",
  "التحكم بالكرة",
  "الاستلام واللمسة الأولى",
  "التحرك دون كرة",
  "الجري بالكرة",
  "الالتحام واستخلاص الكرة",
  "ضربات الرأس",
] as const;

export const CANONICAL_GOALKEEPER_SKILLS = [
  "التصدي للتسديدات",
  "رد الفعل",
  "التمركز",
  "مسك الكرة",
  "التعامل مع الكرات العالية",
  "التوزيع باليد والقدم",
  "الخروج لمواجهة المهاجم",
] as const;

/**
 * Public sport configuration intentionally contains only canonical labels. The
 * legacy labels below remain accepted by server validators so old assessments,
 * videos, and reports stay readable without rewriting historic records.
 */
export const FOOTBALL_SKILLS = [
  ...CANONICAL_OUTFIELD_SKILLS,
  ...CANONICAL_GOALKEEPER_SKILLS,
] as const;

const LEGACY_OUTFIELD_SKILLS = [
  "السرعة",
  "القوة البدنية",
  "القفز",
  "اتخاذ القرار",
] as const;
const LEGACY_GOALKEEPER_SKILLS = [
  "التصدي",
  "توزيع الكرة",
  "القفز",
  "اتخاذ القرار",
] as const;

/** Accepted only for historic compatibility; never returned by the UI catalog. */
export const FOOTBALL_HISTORIC_SKILLS = [
  ...LEGACY_OUTFIELD_SKILLS,
  ...LEGACY_GOALKEEPER_SKILLS,
] as const;

export const FOOTBALL_POSITIONS = [
  "مهاجم",
  "وسط",
  "مدافع",
  "جناح",
  "جناح أيمن",
  "جناح أيسر",
  "حارس مرمى",
] as const;

const outfieldWithHistoric = [
  ...CANONICAL_OUTFIELD_SKILLS,
  ...LEGACY_OUTFIELD_SKILLS,
] as const;
const goalkeeperWithHistoric = [
  ...CANONICAL_GOALKEEPER_SKILLS,
  ...LEGACY_GOALKEEPER_SKILLS,
] as const;

/**
 * The server's accepted football vocabulary is scoped to the player position.
 * Canonical names power all new display flows; historic names remain legal only
 * for the compatible position so cross-position validation stays strict.
 */
export const FOOTBALL_SKILLS_BY_POSITION: Record<string, readonly string[]> = {
  مهاجم: outfieldWithHistoric,
  وسط: outfieldWithHistoric,
  مدافع: outfieldWithHistoric,
  جناح: outfieldWithHistoric,
  "جناح أيمن": outfieldWithHistoric,
  "جناح أيسر": outfieldWithHistoric,
  "حارس مرمى": goalkeeperWithHistoric,
};

export function isAcceptedFootballSkill(skill: string): boolean {
  return (
    (FOOTBALL_SKILLS as readonly string[]).includes(skill) ||
    (FOOTBALL_HISTORIC_SKILLS as readonly string[]).includes(skill)
  );
}

/** Canonical display-only selection for a football player. */
export function canonicalFootballSkillsForPosition(
  position: string
): readonly string[] {
  return position === "حارس مرمى"
    ? CANONICAL_GOALKEEPER_SKILLS
    : CANONICAL_OUTFIELD_SKILLS;
}

const FOOTBALL_INDICATOR_SOURCE =
  "docs/sports-scientific-validation.md#provisional-indicators";

function indicator(
  code: string,
  label: string,
  definition: string,
  group: string,
  measurementType: StrengthIndicator["measurementType"],
  units: readonly string[]
): StrengthIndicator {
  return {
    code,
    label,
    definition,
    group,
    measurementType,
    units,
    apparatus: [],
    validationStatus: "provisional_unvalidated",
    sourceRefs: [FOOTBALL_INDICATOR_SOURCE],
  };
}

/**
 * Twenty provisional selectable physical indicators. They describe *what* the
 * coach recorded; they intentionally carry no threshold, no rating and no
 * composite score.
 */
export const FOOTBALL_INDICATORS: readonly StrengthIndicator[] = [
  indicator(
    "football.lower.limb_press",
    "قوة دفع الرجلين",
    "أقصى حمل يُدفع بالرجلين في تمرين الدفع، كما يسجله المدرب.",
    "قوة الجزء السفلي",
    "load",
    ["كغ"]
  ),
  indicator(
    "football.lower.squat",
    "قوة القرفصاء",
    "أقصى حمل مسجل في تمرين القرفصاء خلال الاختبار.",
    "قوة الجزء السفلي",
    "load",
    ["كغ"]
  ),
  indicator(
    "football.lower.hamstring",
    "قوة أوتار الركبة",
    "أقصى حمل مسجل في تمرين ثني الركبة أو ما يعادله.",
    "قوة الجزء السفلي",
    "load",
    ["كغ"]
  ),
  indicator(
    "football.lower.calf_raise",
    "قوة عضلات السمانة",
    "عدد التكرارات أو الحمل المسجل في رفع السمانة.",
    "قوة الجزء السفلي",
    "repetitions",
    ["تكرار", "كغ"]
  ),
  indicator(
    "football.upper.press",
    "قوة الدفع بالأذرع",
    "عدد التكرارات أو الحمل المسجل في تمرين الدفع بالأذرع.",
    "قوة الجزء العلوي",
    "repetitions",
    ["تكرار"]
  ),
  indicator(
    "football.upper.pull",
    "قوة السحب",
    "عدد التكرارات المسجلة في تمرين السحب (العقلة أو ما يعادلها).",
    "قوة الجزء العلوي",
    "repetitions",
    ["تكرار"]
  ),
  indicator(
    "football.upper.grip",
    "قوة القبضة",
    "أقصى قراءة مسجلة لمقياس قبضة اليد.",
    "قوة الجزء العلوي",
    "load",
    ["كغ"]
  ),
  indicator(
    "football.core.anti_extension",
    "ثبات الجذع ضد البسط",
    "زمن الثبات المسجل في وضعية مقاومة بسط الجذع.",
    "ثبات وقوة الجذع",
    "duration",
    ["ثانية"]
  ),
  indicator(
    "football.core.rotation",
    "قوة الدوران الجذعي",
    "عدد التكرارات المسجلة في تمرين دوران الجذع بمقاومة.",
    "ثبات وقوة الجذع",
    "repetitions",
    ["تكرار"]
  ),
  indicator(
    "football.power.vertical_jump",
    "القفز العمودي",
    "أقصى ارتفاع مسجل في القفز العمودي.",
    "القدرة الانفجارية",
    "distance",
    ["سم"]
  ),
  indicator(
    "football.power.horizontal_jump",
    "القفز الأفقي",
    "أقصى مسافة مسجلة في القفز الأفقي من الثبات.",
    "القدرة الانفجارية",
    "distance",
    ["سم", "م"]
  ),
  indicator(
    "football.power.medicine_ball_throw",
    "رمي الكرة الطبية",
    "أقصى مسافة مسجلة لرمي كرة طبية.",
    "القدرة الانفجارية",
    "distance",
    ["م"]
  ),
  indicator(
    "football.speed.sprint_10m",
    "سرعة 10 أمتار",
    "الزمن المسجل لقطع مسافة 10 أمتار من البدء المتحرك.",
    "السرعة",
    "duration",
    ["ثانية"]
  ),
  indicator(
    "football.speed.sprint_30m",
    "سرعة 30 مترًا",
    "الزمن المسجل لقطع مسافة 30 مترًا.",
    "السرعة",
    "duration",
    ["ثانية"]
  ),
  indicator(
    "football.agility.change_of_direction",
    "الرشاقة وتغيير الاتجاه",
    "الزمن المسجل في مسار تغيير الاتجاه المستخدم في الاختبار.",
    "الرشاقة",
    "duration",
    ["ثانية"]
  ),
  indicator(
    "football.endurance.intermittent",
    "التحمل المتقطع",
    "النتيجة المسجلة في اختبار التحمل المتقطع المستخدم.",
    "التحمل",
    "level",
    ["مستوى"]
  ),
  indicator(
    "football.balance.single_leg",
    "التوازن على قدم واحدة",
    "زمن الثبات المسجل على قدم واحدة.",
    "التوازن",
    "duration",
    ["ثانية"]
  ),
  indicator(
    "football.mobility.ankle",
    "مدى حركة الكاحل",
    "أقصى زاوية مسجلة لثني الكاحل.",
    "المرونة",
    "angle",
    ["درجة"]
  ),
  indicator(
    "football.mobility.hip",
    "مدى حركة الورك",
    "أقصى زاوية مسجلة لثني الورك.",
    "المرونة",
    "angle",
    ["درجة"]
  ),
  indicator(
    "football.stability.landing",
    "ثبات الهبوط",
    "زمن الثبات المسجل بعد الهبوط من قفزة.",
    "التوازن",
    "duration",
    ["ثانية"]
  ),
];

export const FOOTBALL: SportDefinition = {
  id: "football",
  name: "كرة القدم",
  terminology: {
    athlete: "لاعب",
    athletes: "لاعبون",
    group: "المركز",
    groups: "المراكز",
    position: "المركز الرياضي",
    positions: "المراكز الرياضية",
    analysisContext: "تحليل الأداء",
  },
  groups: FOOTBALL_POSITIONS.map(position => ({ id: position, name: position })),
  skills: FOOTBALL_SKILLS,
  indicators: FOOTBALL_INDICATORS,
  apparatus: [],
  categories: [],
  notes: [
    "تعرض الشاشات الجديدة التسميات القانونية الحالية فقط؛ تظل التسميات التاريخية محفوظة في السجلات السابقة.",
    "المؤشرات مسودة عمل بانتظار المراجعة العلمية، ولا تحمل عتبات أو تصنيفًا.",
  ],
};
