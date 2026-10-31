import type { CoachAssessment } from "./coaching";
import type { PhysicalTest, Video } from "./athlete";
import {
  CANONICAL_GOALKEEPER_SKILLS,
  CANONICAL_OUTFIELD_SKILLS,
} from "./sports/football";
import type { SportId } from "./sports/types";

/**
 * Display-only metadata for a fictitious demo profile. It is always derived by
 * the server from saved coach assessments and verified demo-media references;
 * it is not a measurement table or a pose-analysis result.
 */
export type DemoDisplay = {
  source: "demo";
  version: string;
  overall10: number;
  level: string;
  assessments: CoachAssessment[];
  skills: DemoSkill[];
  physicalTests: PhysicalTest[];
  motionIndicators: { name: string; value: number; unit: string }[];
};

export type DemoSkill = {
  name: string;
  englishName: string;
  score: number | null;
  level: string;
  strengths: string[];
  development: string[];
  notes: string;
  exercises: { title: string; description: string }[];
  /** Coach-facing rubric prompts, not FIG/scientific standards or thresholds. */
  criteria: string[];
  video: Video | null;
};

export type SkillCatalogEntry = Pick<
  DemoSkill,
  "name" | "englishName" | "criteria"
>;

const footballOutfieldCatalog: readonly SkillCatalogEntry[] = [
  {
    name: "التسديد",
    englishName: "Shooting",
    criteria: ["اختيار سطح القدم", "اتجاه الجسم قبل التنفيذ", "متابعة الحركة بعد التسديد"],
  },
  {
    name: "التمرير",
    englishName: "Passing",
    criteria: ["توقيت القرار", "وزن التمريرة", "فتح زاوية الاستلام التالية"],
  },
  {
    name: "المراوغة",
    englishName: "Dribbling",
    criteria: ["تغيير الاتجاه", "استخدام الخداع", "حماية الكرة تحت الضغط"],
  },
  {
    name: "التحكم بالكرة",
    englishName: "Ball Control",
    criteria: ["لمسات قريبة", "توجيه الكرة للمساحة", "الاستعداد للحركة التالية"],
  },
  {
    name: "الاستلام واللمسة الأولى",
    englishName: "First Touch & Receiving",
    criteria: ["مسح الملعب قبل الاستلام", "امتصاص سرعة الكرة", "توجيه اللمسة الأولى"],
  },
  {
    name: "التحرك دون كرة",
    englishName: "Off-ball Movement",
    criteria: ["توقيت الانطلاق", "خلق زاوية تمرير", "العودة للمساحة المناسبة"],
  },
  {
    name: "الجري بالكرة",
    englishName: "Carrying the Ball",
    criteria: ["رفع الرأس أثناء الحمل", "التحكم بالسرعة", "اختيار لحظة التمرير أو الاستمرار"],
  },
  {
    name: "الالتحام واستخلاص الكرة",
    englishName: "Duels & Ball Recovery",
    criteria: ["وضع الجسم في الالتحام", "توقيت التدخل", "تأمين الكرة بعد الاستخلاص"],
  },
  {
    name: "ضربات الرأس",
    englishName: "Heading",
    criteria: ["تقدير مسار الكرة", "توجيه الرأس", "الهبوط والاستعداد للعب التالي"],
  },
];

const footballGoalkeeperCatalog: readonly SkillCatalogEntry[] = [
  {
    name: "التصدي للتسديدات",
    englishName: "Shot Stopping",
    criteria: ["قراءة لحظة التسديد", "تكوين اليدين", "تأمين الكرة أو توجيهها بأمان"],
  },
  {
    name: "رد الفعل",
    englishName: "Reaction",
    criteria: ["جاهزية وضع البداية", "سرعة الاستجابة", "استعادة التوازن"],
  },
  {
    name: "التمركز",
    englishName: "Positioning",
    criteria: ["زاوية الوقوف", "المسافة من المرمى", "ضبط الوضع مع حركة الكرة"],
  },
  {
    name: "مسك الكرة",
    englishName: "Handling",
    criteria: ["تثبيت الكفين", "امتصاص القوة", "حماية الكرة بعد الإمساك"],
  },
  {
    name: "التعامل مع الكرات العالية",
    englishName: "High Balls",
    criteria: ["قرار الخروج", "استخدام اليدين في الهواء", "الهبوط الآمن وحماية المساحة"],
  },
  {
    name: "التوزيع باليد والقدم",
    englishName: "Distribution",
    criteria: ["اختيار الهدف", "دقة الإرسال", "سرعة بدء الهجمة"],
  },
  {
    name: "الخروج لمواجهة المهاجم",
    englishName: "One-on-one Closing",
    criteria: ["توقيت التقدم", "تكبير مساحة الجسم", "قرار التدخل أو الانتظار"],
  },
];

