import { FOOTBALL_POSITIONS, FOOTBALL_SKILLS } from "./sports/football";
import type { GymnasticsCategoryId, SportId } from "./sports/types";

export type OrganizationType = "academy" | "club";
export type Membership = {
  organizationId: number;
  name: string;
  type: OrganizationType;
  role: "owner" | "staff";
  region: string;
  isDemo: boolean;
  /** Sports the organization is configured to operate. */
  sports: SportId[];
};
export type Session = {
  user: { id: number; name: string | null; email: string | null } | null;
  memberships: Membership[];
  mode?: "member" | "demo";
  demoToken?: string;
};
/**
 * Backwards-compatible football vocabulary. Sport-aware screens read the
 * selected sport's configuration instead of these constants.
 */
export const SKILLS = FOOTBALL_SKILLS;
export const POSITIONS = FOOTBALL_POSITIONS;
export type SkillValue = { name: string; value: number };
export type HistoryPoint = { date: string; label: string; score: number };
export type PlayerCard = {
  id: number;
  academyId: number;
  sport: SportId;
  /** Empty for sports without artistic categories. */
  gymnasticsCategory: GymnasticsCategoryId | "";
  /** Empty/omitted for football; server-validated against a gymnastics category. */
  primaryApparatus?: string;
  academyName: string;
  name: string;
  age: number;
  nationality: string;
  position: string;
  foot: string;
  height: number;
  weight: number;
  region: string;
  /** Empty when the academy has not recorded this historical date. */
  academyJoinDate?: string;
  photoKey: string;
  overall: number;
  improvement: number;
  skills: SkillValue[];
  discoverable: boolean;
  lastAnalysis: string | null;
  isDemo?: boolean;
  /** Server-issued only; never accepted from public player input. */
  demoProfileKey?: string;
  /** Saved-assessment-derived display metadata for fictitious demo profiles only. */
  demoDisplay?: import("./demo-display").DemoDisplay;
  evaluation?: import("./evaluation-types").PlayerEvaluation;
  coachAssessment?: import("./coaching").CoachAssessmentSummary;
  demoArchived?: boolean;
};
export type PhysicalTest = { name: string; value: string; unit: string };
export type Player = PlayerCard & {
  birthDate: string;
  jersey: number;
  strengths: string[];
  weaknesses: string[];
  physicalTests: PhysicalTest[];
  history: HistoryPoint[];
};
export type PlayerInput = {
  name: string;
  sport: SportId;
  gymnasticsCategory?: GymnasticsCategoryId | "";
  /** Editable only for gymnastics and constrained to the selected category. */
  primaryApparatus?: string;
  age: number;
  nationality: string;
  position: string;
  foot: string;
  height: number;
  weight: number;
  birthDate: string;
  academyJoinDate?: string;
  jersey: number;
  region: string;
  discoverable: boolean;
  strengths?: string[];
  weaknesses?: string[];
  skills?: SkillValue[];
  physicalTests?: PhysicalTest[];
};
export type AccessRequest = {
  id: number;
  playerId: number;
  playerName: string;
  academyId: number;
  academyName: string;
  clubId: number;
  clubName: string;
  status: "pending" | "approved" | "rejected" | "revoked";
  message: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};
export type VideoSource = {
  url: string;
  license: string;
  credit: string;
  description: string;
};
export type Video = {
  id: number;
  playerId: number;
  title: string;
  skill: string;
  recordedAt: string;
  size: number;
  mime: string;
  createdAt: string;
  analysisStatus?: "not_analyzed" | "completed";
  latestAnalysisId?: number | null;
  latestAnalysisMethod?: "simulation" | "pose" | null;
  analysisAt?: string | null;
  source?: VideoSource | null;
  /** Optional verified demo-media metadata; uploads cannot set either field. */
  durationSeconds?: number | null;
  posterKey?: string | null;
};
export type AnalysisMetric = {
  name: string;
  value: number;
  unit: string;
  rating: string;
};
export type Analysis = {
  id: number;
  playerId: number;
  videoId: number | null;
  skill: string;
  createdAt: string;
  isDemo: boolean;
  method?: "simulation" | "pose";
  pose?: import("./pose").PoseResult | null;
  score: number | null;
  context?: import("./evaluation-types").AnalysisContext | null;
  evaluation?: import("./evaluation-types").SessionEvaluation;
  metrics: AnalysisMetric[];
  jointAngles: { name: string; angle: number }[];
  observations: {
    type: "good" | "warning" | "info";
    title: string;
    detail: string;
  }[];
  exercises: { title: string; description: string }[];
};
export type Note = {
  id: number;
  playerId: number;
  playerName: string;
  text: string;
  createdAt: string;
  analysisId?: number | null;
  source?: "automatic" | "coach";
  authorName?: string;
  requiredAction?: string;
  visibility?: "academy_internal" | "shared";
  originalText?: string;
  updatedAt?: string;
  /** Latest editor only; the author attribution above is never overwritten. */
  lastEditedByName?: string;
  lastEditedByUserId?: number | null;
  revisions?: import("./evaluation-types").NoteRevision[];
};
export type Report = {
  player: Player;
  from: string;
  to: string;
  skill: string;
  analyses: Analysis[];
  videos: Video[];
  notes: Note[];
  coachAssessments?: import("./coaching").CoachAssessment[];
  comparisonHistory?: HistoryPoint[];
  isDemo: boolean;
};
export const DEMO_LABEL = "بيانات تجريبية — ليست تحليل ذكاء اصطناعي فعلي";
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

export const PLAYER_LIMITS = {
  age: { min: 5, max: 40 },
  height: { min: 80, max: 240 },
  weight: { min: 20, max: 200 },
  jersey: { min: 0, max: 999 },
} as const;
