import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  Save,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Player, Video } from "@shared/athlete";
import type { CoachAssessment, CoachAssessmentInput } from "@shared/coaching";
import { skillsForPlayer } from "@shared/coaching";
import type { DemoDisplay, DemoSkill } from "@shared/demo-display";
import { ACADEMY_TENURE_NOTE, formatAcademyTenure, getAcademyTenure } from "@shared/academy-tenure";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import { ProfileVideoStrip } from "@/components/athlete/ProfileVideoStrip";
import { EmptyState, ErrorState, Loading, Panel, ScoreRing } from "./UI";
import "./coach-assessments.css";

type ProfilePlayer = Player & {
  demoDisplay?: DemoDisplay;
  primaryApparatus?: string;
};

export const orderedAssessments = (items: CoachAssessment[]) =>
  [...items].sort(
    (a, b) => Date.parse(a.assessedAt) - Date.parse(b.assessedAt) || a.id - b.id
  );

export function comparableAssessments(items: CoachAssessment[]) {
  const ordered = orderedAssessments(items).filter(a => a.overall !== null);
  const last = ordered.at(-1);
  if (!last) return [];
  const signature = (a: CoachAssessment) =>
    a.measuredSignature ?? a.skills
      .filter(s => s.score !== null)
      .map(s => s.name)
      .sort()
      .join("|");
  return ordered.filter(
    a => a.protocol === last.protocol && signature(a) === signature(last)
  );
}