const gymnasticsCatalogByApparatus: Readonly<
  Record<string, readonly SkillCatalogEntry[]>
> = {
  floor: [
    {
      name: "الحركات الأرضية",
      englishName: "Floor Exercise",
      criteria: ["تتابع الحركة", "التحكم في المسار", "الانتقال بين العناصر"],
    },
    {
      name: "الوقوف على اليدين",
      englishName: "Handstand",
      criteria: ["خط الجسم", "ضغط الكتفين", "التحكم عند الدخول والخروج"],
    },
    {
      name: "الهبوط",
      englishName: "Landing",
      criteria: ["امتصاص الهبوط", "ثبات القدمين", "استعادة الوضع بعد النزول"],
    },
  ],
  vault: [
    {
      name: "الاقتراب والارتقاء",
      englishName: "Approach & Board Take-off",
      criteria: ["إيقاع الاقتراب", "خطوات التحضير", "اتصال متزن بلوح الارتقاء"],
    },
    {
      name: "الدفع على طاولة القفز",
      englishName: "Vault Table Block",
      criteria: ["وضع اليدين", "دفع الكتفين", "اتجاه الجسم بعد الدفع"],
    },
    {
      name: "هبوط القفز",
      englishName: "Vault Landing",
      criteria: ["رؤية الأرض", "امتصاص القوة", "ضبط خطوة الهبوط إن وجدت"],
    },
  ],
  balance_beam: [
    {
      name: "التوازن على العارضة",
      englishName: "Beam Balance",
      criteria: ["محاذاة الجذع", "تثبيت القدم", "استعادة التوازن"],
    },
    {
      name: "الوثب على العارضة",
      englishName: "Beam Leap",
      criteria: ["تحضير القفزة", "مسار الجسم فوق العارضة", "العودة المسيطر عليها"],
    },
    {
      name: "النزول من العارضة",
      englishName: "Beam Dismount",
      criteria: ["اختيار لحظة النزول", "اتجاه الدوران", "ثبات الهبوط"],
    },
  ],
  uneven_bars: [
    {
      name: "المرجحة",
      englishName: "Swing",
      criteria: ["إيقاع المرجحة", "امتداد الكتفين", "حفظ شكل الجسم"],
    },
    {
      name: "الانتقال بين العارضتين",
      englishName: "Bar Transition",
      criteria: ["توقيت التحرير", "مسار الانتقال", "إعادة المسك المسيطر عليها"],
    },
    {
      name: "النزول",
      englishName: "Dismount",
      criteria: ["تحضير التحرير", "التحكم في الهواء", "ثبات الهبوط"],
    },
  ],
  pommel_horse: [
    {
      name: "الدوران",
      englishName: "Circles",
      criteria: ["إيقاع الدوران", "اتساع الرجلين", "ثبات دعم الكتفين"],
    },
    {
      name: "المقص",
      englishName: "Scissors",
      criteria: ["تبديل الرجلين", "نقل الوزن", "حفظ ارتفاع الحوض"],
    },
    {
      name: "النزول",
      englishName: "Dismount",
      criteria: ["تجهيز الخروج", "خط الجسم في الطيران", "ثبات الهبوط"],
    },
  ],
  rings: [
    {
      name: "الثبات",
      englishName: "Strength Hold",
      criteria: ["هدوء الحلقات", "تثبيت الكتفين", "شكل الجسم في الوضع"],
    },
    {
      name: "المرجحة",
      englishName: "Swing",
      criteria: ["توقيت التأرجح", "امتداد الجسم", "التحكم عند الانتقال"],
    },
    {
      name: "النزول",
      englishName: "Dismount",
      criteria: ["تحضير التحرير", "اتجاه الحركة", "ثبات الهبوط"],
    },
  ],
  parallel_bars: [
    {
      name: "المرجحة على المتوازي",
      englishName: "Parallel Bars Swing",
      criteria: ["إيقاع المرجحة", "استقرار دعم اليدين", "ارتفاع الحوض بين العارضتين"],
    },
    {
      name: "الوقوف على اليدين على المتوازي",
      englishName: "Parallel Bars Handstand",
      criteria: ["خط الجسم", "ضغط الكتفين", "التحكم في الدخول والخروج"],
    },
    {
      name: "النزول من المتوازي",
      englishName: "Parallel Bars Dismount",
      criteria: ["تجهيز النزول", "التحكم في الهواء", "ثبات الهبوط"],
    },
  ],
  horizontal_bar: [
    {
      name: "الدوران",
      englishName: "Giant Swing",
      criteria: ["إيقاع الدوران", "امتداد الجسم", "التحكم في قبضة اليد"],
    },
    {
      name: "التحرير وإعادة المسك",
      englishName: "Release & Regrasp",
      criteria: ["توقيت التحرير", "مسار الجسم", "إعادة المسك الآمنة"],
    },
    {
      name: "النزول",
      englishName: "Dismount",
      criteria: ["التحضير للخروج", "التحكم في الطيران", "ثبات الهبوط"],
    },
  ],
};

