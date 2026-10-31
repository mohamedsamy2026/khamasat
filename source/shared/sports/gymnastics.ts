import type {
  ApparatusDefinition,
  GymnasticsCategory,
  SportDefinition,
  StrengthIndicator,
} from "./types";

const GYM_INDICATOR_SOURCE =
  "docs/sports-scientific-validation.md#provisional-indicators";

/**
 * The apparatus order below is the competition rotation order used by the
 * section: it is configuration, not a performance standard.
 */
export const WOMENS_APPARATUS_ORDER = [
  "vault",
  "uneven_bars",
  "balance_beam",
  "floor",
] as const;

export const MENS_APPARATUS_ORDER = [
  "floor",
  "pommel_horse",
  "rings",
  "vault",
  "parallel_bars",
  "horizontal_bar",
] as const;

export const GYMNASTICS_APPARATUS: readonly ApparatusDefinition[] = [
  {
    id: "floor",
    name: "الحركات الأرضية",
    englishName: "Floor Exercise",
    description:
      "سلسلة حركات على بساط مساحته 12×12 مترًا تجمع التوازن والقدرة والمرونة.",
  },
  {
    id: "vault",
    name: "طاولة القفز",
    englishName: "Vault",
    description:
      "اقتراب سريع ثم ارتداد على لوح القفز ومرور فوق المنصة وانتهاء بالهبوط.",
  },
  {
    id: "balance_beam",
    name: "عارضة التوازن",
    englishName: "Balance Beam",
    description: "سلسلة حركات على عارضة مرتفعة ضيقة تتطلب دقة التوازن والثبات.",
  },
  {
    id: "uneven_bars",
    name: "المتوازي مختلف الارتفاعات",
    englishName: "Uneven Bars",
    description:
      "انتقالات ودورات بين عارضتين بارتفاعين مختلفين مع ثبات الكتف والجذع.",
  },
  {
    id: "pommel_horse",
    name: "حصان الحلق",
    englishName: "Pommel Horse",
    description:
      "دورات وانتقالات على المقابض تعتمد على ثبات الكتف وقوة دفع الذراعين.",
  },
  {
    id: "rings",
    name: "الحلق",
    englishName: "Rings",
    description:
      "ثباتات وقوى على حلقتين معلقتين تتطلب قوة عالية وتحكمًا في الجسم كاملًا.",
  },
  {
    id: "parallel_bars",
    name: "المتوازي",
    englishName: "Parallel Bars",
    description: "دعم وثباتات وانتقالات على عارضتين متوازيتين.",
  },
  {
    id: "horizontal_bar",
    name: "العقلة",
    englishName: "Horizontal Bar",
    description: "دورات وانتقالات معلقًا على عارضة أفقية واحدة.",
  },
];

export const GYMNASTICS_CATEGORIES: readonly GymnasticsCategory[] = [
  {
    id: "womens_artistic",
    name: "الجمباز الفني — سيدات",
    apparatusOrder: WOMENS_APPARATUS_ORDER,
  },
  {
    id: "mens_artistic",
    name: "الجمباز الفني — رجال",
    apparatusOrder: MENS_APPARATUS_ORDER,
  },
];

function indicator(
  code: string,
  label: string,
  definition: string,
  group: string,
  measurementType: StrengthIndicator["measurementType"],
  units: readonly string[],
  apparatus: readonly string[]
): StrengthIndicator {
  return {
    code,
    label,
    definition,
    group,
    measurementType,
    units,
    apparatus,
    validationStatus: "provisional_unvalidated",
    sourceRefs: [GYM_INDICATOR_SOURCE],
  };
}

/** Deduplicated union of both categories' apparatus (floor and vault repeat). */
const ALL_APPARATUS = [
  ...new Set([...WOMENS_APPARATUS_ORDER, ...MENS_APPARATUS_ORDER]),
];

/**
 * Twenty provisional selectable indicators for artistic gymnastics. The
 * apparatus list restricts an indicator to apparatus where the movement can be
 * performed; it is a compatibility rule, not a scoring rule.
 */
