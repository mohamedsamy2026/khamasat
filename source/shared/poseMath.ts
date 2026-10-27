import type { PoseJointKey, PoseJointSummary, PoseLandmark } from "./pose";

/** A three-point joint definition using MediaPipe Pose landmark indices. */
export type PoseJointDefinition = {
  key: PoseJointKey;
  label: string;
  indices: readonly [start: number, vertex: number, end: number];
};

/**
 * Joints whose angles are measured. Labels are intentionally user-facing Arabic
 * while indices remain the unmodified MediaPipe Pose (33-landmark) indices.
 */
export const POSE_JOINTS: readonly PoseJointDefinition[] = [
  { key: "left_elbow", label: "المرفق الأيسر", indices: [11, 13, 15] },
  { key: "right_elbow", label: "المرفق الأيمن", indices: [12, 14, 16] },
  { key: "left_knee", label: "الركبة اليسرى", indices: [23, 25, 27] },
  { key: "right_knee", label: "الركبة اليمنى", indices: [24, 26, 28] },
  { key: "left_shoulder", label: "الكتف الأيسر", indices: [13, 11, 23] },
  { key: "right_shoulder", label: "الكتف الأيمن", indices: [14, 12, 24] },
  { key: "left_hip", label: "الورك الأيسر", indices: [11, 23, 25] },
  { key: "right_hip", label: "الورك الأيمن", indices: [12, 24, 26] },
];

/**
 * Static MediaPipe Pose skeleton connections for reproducible canvas overlays.
 * Values are landmark indices, not screen coordinates.
 */
export const BODY_CONNECTIONS: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29], [27, 31], [29, 31],
  [24, 26], [26, 28], [28, 30], [28, 32], [30, 32],
];

/** A landmark shape accepted by the pure geometry functions. */
export type AngleLandmark = Pick<PoseLandmark, "x" | "y" | "visibility"> & {
  /** MediaPipe only emits this for models that support a presence score. */
  presence?: number;
};

const DEGREES_PER_RADIAN = 180 / Math.PI;
const DEGENERATE_DISTANCE_PX = 1e-6;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function inImage(point: AngleLandmark): boolean {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function isConfident(point: AngleLandmark, minimumConfidence: number): boolean {
  const presence = typeof point.presence === "number" ? point.presence : point.visibility;
  return finite(point.visibility)
    && finite(presence)
    && point.visibility >= minimumConfidence
    && presence >= minimumConfidence;
}

/** Rounds a stored measurement while preserving nullability for unavailable data. */
export function roundMeasurement(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/**
 * Measures the angle ABC in image pixels, correcting normalized x/y coordinates
 * for the decoded video's aspect ratio. It never invents a value: incomplete,
 * low-confidence, out-of-image, non-finite, and degenerate triplets are null.
 */
export function angle2D(
  a: AngleLandmark | undefined,
  b: AngleLandmark | undefined,
  c: AngleLandmark | undefined,
  videoWidth: number,
  videoHeight: number,
  minimumConfidence = 0.6,
): number | null {
  if (!a || !b || !c || !finite(videoWidth) || !finite(videoHeight) || videoWidth <= 0 || videoHeight <= 0) {
    return null;
  }
  if (!finite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
    return null;
  }
  if (![a, b, c].every((point) => finite(point.x) && finite(point.y) && inImage(point) && isConfident(point, minimumConfidence))) {
    return null;
  }

  const abX = (a.x - b.x) * videoWidth;
  const abY = (a.y - b.y) * videoHeight;
  const cbX = (c.x - b.x) * videoWidth;
  const cbY = (c.y - b.y) * videoHeight;
  const abLength = Math.hypot(abX, abY);
  const cbLength = Math.hypot(cbX, cbY);

  if (!finite(abLength) || !finite(cbLength) || abLength <= DEGENERATE_DISTANCE_PX || cbLength <= DEGENERATE_DISTANCE_PX) {
    return null;
  }

  const cosine = (abX * cbX + abY * cbY) / (abLength * cbLength);
  if (!finite(cosine)) return null;

  // Rounding may put an otherwise valid cosine microscopically outside [-1, 1].
  const degrees = Math.acos(Math.max(-1, Math.min(1, cosine))) * DEGREES_PER_RADIAN;
  return finite(degrees) && degrees >= 0 && degrees <= 180 ? degrees : null;
}

/** Measures every configured joint using the raw, unrounded detector landmarks. */
export function measureFrameAngles(
  landmarks: readonly AngleLandmark[],
  videoWidth: number,
  videoHeight: number,
  minimumConfidence = 0.6,
): Partial<Record<PoseJointKey, number>> {
  const angles: Partial<Record<PoseJointKey, number>> = {};

  for (const joint of POSE_JOINTS) {
    const [start, vertex, end] = joint.indices;
    const angle = angle2D(landmarks[start], landmarks[vertex], landmarks[end], videoWidth, videoHeight, minimumConfidence);
    if (angle !== null) angles[joint.key] = roundMeasurement(angle, 2);
  }

  return angles;
}

/**
 * Produces stable summaries for every supported joint. Unknown object keys,
 * nullish values, and out-of-range/non-finite values are deliberately ignored.
 */
export function summarizeJointAngles(
  frames: readonly { angles: Partial<Record<PoseJointKey, number>> }[],
): PoseJointSummary[] {
  return POSE_JOINTS.map((joint) => {
    const values = frames
      .map((frame) => frame.angles[joint.key])
      .filter((value): value is number => typeof value === "number" && finite(value) && value >= 0 && value <= 180);

    if (values.length === 0) {
      return { key: joint.key, label: joint.label, samples: 0, min: null, max: null, mean: null };
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      key: joint.key,
      label: joint.label,
      samples: values.length,
      min: roundMeasurement(Math.min(...values), 2),
      max: roundMeasurement(Math.max(...values), 2),
      mean: roundMeasurement(total / values.length, 2),
    };
  });
}
