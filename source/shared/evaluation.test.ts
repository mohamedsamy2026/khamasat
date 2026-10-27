import { describe, expect, it } from "vitest";

import {
  ANGLE_2D_METHOD,
  ANGLE_2D_UNIT,
  INDICATOR_CATALOG,
  classifyMeasurement,
  compareSessionCompatibility,
  evaluateSession,
  summarizePlayerEvaluation,
} from "./evaluation";
import type {
  AnalysisContext,
  EvaluationRule,
  EvaluationSessionInput,
  IndicatorMeasurement,
} from "./evaluation-types";
import {
  POSE_ENGINE,
  POSE_MODEL,
  POSE_MODEL_VERSION,
  type PoseLandmark,
  type PoseResult,
} from "./pose";

const point = (x: number, y: number, confidence = 1): PoseLandmark => ({
  x,
  y,
  visibility: confidence,
  presence: confidence,
});

function landmarksForLeftElbow(angle: "right" | "straight" = "right"): PoseLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => point(0, 0, 0));
  if (angle === "right") {
    landmarks[11] = point(0.2, 0.2);
    landmarks[13] = point(0.2, 0.5);
    landmarks[15] = point(0.5, 0.5);
  } else {
    landmarks[11] = point(0.1, 0.5);
    landmarks[13] = point(0.5, 0.5);
    landmarks[15] = point(0.9, 0.5);
  }
  return landmarks;
}

function poseWithLeftElbow(
  frames: PoseResult["frames"],
  overrides: Partial<PoseResult> = {},
): PoseResult {
  return {
    engine: POSE_ENGINE,
    model: POSE_MODEL,
    modelVersion: POSE_MODEL_VERSION,
    packageVersion: "@mediapipe/tasks-vision@1.1.1",
    duration: 1,
    videoWidth: 1280,
    videoHeight: 720,
    sampleFps: 5,
    confidenceThreshold: 0.6,
    totalFrames: frames.length,
    detectedFrames: frames.length,
    frames,
    joints: [],
    limitations: [],
    ...overrides,
  };
}

const comparableContext: AnalysisContext = {
  usedFoot: "right",
  phase: "whole_clip_unsegmented",
  cameraView: "side",
  staticCamera: true,
  protocolId: "shooting-side-v1",
  conditionsNote: "نفس مسافة الكاميرا المعلنة",
};

function session(
  overrides: Partial<EvaluationSessionInput> = {},
): EvaluationSessionInput {
  const frames: PoseResult["frames"] = [
    { timestamp: 0.1, landmarks: landmarksForLeftElbow("right"), angles: { left_elbow: 90 } },
    { timestamp: 0.5, landmarks: landmarksForLeftElbow("straight"), angles: { left_elbow: 180 } },
  ];
  return {
    id: 71,
    playerId: 8,
    videoId: 19,
    skill: "التسديد",
    createdAt: "2026-10-26T04:00:00.000Z",
    isDemo: false,
    pose: poseWithLeftElbow(frames),
    context: comparableContext,
    ...overrides,
  };
}

function measurement(
  overrides: Partial<IndicatorMeasurement> = {},
): IndicatorMeasurement {
  return {
    indicatorCode: "fixture.angle",
    name: "قياس fixture",
    value: 90,
    unit: ANGLE_2D_UNIT,
    samples: 2,
    validity: "valid",
    assessment: "measurement_only",
    reason: "fixture",
    method: ANGLE_2D_METHOD,
    points: ["11", "13", "15"],
    sessionId: 71,
    playerId: 8,
    videoId: 19,
    sessionDate: "2026-10-26T04:00:00.000Z",
    timeStart: 0.1,
    timeEnd: 0.5,
    usedFoot: "right",
    phase: "whole_clip_unsegmented",
    rule: null,
    ...overrides,
  };
}

function fixtureRule(overrides: Partial<EvaluationRule> = {}): EvaluationRule {
  return {
    id: "fixture-rule",
    version: "fixture-v1",
    sourceUrl: "https://example.test/fixture-rule",
    description: "قاعدة اختبار محلية مطابقة للعقد، وليست قاعدة إنتاج.",
    skill: "التسديد",
    usedFoot: "right",
    phase: "whole_clip_unsegmented",
    measurementMethod: ANGLE_2D_METHOD,
    unit: ANGLE_2D_UNIT,
    strengthRange: [80, 100],
    ...overrides,
  };
}

describe("INDICATOR_CATALOG", () => {
  it("contains exactly the eight actual pose joints with no production norms", () => {
    expect(INDICATOR_CATALOG).toHaveLength(8);
    expect(INDICATOR_CATALOG.map((indicator) => indicator.code)).toEqual([
      "joint.left_elbow.angle2d",
      "joint.right_elbow.angle2d",
      "joint.left_knee.angle2d",
      "joint.right_knee.angle2d",
      "joint.left_shoulder.angle2d",
      "joint.right_shoulder.angle2d",
      "joint.left_hip.angle2d",
      "joint.right_hip.angle2d",
    ]);
    expect(INDICATOR_CATALOG.find((indicator) => indicator.code === "joint.left_knee.angle2d")?.definition)
      .toContain("23 / 25 / 27");
    expect(INDICATOR_CATALOG.every((indicator) => indicator.rule === null)).toBe(true);
  });
});