/**
 * Canonical display catalog. Rubric prompts are coach-facing descriptions, not
 * FIG code values, medical findings, or scientific performance thresholds.
 */
export function catalogForPlayer(
  sport: string,
  position: string,
  primaryApparatus?: string | null
): readonly SkillCatalogEntry[] {
  if (sport === "football") {
    return position === "حارس مرمى"
      ? footballGoalkeeperCatalog
      : footballOutfieldCatalog;
  }
  if (sport !== "gymnastics") return [];
  if (primaryApparatus) return gymnasticsCatalogByApparatus[primaryApparatus] ?? [];
  return Object.values(gymnasticsCatalogByApparatus).flat();
}

export function gymnasticsCatalogForApparatus(
  apparatus: string
): readonly SkillCatalogEntry[] {
  return gymnasticsCatalogByApparatus[apparatus] ?? [];
}

export const DEMO_DISPLAY_VERSION = "DEMO_REFERENCE_V2";

/** Non-normative presentation wording for an already saved 0–100 coach score. */
export function performanceLevel(score100: number): string {
  if (score100 >= 90) return "متقدم";
  if (score100 >= 80) return "جيد جدًا";
  if (score100 >= 70) return "جيد";
  if (score100 >= 60) return "قيد التطوير";
  return "يحتاج دعمًا تدريبيًا";
}

/** Converts a saved coach-assessment mean to a ten-point display value. */
export function overall10(assessment: Pick<CoachAssessment, "overall" | "skills">): number {
  const mean =
    typeof assessment.overall === "number" && Number.isFinite(assessment.overall)
      ? assessment.overall
      : (() => {
          const scores = assessment.skills.flatMap(skill =>
            typeof skill.score === "number" && Number.isFinite(skill.score)
              ? [skill.score]
              : []
          );
          return scores.length
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
            : 0;
        })();
  return Number((mean / 10).toFixed(1));
}

/** Canonical display names are intentionally exported for seed and validation. */
export const DEMO_CANONICAL_FOOTBALL_SKILLS = {
  outfield: CANONICAL_OUTFIELD_SKILLS,
  goalkeeper: CANONICAL_GOALKEEPER_SKILLS,
} as const;

export function catalogSkillNames(
  sport: SportId | string,
  position: string,
  primaryApparatus?: string | null
): readonly string[] {
  return catalogForPlayer(sport, position, primaryApparatus).map(item => item.name);
}
