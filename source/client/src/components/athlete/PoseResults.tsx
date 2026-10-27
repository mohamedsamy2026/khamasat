import { useEffect, useRef, useState } from "react";
import {
  Activity,
  CircleAlert,
  Focus,
  Info,
  Loader2,
  Video as VideoIcon,
} from "lucide-react";
import type { Analysis } from "@shared/athlete";
import type { PoseFrame } from "@shared/pose";
import { BODY_CONNECTIONS } from "@shared/poseMath";
import { downloadPrivate, useAthlete } from "@/lib/athleteApi";
import { Panel } from "./UI";
import PoseAngleTimeline from "./PoseAngleTimeline";
import SessionNotes from "./SessionNotes";
import ExercisePlans from "./ExercisePlans";
import { evaluateSession, INDICATOR_CATALOG } from "@shared/evaluation";
import "./pose-results.css";

function closestFrame(
  frames: PoseFrame[],
  time: number
): PoseFrame | undefined {
  if (!frames.length) return undefined;
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].timestamp < time) low = middle + 1;
    else high = middle;
  }
  const previous = frames[Math.max(0, low - 1)];
  return Math.abs(previous.timestamp - time) <
    Math.abs(frames[low].timestamp - time)
    ? previous
    : frames[low];
}

export default function PoseResults({ analysis }: { analysis: Analysis }) {
  const pose = analysis.pose;
  const { orgId } = useAthlete();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [tracking, setTracking] = useState(true);
  const [time, setTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    let ownedUrl: string | null = null;
    setUrl(null);
    setError("");
    setTime(0);
    if (!pose || !analysis.videoId) return;
    setLoading(true);
    void downloadPrivate(`/videos/${analysis.videoId}/content`)
      .then(blob => {
        if (!active) return;
        ownedUrl = URL.createObjectURL(blob);
        setUrl(ownedUrl);
      })
      .catch(problem => {
        if (active)
          setError(
            problem instanceof Error
              ? problem.message
              : "تعذر تحميل الفيديو المرتبط بالتتبع"
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [analysis.id, analysis.videoId, orgId, pose, retry]);

  useEffect(() => {
    if (!pose || !url) return;
    let animation = 0;
    const paint = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas) {
        const width = video.clientWidth;
        const height = video.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        if (
          canvas.width !== Math.round(width * dpr) ||
          canvas.height !== Math.round(height * dpr)
        ) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
        }
        const context = canvas.getContext("2d");
        if (context) {
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          context.clearRect(0, 0, width, height);
          const frame = closestFrame(pose.frames, video.currentTime);
          if (
            tracking &&
            frame &&
            Math.abs(frame.timestamp - video.currentTime) <=
              1 / pose.sampleFps + 0.05 &&
            frame.landmarks.length === 33
          ) {
            const scale = Math.min(
              width / pose.videoWidth,
              height / pose.videoHeight
            );
            const left = (width - pose.videoWidth * scale) / 2;
            const top = (height - pose.videoHeight * scale) / 2;
            const point = (index: number) => {
              const landmark = frame.landmarks[index];
              if (
                !landmark ||
                landmark.visibility < pose.confidenceThreshold ||
                landmark.presence < pose.confidenceThreshold ||
                landmark.x < 0 ||
                landmark.x > 1 ||
                landmark.y < 0 ||
                landmark.y > 1
              )
                return null;
              return {
                x: left + landmark.x * pose.videoWidth * scale,
                y: top + landmark.y * pose.videoHeight * scale,
              };
            };
            context.lineWidth = 3;
            context.strokeStyle = "#4aff93";
            for (const [start, end] of BODY_CONNECTIONS) {
              const a = point(start);
              const b = point(end);
              if (!a || !b) continue;
              context.beginPath();
              context.moveTo(a.x, a.y);
              context.lineTo(b.x, b.y);
              context.stroke();
            }
            context.fillStyle = "#ffffff";
            for (let index = 0; index < frame.landmarks.length; index++) {
              const p = point(index);
              if (!p) continue;
              context.beginPath();
              context.arc(p.x, p.y, 3, 0, Math.PI * 2);
              context.fill();
            }
          }
        }
      }
      animation = requestAnimationFrame(paint);
    };
    animation = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(animation);
  }, [pose, url, tracking]);

  if (!pose || analysis.isDemo) return null;
  const measured = pose.joints.filter(joint => joint.mean !== null).length;
  const coverage = pose.totalFrames
    ? Math.round((pose.detectedFrames / pose.totalFrames) * 100)
    : 0;
  const evaluation = analysis.evaluation ?? evaluateSession(analysis);
  return (
    <section className="pose-results" aria-label="نتائج تحليل الفيديو الفعلي">
      <div className="pose-source-notice">
        <Focus size={20} />
        <div>
          <strong>نتائج رؤية حاسوبية من المقطع نفسه</strong>
          <p>
            {pose.engine} · تقديرات ثنائية الأبعاد، وليست تقييمًا رياضيًا عامًا
            أو قياسًا طبيًا معايرًا.
          </p>
        </div>
      </div>
      <div className="pose-session-context">
        <span>
          الجلسة #{analysis.id} ·{" "}
          {new Date(analysis.createdAt).toLocaleString("ar")}
        </span>
        <span>المهارة: {analysis.skill}</span>
        <span>
          القدم المصرّح بها:{" "}
          {evaluation.context.usedFoot === "right"
            ? "اليمنى"
            : evaluation.context.usedFoot === "left"
              ? "اليسرى"
              : "غير محددة"}
        </span>
        <span>المرحلة: المقطع كاملًا — غير مقسمة آليًا</span>
        <strong>
          التقييم العام: لم يُقيّم — لا توجد طريقة وأوزان تقييم موثقة
        </strong>
      </div>
      <div className="pose-result-layout">
        <Panel title="الفيديو وتتبع الجسم" icon={VideoIcon}>
          {loading && (
            <div className="pose-video-status" role="status">
              <Loader2 className="spin" size={24} /> جارٍ تحميل المقطع المحفوظ…
            </div>
          )}
          {error && (
            <div className="pose-video-error" role="alert">
              <CircleAlert size={20} />
              <p>{error}</p>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setRetry(value => value + 1)}
              >
                إعادة تحميل المقطع
              </button>
            </div>
          )}
          {url && !error && (
            <div className="pose-video-wrap">
              <video
                ref={videoRef}
                src={url}
                controls
                playsInline
                preload="metadata"
                controlsList="nodownload"
                onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
                onSeeked={event => setTime(event.currentTarget.currentTime)}
                onError={() =>
                  setError(
                    "تعذر تشغيل ترميز هذا الفيديو في المتصفح. استخدم MP4 بترميز H.264 أو متصفحًا يدعم الترميز."
                  )
                }
              />
              <canvas ref={canvasRef} aria-hidden="true" />
            </div>
          )}
          <label className="pose-tracking-switch">
            <input
              type="checkbox"
              checked={tracking}
              onChange={event => setTracking(event.target.checked)}
            />{" "}
            إظهار نقاط الجسم المرصودة فوق الفيديو
          </label>
          <p className="pose-help">
            التتبع مبني على عينات {pose.sampleFps} إطارات/ثانية. تُرشح الوصلات
            وفق ثقة النموذج وموقع النقاط؛ قد يخطئ عند الحجب أو في تحديد المفصل.
            لا يُعاد تشغيل النموذج عند مشاهدة النتائج المحفوظة.
          </p>
          {url && closestFrame(pose.frames, time)?.landmarks.length !== 33 && (
            <p className="pose-timeline-warning" role="status">
              لم يُرصد جسم بثقة كافية عند هذا الزمن؛ لا تُولد نقاط أو زوايا
              بديلة. راجع التصوير والحجب.
            </p>
          )}
        </Panel>
        <div className="pose-measurement-stack">
          <div className="metric-tile">
            <span>مدة المقطع</span>
            <strong dir="ltr">
              {pose.duration.toFixed(1)} <small>ثانية</small>
            </strong>
          </div>
          <div className="metric-tile">
            <span>إطارات رُصد فيها جسم</span>
            <strong dir="ltr">
              {pose.detectedFrames} / {pose.totalFrames}
            </strong>
            <small>نسبة الرصد {coverage}% — ليست درجة أداء</small>
          </div>
          <div className="metric-tile">
            <span>مفاصل ذات تقديرات متاحة</span>
            <strong dir="ltr">
              {measured} / {pose.joints.length}
            </strong>
            <small>وفق عتبة ثقة النموذج، وليست ضمانًا للدقة.</small>
          </div>
          <div className="metric-tile">
            <span>التقييم العام والسرعة</span>
            <strong>غير مقاسين</strong>
            <small>لا يقدّر هذا النموذج سرعة الكرة أو درجة المهارة.</small>
          </div>
        </div>
        <Panel title="زوايا المفاصل المرصودة" icon={Activity}>
          <p className="pose-help">
            المتوسط عبر الإطارات الصالحة في مستوى الصورة. اليمين واليسار يشيران
            إلى جسم اللاعب، لا طرف الشاشة. قلة العينات أو تغير الكاميرا قد يجعل
            المتوسط غير ممثل للحركة؛ راجع مواضع التتبع بصريًا.
          </p>
          <div className="pose-joint-list">
            {pose.joints.map(joint => (
              <div className="pose-joint-row" key={joint.key}>
                <div>
                  <strong>{joint.label}</strong>
                  <small>
                    {joint.samples
                      ? `${joint.samples} عينات صالحة`
                      : "غير ظاهر بثقة كافية"}
                  </small>
                </div>
                <div>
                  {joint.mean === null ? (
                    <span className="pose-unmeasured">غير قابل للقياس</span>
                  ) : (
                    <>
                      <strong dir="ltr">{joint.mean.toFixed(1)}°</strong>
                      <small dir="ltr">
                        {joint.min?.toFixed(1)}° — {joint.max?.toFixed(1)}°
                      </small>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="pose-adjacent-actions">
        <SessionNotes
          key={`notes-${orgId}-${analysis.id}`}
          playerId={analysis.playerId}
          analysisId={analysis.id}
        />
        <ExercisePlans
          key={`plans-${orgId}-${analysis.id}`}
          playerId={analysis.playerId}
          analysisId={analysis.id}
        />
      </div>
      <Panel title="جدول المؤشرات الداعمة لهذه الجلسة" icon={Activity}>
        <p className="pose-help">
          القيم قياسات من الجلسة المحددة فقط. غياب معيار موثق لا يحولها إلى قوة
          أو جانب تطوير، ولا تعمم محاولة واحدة على اللاعب.
        </p>
        <div className="pose-indicator-table-wrap">
          <table className="pose-indicator-table">
            <thead>
              <tr>
                <th>المؤشر والوحدة</th>
                <th>القياس</th>
                <th>الزمن الداعم</th>
                <th>الحالة والسبب</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.measurements.map(m => (
                <tr key={m.indicatorCode}>
                  <td>
                    <strong>{m.name}</strong>
                    <small dir="ltr">{m.indicatorCode}</small>
                  </td>
                  <td>
                    {m.value === null ? (
                      "غير متوفر"
                    ) : (
                      <span dir="ltr">
                        {m.value.toFixed(2)} {m.unit}
                      </span>
                    )}
                  </td>
                  <td>
                    {m.timeStart === null || m.timeEnd === null ? (
                      "غير متوفر"
                    ) : (
                      <span dir="ltr">
                        {m.timeStart.toFixed(2)}–{m.timeEnd.toFixed(2)} s
                      </span>
                    )}
                  </td>
                  <td>
                    <strong>
                      {m.assessment === "measurement_only"
                        ? "قياس دون حكم"
                        : m.assessment === "strength"
                          ? "قوة وفق معيار موثق"
                          : m.assessment === "development"
                            ? "جانب تطوير وفق معيار موثق"
                            : "لم يُقيّم"}
                    </strong>
                    <small>{m.reason}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="تغير زوايا المفاصل عبر المقطع" icon={Activity}>
        <PoseAngleTimeline
          pose={pose}
          time={time}
          seekable={Boolean(url) && !loading && !error}
          onSeek={target => {
            const video = videoRef.current;
            if (!video || video.readyState < 1) return;
            video.currentTime = target;
            setTime(target);
          }}
        />
      </Panel>
      <details className="pose-indicator-definitions">
        <summary>تعريف المؤشرات وطرق حسابها ومصادرها</summary>
        <div>
          {INDICATOR_CATALOG.map(indicator => (
            <article key={indicator.code}>
              <strong>{indicator.name}</strong>
              <code>{indicator.code}</code>
              <p>{indicator.definition}</p>
              <p>
                الطريقة: {indicator.method} · الوحدة:{" "}
                {indicator.unit || "غير متوفرة"}
              </p>
              <p>
                {indicator.supported
                  ? indicator.validity.join(" · ")
                  : indicator.unsupportedReason}
              </p>
              <p>
                معيار الأداء:{" "}
                {indicator.rule
                  ? indicator.rule.description
                  : "غير متوفر — لا حكم بالقوة أو التطوير"}
              </p>
              {indicator.methodSourceUrl && (
                <a
                  href={indicator.methodSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  مصدر طريقة الرصد
                </a>
              )}
            </article>
          ))}
        </div>
      </details>
      <Panel title="حدود القياس والملاحظات" icon={Info}>
        <div className="pose-limitations">
          {pose.limitations.map((line, index) => (
            <p key={index}>
              <Info size={16} />
              <span>{line}</span>
            </p>
          ))}
        </div>
        <p className="pose-help">
          المحرك {pose.packageVersion} · النموذج {pose.modelVersion}. قد تختلف
          التقديرات باختلاف زاوية الكاميرا والإضاءة والملابس والحجب؛ يحتاج
          التقييم التدريبي إلى مراجعة المدرب.
        </p>
      </Panel>
    </section>
  );
}
