import {
  MAX_POSE_SECONDS,
  POSE_ENGINE,
  POSE_MIN_CONFIDENCE,
  POSE_MODEL,
  POSE_MODEL_VERSION,
  POSE_SAMPLE_FPS,
} from "@shared/pose";
import type { PoseFrame, PoseLandmark, PoseProgress, PoseResult } from "@shared/pose";
import { measureFrameAngles, roundMeasurement, summarizeJointAngles } from "@shared/poseMath";

export type { PoseProgress } from "@shared/pose";

export type AnalyzeVideoOptions = {
  onProgress?: (progress: PoseProgress) => void;
  signal?: AbortSignal;
};

type MediaPipeLandmark = {
  x: number;
  y: number;
  visibility: number;
  presence?: number;
};

type VideoPoseLandmarker = Pick<import("@mediapipe/tasks-vision").PoseLandmarker, "close" | "detectForVideo">;

const PACKAGE_VERSION = "1.1.1";
const WASM_PATH = "/pose-assets/wasm";
const MODEL_PATH = "/pose-assets/model/pose_landmarker_lite.task";
const METADATA_TIMEOUT_MS = 15_000;
const SEEK_TIMEOUT_MS = 10_000;

function abortError(): Error {
  const error = new Error("تم إلغاء تحليل الفيديو.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function assertBrowser(): void {
  if (
    typeof window === "undefined"
    || typeof document === "undefined"
    || typeof URL === "undefined"
    || typeof URL.createObjectURL !== "function"
    || typeof HTMLVideoElement === "undefined"
  ) {
    throw new Error("تحليل الوضعية متاح داخل متصفح يدعم فيديو HTML فقط.");
  }
}

function mediaErrorMessage(video: HTMLVideoElement): string {
  switch (video.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "تم إيقاف تحميل الفيديو قبل اكتماله.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "تعذر تحميل ملف الفيديو بسبب خطأ في الشبكة.";
    case MediaError.MEDIA_ERR_DECODE:
      return "تعذر فك ترميز الفيديو. استخدم ملف فيديو بترميز مدعوم.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "تنسيق أو ترميز الفيديو غير مدعوم في هذا المتصفح.";
    default:
      return "تعذر تحميل أو فك ترميز ملف الفيديو.";
  }
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  successEvents: readonly string[],
  timeoutMs: number,
  action: string,
  signal?: AbortSignal,
  isReady: () => boolean = () => true,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;

    const cleanup = () => {
      for (const event of successEvents) video.removeEventListener(event, onSuccess);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onSuccess = () => {
      if (isReady()) finish(resolve);
    };
    const onError = () => finish(() => reject(new Error(mediaErrorMessage(video))));
    const onAbort = () => finish(() => reject(abortError()));

    if (signal?.aborted) {
      onAbort();
      return;
    }

    for (const event of successEvents) video.addEventListener(event, onSuccess);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    timeoutId = window.setTimeout(() => finish(() => reject(new Error(`${action} انتهت مهلته.`))), timeoutMs);

    // An event can have arrived in the small interval before listeners attached.
    if (isReady()) onSuccess();
  });
}

async function waitForMetadata(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;
  await waitForVideoEvent(video, ["loadedmetadata"], METADATA_TIMEOUT_MS, "تحميل بيانات الفيديو", signal, () => (
    video.readyState >= HTMLMediaElement.HAVE_METADATA
  ));
}

async function waitForCurrentData(video: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
  await waitForVideoEvent(video, ["loadeddata", "canplay"], METADATA_TIMEOUT_MS, "فك إطار الفيديو", signal, () => (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ));
}

