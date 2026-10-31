import { useState } from "react";
import { Link } from "wouter";
import {
  Activity, BarChart3, BrainCircuit, CheckCircle2, ClipboardCheck,
  Dumbbell, FileText, GitCompareArrows, Info, Target, Trophy, Video, Zap,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Report } from "@shared/athlete";
import type { CoachAssessment } from "@shared/coaching";
import { performanceLevel } from "@shared/demo-display";
import { ACADEMY_TENURE_NOTE, calendarToday, formatAcademyTenure } from "@shared/academy-tenure";
import { compareSessionCompatibility, evaluateSession } from "@shared/evaluation";
import { EmptyState, Panel, ScoreRing, VideoLibrary } from "./UI";
import {
  CoachIdentity, CoachSkillBars, CoachTrend, comparableAssessments, orderedAssessments,
} from "./CoachAssessments";
import { SessionMeasurementGrid } from "./EvaluationSummary";
import { SkillVideo } from "./SkillCards";

function CoachComparison({ assessments, skill }: { assessments: CoachAssessment[]; skill: string }) {
  const comparable = comparableAssessments(assessments);
  if (comparable.length < 2) return (
    <EmptyState title="لم تُقيّم المقارنة بعد" description="يلزم تقييمان متوافقان بنفس البروتوكول والمهارات ضمن الفترة المختارة." />
  );
  const previous = comparable.at(-2)!;
  const current = comparable.at(-1)!;
  const selected = current.skills.filter(s => s.score !== null && (!skill || skill === "all" || s.name === skill));
  const data = selected.slice(0, 5).map(s => ({
    name: s.name,
    "الفترة السابقة": (previous.skills.find(p => p.name === s.name)?.score ?? 0) / 10,
    "الفترة الحالية": (s.score ?? 0) / 10,
  }));
  return (
    <div className="report-comparison-block">
      <div className="report-comparison-bars" dir="ltr">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#edf1ef" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#5f706a" }} interval={0} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number) => `${value.toFixed(1)} / 10`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="الفترة السابقة" fill="#cbd2ce" radius={[4, 4, 0, 0]} />
            <Bar dataKey="الفترة الحالية" fill="#00865b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="report-source-note">
        {selected.length > 5 ? "أبرز خمس مهارات · " : ""}الدرجات معروضة من 10 للمقارنة؛ تفاصيل المهارات من 100.
        {current.isDemo ? " مقارنة بيانات تجريبية." : " المصدر: تقييمات مدرب محفوظة."}
      </p>
    </div>
  );
}

