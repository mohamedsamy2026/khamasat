import type { PhysicalTest, SkillValue } from "../../shared/athlete";
import { catalogForPlayer } from "../../shared/demo-display";
import type { GymnasticsCategoryId, SportId } from "../../shared/sports/types";

export type SeedPlayer = {
  name: string;
  sport: SportId;
  gymnasticsCategory: GymnasticsCategoryId | "";
  primaryApparatus: string;
  /** Server-only opaque key; it doubles as the approved manifest collection. */
  demoProfileKey: string;
  age: number;
  nationality: string;
  position: string;
  foot: string;
  height: number;
  weight: number;
  region: string;
  birthDate: string;
  /** Fictional calendar date for reference-demo profiles only. */
  academyJoinDate?: string;
  jersey: number;
  photoKey: string;
  overall: number;
  improvement: number;
  discoverable: boolean;
  strengths: string[];
  weaknesses: string[];
  skills: SkillValue[];
  physicalTests: PhysicalTest[];
  history: { date: string; label: string; score: number; skill: string }[];
};

export type SeedCoachAssessment = {
  assessedAt: Date;
  protocol: string;
  coachName: string;
  coachPhotoKey: string;
  notes: string;
  skills: { name: string; score: number }[];
  overall: number;
  strengths: string[];
  development: string[];
  exercises: { title: string; description: string }[];
  isDemo: true;
};

const DEMO_COACH_NAME = "رائد الحربي — مدرب افتراضي";
const DEMO_COACH_PHOTO = "/brand/demo-coach.jpg";

/**
 * Fictitious adult demo profiles only. Player-level score/test columns remain
 * empty because assessment detail is saved explicitly in coach_assessments and
 * derived for display; no record represents a real athlete or measurement.
 */
export function demoPlayersForSeed(_now = new Date()): SeedPlayer[] {
  const profiles: SeedPlayer[] = [
    {
      name: "سعود أحمد",
      sport: "football",
      gymnasticsCategory: "",
      primaryApparatus: "",
      demoProfileKey: "striker",
      age: 21,
      nationality: "سعودي",
      position: "مهاجم",
      foot: "اليمنى",
      height: 178,
      weight: 68,
      region: "الرياض",
      birthDate: "2005-03-14",
      jersey: 9,
      photoKey: "/brand/demo-striker.webp",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "عمر خالد",
      sport: "football",
      gymnasticsCategory: "",
      primaryApparatus: "",
      demoProfileKey: "goalkeeper",
      age: 22,
      nationality: "سعودي",
      position: "حارس مرمى",
      foot: "اليمنى",
      height: 186,
      weight: 76,
      region: "جدة",
      birthDate: "2004-08-20",
      jersey: 1,
      photoKey: "/brand/demo-goalkeeper.webp",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "زياد علي",
      sport: "football",
      gymnasticsCategory: "",
      primaryApparatus: "",
      demoProfileKey: "winger",
      age: 20,
      nationality: "سعودي",
      position: "جناح أيمن",
      foot: "اليسرى",
      height: 171,
      weight: 60,
      region: "الدمام",
      birthDate: "2006-09-05",
      jersey: 7,
      photoKey: "/brand/demo-winger.webp",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "ليان السالم",
      sport: "gymnastics",
      gymnasticsCategory: "womens_artistic",
      primaryApparatus: "floor",
      demoProfileKey: "wag-floor",
      age: 20,
      nationality: "سعودية",
      position: "الجمباز الفني — سيدات",
      foot: "غير محدد",
      height: 162,
      weight: 52,
      region: "الرياض",
      birthDate: "2006-04-11",
      jersey: 14,
      photoKey: "/brand/demo-wag-floor.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "جود الحربي",
      sport: "gymnastics",
      gymnasticsCategory: "womens_artistic",
      primaryApparatus: "vault",
      demoProfileKey: "wag-vault",
      age: 21,
      nationality: "سعودية",
      position: "الجمباز الفني — سيدات",
      foot: "غير محدد",
      height: 160,
      weight: 51,
      region: "جدة",
      birthDate: "2005-07-19",
      jersey: 15,
      photoKey: "/brand/demo-wag-vault.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "نورة العتيبي",
      sport: "gymnastics",
      gymnasticsCategory: "womens_artistic",
      primaryApparatus: "balance_beam",
      demoProfileKey: "wag-balance_beam",
      age: 22,
      nationality: "سعودية",
      position: "الجمباز الفني — سيدات",
      foot: "غير محدد",
      height: 164,
      weight: 54,
      region: "الدمام",
      birthDate: "2004-11-02",
      jersey: 16,
      photoKey: "/brand/demo-wag-balance_beam.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "ريم القحطاني",
      sport: "gymnastics",
      gymnasticsCategory: "womens_artistic",
      primaryApparatus: "uneven_bars",
      demoProfileKey: "wag-uneven_bars",
      age: 19,
      nationality: "سعودية",
      position: "الجمباز الفني — سيدات",
      foot: "غير محدد",
      height: 158,
      weight: 49,
      region: "الرياض",
      birthDate: "2007-02-26",
      jersey: 17,
      photoKey: "/brand/demo-wag-uneven_bars.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "فارس العتيبي",
      sport: "gymnastics",
      gymnasticsCategory: "mens_artistic",
      primaryApparatus: "floor",
      demoProfileKey: "mag-floor",
      age: 23,
      nationality: "سعودي",
      position: "الجمباز الفني — رجال",
      foot: "غير محدد",
      height: 170,
      weight: 65,
      region: "الرياض",
      birthDate: "2003-05-03",
      jersey: 21,
      photoKey: "/brand/demo-mag-floor.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "مازن الحربي",
      sport: "gymnastics",
      gymnasticsCategory: "mens_artistic",
      primaryApparatus: "pommel_horse",
      demoProfileKey: "mag-pommel_horse",
      age: 21,
      nationality: "سعودي",
      position: "الجمباز الفني — رجال",
      foot: "غير محدد",
      height: 168,
      weight: 63,
      region: "جدة",
      birthDate: "2005-08-12",
      jersey: 22,
      photoKey: "/brand/demo-mag-pommel_horse.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "راكان الشهري",
      sport: "gymnastics",
      gymnasticsCategory: "mens_artistic",
      primaryApparatus: "rings",
      demoProfileKey: "mag-rings",
      age: 22,
      nationality: "سعودي",
      position: "الجمباز الفني — رجال",
      foot: "غير محدد",
      height: 172,
      weight: 68,
      region: "الدمام",
      birthDate: "2004-02-14",
      jersey: 23,
      photoKey: "/brand/demo-mag-rings.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "سلمان الدوسري",
      sport: "gymnastics",
      gymnasticsCategory: "mens_artistic",
      primaryApparatus: "vault",
      demoProfileKey: "mag-vault",
      age: 20,
      nationality: "سعودي",
      position: "الجمباز الفني — رجال",
      foot: "غير محدد",
      height: 174,
      weight: 66,
      region: "الرياض",
      birthDate: "2006-01-09",
      jersey: 24,
      photoKey: "/brand/demo-mag-vault.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "بدر الغامدي",
      sport: "gymnastics",
      gymnasticsCategory: "mens_artistic",
      primaryApparatus: "parallel_bars",
      demoProfileKey: "mag-parallel_bars",
      age: 19,
      nationality: "سعودي",
      position: "الجمباز الفني — رجال",
      foot: "غير محدد",
      height: 169,
      weight: 61,
      region: "جدة",
      birthDate: "2007-06-28",
      jersey: 25,
      photoKey: "/brand/demo-mag-parallel_bars.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
    {
      name: "تركي المطيري",
      sport: "gymnastics",
      gymnasticsCategory: "mens_artistic",
      primaryApparatus: "horizontal_bar",
      demoProfileKey: "mag-horizontal_bar",
      age: 21,
      nationality: "سعودي",
      position: "الجمباز الفني — رجال",
      foot: "غير محدد",
      height: 173,
      weight: 64,
      region: "الدمام",
      birthDate: "2005-09-30",
      jersey: 26,
      photoKey: "/brand/demo-mag-horizontal_bar.jpg",
      overall: 0,
      improvement: 0,
      discoverable: true,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
  ];
  return profiles.map((player, index) => ({
    ...player,
    academyJoinDate: new Date(
      Date.UTC(_now.getUTCFullYear() - 1, index % 12, 4 + ((index * 3) % 21))
    )
      .toISOString()
      .slice(0, 10),
  }));
}

function assessmentDate(now: Date, assessmentIndex: number): Date {
  const daysAgo = [82, 62, 42, 22, 5][assessmentIndex] ?? 5;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysAgo,
      10 + assessmentIndex,
      0,
      0
    )
  );
}

