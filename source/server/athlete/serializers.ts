import type {
  AccessRequest,
  Analysis,
  AnalysisMetric,
  HistoryPoint,
  Note,
  PhysicalTest,
  Player,
  PlayerCard,
  SkillValue,
  Video,
  VideoSource,
} from "../../shared/athlete";
import {
  EMPTY_ANALYSIS_CONTEXT,
  type AnalysisContext,
  type ExercisePlan,
  type NoteRevision,
  type SessionEvaluation,
} from "../../shared/evaluation-types";
import { evaluateSession } from "../../shared/evaluation";
import {
  apparatusName,
  isGymnasticsCategoryId,
  isSportId,
  type SportId,
} from "../../shared/sports";
import type {
  EmergencyContact,
  HealthProfile,
  SensitiveGrant,
} from "../../shared/health";
import type { PhysicalAssessment } from "../../shared/physical-assessment";

const asDate = (value: unknown): string | null => {
  if (!value || (typeof value !== "string" && !(value instanceof Date)))
    return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function skillValues(value: unknown): SkillValue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as { name?: unknown; value?: unknown };
    return typeof candidate.name === "string" &&
      typeof candidate.value === "number"
      ? [{ name: candidate.name, value: candidate.value }]
      : [];
  });
}

function physicalTests(value: unknown): PhysicalTest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as {
      name?: unknown;
      value?: unknown;
      unit?: unknown;
    };
    return typeof candidate.name === "string" &&
      typeof candidate.value === "string" &&
      typeof candidate.unit === "string"
      ? [{ name: candidate.name, value: candidate.value, unit: candidate.unit }]
      : [];
  });
}

function normalizedContext(value: unknown): AnalysisContext {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return { ...EMPTY_ANALYSIS_CONTEXT };
  const raw = value as Partial<AnalysisContext>;
  return {
    usedFoot:
      raw.usedFoot === "left" || raw.usedFoot === "right"
        ? raw.usedFoot
        : "unknown",
    phase: "whole_clip_unsegmented",
    cameraView:
      raw.cameraView === "side" ||
      raw.cameraView === "front" ||
      raw.cameraView === "oblique"
        ? raw.cameraView
        : "unknown",
    staticCamera:
      typeof raw.staticCamera === "boolean" ? raw.staticCamera : null,
    protocolId: typeof raw.protocolId === "string" ? raw.protocolId : "",
    conditionsNote:
      typeof raw.conditionsNote === "string" ? raw.conditionsNote : "",
  };
}

function isActualPose(analysis: Record<string, unknown>): boolean {
  return (
    analysis.isDemo !== true &&
    Boolean(analysis.poseResult) &&
    typeof analysis.poseResult === "object" &&
    !Array.isArray(analysis.poseResult)
  );
}

/**
 * Simulations are never evaluated. For a historical actual pose without a saved
 * snapshot, derive the same evaluation using the recorded context (or explicit
 * unknown legacy context) without backfilling data.
 */
export function evaluationForActualAnalysis(
  analysis: Record<string, unknown>
): SessionEvaluation | undefined {
  if (!isActualPose(analysis)) return undefined;
  const saved = analysis.evaluationSnapshot;
  if (saved && typeof saved === "object" && !Array.isArray(saved))
    return saved as SessionEvaluation;
  return evaluateSession({
    id: Number(analysis.id),
    playerId: Number(analysis.playerId),
    videoId:
      analysis.videoId === null || analysis.videoId === undefined
        ? null
        : Number(analysis.videoId),
    skill: String(analysis.skill),
    createdAt: asDate(analysis.createdAt) ?? "",
    isDemo: false,
    pose: analysis.poseResult as NonNullable<Analysis["pose"]>,
    context: normalizedContext(analysis.context),
  });
}

