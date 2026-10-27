import { describe, expect, it } from "vitest";

import { angle2D, measureFrameAngles, summarizeJointAngles } from "./poseMath";

const point = (x: number, y: number, visibility = 1, presence = 1) => ({ x, y, visibility, presence });

describe("angle2D", () => {
  it("measures a right angle", () => {
    expect(angle2D(point(0, 0), point(0, 1), point(1, 1), 100, 100)).toBeCloseTo(90, 8);
  });

  it("measures a straight angle", () => {
    expect(angle2D(point(0, 0.5), point(0.5, 0.5), point(1, 0.5), 1920, 1080)).toBeCloseTo(180, 8);
  });

  it("uses pixel aspect ratio rather than normalized-coordinate geometry", () => {
    // Normalized vectors are (-1, -1) and (1, -1), which would be 90°. In a
    // 2:1 image, the corresponding pixel vectors yield ~126.87°.
    expect(angle2D(point(0, 0), point(0.5, 0.5), point(1, 0), 200, 100)).toBeCloseTo(126.869898, 5);
  });

  it("rejects low-confidence points", () => {
    expect(angle2D(point(0, 0, 0.59), point(0, 1), point(1, 1), 100, 100)).toBeNull();
    expect(angle2D(point(0, 0), point(0, 1, 1, 0.59), point(1, 1), 100, 100)).toBeNull();
  });

  it("rejects landmarks outside the decoded image", () => {
    expect(angle2D(point(-0.001, 0), point(0, 1), point(1, 1), 100, 100)).toBeNull();
    expect(angle2D(point(0, 0), point(0, 1), point(1.001, 1), 100, 100)).toBeNull();
  });

  it("rejects degenerate vectors", () => {
    expect(angle2D(point(0.5, 0.5), point(0.5, 0.5), point(1, 1), 100, 100)).toBeNull();
  });
});

describe("joint measurement and summaries", () => {
  it("only records known measurable joints", () => {
    const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
    landmarks[11] = point(0, 0);
    landmarks[13] = point(0, 1);
    landmarks[15] = point(1, 1);
    landmarks[23] = point(0, 0);

    expect(measureFrameAngles(landmarks, 100, 100)).toEqual({ left_elbow: 90 });
  });

  it("includes all eight joints and nulls unavailable measurements", () => {
    const frames = [
      { angles: { left_elbow: 90, right_elbow: 100 } },
      { angles: { left_elbow: 110, unknown_angle: 33 } as never },
      { angles: { left_elbow: Number.NaN, right_elbow: 181 } },
    ];
    const summaries = summarizeJointAngles(frames);

    expect(summaries).toHaveLength(8);
    expect(summaries.find((summary) => summary.key === "left_elbow")).toMatchObject({
      samples: 2,
      min: 90,
      max: 110,
      mean: 100,
    });
    expect(summaries.find((summary) => summary.key === "right_elbow")).toMatchObject({
      samples: 1,
      min: 100,
      max: 100,
      mean: 100,
    });
    expect(summaries.find((summary) => summary.key === "left_knee")).toMatchObject({
      samples: 0,
      min: null,
      max: null,
      mean: null,
    });
    expect(summaries.map((summary) => summary.key)).not.toContain("unknown_angle");
  });
});
