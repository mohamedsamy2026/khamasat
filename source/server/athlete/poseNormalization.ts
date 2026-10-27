import type { PoseResult } from "../../shared/pose";
import { POSE_MIN_CONFIDENCE } from "../../shared/pose";
import {
  measureFrameAngles,
  summarizeJointAngles,
} from "../../shared/poseMath";

/** Geometry is derived again from supplied model landmarks; summary numbers are never trusted. */
export function normalizePoseResult(pose: PoseResult): PoseResult {
  const confidenceThreshold = Math.max(
    POSE_MIN_CONFIDENCE,
    pose.confidenceThreshold
  );
  const frames = pose.frames.map(frame => ({
    ...frame,
    angles: measureFrameAngles(
      frame.landmarks,
      pose.videoWidth,
      pose.videoHeight,
      confidenceThreshold
    ),
  }));
  const joints = summarizeJointAngles(frames);
  const unavailable = joints
    .filter(joint => joint.mean === null)
    .map(
      joint =>
        `تعذر قياس ${joint.label} بسبب الحجب أو انخفاض ثقة النقاط أو خروجها من الإطار.`
    );
  return {
    ...pose,
    confidenceThreshold,
    frames,
    totalFrames: frames.length,
    detectedFrames: frames.filter(frame => frame.landmarks.length === 33)
      .length,
    joints,
    limitations: [
      ...new Set([
        "الزوايا تقديرية ثنائية الأبعاد في مستوى الصورة؛ لا تمثل قياسًا طبيًا أو تشريحيًا ثلاثي الأبعاد معايرًا.",
        "سرعة الكرة والمسافات المترية والتقييم الرياضي العام غير محسوبة من هذا النموذج.",
        ...pose.limitations,
        ...unavailable,
      ]),
    ],
  };
}
