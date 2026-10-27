import { describe, expect, it } from "vitest";
import type { PoseResult } from "./pose";
import { angleAtTime, angleTimeline } from "./poseTimeline";

function sample(frames: PoseResult["frames"]): PoseResult {
  return {
    engine: "MediaPipe Pose Landmarker",
    model: "pose_landmarker_lite",
    modelVersion: "lite-float16-v1",
    packageVersion: "test",
    duration: 1,
    videoWidth: 960,
    videoHeight: 540,
    sampleFps: 5,
    confidenceThreshold: 0.6,
    totalFrames: frames.length,
    detectedFrames: frames.length,
    frames,
    joints: [],
    limitations: [],
  };
}
describe("stored pose time-series without fabricated data", () => {
  it("uses the angle of each frame rather than a fixed value", () => {
    const pose = sample([
      { timestamp: 0, landmarks: [], angles: { left_knee: 90 } },
      { timestamp: 0.2, landmarks: [], angles: { left_knee: 130 } },
    ]);
    expect(angleTimeline(pose, "left_knee").slice(0, 2)).toEqual([
      { time: 0, angle: 90 },
      { time: 0.2, angle: 130 },
    ]);
  });
  it("does not fill a missing angle", () => {
    expect(
      angleTimeline(
        sample([{ timestamp: 0, landmarks: [], angles: {} }]),
        "left_knee"
      )[0].angle
    ).toBeNull();
  });
  it("inserts gaps for absent frames", () => {
    const pose = sample([
      { timestamp: 0, landmarks: [], angles: { left_knee: 90 } },
      { timestamp: 0.8, landmarks: [], angles: { left_knee: 130 } },
    ]);
    expect(angleTimeline(pose, "left_knee")[1]).toEqual({
      time: 0.4,
      angle: null,
    });
    expect(angleAtTime(pose, "left_knee", 0.4)).toBeNull();
  });
  it("returns unavailable at an invalid or absent observation", () => {
    expect(angleAtTime(sample([]), "left_knee", 0)).toBeNull();
    expect(
      angleTimeline(
        sample([{ timestamp: 0, landmarks: [], angles: { left_knee: NaN } }]),
        "left_knee"
      )[0].angle
    ).toBeNull();
  });
});