export function historyPoints(value: unknown): HistoryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as {
      date?: unknown;
      label?: unknown;
      score?: unknown;
    };
    return typeof candidate.date === "string" &&
      typeof candidate.label === "string" &&
      typeof candidate.score === "number"
      ? [
          {
            date: candidate.date,
            label: candidate.label,
            score: candidate.score,
          },
        ]
      : [];
  });
}

function sportOf(player: Record<string, unknown>): SportId {
  const value = player.sport;
  return isSportId(value) ? value : "football";
}

function gymnasticsCategoryOf(
  player: Record<string, unknown>
): PlayerCard["gymnasticsCategory"] {
  const value = player.gymnasticsCategory;
  return isGymnasticsCategoryId(value) ? value : "";
}

export function serializePlayerCard(
  player: Record<string, unknown>,
  academyName: string,
  isDemo = false,
  evaluation?: PlayerCard["evaluation"]
): PlayerCard {
  return {
    id: Number(player.id),
    academyId: Number(player.academyId),
    sport: sportOf(player),
    gymnasticsCategory: gymnasticsCategoryOf(player),
    academyName,
    name: String(player.name),
    age: Number(player.age),
    nationality: String(player.nationality),
    position: String(player.position),
    foot: String(player.foot),
    height: Number(player.height),
    weight: Number(player.weight),
    region: String(player.region),
    photoKey: String(player.photoKey ?? ""),
    // Legacy raw values remain stored for compatibility, but are not a normalised
    // athletic measurement and must never be presented as one.
    overall: 0,
    improvement: 0,
    skills: skillValues(player.skills),
    discoverable: Boolean(player.discoverable),
    lastAnalysis: asDate(player.lastAnalysisAt),
    isDemo,
    demoArchived: Boolean(player.demoArchived),
    ...(evaluation ? { evaluation } : {}),
  };
}

export function serializePlayer(
  player: Record<string, unknown>,
  academyName: string,
  isDemo = false,
  evaluation?: PlayerCard["evaluation"]
): Player {
  return {
    ...serializePlayerCard(player, academyName, isDemo, evaluation),
    birthDate: String(player.birthDate ?? ""),
    jersey: Number(player.jersey),
    strengths: stringArray(player.strengths),
    weaknesses: stringArray(player.weaknesses),
    physicalTests: physicalTests(player.physicalTests),
    history: historyPoints(player.history),
  };
}

export type VideoAnalysisState = {
  latestAnalysisId: number;
  latestAnalysisMethod: "simulation" | "pose";
  analysisAt: unknown;
};

function videoSource(value: unknown): VideoSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  return typeof source.url === "string" &&
    typeof source.license === "string" &&
    typeof source.credit === "string" &&
    typeof source.description === "string"
    ? {
        url: source.url,
        license: source.license,
        credit: source.credit,
        description: source.description,
      }
    : null;
}

export function serializeVideo(
  video: Record<string, unknown>,
  savedAnalysis?: VideoAnalysisState
): Video {
  const analysisAt = savedAnalysis ? asDate(savedAnalysis.analysisAt) : null;
  const hasSavedPoseAnalysis =
    savedAnalysis?.latestAnalysisMethod === "pose" &&
    Number.isSafeInteger(savedAnalysis.latestAnalysisId) &&
    savedAnalysis.latestAnalysisId > 0 &&
    analysisAt !== null;
  return {
    id: Number(video.id),
    playerId: Number(video.playerId),
    title: String(video.title),
    skill: String(video.skill),
    recordedAt: asDate(video.recordedAt) ?? "",
    size: Number(video.size),
    mime: String(video.mime),
    createdAt: asDate(video.createdAt) ?? "",
    analysisStatus: hasSavedPoseAnalysis ? "completed" : "not_analyzed",
    latestAnalysisId: hasSavedPoseAnalysis
      ? savedAnalysis.latestAnalysisId
      : null,
    latestAnalysisMethod: hasSavedPoseAnalysis
      ? savedAnalysis.latestAnalysisMethod
      : null,
    analysisAt: hasSavedPoseAnalysis ? analysisAt : null,
    source: videoSource(video.source),
  };
}

