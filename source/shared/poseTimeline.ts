import type { PoseJointKey, PoseResult } from "./pose";

export type AngleSample = { time: number; angle: number | null };

/** Missing observations remain gaps; no interpolation or model-independent values. */
export function angleTimeline(
  pose: PoseResult,
  key: PoseJointKey
): AngleSample[] {
  const result: AngleSample[] = [];
  const interval = 1 / Math.max(1, pose.sampleFps);
  for (const frame of pose.frames) {
    const previous = result[result.length - 1];
    if (previous && frame.timestamp - previous.time > interval * 1.5) {
      result.push({ time: (previous.time + frame.timestamp) / 2, angle: null });
    } else if (!previous && frame.timestamp > interval * 1.5) {
      result.push({ time: 0, angle: null });
    }
    const value = frame.angles[key];
    result.push({
      time: frame.timestamp,
      angle:
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 180
          ? value
          : null,
    });
  }
  const last = result[result.length - 1];
  if (last && pose.duration - last.time > interval * 1.5) {
    result.push({ time: pose.duration, angle: null });
  }
  return result;
}

export function angleAtTime(
  pose: PoseResult,
  key: PoseJointKey,
  time: number
): number | null {
  let nearest = pose.frames[0];
  for (const frame of pose.frames) {
    if (
      !nearest ||
      Math.abs(frame.timestamp - time) < Math.abs(nearest.timestamp - time)
    )
      nearest = frame;
  }
  if (
    !nearest ||
    Math.abs(nearest.timestamp - time) > 1 / Math.max(1, pose.sampleFps) + 0.05
  )
    return null;
  const value = nearest.angles[key];
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 180
    ? value
    : null;
}