/**
 * Five deterministic dated reference assessments for a fictitious demo profile.
 * Each record has full catalog coverage so its overall is the saved mean of
 * measured skills, its strengths are the highest three, and development is the
 * lowest three. These are visibly fictional coaching examples, not analysis.
 */
export function demoCoachAssessmentsForSeed(
  player: SeedPlayer,
  profileIndex: number,
  now = new Date()
): SeedCoachAssessment[] {
  const catalog = catalogForPlayer(
    player.sport,
    player.position,
    player.primaryApparatus
  );
  if (!catalog.length) return [];
  return Array.from({ length: 5 }, (_, assessmentIndex) => {
    const skills = catalog.map((skill, skillIndex) => {
      const variation =
        (profileIndex * 7 + skillIndex * 9 + assessmentIndex * 5) % 19;
      const score = Math.max(
        55,
        Math.min(96, 67 + profileIndex + assessmentIndex * 2 + variation - 9)
      );
      return { name: skill.name, score };
    });
    const sorted = [...skills].sort(
      (left, right) =>
        right.score - left.score || left.name.localeCompare(right.name, "ar")
    );
    const strengths = sorted.slice(0, 3).map(skill => skill.name);
    const development = sorted
      .slice(-3)
      .reverse()
      .map(skill => skill.name);
    const overall = Number(
      (
        skills.reduce((sum, skill) => sum + skill.score, 0) / skills.length
      ).toFixed(2)
    );
    return {
      assessedAt: assessmentDate(now, assessmentIndex),
      protocol: `DEMO_REFERENCE_V2:${player.demoProfileKey}`,
      coachName: DEMO_COACH_NAME,
      coachPhotoKey: DEMO_COACH_PHOTO,
      notes: `ملاحظة مدرب افتراضي — جلسة المتابعة ${assessmentIndex + 1}: «${player.name}، أبرز ما نجح في مثال هذه الجلسة هو ${strengths.join("، ")}. في التدريب المقبل سنركّز على ${development.join("، ")} مع المراجعة التدريجية.» هذا نص عرض تجريبي وليس قولًا لمدرب حقيقي أو نتيجة تحليل ذكاء اصطناعي.`,
      skills,
      overall,
      strengths,
      development,
      exercises: development.map(skill => ({
        title: `تمرين عرض — ${skill}`,
        description: `تمرين تدريبي مقترح ضمن المثال الخيالي لتحسين ${skill} مع مراجعة مدرب بشري؛ لا يمثل وصفة فردية أو تحليل فيديو.`,
      })),
      isDemo: true,
    };
  });
}
