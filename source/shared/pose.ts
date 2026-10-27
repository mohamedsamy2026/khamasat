export const POSE_ENGINE = "MediaPipe Pose Landmarker" as const;
export const POSE_MODEL = "pose_landmarker_lite" as const;
export const POSE_MODEL_VERSION = "lite-float16-v1" as const;
export const MAX_POSE_SECONDS = 60;
export const POSE_SAMPLE_FPS = 5;
export const POSE_MIN_CONFIDENCE = 0.6;

export type PoseJointKey =
  | "left_elbow"
  | "right_elbow"
  | "left_knee"
  | "right_knee"
  | "left_shoulder"
  | "right_shoulder"
  | "left_hip"
  | "right_hip";
export type PoseLandmark = {
  x: number;
  y: number;
  visibility: number;
  presence: number;
};
export type PoseFrame = {
  timestamp: number;
  landmarks: PoseLandmark[];
  angles: Partial<Record<PoseJointKey, number>>;
};
export type PoseJointSummary = {
  key: PoseJointKey;
  label: string;
  samples: number;
  min: number | null;
  max: number | null;
  mean: number | null;
};
export type PoseResult = {
  engine: typeof POSE_ENGINE;
  model: typeof POSE_MODEL;
  modelVersion: typeof POSE_MODEL_VERSION;
  packageVersion: string;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  sampleFps: number;
  confidenceThreshold: number;
  totalFrames: number;
  detectedFrames: number;
  frames: PoseFrame[];
  joints: PoseJointSummary[];
  limitations: string[];
};
export type PoseProgress = {
  phase: "loading" | "decoding" | "analyzing";
  current: number;
  total: number;
  message: string;
};
