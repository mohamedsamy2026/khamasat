import {
  EMPTY_ANALYSIS_CONTEXT,
  EVALUATION_CATALOG_VERSION,
  type AnalysisContext,
  type EvaluationFinding,
  type EvaluationRule,
  type EvaluationSessionInput,
  type IndicatorDefinition,
  type IndicatorMeasurement,
  type PlayerEvaluation,
  type SessionCompatibility,
  type SessionEvaluation,
  type UsedFoot,
} from "./evaluation-types";
import type { PoseJointKey, PoseResult } from "./pose";
import { POSE_MIN_CONFIDENCE } from "./pose";
import { angle2D, POSE_JOINTS, roundMeasurement } from "./poseMath";

export type {
  AnalysisContext,
  EvaluationFinding,
  EvaluationRule,
  EvaluationSessionInput,
  IndicatorDefinition,
  IndicatorMeasurement,
  PlayerEvaluation,
  SessionCompatibility,
  SessionEvaluation,
  UsedFoot,
} from "./evaluation-types";

/** Official MediaPipe documentation listed in models/README.md. */
export const MEDIAPIPE_POSE_SOURCE_URL =
  "https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker";

/**
 * The geometry implemented in poseMath.angle2D: image-plane vectors are scaled
 * to decoded video pixels, then their included angle is calculated with acos.
 */
export const ANGLE_2D_METHOD = "2D aspect-corrected vector angle (acos)";
export const ANGLE_2D_UNIT = "°";
export const LANDMARK_AVAILABILITY_THRESHOLD = POSE_MIN_CONFIDENCE;

const RAW_ANGLE_SKILL = "all_skills_raw_pose_measurement";
const WHOLE_CLIP_PHASE = "whole_clip_unsegmented" as const;

function anatomicalSide(key: PoseJointKey): IndicatorDefinition["anatomicalSide"] {
  return key.startsWith("left_") ? "left" : "right";
}

/**
 * The complete production registry. It deliberately contains only the eight
 * three-point joints configured in poseMath; it contains no performance rules.
 */
export const INDICATOR_CATALOG: IndicatorDefinition[] = POSE_JOINTS.map((joint) => ({
  code: `joint.${joint.key}.angle2d`,
  name: joint.label,
  definition: `زاوية ${joint.label} بين معالم MediaPipe ${joint.indices.join(" / ")}.`,
  skill: RAW_ANGLE_SKILL,
  anatomicalSide: anatomicalSide(joint.key),
  phase: WHOLE_CLIP_PHASE,
  method: ANGLE_2D_METHOD,
  unit: ANGLE_2D_UNIT,
  validity: [
    `توافر كل من المعالم ${joint.indices.join(" / ")} داخل الصورة.`,
    `visibility وpresence لكل معلم ≥ ${LANDMARK_AVAILABILITY_THRESHOLD}.`,
    "هندسة ثلاثية النقاط صالحة وغير منعدمة بعد تصحيح نسبة أبعاد الفيديو.",
    "الزاوية المحفوظة في الإطار متسقة مع إعادة فحص الهندسة.",
  ],
  supported: true,
  jointKey: joint.key,
  rule: null,
  methodSourceUrl: MEDIAPIPE_POSE_SOURCE_URL,
  version: EVALUATION_CATALOG_VERSION,
}));

type StoredAngleSummary = {
  values: number[];
  samples: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  timeStart: number | null;
  timeEnd: number | null;
  geometricallyAvailableFrames: number;
  storedAngleFrames: number;
  inconsistentStoredAngleFrames: number;
};

