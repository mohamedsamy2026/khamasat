import { z } from "zod";
import { MAX_VIDEO_BYTES, PLAYER_LIMITS } from "../../shared/athlete";
import { calendarToday, isValidCalendarDate } from "../../shared/academy-tenure";
import {
  ALL_SKILLS,
  GYMNASTICS_CATEGORIES,
  SPORT_IDS,
  groupsForSport,
  indicatorsFor,
  isGymnasticsCategoryId,
  isSportId,
  type GymnasticsCategoryId,
  type SportId,
} from "../../shared/sports";
import { isAcceptedFootballSkill } from "../../shared/sports/football";
import { isAcceptedGymnasticsSkill } from "../../shared/sports/gymnastics";
import {
  EMERGENCY_CONTACT_LIMITS,
  HEALTH_FIELD_LIMITS,
} from "../../shared/health";
import {
  MAX_POSE_SECONDS,
  POSE_ENGINE,
  POSE_MIN_CONFIDENCE,
  POSE_MODEL,
  POSE_MODEL_VERSION,
} from "../../shared/pose";

const trimmed = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

export const positiveId = z.coerce.number().int().positive();
/** Any registered sport skill; the route then enforces the athlete's sport. */
export const skillName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    value =>
      ALL_SKILLS.includes(value) ||
      isAcceptedFootballSkill(value) ||
      isAcceptedGymnasticsSkill(value),
    { message: "المهارة المحددة غير مسجلة في إعدادات الرياضات" }
  );
/** Any registered sport group; the route then enforces the athlete's sport. */
export const position = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(value => SPORT_IDS.some(id => groupsForSport(id).includes(value)), {
    message: "الفئة أو المركز المحدد غير مسجل في إعدادات الرياضات",
  });
export const sportId = z.custom<SportId>(
  value => typeof value === "string" && isSportId(value.trim()),
  { message: "الرياضة المحددة غير مدعومة" }
);
export const gymnasticsCategoryId = z.custom<GymnasticsCategoryId>(
  value => typeof value === "string" && isGymnasticsCategoryId(value.trim()),
  { message: "فئة الجمباز المحددة غير مدعومة" }
);
export const sportList = z
  .array(sportId)
  .min(1)
  .max(SPORT_IDS.length)
  .refine(value => new Set(value).size === value.length, {
    message: "لا تكرر الرياضة نفسها",
  });
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD")
  .refine(
    value => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    },
    { message: "التاريخ غير صالح" }
  );
/**
 * Validates a player's academy start date without guessing missing dates.
 * Returns null for an omitted date, or an Arabic message for an invalid date.
 */
export function validateAcademyJoinDate(
  academyJoinDate: string | null | undefined,
  birthDate: string | null | undefined
): string | null {
  if (!academyJoinDate) return null;
  if (!isValidCalendarDate(academyJoinDate))
    return "تاريخ الانضمام غير صالح";
  if (academyJoinDate > calendarToday())
    return "تاريخ الانضمام لا يمكن أن يكون في المستقبل";
  if (birthDate && isValidCalendarDate(birthDate) && academyJoinDate < birthDate)
    return "تاريخ الانضمام لا يمكن أن يسبق تاريخ الميلاد";
  return null;
}

export const isoDateTime = z
  .string()
  .trim()
  .max(40)
  .refine(
    value => {
      const match =
        /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(
          value
        );
      if (!match) return false;
      const calendar = new Date(`${match[1]}T00:00:00.000Z`);
      return (
        !Number.isNaN(calendar.getTime()) &&
        calendar.toISOString().slice(0, 10) === match[1] &&
        !Number.isNaN(new Date(value).getTime())
      );
    },
    { message: "تاريخ التسجيل غير صالح" }
  );

export const organizationInputSchema = z.object({
  name: trimmed(2, 160),
  type: z.enum(["academy", "club"]),
  region: trimmed(2, 120),
  sports: sportList.optional(),
});