export function serializeAnalysis(analysis: Record<string, unknown>): Analysis {
  const metrics = Array.isArray(analysis.metrics) ? analysis.metrics : [];
  const jointAngles = Array.isArray(analysis.jointAngles)
    ? analysis.jointAngles
    : [];
  const observations = Array.isArray(analysis.observations)
    ? analysis.observations
    : [];
  const exercises = Array.isArray(analysis.exercises) ? analysis.exercises : [];
  const actual = isActualPose(analysis);
  const evaluation = evaluationForActualAnalysis(analysis);
  return {
    id: Number(analysis.id),
    playerId: Number(analysis.playerId),
    videoId:
      analysis.videoId === null || analysis.videoId === undefined
        ? null
        : Number(analysis.videoId),
    skill: String(analysis.skill),
    createdAt: asDate(analysis.createdAt) ?? "",
    isDemo: Boolean(analysis.isDemo),
    method: actual ? "pose" : analysis.isDemo ? "simulation" : undefined,
    pose: actual ? (analysis.poseResult as Analysis["pose"]) : null,
    // Stored historical numbers have no published normalisation and are hidden.
    score: null,
    context: actual ? normalizedContext(analysis.context) : null,
    ...(evaluation ? { evaluation } : {}),
    metrics: metrics as AnalysisMetric[],
    jointAngles: jointAngles as Analysis["jointAngles"],
    observations: observations as Analysis["observations"],
    exercises: exercises as Analysis["exercises"],
  };
}

export function serializeAccessRequest(
  request: Record<string, unknown>,
  playerName: string,
  academyName: string,
  clubName: string
): AccessRequest {
  return {
    id: Number(request.id),
    playerId: Number(request.playerId),
    playerName,
    academyId: Number(request.academyId),
    academyName,
    clubId: Number(request.clubId),
    clubName,
    status: request.status as AccessRequest["status"],
    message: String(request.message ?? ""),
    reason:
      request.reason === null || request.reason === undefined
        ? null
        : String(request.reason),
    createdAt: asDate(request.createdAt) ?? "",
    updatedAt: asDate(request.updatedAt) ?? "",
  };
}

function noteRevisions(value: unknown): NoteRevision[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const revision = item as Partial<NoteRevision>;
    if (
      typeof revision.text !== "string" ||
      typeof revision.requiredAction !== "string" ||
      typeof revision.authorName !== "string" ||
      typeof revision.editedAt !== "string"
    )
      return [];
    return [
      {
        text: revision.text,
        requiredAction: revision.requiredAction,
        authorName: revision.authorName,
        editedAt: revision.editedAt,
        editedByUserId:
          typeof revision.editedByUserId === "number"
            ? revision.editedByUserId
            : null,
      },
    ];
  });
}

export function serializeNote(
  note: Record<string, unknown>,
  playerName: string
): Note {
  return {
    id: Number(note.id),
    playerId: Number(note.playerId),
    playerName,
    text: String(note.text),
    createdAt: asDate(note.createdAt) ?? "",
    analysisId:
      note.analysisId === null || note.analysisId === undefined
        ? null
        : Number(note.analysisId),
    source: note.source === "automatic" ? "automatic" : "coach",
    authorName: String(note.authorName ?? "سجل تاريخي غير منسوب"),
    requiredAction: String(note.requiredAction ?? ""),
    visibility: note.visibility === "shared" ? "shared" : "academy_internal",
    originalText: String(note.originalText ?? note.text ?? ""),
    updatedAt: asDate(note.updatedAt) ?? asDate(note.createdAt) ?? "",
    lastEditedByName: String(note.lastEditedByName ?? ""),
    lastEditedByUserId:
      typeof note.lastEditedByUserId === "number"
        ? note.lastEditedByUserId
        : null,
    revisions: noteRevisions(note.revisions),
  };
}