export const GYMNASTICS_INDICATORS: readonly StrengthIndicator[] = [
  indicator(
    "gym.upper.push_up",
    "قوة الدفع — تمرين الضغط",
    "عدد التكرارات المسجلة في تمرين الضغط بوضعية صحيحة.",
    "قوة الدفع",
    "repetitions",
    ["تكرار"],
    ALL_APPARATUS
  ),
  indicator(
    "gym.upper.pull_up",
    "قوة السحب — العقلة",
    "عدد التكرارات المسجلة في سحب الجسم حتى الذقن.",
    "قوة السحب",
    "repetitions",
    ["تكرار"],
    ["uneven_bars", "rings", "horizontal_bar", "parallel_bars"]
  ),
  indicator(
    "gym.upper.dip",
    "قوة الدفع على المتوازيين",
    "عدد التكرارات المسجلة في تمرين الدفع على المتوازيين.",
    "قوة الدفع",
    "repetitions",
    ["تكرار"],
    ["parallel_bars", "rings"]
  ),
  indicator(
    "gym.core.leg_raise",
    "رفع الرجلين معلقًا",
    "عدد التكرارات المسجلة لرفع الرجلين حتى المستوى الأفقي.",
    "قوة الجذع",
    "repetitions",
    ["تكرار"],
    ["uneven_bars", "rings", "horizontal_bar"]
  ),
  indicator(
    "gym.core.l_sit",
    "ثبات L-sit",
    "زمن الثبات المسجل في وضعية L-sit.",
    "قوة الجذع",
    "duration",
    ["ثانية"],
    ["floor", "rings", "parallel_bars"]
  ),
  indicator(
    "gym.handstand.hold",
    "ثبات الوقوف على اليدين",
    "زمن الثبات المسجل في الوقوف على اليدين.",
    "التوازن المقلوب",
    "duration",
    ["ثانية"],
    ["floor", "parallel_bars"]
  ),
  indicator(
    "gym.core.hollow_body",
    "ثبات وضعية الجسم المجوف",
    "زمن الثبات المسجل في وضعية الجسم المجوف.",
    "قوة الجذع",
    "duration",
    ["ثانية"],
    ALL_APPARATUS
  ),
  indicator(
    "gym.core.arch_hold",
    "ثبات القوس الخلفي",
    "زمن الثبات المسجل في وضعية القوس الخلفي.",
    "قوة الجذع",
    "duration",
    ["ثانية"],
    ["floor", "balance_beam", "rings"]
  ),
  indicator(
    "gym.mobility.pike_compression",
    "ضغط وضعية الثني",
    "المسافة المسجلة بين الجذع والرجلين في وضعية الثني.",
    "المرونة",
    "distance",
    ["سم"],
    ["floor", "balance_beam", "parallel_bars"]
  ),
  indicator(
    "gym.mobility.front_split",
    "فتح أمامي كامل",
    "الزاوية المسجلة في الفتح الأمامي للرجلين.",
    "المرونة",
    "angle",
    ["درجة"],
    ["floor", "balance_beam"]
  ),
  indicator(
    "gym.mobility.bridge",
    "الجسر الخلفي",
    "زمن الثبات أو الزاوية المسجلة في وضعية الجسر الخلفي.",
    "المرونة",
    "duration",
    ["ثانية", "درجة"],
    ["floor", "balance_beam"]
  ),
  indicator(
    "gym.rings.support",
    "الثبات على الحلقات",
    "زمن الثبات المسجل في وضعية الدعم على الحلقات.",
    "ثبات الحلقات",
    "duration",
    ["ثانية"],
    ["rings"]
  ),
  indicator(
    "gym.vault.run_speed",
    "سرعة الاقتراب",
    "الزمن المسجل لاقتراب القفز قبل لوح الارتداد.",
    "القفز",
    "duration",
    ["ثانية"],
    ["vault"]
  ),
  indicator(
    "gym.vault.board_rebound",
    "ارتداد لوح القفز",
    "الارتفاع المسجل للارتداد من لوح القفز.",
    "القفز",
    "distance",
    ["سم"],
    ["vault"]
  ),
  indicator(
    "gym.beam.walk",
    "المشي على العارضة",
    "زمن أو عدد الخطوات المسجلة في المشي على عارضة منخفضة.",
    "التوازن",
    "duration",
    ["ثانية", "خطوة"],
    ["balance_beam"]
  ),
  indicator(
    "gym.bars.cast_hold",
    "ثبات الارتفاع على العارضتين",
    "عدد التكرارات المسجلة لثبات الارتفاع على العارضتين.",
    "العارضتان",
    "repetitions",
    ["تكرار"],
    ["uneven_bars", "parallel_bars"]
  ),
  indicator(
    "gym.pommel.support_circle",
    "الدورات المدعومة على الحصان",
    "عدد الدورات المسجلة مع بقاء الجسم مدعومًا على المقابض.",
    "حصان المقابض",
    "repetitions",
    ["تكرار"],
    ["pommel_horse"]
  ),
  indicator(
    "gym.hbar.giant_swing",
    "الدورات الكبيرة على العارضة",
    "عدد الدورات الكبيرة المسجلة على العارضة الأفقية.",
    "العارضة الأفقية",
    "repetitions",
    ["تكرار"],
    ["horizontal_bar"]
  ),
  indicator(
    "gym.power.vertical_jump",
    "القفز العمودي",
    "أقصى ارتفاع مسجل في القفز العمودي من الثبات.",
    "القدرة الانفجارية",
    "distance",
    ["سم"],
    ALL_APPARATUS
  ),
  indicator(
    "gym.landing.stability",
    "ثبات الهبوط",
    "زمن الثبات المسجل بعد الهبوط دون خطوة إضافية.",
    "التوازن",
    "duration",
    ["ثانية"],
    [
      "floor",
      "vault",
      "balance_beam",
      "rings",
      "parallel_bars",
      "horizontal_bar",
    ]
  ),
];