export const organizationPatchSchema = z
  .object({
    name: trimmed(2, 160).optional(),
    region: trimmed(2, 120).optional(),
    sports: sportList.optional(),
  })
  .refine(
    value =>
      value.name !== undefined ||
      value.region !== undefined ||
      value.sports !== undefined,
    { message: "أرسل اسم المؤسسة أو المنطقة أو الرياضات لتعديلها" }
  );

export const skillValueSchema = z.object({
  name: skillName,
  value: z.number().finite().min(0).max(100),
});

export const physicalTestSchema = z.object({
  name: trimmed(1, 80),
  value: trimmed(0, 40),
  unit: trimmed(0, 20),
});

export const playerInputSchema = z
  .object({
    name: trimmed(2, 140),
    sport: sportId,
    gymnasticsCategory: z
      .union([gymnasticsCategoryId, z.literal("")])
      .optional()
      .default(""),
    primaryApparatus: trimmed(0, 40).optional().default(""),
    age: z.number().int().min(PLAYER_LIMITS.age.min).max(PLAYER_LIMITS.age.max),
    nationality: trimmed(2, 80),
    position,
    foot: trimmed(1, 30),
    height: z
      .number()
      .int()
      .min(PLAYER_LIMITS.height.min)
      .max(PLAYER_LIMITS.height.max),
    weight: z
      .number()
      .finite()
      .min(PLAYER_LIMITS.weight.min)
      .max(PLAYER_LIMITS.weight.max),
    birthDate: z.union([z.literal(""), isoDate]),
    academyJoinDate: z.union([z.literal(""), isoDate]).optional(),
    jersey: z
      .number()
      .int()
      .min(PLAYER_LIMITS.jersey.min)
      .max(PLAYER_LIMITS.jersey.max),
    region: trimmed(2, 120),
    discoverable: z.boolean(),
    strengths: z.array(trimmed(1, 100)).max(10).optional(),
    weaknesses: z.array(trimmed(1, 100)).max(10).optional(),
    skills: z.array(skillValueSchema).max(ALL_SKILLS.length).optional(),
    physicalTests: z.array(physicalTestSchema).max(12).optional(),
  })
  .superRefine((input, context) => {
    // Sport/group consistency is enforced here *and* again in the route against
    // the organization's configured sports.
    if (input.sport === "gymnastics") {
      if (!input.gymnasticsCategory) {
        context.addIssue({
          code: "custom",
          path: ["gymnasticsCategory"],
          message: "اختر فئة الجمباز (سيدات أو رجال) للاعب الجمباز",
        });
      } else {
        const category = GYMNASTICS_CATEGORIES.find(
          item => item.id === input.gymnasticsCategory
        );
        if (category && input.position !== category.name) {
          context.addIssue({
            code: "custom",
            path: ["position"],
            message: "فئة اللاعب لا تتوافق مع الفئة المختارة",
          });
        }
        if (
          input.primaryApparatus &&
          (!category || !category.apparatusOrder.includes(input.primaryApparatus))
        ) {
          context.addIssue({
            code: "custom",
            path: ["primaryApparatus"],
            message: "الجهاز الرئيسي لا يتوافق مع فئة الجمباز المختارة",
          });
        }
      }
    } else {
      if (input.gymnasticsCategory) {
        context.addIssue({
          code: "custom",
          path: ["gymnasticsCategory"],
          message: "فئة الجمباز لا تُستخدم مع رياضة أخرى",
        });
      }
      if (input.primaryApparatus) {
        context.addIssue({
          code: "custom",
          path: ["primaryApparatus"],
          message: "الجهاز الرئيسي يُستخدم فقط مع رياضة الجمباز",
        });
      }
      if (!groupsForSport(input.sport).includes(input.position)) {
        context.addIssue({
          code: "custom",
          path: ["position"],
          message: "المركز المحدد لا يتبع الرياضة المختارة",
        });
      }
    }
    const academyJoinDateError = validateAcademyJoinDate(
      input.academyJoinDate,
      input.birthDate
    );
    if (academyJoinDateError) {
      context.addIssue({
        code: "custom",
        path: ["academyJoinDate"],
        message: academyJoinDateError,
      });
    }
    if (!input.birthDate) return;
    const birth = new Date(`${input.birthDate}T00:00:00.000Z`);
    if (birth > new Date()) {
      context.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "تاريخ الميلاد لا يمكن أن يكون في المستقبل",
      });
      return;
    }
    const ageFromDate = Math.floor(
      (Date.now() - birth.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
    );
    if (Math.abs(ageFromDate - input.age) > 1) {
      context.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "العمر لا يتوافق مع تاريخ الميلاد",
      });
    }
  });

