export type OrganizationType = "academy" | "club";
export type Membership = {
  organizationId: number;
  name: string;
  type: OrganizationType;
  role: "owner" | "staff";
  region: string;
  isDemo: boolean;
};
export type Session = {
  user: { id: number; name: string | null; email: string | null } | null;
  memberships: Membership[];
  mode?: "member" | "demo";
  demoToken?: string;
};
export const SKILLS = [
  "التسديد",
  "المراوغة",
  "التمرير",
  "السرعة",
  "القوة البدنية",
  "التحكم بالكرة",
  "القفز",
  "اتخاذ القرار",
] as const;
export const POSITIONS = [
  "مهاجم",
  "وسط",
  "مدافع",
  "جناح",
  "حارس مرمى",
] as const;
export type SkillValue = { name: string; value: number };
export type HistoryPoint = { date: string; label: string; score: number };
export type PlayerCard = {
  id: number;
  academyId: number;
  academyName: string;
  name: string;
  age: number;
  nationality: string;
  position: string;
  foot: string;
  height: number;
  weight: number;
  region: string;
  photoKey: string;
  overall: number;
  improvement: number;
  skills: SkillValue[];
  discoverable: boolean;
  lastAnalysis: string | null;
  isDemo?: boolean;
  evaluation?: import("./evaluation-types").PlayerEvaluation;
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
  age: number;
  nationality: string;
  position: string;
  foot: string;
  height: number;
  weight: number;
  birthDate: string;
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
  comparisonHistory?: HistoryPoint[];
  isDemo: true;
};
export const DEMO_LABEL = "بيانات تجريبية — ليست تحليل ذكاء اصطناعي فعلي";
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

export const PLAYER_LIMITS = {
  age: { min: 5, max: 40 },
  height: { min: 80, max: 240 },
  weight: { min: 20, max: 200 },
  jersey: { min: 0, max: 999 },
} as const;
