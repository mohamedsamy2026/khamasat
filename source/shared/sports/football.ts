import type { SportDefinition, StrengthIndicator } from "./types";

/** Preserved verbatim from the existing platform vocabulary. */
export const FOOTBALL_SKILLS = [
  "التسديد",
  "المراوغة",
  "التمرير",
  "السرعة",
  "القوة البدنية",
  "التحكم بالكرة",
  "القفز",
  "اتخاذ القرار",
] as const;

export const FOOTBALL_POSITIONS = [
  "مهاجم",
  "وسط",
  "مدافع",
  "جناح",
  "حارس مرمى",
] as const;

/**
 * Football keeps the existing platform vocabulary (positions and skills) so
 * historical records stay valid without a data rewrite.
 */
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
    ["تكرار", "كغ"]
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
  groups: FOOTBALL_POSITIONS.map(position => ({
    id: position,
    name: position,
  })),
  skills: FOOTBALL_SKILLS,
  indicators: FOOTBALL_INDICATORS,
  apparatus: [],
  categories: [],
  notes: [
    "المؤشرات مسودة عمل بانتظار المراجعة العلمية، ولا تحمل عتبات أو تصنيفًا.",
  ],
};