export default function VerifiedReportBody({ report, view }: { report: Report; view: string }) {
  const sessions = report.analyses.filter(a => a.pose && !a.isDemo);
  const assessments = report.coachAssessments ?? [];
  const ordered = orderedAssessments(assessments);
  const latest = ordered.at(-1);
  const previous = comparableAssessments(assessments).at(-2);
  const isDemo = Boolean(latest?.isDemo && report.player.isDemo);
  const selectedSkill = report.skill || "all";
  const [showAllVideos, setShowAllVideos] = useState(false);
  const [firstId, setFirstId] = useState(0);
  const [secondId, setSecondId] = useState(0);
  const first = sessions.find(a => a.id === firstId);
  const second = sessions.find(a => a.id === secondId);
  const compatibility = first && second ? compareSessionCompatibility(first, second) : null;
  const scored = latest?.skills.filter(s => s.score !== null) ?? [];
  const score10 = latest?.overall == null ? null : Number((latest.overall / 10).toFixed(1));
  const change = latest?.overall != null && previous?.overall != null && previous.overall > 0
    ? ((latest.overall - previous.overall) / previous.overall) * 100 : null;
  const summarySkills = scored.filter(s => selectedSkill === "all" || s.name === selectedSkill).slice(0, 4);
  const summaryIcons = [Target, Activity, Zap, Dumbbell];
  const visibleVideos = showAllVideos ? report.videos : report.videos.slice(0, 4);
  const latestPose = sessions[0];
  return (
    <section id="report-results" className="section-stack report-results" data-player-id={report.player.id}>
      <div className="report-player-heading">
        <div>
          <span className="eyebrow">تقرير اللاعب</span>
          <h2>{report.player.name}</h2>
          <p>{report.player.position} · {report.player.academyName} · {report.from.slice(0, 10)} — {report.to.slice(0, 10)}</p>
          <p data-testid="report-academy-tenure">تاريخ الانضمام للأكاديمية: {report.player.academyJoinDate || "غير محدد"} · مدة الانضمام حتى نهاية الفترة: {formatAcademyTenure(report.player.academyJoinDate, report.to.slice(0, 10) > calendarToday() ? calendarToday() : report.to.slice(0, 10))}</p>
          <small>{ACADEMY_TENURE_NOTE}</small>
        </div>
        <span className="badge">{view === "technical" ? "تقرير التحليل الفني" : view === "progress" ? "تطور الأداء" : "تقرير شامل"}</span>
      </div>
      {isDemo && (
        <p className="report-demo-disclosure">
          <Info size={17} /> بيانات وتقييمات تجريبية للعرض — ليست مستخرجة من تحليل ذكاء اصطناعي فعلي.
        </p>
      )}
      <div className="report-summary-top">
        <Panel title="ملخص الأداء العام" icon={Trophy}>
          <div className="report-performance-summary">
            <div className="report-overall-card">
              <ScoreRing score={score10} maxScore={10} label="من 10" size={142}
                documentedMethod={latest?.overall != null ? (isDemo ? "متوسط درجات المهارات التجريبية" : "متوسط تقييم المهارات المسجل") : null} />
              <strong data-testid="report-overall">{latest?.overall != null ? performanceLevel(latest.overall) : "لم تُقيّم بعد"}</strong>
              {change != null && <small className={change >= 0 ? "report-positive" : "report-negative"}>{change >= 0 ? "+" : ""}{change.toFixed(1)}% عن التقييم السابق</small>}
            </div>
            {summarySkills.map((skill, index) => {
              const Icon = summaryIcons[index % summaryIcons.length];
              return <article className="report-summary-skill" key={skill.name}>
                <Icon size={30} strokeWidth={2.5} />
                <span>{skill.name}</span>
                <strong>{skill.score}%</strong>
                <small>{performanceLevel(skill.score!)}</small>
              </article>;
            })}
            {!summarySkills.length && <p className="helper">لم يُسجل تقييم للمهارات ضمن الفترة المختارة.</p>}
          </div>
        </Panel>
        <Panel title="مقارنة الأداء" icon={BarChart3}>
          <CoachComparison assessments={assessments} skill={report.skill} />
        </Panel>
      </div>
      <div className="report-three-column">
        <Panel title="تطور الأداء عبر الزمن" icon={Activity}>
          <CoachTrend assessments={assessments} player={report.player} />
        </Panel>
        <Panel title="تقييم المهارات التفصيلي" icon={Target}>
          <CoachSkillBars assessments={assessments} player={report.player} skill={report.skill} />
        </Panel>
        <Panel title="أهم الملاحظات" icon={Info}>
          {latest ? <div className="report-key-findings">
            {latest.strengths.slice(0, 2).map((item, i) => <article className="report-finding good" key={`s-${i}`}><CheckCircle2 size={22} /><div><strong>{item}</strong><small>من نقاط القوة في {isDemo ? "تقييم العرض" : "التقييم المسجل"}</small></div></article>)}
            {latest.development.slice(0, 2).map((item, i) => <article className="report-finding warning" key={`d-${i}`}><Target size={22} /><div><strong>{item}</strong><small>أولوية تدريبية من المهارات الأقل تقييمًا</small></div></article>)}
            {latest.notes && <article className="report-finding info"><Info size={22} /><div><strong>{latest.notes}</strong><small>{latest.coachName}</small></div></article>}
          </div> : <EmptyState title="لم تُسجل ملاحظات تقييم" description="ستظهر ملاحظات التقييم المحفوظة هنا." />}
        </Panel>
      </div>
      <div className="report-bottom-grid">
        <Panel title="مقاطع الأداء المسجلة" icon={Video} actions={report.videos.length > 4 ? <button className="btn btn-ghost" type="button" onClick={() => setShowAllVideos(value => !value)}>{showAllVideos ? "عرض الأحدث" : `عرض الكل (${report.videos.length})`}</button> : undefined}>
          {report.videos.length ? isDemo ? <div className="report-video-grid">
            {visibleVideos.map(video => <article key={video.id} className="report-video-item">
              <SkillVideo video={video} playerId={report.player.id} compact />
              <strong>{video.skill}</strong>
              <small>{video.recordedAt.slice(0, 10)} · عينة عرض مرخصة</small>
              <span>{scored.find(s => s.name === video.skill)?.score ?? "—"} / 100</span>
            </article>)}
          </div> : <VideoLibrary videos={report.videos} playerId={report.player.id} />
            : <EmptyState title="لا توجد مقاطع في الفترة المحددة" description="ارفع مقطعًا أو اختر فترة أخرى." />}
        </Panel>
        <Panel title="ملخص التحليل والتوصيات" icon={BrainCircuit}>
          <div className="report-ai-summary">
            <FileText size={44} />
            <div>
              <h3>{isDemo ? "قراءة توضيحية للأداء" : "ملخص السجلات المحفوظة"}</h3>
              {latest ? <>
                <p>التقييم العام {score10} من 10، بناءً على {scored.length} مهارات في هذا السجل. {latest.strengths.slice(0, 2).join("، ")} من أبرز جوانب الأداء.</p>
                <p>يوصى بالتركيز على {latest.development.slice(0, 2).join("، ") || "خطة المدرب المسجلة"}، ومراجعة التمارين التصحيحية أدناه.</p>
                <small>{isDemo ? "ملخص مستند إلى درجات العرض؛ لم ينشئ الذكاء الاصطناعي هذه النتائج." : `المصدر: ${latest.coachName} · ${latest.assessedAt.slice(0, 10)}`}</small>
              </> : <p>لا توجد درجات مدرب في هذه الفترة؛ لا تُستنتج درجات مهارات من قياسات غير معايرة.</p>}
              {latestPose && <p className="report-actual-note">توجد {sessions.length} جلسة رؤية حاسوبية فعلية منفصلة باستخدام {latestPose.pose?.engine}، مرتبطة بمقاطعها. قياسات الجسم 2D لا تمثل درجة المهارة.</p>}
              <Link className="text-link" href={`/analysis?player=${report.player.id}`}>فتح التحليل الحركي الفعلي</Link>
            </div>
          </div>
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="أحدث ملاحظات المدربين" icon={ClipboardCheck}>
          {ordered.slice(-2).reverse().map(assessment => <article className="report-note" key={assessment.id}><CoachIdentity assessment={assessment} /><p>{assessment.notes}</p></article>)}
          {report.notes.map(note => <article className="report-note" key={`note-${note.id}`}><strong>{note.authorName || "ملاحظة محفوظة"}</strong><small> · {note.createdAt.slice(0, 10)}</small><p>{note.text}</p>{note.requiredAction && <p className="helper">الإجراء: {note.requiredAction}</p>}</article>)}
          {!ordered.length && !report.notes.length && <p className="muted">لا توجد ملاحظات مصرح بها ضمن الفترة.</p>}
        </Panel>
        <Panel title="التمارين الموصى بها" icon={FileText}>
          {latest?.exercises.length ? <div className="coach-exercises">
            {latest.exercises.map((exercise, index) => <article key={exercise.title}><span className="coach-exercise-number">{index + 1}</span><div><h3>{exercise.title}</h3><p>{exercise.description}</p></div></article>)}
          </div> : <p className="muted">تظهر التمارين بعد حفظ توصيات المدرب.</p>}
          {isDemo && <small className="report-source-note">توصيات عرض توضيحية؛ تعتمد الجرعة الفعلية على تقييم المدرب.</small>}
          <Link className="text-link" href={`/training?player=${report.player.id}`}>الخطط التدريبية المحفوظة</Link>
        </Panel>
      </div>
      {view !== "overview" && sessions.length > 0 && <>
        <Panel title="مقارنة التحليل الحركي الفعلي" icon={GitCompareArrows}>
          <div className="form-grid">
            <label>الجلسة السابقة<select className="field" value={firstId} onChange={event => setFirstId(Number(event.target.value))}><option value={0}>اختر جلسة</option>{sessions.map(analysis => <option key={analysis.id} value={analysis.id}>#{analysis.id} · {analysis.skill}</option>)}</select></label>
            <label>الجلسة الحالية<select className="field" value={secondId} onChange={event => setSecondId(Number(event.target.value))}><option value={0}>اختر جلسة أخرى</option>{sessions.map(analysis => <option key={analysis.id} value={analysis.id}>#{analysis.id} · {analysis.skill}</option>)}</select></label>
          </div>
          {!compatibility ? <p className="helper">اختر جلستين فعليتين متوافقتين.</p> : firstId === secondId ? <p className="form-error">اختر جلستين مختلفتين.</p> : !compatibility.compatible ? <p className="helper">{compatibility.reasons.join(" ")}</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>المؤشر</th><th>السابق</th><th>الحالي</th><th>الوحدة</th></tr></thead><tbody>{evaluateSession(first!).measurements.map(measurement => { const next = evaluateSession(second!).measurements.find(item => item.indicatorCode === measurement.indicatorCode); return <tr key={measurement.indicatorCode}><td>{measurement.name}</td><td>{measurement.value == null ? "غير مقاس" : measurement.value.toFixed(2)}</td><td>{next?.value == null ? "غير مقاس" : next.value.toFixed(2)}</td><td>{measurement.unit}</td></tr>; })}</tbody></table><p className="helper">فروق القياسات لا تعني حكمًا آليًا بتحسن الأداء.</p></div>}
        </Panel>
        {sessions.map(analysis => <Panel key={analysis.id} title={`الجلسة #${analysis.id} — ${analysis.skill}`} icon={Activity}><p className="helper">{analysis.createdAt.slice(0, 10)} · الفيديو #{analysis.videoId}</p><p className="helper">مدة الانضمام عند التحليل: {formatAcademyTenure(report.player.academyJoinDate, analysis.createdAt.slice(0, 10))}</p><SessionMeasurementGrid evaluation={analysis.evaluation ?? evaluateSession(analysis)} /><Link className="text-link" href={`/analysis?player=${analysis.playerId}&video=${analysis.videoId}&analysis=${analysis.id}`}>مراجعة التتبع ومصدر القياس</Link></Panel>)}
      </>}
    </section>
  );
}