type Assessment = IndicatorMeasurement["assessment"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStoredAngle(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 180;
}

function knownFoot(value: UsedFoot): value is "left" | "right" {
  return value === "left" || value === "right";
}

function copyContext(input: EvaluationSessionInput): AnalysisContext {
  const context = input.context ?? EMPTY_ANALYSIS_CONTEXT;
  return {
    usedFoot: context.usedFoot,
    // No phase segmentation is performed by this module.
    phase: WHOLE_CLIP_PHASE,
    cameraView: context.cameraView,
    staticCamera: context.staticCamera,
    protocolId: context.protocolId,
    conditionsNote: context.conditionsNote,
  };
}

/** A real pose is a non-demo analysis with an attached stored frame sequence. */
function hasActualPose(
  input: EvaluationSessionInput,
): input is EvaluationSessionInput & { pose: PoseResult } {
  return input.isDemo !== true
    && Boolean(input.pose && Array.isArray(input.pose.frames) && input.pose.frames.length > 0);
}

function definitionForJoint(key: PoseJointKey): IndicatorDefinition {
  const definition = INDICATOR_CATALOG.find((candidate) => candidate.jointKey === key);
  if (!definition) {
    throw new Error(`Missing indicator definition for configured joint ${key}`);
  }
  return definition;
}

/**
 * Uses only a frame's persisted angle after independently verifying that the
 * corresponding persisted landmarks still form the same valid 2D geometry.
 * pose.joints is intentionally not used because it is a derived summary.
 */
function summarizeStoredFrameAngles(pose: PoseResult, key: PoseJointKey): StoredAngleSummary {
  const joint = POSE_JOINTS.find((candidate) => candidate.key === key);
  if (!joint) {
    return {
      values: [], samples: 0, min: null, max: null, mean: null,
      timeStart: null, timeEnd: null, geometricallyAvailableFrames: 0,
      storedAngleFrames: 0, inconsistentStoredAngleFrames: 0,
    };
  }

  const values: number[] = [];
  const timestamps: number[] = [];
  let geometricallyAvailableFrames = 0;
  let storedAngleFrames = 0;
  let inconsistentStoredAngleFrames = 0;

  for (const frame of pose.frames) {
    const [start, vertex, end] = joint.indices;
    const geometricAngle = angle2D(
      frame.landmarks[start],
      frame.landmarks[vertex],
      frame.landmarks[end],
      pose.videoWidth,
      pose.videoHeight,
      LANDMARK_AVAILABILITY_THRESHOLD,
    );

    if (geometricAngle === null) continue;
    geometricallyAvailableFrames += 1;

    const storedAngle = frame.angles[key];
    if (!isStoredAngle(storedAngle)) continue;
    storedAngleFrames += 1;

    // Frame angles are saved rounded to two decimals by measureFrameAngles.
    if (roundMeasurement(storedAngle, 2) !== roundMeasurement(geometricAngle, 2)) {
      inconsistentStoredAngleFrames += 1;
      continue;
    }
    if (!isFiniteNumber(frame.timestamp)) continue;

    values.push(storedAngle);
    timestamps.push(frame.timestamp);
  }

  if (values.length === 0) {
    return {
      values,
      samples: 0,
      min: null,
      max: null,
      mean: null,
      timeStart: null,
      timeEnd: null,
      geometricallyAvailableFrames,
      storedAngleFrames,
      inconsistentStoredAngleFrames,
    };
  }

  const min = roundMeasurement(Math.min(...values), 2);
  const max = roundMeasurement(Math.max(...values), 2);
  const mean = roundMeasurement(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
  return {
    values,
    samples: values.length,
    min,
    max,
    mean,
    timeStart: Math.min(...timestamps),
    timeEnd: Math.max(...timestamps),
    geometricallyAvailableFrames,
    storedAngleFrames,
    inconsistentStoredAngleFrames,
  };
}

function unavailableReason(summary: StoredAngleSummary, hasPose: boolean): string {
  if (!hasPose) {
    return "لا توجد إطارات وضعية فعلية محفوظة لهذه الجلسة؛ لا يمكن اشتقاق قياس.";
  }
  if (summary.geometricallyAvailableFrames === 0) {
    return "تعذر التحقق من توافر النقاط أو هندسة الزاوية في الإطارات المحفوظة؛ لا توجد قيمة أداء.";
  }
  if (summary.storedAngleFrames === 0) {
    return "النقاط متاحة هندسيًا، لكن لا توجد زاوية محفوظة قابلة للاعتماد؛ لا يعاد اختلاق قياس من الإطار.";
  }
  if (summary.inconsistentStoredAngleFrames > 0) {
    return "الزاوية المحفوظة غير متسقة مع هندسة المعالم المحفوظة؛ لا توجد قيمة أداء.";
  }
  return "لا يوجد طابع زمني صالح لعينة زاوية محفوظة قابلة للتحقق؛ لا توجد قيمة أداء.";
}

function formatDegrees(value: number): string {
  return `${value.toFixed(2)}${ANGLE_2D_UNIT}`;
}

function measurementForDefinition(
  input: EvaluationSessionInput,
  context: AnalysisContext,
  definition: IndicatorDefinition,
): IndicatorMeasurement {
  const key = definition.jointKey;
  if (!key || !hasActualPose(input)) {
    const noPoseSummary: StoredAngleSummary = {
      values: [], samples: 0, min: null, max: null, mean: null,
      timeStart: null, timeEnd: null, geometricallyAvailableFrames: 0,
      storedAngleFrames: 0, inconsistentStoredAngleFrames: 0,
    };
    return {
      indicatorCode: definition.code,
      name: definition.name,
      value: null,
      unit: definition.unit,
      samples: 0,
      validity: "unavailable",
      assessment: "unassessed",
      reason: unavailableReason(noPoseSummary, false),
      method: definition.method,
      points: [],
      sessionId: input.id,
      playerId: input.playerId,
      videoId: input.videoId,
      sessionDate: input.createdAt,
      timeStart: null,
      timeEnd: null,
      usedFoot: context.usedFoot,
      phase: WHOLE_CLIP_PHASE,
      rule: definition.rule,
    };
  }

  const summary = summarizeStoredFrameAngles(input.pose, key);
  const points = POSE_JOINTS.find((joint) => joint.key === key)?.indices.map(String) ?? [];
  if (summary.mean === null || summary.min === null || summary.max === null) {
    return {
      indicatorCode: definition.code,
      name: definition.name,
      value: null,
      unit: definition.unit,
      samples: 0,
      validity: "unavailable",
      assessment: "unassessed",
      reason: unavailableReason(summary, true),
      method: definition.method,
      points,
      sessionId: input.id,
      playerId: input.playerId,
      videoId: input.videoId,
      sessionDate: input.createdAt,
      timeStart: null,
      timeEnd: null,
      usedFoot: context.usedFoot,
      phase: WHOLE_CLIP_PHASE,
      rule: definition.rule,
    };
  }

  const base: IndicatorMeasurement = {
    indicatorCode: definition.code,
    name: definition.name,
    value: summary.mean,
    unit: definition.unit,
    samples: summary.samples,
    validity: "valid",
    assessment: "measurement_only",
    reason: `متوسط الزوايا المحفوظة القابلة للتحقق هندسيًا هو ${formatDegrees(summary.mean)}؛ المدى ${formatDegrees(summary.min)}–${formatDegrees(summary.max)} من ${summary.samples} عينة. لا توجد قاعدة أداء موثقة، لذلك هذا قياس وصفي فقط.`,
    method: definition.method,
    points,
    sessionId: input.id,
    playerId: input.playerId,
    videoId: input.videoId,
    sessionDate: input.createdAt,
    timeStart: summary.timeStart,
    timeEnd: summary.timeEnd,
    usedFoot: context.usedFoot,
    phase: WHOLE_CLIP_PHASE,
    rule: definition.rule,
  };
  return { ...base, assessment: classifyMeasurement(base, input.skill) };
}

function isDocumentedRule(rule: EvaluationRule): boolean {
  return [
    rule.id,
    rule.version,
    rule.sourceUrl,
    rule.description,
    rule.skill,
    rule.measurementMethod,
    rule.unit,
  ].every((field) => typeof field === "string" && field.trim().length > 0);
}

function validRange(range: unknown): range is [number, number] {
  return Array.isArray(range)
    && range.length === 2
    && isFiniteNumber(range[0])
    && isFiniteNumber(range[1])
    && range[0] <= range[1];
}

function rangeContains(range: [number, number] | undefined, value: number): boolean {
  if (!range) return false;
  return value >= range[0] && value <= range[1];
}

function rangesOverlap(left: [number, number], right: [number, number]): boolean {
  return left[0] <= right[1] && right[0] <= left[1];
}

/**
 * Classifies only a valid measurement against a documented, exactly matching
 * rule. The caller supplies the session skill because IndicatorMeasurement
 * carries the link to a session but not the skill name itself.
 */
export function classifyMeasurement(
  measurement: IndicatorMeasurement,
  sessionSkill: string,
): Assessment {
  if (
    measurement.validity !== "valid"
    || !isFiniteNumber(measurement.value)
    || measurement.samples <= 0
  ) {
    return "unassessed";
  }

  const rule = measurement.rule;
  if (!rule) return "measurement_only";

  if (
    !isDocumentedRule(rule)
    || !sessionSkill.trim()
    || !knownFoot(measurement.usedFoot)
    || !knownFoot(rule.usedFoot)
    || rule.skill !== sessionSkill
    || rule.usedFoot !== measurement.usedFoot
    || rule.phase !== measurement.phase
    || rule.unit !== measurement.unit
    || rule.measurementMethod !== measurement.method
  ) {
    return "unassessed";
  }

  const strengthRange = validRange(rule.strengthRange) ? rule.strengthRange : undefined;
  const developmentRange = validRange(rule.developmentRange) ? rule.developmentRange : undefined;
  if ((rule.strengthRange !== undefined && !strengthRange)
    || (rule.developmentRange !== undefined && !developmentRange)) {
    return "unassessed";
  }

  if (strengthRange && developmentRange && rangesOverlap(strengthRange, developmentRange)) {
    return "unassessed";
  }

  const isStrength = rangeContains(strengthRange, measurement.value);
  const isDevelopment = rangeContains(developmentRange, measurement.value);
  if (isStrength && isDevelopment) return "unassessed";
  if (isStrength) return "strength";
  if (isDevelopment) return "development";
  return "measurement_only";
}

function findingFor(measurement: IndicatorMeasurement, classification: "strength" | "development"): EvaluationFinding {
  const classificationLabel = classification === "strength" ? "نقطة قوة" : "جانب تطوير";
  return {
    id: `${measurement.sessionId}:${measurement.indicatorCode}:${classification}`,
    classification,
    indicatorCode: measurement.indicatorCode,
    title: `${classificationLabel}: ${measurement.name}`,
    explanation: measurement.reason,
    measurement,
  };
}

/**
 * Derives descriptive 2D joint-angle measurements from persisted real pose
 * frames. It does not score the player, infer an action phase, or use legacy
 * simulation data and it never manufactures a missing sample.
 */
export function evaluateSession(input: EvaluationSessionInput): SessionEvaluation {
  const context = copyContext(input);
  const measurements = INDICATOR_CATALOG.map((definition) =>
    measurementForDefinition(input, context, definition),
  );
  const strengths = measurements
    .filter((measurement) => measurement.assessment === "strength")
    .map((measurement) => findingFor(measurement, "strength"));
  const development = measurements
    .filter((measurement) => measurement.assessment === "development")
    .map((measurement) => findingFor(measurement, "development"));

  return {
    catalogVersion: EVALUATION_CATALOG_VERSION,
    measurements,
    strengths,
    development,
    overall: {
      score: null,
      method: null,
      reason: "لا توجد قاعدة أداء موثقة أو درجة إجمالية لهذه الزوايا الثنائية الأبعاد.",
    },
    context,
  };
}

function latestCreatedAt(sessions: readonly EvaluationSessionInput[]): string | null {
  let latest: { date: number; value: string } | null = null;
  for (const session of sessions) {
    const date = Date.parse(session.createdAt);
    if (!Number.isFinite(date)) continue;
    if (!latest || date > latest.date) latest = { date, value: session.createdAt };
  }
  return latest?.value ?? null;
}

/**
 * Summarizes only unique sessions that contain persisted actual pose frames.
 * The returned overall value remains intentionally absent until a validated
 * rule and aggregation method exist.
 */
export function summarizePlayerEvaluation(
  sessions: EvaluationSessionInput[],
): PlayerEvaluation {
  const uniqueActualSessions: EvaluationSessionInput[] = [];
  const seenSessionIds = new Set<number>();
  for (const session of sessions) {
    if (!hasActualPose(session) || seenSessionIds.has(session.id)) continue;
    seenSessionIds.add(session.id);
    uniqueActualSessions.push(session);
  }

  const testedSkills: string[] = [];
  const seenSkills = new Set<string>();
  for (const session of uniqueActualSessions) {
    if (!seenSkills.has(session.skill)) {
      seenSkills.add(session.skill);
      testedSkills.push(session.skill);
    }
  }

  const allEvaluations = uniqueActualSessions.map(evaluateSession);
  return {
    sessionsCount: uniqueActualSessions.length,
    testedSkills,
    lastEvaluationAt: latestCreatedAt(uniqueActualSessions),
    overall: {
      score: null,
      method: null,
      reason: "لا توجد طريقة موثقة لدمج قياسات الزوايا الثنائية الأبعاد في درجة لاعب.",
    },
    strengths: allEvaluations.flatMap((evaluation) => evaluation.strengths),
    development: allEvaluations.flatMap((evaluation) => evaluation.development),
  };
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function sameFinitePositive(left: number, right: number): boolean {
  return Number.isFinite(left) && left > 0 && Number.isFinite(right) && right > 0 && left === right;
}

/**
 * Checks whether two stored real-pose sessions have the declared technical and
 * capture context required for a cautious descriptive comparison. Compatibility
 * is not evidence that a camera protocol is scientifically validated.
 */
export function compareSessionCompatibility(
  a: EvaluationSessionInput,
  b: EvaluationSessionInput,
): SessionCompatibility {
  const reasons: string[] = [];
  const aHasPose = hasActualPose(a);
  const bHasPose = hasActualPose(b);
  if (!aHasPose) reasons.push("الجلسة الأولى لا تحتوي إطارات وضعية فعلية محفوظة.");
  if (!bHasPose) reasons.push("الجلسة الثانية لا تحتوي إطارات وضعية فعلية محفوظة.");
  if (a.playerId !== b.playerId) reasons.push("اللاعب مختلف بين الجلستين.");
  if (a.skill !== b.skill) reasons.push("المهارة المصرح بها مختلفة بين الجلستين.");

  const aContext = copyContext(a);
  const bContext = copyContext(b);
  if (!knownFoot(aContext.usedFoot) || !knownFoot(bContext.usedFoot)) {
    reasons.push("القدم المستخدمة غير معروفة في إحدى الجلستين.");
  } else if (aContext.usedFoot !== bContext.usedFoot) {
    reasons.push("القدم المستخدمة مختلفة بين الجلستين.");
  }

  if (aContext.phase !== bContext.phase) reasons.push("مرحلة القياس مختلفة بين الجلستين.");
  if (aContext.cameraView === "unknown" || bContext.cameraView === "unknown") {
    reasons.push("منظور الكاميرا غير معروف في إحدى الجلستين.");
  } else if (aContext.cameraView !== bContext.cameraView) {
    reasons.push("منظور الكاميرا مختلف بين الجلستين.");
  }
  if (aContext.staticCamera === null || bContext.staticCamera === null) {
    reasons.push("حالة ثبات الكاميرا غير معروفة في إحدى الجلستين.");
  } else if (aContext.staticCamera !== bContext.staticCamera) {
    reasons.push("حالة ثبات الكاميرا مختلفة بين الجلستين.");
  }
  if (!nonEmpty(aContext.protocolId) || !nonEmpty(bContext.protocolId)) {
    reasons.push("معرّف البروتوكول غير معروف في إحدى الجلستين.");
  } else if (aContext.protocolId !== bContext.protocolId) {
    reasons.push("معرّف البروتوكول مختلف بين الجلستين.");
  }
  if (aContext.conditionsNote !== bContext.conditionsNote) {
    reasons.push("الظروف المصرح بها مختلفة؛ لا يثبت ذلك تكافؤًا علميًا للبروتوكول.");
  }

  if (aHasPose && bHasPose) {
    if (a.pose.engine !== b.pose.engine) reasons.push("محرك الوضعية مختلف بين الجلستين.");
    if (a.pose.model !== b.pose.model) reasons.push("نموذج الوضعية مختلف بين الجلستين.");
    if (a.pose.modelVersion !== b.pose.modelVersion) reasons.push("إصدار نموذج الوضعية مختلف بين الجلستين.");
    if (!nonEmpty(a.pose.packageVersion) || !nonEmpty(b.pose.packageVersion)) {
      reasons.push("إصدار حزمة الوضعية غير معروف في إحدى الجلستين.");
    } else if (a.pose.packageVersion !== b.pose.packageVersion) {
      reasons.push("إصدار حزمة الوضعية مختلف بين الجلستين.");
    }
    if (!sameFinitePositive(a.pose.sampleFps, b.pose.sampleFps)) {
      reasons.push("معدل عينات الوضعية غير متطابق أو غير صالح.");
    }
    if (!sameFinitePositive(a.pose.confidenceThreshold, b.pose.confidenceThreshold)) {
      reasons.push("عتبة توافر المعالم غير متطابقة أو غير صالحة.");
    }
  }

  // Both sides of this function use the same immutable registry. Keeping this
  // explicit documents that method and unit are part of the compatibility
  // contract rather than a score or an inferred performance standard.
  const methodsAndUnitsKnown = INDICATOR_CATALOG.every((definition) =>
    definition.method === ANGLE_2D_METHOD && definition.unit === ANGLE_2D_UNIT,
  );
  if (!methodsAndUnitsKnown) {
    reasons.push("طريقة القياس أو وحدته غير معروفة في سجل المؤشرات.");
  }

  return { compatible: reasons.length === 0, reasons };
}