export const requestInputSchema = z.object({
  playerId: positiveId,
  message: trimmed(0, 500).default(""),
});

export const requestActionSchema = z.object({
  action: z.enum(["approve", "reject", "revoke"]),
  reason: trimmed(1, 500).optional(),
});

const finite = z.number().finite();
const poseAngleSchema = finite.min(0).max(180);
const poseLandmarkSchema = z.object({
  x: finite.min(-10).max(10),
  y: finite.min(-10).max(10),
  visibility: finite.min(0).max(1),
  presence: finite.min(0).max(1),
});
const poseAnglesSchema = z.object({
  left_elbow: poseAngleSchema.optional(),
  right_elbow: poseAngleSchema.optional(),
  left_knee: poseAngleSchema.optional(),
  right_knee: poseAngleSchema.optional(),
  left_shoulder: poseAngleSchema.optional(),
  right_shoulder: poseAngleSchema.optional(),
  left_hip: poseAngleSchema.optional(),
  right_hip: poseAngleSchema.optional(),
});
const poseFrameSchema = z.object({
  timestamp: finite.min(0),
  landmarks: z
    .array(poseLandmarkSchema)
    .max(33)
    .refine(value => value.length === 0 || value.length === 33, {
      message: "يجب أن تحتوي كل عينة وضعية على 33 معلمًا أو لا شيء",
    }),
  angles: poseAnglesSchema,
});
const poseJointSchema = z
  .object({
    key: z.enum([
      "left_elbow",
      "right_elbow",
      "left_knee",
      "right_knee",
      "left_shoulder",
      "right_shoulder",
      "left_hip",
      "right_hip",
    ]),
    label: trimmed(1, 80),
    samples: z.number().int().min(0).max(301),
    min: poseAngleSchema.nullable(),
    max: poseAngleSchema.nullable(),
    mean: poseAngleSchema.nullable(),
  })
  .superRefine((joint, context) => {
    const values = [joint.min, joint.max, joint.mean];
    if (joint.samples === 0 && values.some(value => value !== null)) {
      context.addIssue({
        code: "custom",
        message: "إحصاءات المفصل الخالية يجب أن تكون null",
      });
    }
    if (joint.samples > 0 && values.some(value => value === null)) {
      context.addIssue({
        code: "custom",
        message: "إحصاءات المفصل المرصودة يجب أن تكون أرقامًا منتهية",
      });
    }
    if (
      joint.min !== null &&
      joint.mean !== null &&
      joint.max !== null &&
      (joint.min > joint.mean || joint.mean > joint.max)
    ) {
      context.addIssue({
        code: "custom",
        message: "ترتيب إحصاءات المفصل غير صالح",
      });
    }
  });