export function serializeExercisePlan(
  plan: Record<string, unknown>
): ExercisePlan {
  return {
    id: Number(plan.id),
    playerId: Number(plan.playerId),
    analysisId: Number(plan.analysisId),
    developmentId: String(plan.developmentId),
    name: String(plan.name),
    goal: String(plan.goal),
    steps: stringArray(plan.steps),
    tools: String(plan.tools),
    sets: typeof plan.sets === "number" ? plan.sets : null,
    repetitions: typeof plan.repetitions === "number" ? plan.repetitions : null,
    durationSeconds:
      typeof plan.durationSeconds === "number" ? plan.durationSeconds : null,
    restSeconds: typeof plan.restSeconds === "number" ? plan.restSeconds : null,
    progression: String(plan.progression),
    reassessAt: String(plan.reassessAt),
    reassessMethod: String(plan.reassessMethod),
    reassessIndicatorCode: String(plan.reassessIndicatorCode),
    authorName: String(plan.authorName),
    createdAt: asDate(plan.createdAt) ?? "",
    updatedAt: asDate(plan.updatedAt) ?? asDate(plan.createdAt) ?? "",
    reviewed: Boolean(plan.reviewed),
  };
}

export function serializeHealthProfile(
  row: Record<string, unknown>
): HealthProfile {
  return {
    playerId: Number(row.playerId),
    previousInjuries: String(row.previousInjuries ?? ""),
    currentMedications: String(row.currentMedications ?? ""),
    physiotherapy: String(row.physiotherapy ?? ""),
    otherNotes: String(row.otherNotes ?? ""),
    updatedByName: String(row.updatedByName ?? ""),
    updatedAt: asDate(row.updatedAt) ?? "",
    createdAt: asDate(row.createdAt) ?? "",
  };
}

export function serializeEmergencyContact(
  row: Record<string, unknown>
): EmergencyContact {
  return {
    playerId: Number(row.playerId),
    contactName: String(row.contactName ?? ""),
    relationship: String(row.relationship ?? ""),
    phone: String(row.phone ?? ""),
    alternatePhone: String(row.alternatePhone ?? ""),
    notes: String(row.notes ?? ""),
    updatedByName: String(row.updatedByName ?? ""),
    updatedAt: asDate(row.updatedAt) ?? "",
    createdAt: asDate(row.createdAt) ?? "",
  };
}

export function serializeSensitiveGrant(
  row: Record<string, unknown>,
  organizationName: string,
  organizationType: "academy" | "club"
): SensitiveGrant {
  return {
    id: Number(row.id),
    playerId: Number(row.playerId),
    organizationId: Number(row.organizationId),
    organizationName,
    organizationType,
    scope: row.scope === "emergency" ? "emergency" : "health",
    active: Boolean(row.active),
    grantedAt: asDate(row.grantedAt) ?? "",
    revokedAt: asDate(row.revokedAt),
  };
}

export function serializePhysicalAssessment(
  row: Record<string, unknown>
): PhysicalAssessment {
  const apparatus = String(row.apparatus ?? "");
  const sport = isSportId(row.sport) ? row.sport : "football";
  return {
    id: Number(row.id),
    playerId: Number(row.playerId),
    sport,
    apparatus,
    apparatusName: apparatus ? apparatusName(apparatus) : "",
    skill: String(row.skill ?? ""),
    indicatorCode: String(row.indicatorCode ?? ""),
    indicatorLabel: String(row.indicatorLabel ?? ""),
    indicatorGroup: String(row.indicatorGroup ?? ""),
    indicatorVersion: String(row.indicatorVersion ?? ""),
    value: Number(row.value),
    unit: String(row.unit ?? ""),
    note: String(row.note ?? ""),
    // Always provisional: the API never exposes a stored criterion claim.
    criterionStatus: "provisional_unvalidated",
    sessionKey: String(row.sessionKey ?? ""),
    recordedAt: asDate(row.recordedAt) ?? "",
    authorName: String(row.authorName ?? ""),
    createdAt: asDate(row.createdAt) ?? "",
  };
}