/** Seeks only after its event handlers are installed; time zero uses loadeddata. */
async function seekToSample(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  if (time === 0) {
    await waitForCurrentData(video, signal);
    return;
  }

  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;
    const cleanup = () => {
      video.removeEventListener("seeked", onPotentialFrame);
      video.removeEventListener("loadeddata", onPotentialFrame);
      video.removeEventListener("canplay", onPotentialFrame);
      video.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onPotentialFrame = () => {
      if (!video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish(resolve);
    };
    const onError = () => finish(() => reject(new Error(mediaErrorMessage(video))));
    const onAbort = () => finish(() => reject(abortError()));

    if (signal?.aborted) {
      onAbort();
      return;
    }

    video.addEventListener("seeked", onPotentialFrame);
    video.addEventListener("loadeddata", onPotentialFrame);
    video.addEventListener("canplay", onPotentialFrame);
    video.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    timeoutId = window.setTimeout(() => finish(() => reject(new Error("البحث عن إطار فيديو انتهت مهلته."))), SEEK_TIMEOUT_MS);

    try {
      video.currentTime = time;
      onPotentialFrame();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

async function yieldToBrowser(signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
    } else {
      window.setTimeout(resolve, 0);
    }
  });
  throwIfAborted(signal);
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isFiniteLandmark(landmark: MediaPipeLandmark): boolean {
  return Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && Number.isFinite(landmark.visibility);
}

/** Copies model values before the next inference can reuse MediaPipe-owned buffers. */
function copyLandmarks(raw: readonly MediaPipeLandmark[]): PoseLandmark[] {
  return raw.map((landmark) => {
    const presence = typeof landmark.presence === "number" && Number.isFinite(landmark.presence)
      ? landmark.presence
      : landmark.visibility;
    return {
      // Coordinates are intentionally not clamped: out-of-image observations
      // must remain evident and are rejected only for angle geometry.
      x: roundMeasurement(landmark.x, 5),
      y: roundMeasurement(landmark.y, 5),
      visibility: roundMeasurement(clampConfidence(landmark.visibility), 5),
      presence: roundMeasurement(clampConfidence(presence), 5),
    };
  });
}

function makeVideo(): HTMLVideoElement {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");
  // Safari can avoid decoding a display:none video. Keep a tiny attached element
  // off screen without making it visible or interactive.
  video.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  (document.body ?? document.documentElement).appendChild(video);
  return video;
}

function validateVideoMetadata(video: HTMLVideoElement): void {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error("تعذر تحديد مدة الفيديو أو أن الملف لا يحتوي على مدة صالحة.");
  }
  if (video.duration > MAX_POSE_SECONDS) {
    throw new Error(`مدة الفيديو تتجاوز الحد الأقصى البالغ ${MAX_POSE_SECONDS} ثانية.`);
  }
  if (!Number.isFinite(video.videoWidth) || !Number.isFinite(video.videoHeight) || video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error("لا يحتوي الفيديو على أبعاد صالحة أو أن ترميزه غير مدعوم.");
  }
}

function analysisLimitations(frames: readonly PoseFrame[]): string[] {
  const summaries = summarizeJointAngles(frames);
  const unavailable = summaries
    .filter((summary) => summary.samples === 0)
    .map((summary) => `تعذر قياس ${summary.label} لعدم وجود نقاط موثوقة داخل الإطار في العينات المتاحة.`);

  return [
    "الزوايا محسوبة من إسقاط ثنائي الأبعاد للفيديو؛ زاوية الكاميرا والمنظور قد يغيران القراءة.",
    "هذه القياسات ليست معايرة سريرياً ولا تمثل تشخيصاً أو تقييماً طبياً.",
    "لا يحلل النظام الكرة ولا سرعتها أو سرعة اللاعب.",
    "لا يوفر هذا التحليل قياساً ثلاثي الأبعاد حقيقياً للحركة.",
    "لا يصدر النظام درجة ذكاء اصطناعي إجمالية أو حكماً تلقائياً على جودة الأداء.",
    "النموذج مضبوط على كشف شخص واحد فقط؛ لا يفترض أن يكون أكبر أو نفس شخص في كل لقطة، ولا يضمن ثبات الهوية عبر الفيديو.",
    "لنتيجة أوضح، اجعل الجسم كاملاً داخل الإطار مع إضاءة جيدة ومن دون حجب للمفاصل.",
    ...unavailable,
  ];
}

/**
 * Decodes a browser video Blob and samples actual decoded frames at 5 FPS.
 * MediaPipe is imported only when analysis starts, keeping the homepage bundle idle.
 */
export async function analyzeVideo(blob: Blob, options: AnalyzeVideoOptions = {}): Promise<PoseResult> {
  assertBrowser();
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new Error("يلزم اختيار ملف فيديو صالح للتحليل.");
  }

  const { signal, onProgress } = options;
  const progress = (phase: PoseProgress["phase"], current: number, total: number, message: string) => {
    if (!signal?.aborted) onProgress?.({ phase, current, total, message });
  };

  throwIfAborted(signal);
  let objectUrl: string | undefined;
  let video: HTMLVideoElement | undefined;
  let landmarker: VideoPoseLandmarker | undefined;

  try {
    progress("loading", 0, 1, "جارٍ تحميل محرك تحليل الوضعية…");
    const vision = await import("@mediapipe/tasks-vision");
    throwIfAborted(signal);

    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
    throwIfAborted(signal);
    landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    throwIfAborted(signal);
    progress("loading", 1, 1, "اكتمل تحميل محرك تحليل الوضعية.");

    video = makeVideo();
    objectUrl = URL.createObjectURL(blob);
    const metadata = waitForMetadata(video, signal);
    video.src = objectUrl;
    video.load();
    await metadata;
    validateVideoMetadata(video);
    await waitForCurrentData(video, signal);
    throwIfAborted(signal);

    const duration = video.duration;
    const sampleCount = Math.max(1, Math.ceil(duration * POSE_SAMPLE_FPS));
    const frames: PoseFrame[] = [];
    let detectedFrames = 0;
    let lastTimestampMs = -Infinity;
    progress("decoding", 0, sampleCount, "جارٍ تجهيز إطارات الفيديو…");

    for (let index = 0; index < sampleCount; index += 1) {
      throwIfAborted(signal);
      const requestedTime = index / POSE_SAMPLE_FPS;
      await seekToSample(video, requestedTime, signal);
      throwIfAborted(signal);

      // Use the requested sampling timestamp (strictly monotonic); pixels always
      // come from the decoded frame selected by the completed seek above.
      const timestampMs = Math.max(requestedTime * 1000, lastTimestampMs + 0.001);
      lastTimestampMs = timestampMs;
      const detected = landmarker.detectForVideo(video, timestampMs).landmarks[0] as MediaPipeLandmark[] | undefined;
      const timestamp = roundMeasurement(video.currentTime, 3);

      if (detected && detected.length === 33 && detected.every(isFiniteLandmark)) {
        // Geometry must use original coordinates/confidences before output rounding.
        const angles = measureFrameAngles(detected, video.videoWidth, video.videoHeight, POSE_MIN_CONFIDENCE);
        frames.push({ timestamp, landmarks: copyLandmarks(detected), angles });
        detectedFrames += 1;
      } else {
        frames.push({ timestamp, landmarks: [], angles: {} });
      }

      progress("analyzing", index + 1, sampleCount, `جارٍ تحليل الإطار ${index + 1} من ${sampleCount}…`);
      if (index + 1 < sampleCount) await yieldToBrowser(signal);
    }

    throwIfAborted(signal);
    if (detectedFrames === 0) {
      throw new Error("لم يتم اكتشاف وضعية جسم صالحة في أي إطار من الفيديو.");
    }

    const joints = summarizeJointAngles(frames);
    return {
      engine: POSE_ENGINE,
      model: POSE_MODEL,
      modelVersion: POSE_MODEL_VERSION,
      packageVersion: PACKAGE_VERSION,
      duration: roundMeasurement(duration, 3),
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      sampleFps: POSE_SAMPLE_FPS,
      confidenceThreshold: POSE_MIN_CONFIDENCE,
      totalFrames: frames.length,
      detectedFrames,
      frames,
      joints,
      limitations: analysisLimitations(frames),
    };
  } finally {
    // Cleanup runs on success, decoder/model errors, and cancellation alike.
    try {
      landmarker?.close();
    } catch {
      // Cleanup must not overwrite the original analysis failure.
    }
    if (video) {
      video.pause();
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // No-op: the node is being removed immediately.
      }
      video.remove();
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