export const poseResultSchema = z
  .object({
    engine: z.literal(POSE_ENGINE),
    model: z.literal(POSE_MODEL),
    modelVersion: z.literal(POSE_MODEL_VERSION),
    packageVersion: trimmed(1, 80),
    duration: finite.positive().max(MAX_POSE_SECONDS),
    videoWidth: z.number().int().positive().max(10000),
    videoHeight: z.number().int().positive().max(10000),
    sampleFps: finite.positive().max(60),
    confidenceThreshold: finite.min(POSE_MIN_CONFIDENCE).max(1),
    totalFrames: z.number().int().min(1).max(301),
    detectedFrames: z.number().int().min(0).max(301),
    frames: z.array(poseFrameSchema).min(1).max(301),
    joints: z.array(poseJointSchema).min(1).max(8),
    limitations: z.array(trimmed(1, 300)).max(20),
  })
  .superRefine((pose, context) => {
    if (pose.frames.length !== pose.totalFrames) {
      context.addIssue({
        code: "custom",
        path: ["totalFrames"],
        message: "عدد عينات الوضعية لا يطابق totalFrames",
      });
    }
    const detected = pose.frames.filter(frame => frame.landmarks.length === 33);
    if (detected.length !== pose.detectedFrames) {
      context.addIssue({
        code: "custom",
        path: ["detectedFrames"],
        message: "عدد العينات المكتشفة لا يطابق الإطارات المرسلة",
      });
    }
    if (pose.detectedFrames === 0) {
      context.addIssue({
        code: "custom",
        path: ["detectedFrames"],
        message: "لا يمكن حفظ تحليل بلا وضعية مرصودة",
      });
    }
    for (let index = 1; index < pose.frames.length; index += 1) {
      if (pose.frames[index]!.timestamp < pose.frames[index - 1]!.timestamp) {
        context.addIssue({
          code: "custom",
          path: ["frames", index, "timestamp"],
          message: "طوابع عينات الوضعية يجب أن تكون مرتبة زمنيًا",
        });
      }
    }
    if (pose.frames.at(-1)!.timestamp > pose.duration + 0.001) {
      context.addIssue({
        code: "custom",
        path: ["frames"],
        message: "طابع عينة الوضعية يتجاوز مدة الفيديو",
      });
    }
    const keys = new Set<string>();
    for (const joint of pose.joints) {
      if (keys.has(joint.key)) {
        context.addIssue({
          code: "custom",
          path: ["joints"],
          message: "المفاصل مكررة",
        });
      }
      keys.add(joint.key);
      if (joint.samples > pose.detectedFrames) {
        context.addIssue({
          code: "custom",
          path: ["joints"],
          message: "عدد عينات المفصل يتجاوز الإطارات المرصودة",
        });
      }
    }
  });

const analysisContextFields = z.object({
  usedFoot: z.enum(["left", "right", "unknown"]),
  phase: z.literal("whole_clip_unsegmented"),
  cameraView: z.enum(["side", "front", "oblique", "unknown"]),
  staticCamera: z.boolean().nullable(),
  protocolId: trimmed(0, 120),
  conditionsNote: trimmed(0, 600),
});

export const analysisContextSchema = analysisContextFields
  .partial()
  .transform(value => ({
    usedFoot: value.usedFoot ?? "unknown",
    phase: "whole_clip_unsegmented" as const,
    cameraView: value.cameraView ?? "unknown",
    staticCamera: value.staticCamera ?? null,
    protocolId: value.protocolId ?? "",
    conditionsNote: value.conditionsNote ?? "",
  }));

export const analysisInputSchema = z.object({
  playerId: positiveId,
  skill: skillName,
  // New analyses must always be tied to a real private upload and a browser
  // MediaPipe result. Historical simulation rows remain readable.
  videoId: positiveId,
  pose: poseResultSchema,
  context: analysisContextSchema.optional().transform(
    value =>
      value ?? {
        usedFoot: "unknown" as const,
        phase: "whole_clip_unsegmented" as const,
        cameraView: "unknown" as const,
        staticCamera: null,
        protocolId: "",
        conditionsNote: "",
      }
  ),
});

export const noteInputSchema = z
  .object({
    playerId: positiveId,
    text: trimmed(1, 1000),
    analysisId: positiveId.optional(),
    /** A deliberately unlinked academy note, never an implied analysis link. */
    unlinkedGeneral: z.literal(true).optional(),
    requiredAction: trimmed(0, 500).optional(),
    visibility: z.enum(["academy_internal", "shared"]).optional(),
  })
  .superRefine((input, context) => {
    if (!input.analysisId && input.unlinkedGeneral !== true) {
      context.addIssue({
        code: "custom",
        path: ["analysisId"],
        message:
          "اربط الملاحظة بتحليل فعلي أو حدّد أنها ملاحظة عامة غير مرتبطة",
      });
    }
  });