/**
 * Technical labels used for new assessment/display flows. They are coaching
 * rubric dimensions, not FIG values or scientific performance standards.
 * Duplicate movement names (for example "النزول") intentionally remain in
 * the apparatus-specific catalog in demo-display.ts; this sport-wide union is
 * de-duplicated only for generic legacy-compatible input validation.
 */
export const GYMNASTICS_CANONICAL_SKILLS = [
  "الحركات الأرضية",
  "الوقوف على اليدين",
  "الهبوط",
  "الاقتراب والارتقاء",
  "الدفع على طاولة القفز",
  "هبوط القفز",
  "التوازن على العارضة",
  "الوثب على العارضة",
  "النزول من العارضة",
  "المرجحة",
  "الانتقال بين العارضتين",
  "النزول",
  "الدوران",
  "المقص",
  "الثبات",
  "المرجحة على المتوازي",
  "الوقوف على اليدين على المتوازي",
  "النزول من المتوازي",
  "التحرير وإعادة المسك",
] as const;

/** Former apparatus labels accepted only when reading or extending old records. */
export const GYMNASTICS_HISTORIC_SKILLS = [
  "القفز",
  "العارضتان غير المتوازيتين",
  "حصان المقابض",
  "الحلقات",
  "المتوازيان",
  "العارضة الأفقية",
] as const;

export function isAcceptedGymnasticsSkill(skill: string): boolean {
  return (
    (GYMNASTICS_CANONICAL_SKILLS as readonly string[]).includes(skill) ||
    (GYMNASTICS_HISTORIC_SKILLS as readonly string[]).includes(skill)
  );
}

export const GYMNASTICS: SportDefinition = {
  id: "gymnastics",
  name: "الجمباز الفني",
  terminology: {
    athlete: "لاعب جمباز",
    athletes: "لاعبو الجمباز",
    group: "الفئة",
    groups: "الفئات",
    position: "الفئة",
    positions: "الفئات",
    analysisContext: "تحليل الأداء الفني",
  },
  groups: GYMNASTICS_CATEGORIES.map(category => ({
    id: category.name,
    name: category.name,
  })),
  skills: GYMNASTICS_CANONICAL_SKILLS,
  indicators: GYMNASTICS_INDICATORS,
  apparatus: GYMNASTICS_APPARATUS,
  categories: GYMNASTICS_CATEGORIES,
  notes: [
    "ترتيب الأجهزة في الواجهة يتبع ترتيب الدوران المعتمد للفئة المختارة.",
    "تعرض الشاشات الجديدة مهارات فنية مخصصة للجهاز؛ تبقى أسماء الأجهزة التاريخية مقبولة للسجلات القديمة فقط.",
    "المؤشرات مسودة عمل بانتظار المراجعة العلمية، ولا تحوي عتبات درجات.",
  ],
};