describe("evaluateSession", () => {
  it("uses verified stored frame angles as descriptive mean/range data, not a score", () => {
    const result = evaluateSession(session());
    const elbow = result.measurements.find((item) => item.indicatorCode === "joint.left_elbow.angle2d");

    expect(elbow).toMatchObject({
      value: 135,
      unit: "°",
      samples: 2,
      validity: "valid",
      assessment: "measurement_only",
      points: ["11", "13", "15"],
      timeStart: 0.1,
      timeEnd: 0.5,
      usedFoot: "right",
      phase: "whole_clip_unsegmented",
      rule: null,
    });
    expect(elbow?.reason).toContain("90.00°–180.00°");
    expect(result.measurements).toHaveLength(8);
    expect(result.strengths).toEqual([]);
    expect(result.development).toEqual([]);
    expect(result.overall.score).toBeNull();
    expect(result.overall.method).toBeNull();
  });

  it("does not create an angle when landmarks are missing or a persisted angle fails geometry", () => {
    const missingLandmarks = landmarksForLeftElbow();
    missingLandmarks[13] = point(0.2, 0.5, 0.59);
    const missingResult = evaluateSession(session({
      pose: poseWithLeftElbow([
        { timestamp: 0.1, landmarks: missingLandmarks, angles: { left_elbow: 90 } },
      ]),
    }));
    const missing = missingResult.measurements.find((item) => item.indicatorCode === "joint.left_elbow.angle2d");
    expect(missing).toMatchObject({ value: null, samples: 0, validity: "unavailable", assessment: "unassessed" });

    const inconsistentResult = evaluateSession(session({
      pose: poseWithLeftElbow([
        { timestamp: 0.1, landmarks: landmarksForLeftElbow(), angles: { left_elbow: 100 } },
      ]),
    }));
    const inconsistent = inconsistentResult.measurements.find((item) => item.indicatorCode === "joint.left_elbow.angle2d");
    expect(inconsistent).toMatchObject({ value: null, samples: 0, validity: "unavailable", assessment: "unassessed" });
  });

  it("keeps every measurement unavailable when no real pose is attached", () => {
    const result = evaluateSession(session({ pose: null }));
    expect(result.measurements.every((item) => (
      item.value === null
      && item.samples === 0
      && item.validity === "unavailable"
      && item.assessment === "unassessed"
      && item.timeStart === null
      && item.timeEnd === null
    ))).toBe(true);
  });

  it("does not treat a demo or simulation row as an actual pose session", () => {
    const result = evaluateSession(session({ isDemo: true }));
    expect(result.measurements.every((item) => (
      item.value === null && item.samples === 0 && item.assessment === "unassessed"
    ))).toBe(true);
  });
});

describe("classifyMeasurement", () => {
  it("accepts only a fully matching local fixture rule", () => {
    const localRule = fixtureRule();
    expect(classifyMeasurement(measurement({ rule: localRule }), "التسديد")).toBe("strength");
    expect(classifyMeasurement(measurement({ rule: localRule, usedFoot: "unknown" }), "التسديد"))
      .toBe("unassessed");
  });

  it("returns measurement_only without a norm and rejects conflicting ranges", () => {
    expect(classifyMeasurement(measurement(), "التسديد")).toBe("measurement_only");
    const conflictingRule = fixtureRule({
      strengthRange: [80, 100],
      developmentRange: [90, 110],
    });
    expect(classifyMeasurement(measurement({ rule: conflictingRule }), "التسديد")).toBe("unassessed");
  });
});

describe("player summary and session compatibility", () => {
  it("counts unique actual-pose sessions and leaves the player score absent", () => {
    const actual = session();
    const result = summarizePlayerEvaluation([
      actual,
      { ...actual, createdAt: "2026-10-27T04:00:00.000Z" },
      session({ id: 72, skill: "التمرير", pose: null }),
    ]);

    expect(result).toMatchObject({
      sessionsCount: 1,
      testedSkills: ["التسديد"],
      lastEvaluationAt: "2026-10-26T04:00:00.000Z",
      overall: { score: null, method: null },
      strengths: [],
      development: [],
    });
  });

  it("blocks comparisons with an unknown foot or different declared conditions", () => {
    const first = session();
    const compatible = compareSessionCompatibility(first, session({ id: 73 }));
    expect(compatible).toEqual({ compatible: true, reasons: [] });

    const unknownFoot = compareSessionCompatibility(first, session({
      id: 74,
      context: { ...comparableContext, usedFoot: "unknown" },
    }));
    expect(unknownFoot.compatible).toBe(false);
    expect(unknownFoot.reasons.join(" ")).toContain("القدم المستخدمة غير معروفة");

    const changedConditions = compareSessionCompatibility(first, session({
      id: 75,
      context: { ...comparableContext, conditionsNote: "ملاحظة ظروف مختلفة" },
    }));
    expect(changedConditions.compatible).toBe(false);
    expect(changedConditions.reasons.join(" ")).toContain("الظروف المصرح بها مختلفة");
  });
});