export const notePatchSchema = z
  .object({
    text: trimmed(1, 1000).optional(),
    requiredAction: trimmed(0, 500).optional(),
  })
  .refine(
    input => input.text !== undefined || input.requiredAction !== undefined,
    { message: "أرسل النص أو الإجراء المطلوب لتعديل الملاحظة" }
  );

const doseValue = z.number().int().positive().nullable();

export const exercisePlanInputSchema = z.object({
  playerId: positiveId,
  analysisId: positiveId,
  developmentId: trimmed(1, 200),
  name: trimmed(1, 200),
  goal: trimmed(1, 1000),
  steps: z.array(trimmed(1, 1000)).min(1).max(30),
  tools: trimmed(0, 500),
  sets: doseValue,
  repetitions: doseValue,
  durationSeconds: doseValue,
  restSeconds: doseValue,
  progression: trimmed(1, 1000),
  reassessAt: isoDateTime,
  reassessMethod: trimmed(1, 1000),
  reassessIndicatorCode: trimmed(1, 160),
  reviewed: z.boolean(),
});

export const exercisePlanPatchSchema = exercisePlanInputSchema
  .omit({ playerId: true })
  .partial()
  .refine(input => Object.keys(input).length > 0, {
    message: "أرسل حقلاً واحدًا على الأقل لتعديل الخطة",
  });

const httpsSourceUrl = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    value => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          Boolean(url.hostname) &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    },
    {
      message:
        "رابط مصدر الفيديو يجب أن يكون رابط HTTPS صالحًا دون بيانات دخول",
    }
  );

export const videoQuerySchema = z
  .object({
    playerId: positiveId,
    skill: skillName.optional(),
    name: trimmed(1, 160).optional(),
    recordedAt: isoDateTime.optional(),
    sourceURL: httpsSourceUrl.optional(),
    sourceCredit: trimmed(1, 160).optional(),
    sourceLicense: trimmed(1, 160).optional(),
    sourceDescription: trimmed(1, 500).optional(),
  })
  .superRefine((input, context) => {
    if (
      !input.sourceURL &&
      (input.sourceCredit !== undefined ||
        input.sourceLicense !== undefined ||
        input.sourceDescription !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceURL"],
        message: "أرسل رابط HTTPS عند إرفاق بيانات مصدر الفيديو",
      });
    }
  });

export const reportQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    skill: z.preprocess(
      value => (value === "all" || value === "" ? undefined : value),
      skillName.optional()
    ),
  })
  .superRefine((value, context) => {
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
      });
    }
  });

export const exportQuerySchema = reportQuerySchema.safeExtend({
  format: z.enum(["html", "csv", "pdf"]),
});

const indicatorValueSchema = z
  .object({
    code: trimmed(1, 120),
    value: z.number().finite().min(0).max(10000),
    unit: trimmed(1, 20),
    note: trimmed(0, 500).optional(),
  })
  .strict();

/**
 * Standardized selection: every record must reference a catalogued indicator of
 * the athlete's sport and one of the units that indicator declares.
 */
export const physicalAssessmentInputSchema = z
  .object({
    playerId: positiveId,
    apparatus: trimmed(0, 40).optional().default(""),
    skill: trimmed(0, 80).optional().default(""),
    sessionKey: z
      .string()
      .trim()
      .regex(/^as\_[a-z0-9]{6,32}$/, "معرّف جلسة التقييم غير صالح")
      .optional(),
    recordedAt: isoDateTime.optional(),
    indicators: z.array(indicatorValueSchema).min(1).max(40),
  })
  .superRefine((input, context) => {
    const codes = new Set<string>();
    for (const [index, indicator] of input.indicators.entries()) {
      if (codes.has(indicator.code)) {
        context.addIssue({
          code: "custom",
          path: ["indicators", index, "code"],
          message: "لا تكرر المؤشر نفسه في التقييم الواحد",
        });
      }
      codes.add(indicator.code);
    }
  });

