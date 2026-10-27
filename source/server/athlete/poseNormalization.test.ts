import { describe, expect, it } from "vitest";
import { normalizePoseResult } from "./poseNormalization";
import { validPoseResult } from "./route-test-support";
import { poseResultSchema } from "./validation";

describe("measured-pose normalization", () => {
  it("recomputes a joint from landmarks instead of accepting a ready-made angle", () => {
    const pose = validPoseResult();
    pose.frames[0]!.angles.left_elbow = 140;
    pose.joints[0] = { ...pose.joints[0]!, min: 140, max: 140, mean: 140 };
    const normalized = normalizePoseResult(pose);
    expect(normalized.frames[0]!.angles.left_elbow).toBe(90);
    expect(
      normalized.joints.find(joint => joint.key === "left_elbow")?.mean
    ).toBe(90);
    expect(
      normalized.joints.find(joint => joint.key === "left_knee")?.mean
    ).toBeNull();
  });

  it("keeps detected tracking without inventing angles when confidence is too low", () => {
    const pose = validPoseResult();
    pose.frames[0]!.landmarks = pose.frames[0]!.landmarks.map(point => ({
      ...point,
      visibility: 0.1,
      presence: 0.1,
    }));
    const normalized = normalizePoseResult(pose);
    expect(normalized.detectedFrames).toBe(1);
    expect(normalized.joints.every(joint => joint.mean === null)).toBe(true);
    expect(poseResultSchema.safeParse(normalized).success).toBe(true);
  });

  it("uses seconds and rejects samples beyond the actual video duration", () => {
    const pose = validPoseResult();
    pose.frames[0]!.timestamp = 1.2;
    expect(poseResultSchema.safeParse(pose).success).toBe(false);
  });
});
