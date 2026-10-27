import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PoseJointKey, PoseResult } from "@shared/pose";
import { angleAtTime, angleTimeline } from "@shared/poseTimeline";

export default function PoseAngleTimeline({
  pose,
  time,
  onSeek,
  seekable = true,
}: {
  pose: PoseResult;
  time: number;
  onSeek: (time: number) => void;
  seekable?: boolean;
}) {
  const [key, setKey] = useState<PoseJointKey>("left_knee");
  const data = useMemo(() => angleTimeline(pose, key), [pose, key]);
  const label = pose.joints.find(joint => joint.key === key)?.label ?? "المفصل";
  const current = angleAtTime(pose, key, time);
  const measured = data.filter(point => point.angle !== null).length;
  return (
    <div className="pose-timeline">
      <div className="pose-timeline-controls">
        <label className="field">
          المفصل المعروض
          <select
            aria-label="اختيار المفصل للرسم الزمني"
            value={key}
            onChange={event => setKey(event.target.value as PoseJointKey)}
          >
            {pose.joints.map(joint => (
              <option key={joint.key} value={joint.key}>
                {joint.label}
              </option>
            ))}
          </select>
        </label>
        <div className="pose-current-angle" role="status" aria-live="off">
          <span>
            عند {time.toFixed(2)} ثانية · {label}
          </span>
          <strong dir="ltr">
            {current === null ? "غير مقاس" : `${current.toFixed(1)}°`}
          </strong>
          {current === null && (
            <small>
              النقاط غير متاحة بثقة كافية عند هذا الزمن؛ لا تُملأ بقيم تقديرية
              بديلة.
            </small>
          )}
        </div>
      </div>
      {measured ? (
        <div
          className="pose-time-chart"
          dir="ltr"
          aria-label={`تغير زاوية ${label} عبر المقطع`}
        >
          <ResponsiveContainer width="100%" height={270}>
            <LineChart
              data={data}
              margin={{ top: 15, right: 20, left: 0, bottom: 20 }}
              onClick={state => {
                const target = Number(state?.activeLabel);
                if (
                  seekable &&
                  state?.activeLabel !== undefined &&
                  Number.isFinite(target)
                )
                  onSeek(Math.max(0, Math.min(pose.duration, target)));
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#dce8e2" />
              <XAxis
                type="number"
                dataKey="time"
                domain={[0, pose.duration]}
                tickFormatter={value => `${Number(value).toFixed(1)}s`}
                tick={{ fill: "#405a50", fontSize: 13 }}
              />
              <YAxis
                domain={[0, 180]}
                tickFormatter={value => `${value}°`}
                tick={{ fill: "#405a50", fontSize: 13 }}
              />
              <Tooltip
                labelFormatter={value =>
                  `الزمن ${Number(value).toFixed(2)} ثانية`
                }
                formatter={value => [`${Number(value).toFixed(1)}°`, label]}
                contentStyle={{ direction: "rtl", borderRadius: 10 }}
              />
              <ReferenceLine x={time} stroke="#1b4963" strokeDasharray="4 3" />
              <Line
                type="linear"
                dataKey="angle"
                name={label}
                stroke="#078c59"
                strokeWidth={2.5}
                connectNulls={false}
                dot={false}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="pose-timeline-warning" role="status">
          تعذر قياس هذا المفصل طوال المقطع بثقة كافية. لا يوجد منحنى أو أرقام
          مختلقة.
        </p>
      )}
      <label className="pose-time-scrubber">
        مراجعة زمن المقطع · {time.toFixed(2)} / {pose.duration.toFixed(2)} ثانية
        <input
          type="range"
          aria-label="زمن مراجعة التحليل"
          disabled={!seekable}
          title={!seekable ? "انتظر اكتمال تحميل الفيديو المحفوظ" : undefined}
          min={0}
          max={pose.duration}
          step={1 / pose.sampleFps}
          value={Math.min(time, pose.duration)}
          onChange={event => onSeek(Number(event.target.value))}
        />
      </label>
      {!seekable && (
        <p className="pose-help" role="status">
          مراجعة الزمن متاحة بعد اكتمال تحميل الفيديو؛ راجع رسالة التحميل أو
          الخطأ في المشغل.
        </p>
      )}
      <p className="pose-help">
        اضغط نقطة المنحنى أو حرّك شريط الزمن لمراجعة الإطار الداعم في الفيديو.
        الفراغات تعني قياسات غير متاحة، ولا يُوصل الخط عبرها. الزاوية في مستوى
        الصورة وتتأثر بالمنظور والحجب؛ ليست حكمًا على صحة التسديد.
      </p>
    </div>
  );
}