const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("ar-SA", {
    calendar: "gregory",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const lines = (text: string) =>
  text
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

/** Supports the incoming third apparatus parameter while staying compatible with saved profiles. */
function scopedSkills(player: Pick<ProfilePlayer, "sport" | "position" | "primaryApparatus">) {
  return (
    skillsForPlayer as (
      sport: string,
      position: string,
      primaryApparatus?: string
    ) => readonly string[]
  )(player.sport, player.position, player.primaryApparatus);
}

function demoOverall10(skills: DemoSkill[]) {
  const values = skills
    .map(skill => skill.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  return values.length
    ? values.reduce((total, score) => total + score, 0) / values.length / 10
    : null;
}

function demoFindings(skills: DemoSkill[], field: "strengths" | "development", direction: "high" | "low") {
  const ordered = skills.filter(skill => skill.score !== null).sort((left, right) =>
    direction === "high" ? (right.score ?? 0) - (left.score ?? 0) : (left.score ?? 0) - (right.score ?? 0)
  );
  return ordered.slice(0, 2).map(skill => {
    const finding = skill[field].at(0);
    return finding ? `${skill.name}: ${finding}` : skill.name;
  });
}

export function CoachIdentity({ assessment }: { assessment: CoachAssessment }) {
  return (
    <div className="coach-identity">
      <span className="coach-avatar">
        {assessment.coachPhotoKey ? (
          <img
            src={assessment.coachPhotoKey}
            alt={`صورة المدرب ${assessment.coachName}`}
          />
        ) : (
          <UserRound size={22} />
        )}
      </span>
      <div>
        <strong>{assessment.coachName || "مدرب غير منسوب"}</strong>
        <small>
          <time dateTime={assessment.assessedAt}>{dateLabel(assessment.assessedAt)}</time>
          {assessment.isDemo
            ? " · مدرب مساحة العرض — تقييم تجريبي محفوظ"
            : " · تقييم مدرب موثق"}
        </small>
      </div>
    </div>
  );
}

export function CoachNotesFeed({ assessments }: { assessments: CoachAssessment[] }) {
  const [showAll, setShowAll] = useState(false);
  const notes = orderedAssessments(assessments).reverse().filter(assessment => assessment.notes.trim());
  const visible = showAll ? notes : notes.slice(0, 3);
  return (
    <div className="coach-notes-feed" data-testid="coach-notes-feed">
      {notes.length ? visible.map(assessment => (
        <article className="coach-note-card" key={assessment.id}>
          <CoachIdentity assessment={assessment} />
          <blockquote>{assessment.notes}</blockquote>
          <small className="helper">{assessment.isDemo ? "ملاحظة محفوظة في ملف عرض تجريبي — لا تمثل تحليلًا آليًا. الملاحظات الافتراضية موسومة داخل النص واسم المدرب." : "نص الملاحظة المحفوظ كما أدخله المدرب."}</small>
        </article>
      )) : <EmptyState title="لا توجد ملاحظات محفوظة بعد" description="يمكن إضافة ملاحظة مؤرخة مع اسم المدرب وصورته من قسم تقييم المدرب." />}
      {notes.length > 3 ? <button className="btn btn-ghost" type="button" onClick={() => setShowAll(value => !value)}>{showAll ? "إخفاء الملاحظات السابقة" : `عرض جميع ملاحظات المدرب (${notes.length})`}</button> : null}
    </div>
  );
}

export function CoachSkillBars({
  assessments,
  player,
  skill,
  skills,
}: {
  assessments: CoachAssessment[];
  player: Pick<ProfilePlayer, "sport" | "position" | "primaryApparatus">;
  /** Retains the skill-specific filter used by reports and assessment panels. */
  skill?: string | null;
  /** Saved demo records, never inferred from pose data. */
  skills?: DemoSkill[];
}) {
  const latest = orderedAssessments(assessments).at(-1);
  const names = (skills?.map(item => item.name) ?? scopedSkills(player)).filter(
    name => !skill || name === skill
  );
  return (
    <div className="coach-skill-bars">
      {names.map(name => {
        const demoSkill = skills?.find(item => item.name === name);
        const score = demoSkill?.score ?? latest?.skills.find(item => item.name === name)?.score ?? null;
        return (
          <div className="coach-skill-row" key={name}>
            <span>{name}</span>
            <div className="coach-skill-track">
              <i style={{ width: score === null ? "0%" : `${score}%` }} />
            </div>
            <strong>
              {score === null
                ? "لم تُقيّم بعد"
                : `${score.toLocaleString("ar")} / 100`}
            </strong>
          </div>
        );
      })}
      <p className="helper">
        {skills?.length
          ? "المصدر: مهارات عرض تجريبية محفوظة — ليست قياسًا آليًا أو معيارًا علميًا."
          : latest
            ? `المصدر: ${latest.coachName} · ${dateLabel(latest.assessedAt)} · بروتوكول: ${latest.protocol}`
            : "لا توجد درجات مدرب محفوظة. لا تُستنتج الدرجات من الصورة أو من زوايا الحركة."}
      </p>
    </div>
  );
}

export function CoachTrend({
  assessments,
  player,
  demoSkills,
}: {
  assessments: CoachAssessment[];
  player?: Pick<ProfilePlayer, "sport" | "position" | "primaryApparatus" | "academyJoinDate">;
  demoSkills?: DemoSkill[];
}) {
  const availableSkills = demoSkills?.map(skill => skill.name) ?? (player ? scopedSkills(player) : []);
  const [metric, setMetric] = useState("overall");
  const comparable = comparableAssessments(assessments);
  const isOverall = metric === "overall";
  const data = comparable.flatMap(assessment => {
    const raw = isOverall
      ? assessment.overall === null
        ? null
        : assessment.overall / 10
      : assessment.skills.find(skill => skill.name === metric)?.score ?? null;
    return typeof raw === "number" && Number.isFinite(raw)
      ? [{ date: dateLabel(assessment.assessedAt), rawDate: assessment.assessedAt.slice(0, 10), score: raw }]
      : [];
  });

  return (
    <div className="coach-trend-wrap">
      {availableSkills.length ? (
        <label className="coach-trend-filter">
          <span>المؤشر المعروض</span>
          <select value={metric} onChange={event => setMetric(event.target.value)}>
            <option value="overall">التقييم الإجمالي / 10</option>
            {availableSkills.map(name => (
              <option key={name} value={name}>
                {name} / 100
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {data.length < 2 ? (
        <EmptyState
          title="لم يُقيّم التطور بعد"
          description="يلزم تقييمان محفوظان بنفس البروتوكول ونفس المهارات المقاسة. لا يُعامل نقص البيانات كصفر."
        />
      ) : (
        <>
          <div className="coach-trend" dir="ltr">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart
                data={data}
                margin={{ top: 12, right: 12, left: -15, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="coach-trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#009c6b" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#009c6b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e8efec" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={isOverall ? [0, 10] : [0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip content={({ active, payload }) => {
                  const point = payload?.[0]?.payload;
                  return active && point ? <div className="coach-tenure-tooltip" dir="rtl"><strong>{point.date}</strong><p>{point.score.toFixed(1)} / {isOverall ? 10 : 100}</p><p>مدة الانضمام عند التقييم: {formatAcademyTenure(player?.academyJoinDate, point.rawDate)}</p></div> : null;
                }} />
                <Area
                  dataKey="score"
                  name={isOverall ? "تقييم المدرب من 10" : "تقييم المهارة من 100"}
                  stroke="#009c6b"
                  strokeWidth={3}
                fill="url(#coach-trend-fill)"
                  dot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="helper">
            {isOverall
              ? "المحور من 10: متوسط المهارات المحفوظة فقط."
              : "المحور من 100: درجة المهارة المختارة في تقييمات المدرب المحفوظة."}
          </p>
        </>
      )}
      {player?.academyJoinDate && data.length > 0 && <div className="table-wrap coach-tenure-table" data-testid="academy-tenure-history"><table className="data-table"><thead><tr><th>تاريخ التقييم</th><th>التقييم / {isOverall ? 10 : 100}</th><th>مدة الانضمام عند التقييم</th></tr></thead><tbody>{data.map((point, index) => <tr key={`${point.rawDate}-${index}`}><td>{point.rawDate}</td><td>{point.score.toFixed(1)}</td><td>{formatAcademyTenure(player.academyJoinDate, point.rawDate)}{getAcademyTenure(player.academyJoinDate, point.rawDate) ? <small> · {getAcademyTenure(player.academyJoinDate, point.rawDate)!.totalDays} يومًا إجماليًا</small> : null}</td></tr>)}</tbody></table><p className="helper">{ACADEMY_TENURE_NOTE}</p></div>}
    </div>
  );
}

function LatestCoachRecord({
  assessment,
  demoSkills,
}: {
  assessment?: CoachAssessment;
  demoSkills?: DemoSkill[];
}) {
  if (!assessment) {
    return (
      <EmptyState
        title="لم تُقيّم بعد"
        description="لا توجد ملاحظات أو تمارين مدرب محفوظة لهذا اللاعب."
      />
    );
  }
  const exercises = assessment.exercises.length
    ? assessment.exercises
    : demoSkills
        ?.flatMap(skill => skill.exercises)
        .slice(0, 3) ?? [];
  return (
    <div className="coach-latest-record">
      <CoachIdentity assessment={assessment} />
      {assessment.notes.trim() ? (
        <p className="coach-latest-note">{assessment.notes}</p>
      ) : (
        <p className="muted">لا توجد ملاحظة نصية محفوظة في هذا التقييم.</p>
      )}
      {exercises.length ? (
        <div className="coach-exercises">
          {exercises.map((exercise, index) => (
            <article key={`${exercise.title}-${index}`}>
              <span className="coach-exercise-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{exercise.title}</h3>
                <p>{exercise.description}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">لا توجد تمارين تصحيحية محفوظة في هذا التقييم.</p>
      )}
    </div>
  );
}

export function CoachOverview({
  player,
  videos,
  onOpenVideos,
}: {
  player: Player;
  videos?: Video[];
  onOpenVideos?: () => void;
}) {
  const profilePlayer = player as ProfilePlayer;
  const demo = profilePlayer.demoDisplay;
  const query = useApi<CoachAssessment[]>(
    `/players/${player.id}/coach-assessments`,
    !demo
  );
  if (!demo && query.isLoading) return <Loading label="جارٍ تحميل تقييمات المدرب…" />;
  if (!demo && query.isError)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;

  const items = demo?.assessments ?? query.data ?? [];
  const latest = orderedAssessments(items).at(-1);
  const overall = demo ? demo.overall10 : typeof latest?.overall === "number" ? latest.overall / 10 : null;
  const documentedMethod = demo
    ? "متوسط المهارات المقاسة في التقييم الأخير نفسه / 10؛ لا تُخلط درجات جلسات مختلفة"
    : latest?.overall !== null && latest?.overall !== undefined
      ? "المتوسط الحسابي للمهارات المقاسة في تقييم المدرب / 10"
      : null;
  const development = latest?.development ?? [];
  const strengths = latest?.strengths ?? [];
  const hasVideoRow = videos !== undefined;

  return (
    <div className="section-stack coach-overview">
      <div className="coach-summary-grid profile-overview-grid">
        <Panel title="التقييم الإجمالي" icon={Trophy} className="coach-score-panel score-panel">
          <ScoreRing
            score={overall}
            maxScore={10}
            label="من 10"
            documentedMethod={documentedMethod}
            size={168}
          />
          <p className="helper">
            {demo
              ? "المصدر: عرض تجريبي محفوظ · متوسط المهارات نفسها / 10"
              : overall !== null
                ? "متوسط المهارات المقاسة فقط · تقييم مدرب"
                : "لم تُقيّم بعد — لا توجد درجة محفوظة"}
          </p>
          {latest ? <CoachIdentity assessment={latest} /> : null}
        </Panel>
        <Panel title="الجوانب التي تحتاج تطوير" icon={Target}>
          {development.length ? (
            <ul className="coach-findings development">
              {development.map((text, index) => (
                <li key={`${text}-${index}`}>
                  <Target size={19} />
                  {text}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="لم تُحدد بعد"
              description="ستظهر الجوانب التي يسجلها المدرب بناءً على تقييمه."
            />
          )}
        </Panel>
        <Panel title="نقاط القوة" icon={CheckCircle2}>
          {strengths.length ? (
            <ul className="coach-findings">
              {strengths.map((text, index) => (
                <li key={`${text}-${index}`}>
                  <CheckCircle2 size={20} />
                  {text}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="لم تُحدد بعد"
              description="لا توجد نقاط قوة مسجلة بواسطة مدرب."
            />
          )}
        </Panel>
      </div>
      <div className="grid-2 coach-overview-lower">
        <Panel title="تطور الأداء عبر الزمن" icon={Activity}>
          <CoachTrend assessments={items} player={profilePlayer} demoSkills={demo?.skills} />
        </Panel>
        {hasVideoRow ? (
          <Panel
            title="أحدث الفيديوهات"
            icon={ClipboardCheck}
            actions={
              onOpenVideos ? (
                <button className="btn btn-ghost" type="button" onClick={onOpenVideos}>
                  عرض الكل
                </button>
              ) : undefined
            }
          >
            {videos.length ? (
              <ProfileVideoStrip videos={videos} />
            ) : (
              <EmptyState
                title="لا توجد فيديوهات موثقة"
                description="ستظهر المقاطع الفعلية المصرح بها هنا عند إضافتها."
              />
            )}
          </Panel>
        ) : (
          <Panel title="تقييم المهارات" icon={ClipboardCheck}>
            <CoachSkillBars assessments={items} player={profilePlayer} skills={demo?.skills} />
          </Panel>
        )}
      </div>
      <Panel title="ملاحظات المدرب" icon={ClipboardCheck} className="coach-notes-panel">
        <CoachNotesFeed assessments={items} />
      </Panel>
      <Panel title="أحدث ملاحظات المدرب والتمارين التصحيحية" icon={Dumbbell} className="coach-latest-panel">
        <LatestCoachRecord assessment={latest} demoSkills={demo?.skills} />
      </Panel>
    </div>
  );
}

export function CoachAssessmentPanel({
  player,
  readOnly = false,
}: {
  player: Player;
  readOnly?: boolean;
}) {
  const profilePlayer = player as ProfilePlayer;
  const { organization, invalidate } = useAthlete();
  const query = useApi<CoachAssessment[]>(
    `/players/${player.id}/coach-assessments`
  );
  const skillNames = useMemo(
    () => scopedSkills(profilePlayer),
    [profilePlayer.primaryApparatus, profilePlayer.position, profilePlayer.sport]
  );
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [assessedAt, setAssessedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [protocol, setProtocol] = useState("");
  const [notes, setNotes] = useState("");
  const [strengths, setStrengths] = useState("");
  const [development, setDevelopment] = useState("");
  const [exercises, setExercises] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const canWrite = !readOnly && organization?.type === "academy";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!protocol.trim()) {
      setError("اكتب اسم بروتوكول التقييم حتى تكون المقارنات قابلة للمراجعة.");
      return;
    }
    if (!Object.values(scores).some(value => value !== "")) {
      setError("قيّم مهارة واحدة على الأقل. اترك غير المقاسة فارغة.");
      return;
    }
    const input: CoachAssessmentInput = {
      assessedAt: `${assessedAt}T12:00:00.000Z`,
      protocol: protocol.trim(),
      notes: notes.trim(),
      skills: skillNames.map(name => ({
        name,
        score:
          scores[name] === undefined || scores[name] === ""
            ? null
            : Number(scores[name]),
      })),
      strengths: lines(strengths),
      development: lines(development),
      exercises: lines(exercises).map(line => {
        const [title, ...parts] = line.split("|");
        return { title: title.trim(), description: parts.join("|").trim() };
      }),
    };
    setSaving(true);
    try {
      await api(`/players/${player.id}/coach-assessments`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      await invalidate();
      setOpen(false);
      setScores({});
      setNotes("");
      setStrengths("");
      setDevelopment("");
      setExercises("");
      setSuccess("تم حفظ تقييم المدرب وربطه بملف اللاعب والتقارير.");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "تعذر حفظ التقييم.");
    } finally {
      setSaving(false);
    }
  }

  const items = query.data ?? [];
  return (
    <Panel
      title="تقييم مهارات اللاعب من 100"
      icon={Target}
      actions={
        canWrite ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              setOpen(!open);
              setError("");
              setSuccess("");
            }}
            type="button"
          >
            <ClipboardCheck size={17} />
            {open ? "إغلاق النموذج" : "إضافة تقييم مدرب"}
          </button>
        ) : undefined
      }
    >
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <CoachSkillBars assessments={items} player={profilePlayer} />
      )}
      {success ? (
        <p className="coach-save-success" role="status">
          {success}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {open && canWrite ? (
        <form className="coach-assessment-form" onSubmit={event => void save(event)}>
          <div className="coach-form-intro">
            <strong>تقييم مدرب، وليس تحليلًا آليًا</strong>
            <p>
              سيُحفظ اسم صاحب الجلسة وتاريخ التقييم والبروتوكول. اترك المهارات غير المقاسة فارغة.
            </p>
          </div>
          <div className="form-grid">
            <label>
              <span>تاريخ التقييم</span>
              <input
                className="field"
                type="date"
                value={assessedAt}
                onChange={event => setAssessedAt(event.target.value)}
                required
              />
            </label>
            <label>
              <span>بروتوكول التقييم</span>
              <input
                className="field"
                aria-label="بروتوكول التقييم"
                value={protocol}
                onChange={event => setProtocol(event.target.value)}
                placeholder="مثال: اختبار المهارات الأسبوعي — إصدار 1"
                required
                maxLength={160}
              />
            </label>
          </div>
          <div className="coach-score-inputs">
            {skillNames.map(name => (
              <label key={name}>
                <span>{name}</span>
                <div>
                  <input
                    type="number"
                    className="field"
                    aria-label={`تقييم ${name}`}
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder="غير مقاسة"
                    value={scores[name] ?? ""}
                    onChange={event =>
                      setScores(current => ({ ...current, [name]: event.target.value }))
                    }
                  />
                  <small>/ 100</small>
                </div>
              </label>
            ))}
          </div>
          <div className="form-grid">
            <label>
              <span>نقاط القوة — كل نقطة في سطر</span>
              <textarea
                className="field"
                aria-label="نقاط القوة"
                value={strengths}
                onChange={event => setStrengths(event.target.value)}
                maxLength={2000}
              />
            </label>
            <label>
              <span>الجوانب التي تحتاج تطوير — كل جانب في سطر</span>
              <textarea
                className="field"
                aria-label="الجوانب التي تحتاج تطوير"
                value={development}
                onChange={event => setDevelopment(event.target.value)}
                maxLength={2000}
              />
            </label>
          </div>
          <label>
            <span>التمارين الموصى بها</span>
            <textarea
              className="field"
              aria-label="التمارين الموصى بها"
              value={exercises}
              onChange={event => setExercises(event.target.value)}
              placeholder="اسم التمرين | تعليمات المدرب (كل تمرين في سطر)"
              maxLength={4000}
            />
          </label>
          <label>
            <span>ملاحظات التقييم</span>
            <textarea
              className="field"
              aria-label="ملاحظات التقييم"
              value={notes}
              onChange={event => setNotes(event.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="inline-actions">
            <button className="btn btn-primary" disabled={saving} type="submit">
              <Save size={17} />
              {saving ? "جارٍ حفظ التقييم…" : "حفظ تقييم المدرب"}
            </button>
            <button
              className="btn btn-outline"
              type="button"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              إلغاء
            </button>
          </div>
        </form>
      ) : null}
      {items.length > 0 ? (
        <details className="coach-assessment-history">
          <summary>سجل تقييمات المدرب ({items.length})</summary>
          {orderedAssessments(items)
            .reverse()
            .map(assessment => (
              <article key={assessment.id}>
                <CoachIdentity assessment={assessment} />
                <span className="badge">
                  {assessment.overall === null
                    ? "لم تُقيّم بعد"
                    : `${assessment.overall.toLocaleString("ar")} / 100`}
                </span>
                <p>بروتوكول: {assessment.protocol}</p>
                {assessment.notes ? <p>{assessment.notes}</p> : null}
              </article>
            ))}
        </details>
      ) : null}
    </Panel>
  );
}
