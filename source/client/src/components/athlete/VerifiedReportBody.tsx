import { useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  FileText,
  GitCompareArrows,
  Info,
  Video,
} from "lucide-react";
import type { Report } from "@shared/athlete";
import {
  compareSessionCompatibility,
  evaluateSession,
  summarizePlayerEvaluation,
} from "@shared/evaluation";
import { EmptyState, Panel, VideoLibrary } from "./UI";
import EvaluationSummary, { SessionMeasurementGrid } from "./EvaluationSummary";

export default function VerifiedReportBody({
  report,
  view,
}: {
  report: Report;
  view: string;
}) {
  const sessions = report.analyses.filter(a => a.pose && !a.isDemo);
  const [firstId, setFirstId] = useState(0);
  const [secondId, setSecondId] = useState(0);
  const first = sessions.find(a => a.id === firstId);
  const second = sessions.find(a => a.id === secondId);
  const compatibility =
    first && second ? compareSessionCompatibility(first, second) : null;
  return (
    <section id="report-results" className="section-stack report-results">
      <div className="report-player-heading">
        <div>
          <span className="eyebrow">تقرير اللاعب</span>
          <h2>{report.player.name}</h2>
          <p>
            {report.player.academyName} ·{" "}
            {new Date(report.from).toLocaleDateString("ar")} —{" "}
            {new Date(report.to).toLocaleDateString("ar")}
          </p>
        </div>
        <span className="badge">
          {view === "technical"
            ? "القياسات التقنية"
            : view === "progress"
              ? "الجلسات والتطور"
              : "نظرة عامة"}
        </span>
      </div>
      <Panel title="تغطية القياس ضمن التقرير" icon={FileText}>
        <EvaluationSummary
          evaluation={summarizePlayerEvaluation(sessions)}
          includeMeasurements={false}
        />
        <p className="helper">
          الملخص يحصي الجلسات الفعلية ضمن الفترة فقط. لا يستبدل نقص البيانات
          بدرجة ملف أو بمتوسط أمثلة عرض قديمة.
        </p>
      </Panel>
      <Panel title="مقارنة جلسات متوافقة" icon={GitCompareArrows}>
        <div className="form-grid">
          <label>
            الجلسة الأولى
            <select
              className="field"
              value={firstId}
              onChange={e => setFirstId(Number(e.target.value))}
            >
              <option value={0}>اختر جلسة</option>
              {sessions.map(a => (
                <option key={a.id} value={a.id}>
                  #{a.id} · {a.skill}
                </option>
              ))}
            </select>
          </label>
          <label>
            الجلسة الثانية
            <select
              className="field"
              value={secondId}
              onChange={e => setSecondId(Number(e.target.value))}
            >
              <option value={0}>اختر جلسة أخرى</option>
              {sessions.map(a => (
                <option key={a.id} value={a.id}>
                  #{a.id} · {a.skill}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!compatibility ? (
          <p>
            لم يُقيّم التطور؛ اختر جلستين فعليتين، ولا تعمم نتيجة محاولة واحدة.
          </p>
        ) : firstId === secondId ? (
          <p>اختر جلستين مختلفتين؛ الجلسة نفسها ليست دليل تطور.</p>
        ) : !compatibility.compatible ? (
          <ul>
            {compatibility.reasons.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <>
            <p>
              السياق المصرح به متوافق تقنيًا؛ الفروق ليست حكمًا آليًا بتحسن
              الأداء.
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>المؤشر</th>
                    <th>الجلسة الأولى</th>
                    <th>الجلسة الثانية</th>
                    <th>الوحدة</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluateSession(first!).measurements.map(m => {
                    const n = evaluateSession(second!).measurements.find(
                      x => x.indicatorCode === m.indicatorCode
                    );
                    return (
                      <tr key={m.indicatorCode}>
                        <td>{m.name}</td>
                        <td>
                          {m.value === null ? "غير متوفر" : m.value.toFixed(2)}
                        </td>
                        <td>
                          {n?.value == null ? "غير متوفر" : n.value.toFixed(2)}
                        </td>
                        <td>{m.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
      {sessions.length ? (
        sessions.map(a => (
          <Panel
            key={a.id}
            title={`الجلسة #${a.id} — ${a.skill}`}
            icon={Activity}
          >
            <p>
              {new Date(a.createdAt).toLocaleString("ar")} · الفيديو #
              {a.videoId} · {a.pose?.engine} · {a.pose?.modelVersion}
            </p>
            <EvaluationSummary
              kind="session"
              evaluation={a.evaluation ?? evaluateSession(a)}
              includeMeasurements={false}
            />
            <SessionMeasurementGrid
              evaluation={a.evaluation ?? evaluateSession(a)}
            />
            <Link
              className="text-link"
              href={`/analysis?player=${a.playerId}&video=${a.videoId}&skill=${encodeURIComponent(a.skill)}&analysis=${a.id}`}
            >
              فتح الفيديو والتتبع المحفوظ
            </Link>
          </Panel>
        ))
      ) : (
        <EmptyState
          title="لم يُقيّم — لا توجد جلسة فعلية ضمن هذه الفترة"
          description="الأمثلة القديمة ليست قياسًا جديدًا ولا تستخدم لملء التقرير."
        />
      )}
      <Panel title="الملاحظات المصرح بها ضمن الفترة" icon={Info}>
        {report.notes.length ? (
          report.notes.map(n => (
            <article className="session-note-item" key={n.id}>
              <strong>
                {n.source === "automatic" ? "تحليل آلي" : "مدرب"} ·{" "}
                {n.authorName || "المصدر غير متوفر"}
              </strong>
              <p>{n.text}</p>
              <p>
                الإجراء: {n.requiredAction || "غير محدد"} · الجلسة{" "}
                {n.analysisId || "عامة"} ·{" "}
                {new Date(n.createdAt).toLocaleString("ar")}
              </p>
            </article>
          ))
        ) : (
          <p>
            لا توجد ملاحظات مصرح بها في الفترة. الملاحظات الداخلية غير متاحة
            للنادي.
          </p>
        )}
      </Panel>
      <Panel title="التمارين الموصى بها">
        <p>
          لا تتولد توصية من قياس دون معيار مناسب. خطط التمرين المرتبطة بتطوير
          موثق تظهر في ملف اللاعب وصفحة التدريب، ولا تستخدم التمارين القديمة
          كبديل.
        </p>
        <Link
          className="text-link"
          href={`/training?player=${report.player.id}`}
        >
          خطط اللاعب المحفوظة
        </Link>
      </Panel>
      <Panel title="الفيديوهات المصرح بها" icon={Video}>
        <VideoLibrary videos={report.videos} playerId={report.player.id} />
      </Panel>
    </section>
  );
}