/** Validates indicator/unit/apparatus against the athlete's sport catalog. */
export function validateIndicatorsForSport(
  sport: SportId,
  apparatus: string,
  indicators: Array<{ code: string; unit: string }>
): string | null {
  const allowed = indicatorsFor(sport, apparatus || null);
  for (const indicator of indicators) {
    const definition = allowed.find(item => item.code === indicator.code);
    if (!definition)
      return "المؤشر المحدد غير متاح لهذه الرياضة أو لهذا الجهاز";
    if (!definition.units.includes(indicator.unit))
      return "وحدة القياس المحددة غير مسجلة لهذا المؤشر";
  }
  return null;
}

export const healthInputSchema = z.object({
  previousInjuries: trimmed(0, HEALTH_FIELD_LIMITS.previousInjuries).default(
    ""
  ),
  chronicDiseases: trimmed(0, HEALTH_FIELD_LIMITS.chronicDiseases).default(""),
  currentMedications: trimmed(
    0,
    HEALTH_FIELD_LIMITS.currentMedications
  ).default(""),
  physiotherapy: trimmed(0, HEALTH_FIELD_LIMITS.physiotherapy).default(""),
  availableExams: trimmed(0, HEALTH_FIELD_LIMITS.availableExams).default(""),
  otherNotes: trimmed(0, HEALTH_FIELD_LIMITS.otherNotes).default(""),
});


const coachAssessmentSkillSchema = z.object({
  name: skillName,
  score: z.number().finite().min(0).max(100).nullable(),
});

const coachExerciseSchema = z.object({
  title: trimmed(1, 200),
  description: trimmed(1, 1000),
});

/**
 * The authenticated route derives player identity, author, demo flag, and
 * overall score; clients cannot submit or override those fields.
 */
export const coachAssessmentInputSchema = z
  .object({
    assessedAt: isoDateTime,
    protocol: trimmed(1, 160),
    notes: trimmed(0, 2000).default(""),
    skills: z.array(coachAssessmentSkillSchema).min(1).max(40),
    strengths: z.array(trimmed(1, 300)).max(20).default([]),
    development: z.array(trimmed(1, 300)).max(20).default([]),
    exercises: z.array(coachExerciseSchema).max(20).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    if (!input.skills.some(skill => skill.score !== null)) {
      context.addIssue({
        code: "custom",
        path: ["skills"],
        message: "سجّل تقدير مدرب واحدًا على الأقل؛ اترك غير المقيم null",
      });
    }
    const names = new Set<string>();
    for (const [index, skill] of input.skills.entries()) {
      if (names.has(skill.name)) {
        context.addIssue({
          code: "custom",
          path: ["skills", index, "name"],
          message: "لا تكرر المهارة نفسها في تقييم المدرب",
        });
      }
      names.add(skill.name);
    }
  });

const phoneNumber = z
  .string()
  .trim()
  .min(6, "أدخل رقم هاتف صالحًا")
  .max(EMERGENCY_CONTACT_LIMITS.phone)
  .refine(value => /^[+0-9][0-9 ()-]{5,}$/.test(value), {
    message: "رقم الهاتف يحتوي على رموز غير مسموح بها",
  });

export const emergencyContactSchema = z
  .object({
    contactName: z
      .string()
      .trim()
      .min(2, "اسم جهة الاتصال مطلوب")
      .max(EMERGENCY_CONTACT_LIMITS.contactName),
    relationship: trimmed(0, EMERGENCY_CONTACT_LIMITS.relationship).default(""),
    phone: phoneNumber,
    alternatePhone: z
      .union([z.literal(""), phoneNumber])
      .optional()
      .default(""),
    notes: trimmed(0, EMERGENCY_CONTACT_LIMITS.notes).default(""),
  })
  .superRefine((value, context) => {
    if (value.alternatePhone && value.alternatePhone === value.phone) {
      context.addIssue({
        code: "custom",
        path: ["alternatePhone"],
        message: "الرقم البديل يجب أن يختلف عن الرقم الأساسي",
      });
    }
  });

export const sensitiveGrantSchema = z.object({
  organizationId: positiveId,
  scope: z.enum(["health", "emergency"]),
  action: z.enum(["grant", "revoke"]),
});

export function maxVideoBytes(): number {
  return MAX_VIDEO_BYTES;
}
