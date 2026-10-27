import type { PoseJointKey, PoseResult } from "./pose";

export const EVALUATION_CATALOG_VERSION = "athlete-indicators-2d-v1" as const;
export type UsedFoot = "left" | "right" | "unknown";
export type CameraView = "side" | "front" | "oblique" | "unknown";
export type AnalysisContext = {
  usedFoot: UsedFoot;
  phase: "whole_clip_unsegmented";
  cameraView: CameraView;
  staticCamera: boolean | null;
  protocolId: string;
  conditionsNote: string;
};
export const EMPTY_ANALYSIS_CONTEXT: AnalysisContext = {
  usedFoot: "unknown",
  phase: "whole_clip_unsegmented",
  cameraView: "unknown",
  staticCamera: null,
  protocolId: "",
  conditionsNote: "",
};
export type EvaluationRule = {
  id: string;
  version: string;
  sourceUrl: string;
  description: string;
  skill: string;
  usedFoot: UsedFoot;
  phase: AnalysisContext["phase"];
  measurementMethod: string;
  unit: string;
  strengthRange?: [number, number];
  developmentRange?: [number, number];
};
export type IndicatorDefinition = {
  code: string;
  name: string;
  definition: string;
  skill: string;
  anatomicalSide: "left" | "right" | "not_applicable";
  phase: string;
  method: string;
  unit: string;
  validity: string[];
  supported: boolean;
  unsupportedReason?: string;
  jointKey?: PoseJointKey;
  rule: EvaluationRule | null;
  methodSourceUrl: string;
  version: string;
};
export type IndicatorMeasurement = {
  indicatorCode: string;
  name: string;
  value: number | null;
  unit: string;
  samples: number;
  validity: "valid" | "insufficient" | "unavailable";
  assessment: "unassessed" | "measurement_only" | "strength" | "development";
  reason: string;
  method: string;
  points: string[];
  sessionId: number;
  playerId: number;
  videoId: number | null;
  sessionDate: string;
  timeStart: number | null;
  timeEnd: number | null;
  usedFoot: UsedFoot;
  phase: string;
  rule: EvaluationRule | null;
};
export type EvaluationFinding = {
  id: string;
  classification: "strength" | "development";
  indicatorCode: string;
  title: string;
  explanation: string;
  measurement: IndicatorMeasurement;
};
export type SessionEvaluation = {
  catalogVersion: string;
  measurements: IndicatorMeasurement[];
  strengths: EvaluationFinding[];
  development: EvaluationFinding[];
  overall: { score: number | null; method: string | null; reason: string };
  context: AnalysisContext;
};
export type PlayerEvaluation = {
  sessionsCount: number;
  testedSkills: string[];
  lastEvaluationAt: string | null;
  overall: { score: number | null; method: string | null; reason: string };
  strengths: EvaluationFinding[];
  development: EvaluationFinding[];
};
export type EvaluationSessionInput = {
  id: number;
  playerId: number;
  videoId: number | null;
  skill: string;
  createdAt: string;
  isDemo: boolean;
  pose?: PoseResult | null;
  context?: AnalysisContext | null;
};
export type SessionCompatibility = { compatible: boolean; reasons: string[] };
export type NoteRevision = {
  text: string;
  requiredAction: string;
  /** Display name of the coach who saved this revision. */
  authorName: string;
  editedAt: string;
  /** Optional for revisions written before editor identity was recorded. */
  editedByUserId?: number | null;
};
export type ExercisePlan = {
  id: number;
  playerId: number;
  analysisId: number;
  developmentId: string;
  name: string;
  goal: string;
  steps: string[];
  tools: string;
  sets: number | null;
  repetitions: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  progression: string;
  reassessAt: string;
  reassessMethod: string;
  reassessIndicatorCode: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  reviewed: boolean;
};
export type ExercisePlanInput = Omit<
  ExercisePlan,
  "id" | "authorName" | "createdAt" | "updatedAt"
>;
