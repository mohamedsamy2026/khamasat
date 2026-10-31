import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Dumbbell,
  FileText,
  Footprints,
  Hash,
  Info,
  Layers,
  LockKeyhole,
  Pencil,
  Ruler,
  Scale,
  ShieldCheck,
  Target,
  Trophy,
  Upload,
  UserRound,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Analysis,
  AnalysisMetric,
  Player,
  PlayerCard,
  SkillValue,
  Video,
} from "@shared/athlete";
import { compareSessionCompatibility } from "@shared/evaluation";
import { ApiError, useApi, useAthlete } from "@/lib/athleteApi";
import {
  Avatar,
  DemoBadge,
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  Panel,
  ScoreRing,
  SkillBars,
  Tabs,
  TrendChart,
  UploadModal,
  VideoLibrary,
} from "@/components/athlete/UI";
import { ProfileVideoStrip } from "@/components/athlete/ProfileVideoStrip";
import PoseResults from "@/components/athlete/PoseResults";
import EvaluationSummary, {
  EvaluationFindingList,
  SessionMeasurementGrid,
  hasDocumentedOverall,
} from "@/components/athlete/EvaluationSummary";
import SessionNotes from "@/components/athlete/SessionNotes";
import ExercisePlans from "@/components/athlete/ExercisePlans";
import HealthPanel from "@/components/athlete/HealthPanel";
import PhysicalAssessments from "@/components/athlete/PhysicalAssessments";
import { gymnasticsCategoryName, sportDefinition } from "@shared/sports";
import "./athlete-pages.css";
import "./player-reference.css";
import "@/components/athlete/session-evaluation.css";

type ProfileTab =
  | "overview"
  | "physical"
  | "motion"
  | "skills"
  | "comparison"
  | "videos"
  | "reports"
  | "health";

const profileTabs: { id: ProfileTab; label: string }[] = [
  { id: "overview", label: "نظرة عامة" },
  { id: "health", label: "الملف الصحي" },
  { id: "physical", label: "التحليل البدني" },
  { id: "motion", label: "التحليل الحركي" },
  { id: "skills", label: "المهارات" },
  { id: "comparison", label: "المقارنات" },
  { id: "videos", label: "الفيديوهات" },
  { id: "reports", label: "التقارير" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("ar", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("ar")
    : "—";
}

function isForbidden(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

function documentedOverallText(player: Pick<PlayerCard, "evaluation">) {
  const overall = player.evaluation?.overall;
  return hasDocumentedOverall(player.evaluation)
    ? `${overall?.score?.toLocaleString("ar")} — ${overall?.method}`
    : "لم يُقيّم";
}

function SessionFollowUp({
  playerId,
  analysisId,
}: {
  playerId: number;
  analysisId?: number;
}) {
  const { orgId } = useAthlete();
  const contextKey = `${orgId ?? "unknown"}-${playerId}-${analysisId ?? "general"}`;
  return (
    <div className="session-follow-up-grid">
      <SessionNotes
        key={`notes-${contextKey}`}
        playerId={playerId}
        analysisId={analysisId}
      />
      <ExercisePlans
        key={`plans-${contextKey}`}
        playerId={playerId}
        analysisId={analysisId}
      />
    </div>
  );
}

function ObservationIcon({
  type,
}: {
  type: Analysis["observations"][number]["type"];
}) {
  if (type === "good")
    return (
      <CheckCircle2 aria-hidden="true" className="observation-icon good" />
    );
  if (type === "warning")
    return (
      <CircleAlert aria-hidden="true" className="observation-icon warning" />
    );
  return <Info aria-hidden="true" className="observation-icon info" />;
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Ruler;
  label: string;
  value: string | number;
}) {
  return (
    <div className="profile-detail-item">
      <Icon aria-hidden="true" size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlayerChooser({
  players,
  selectedId,
  onSelect,
}: {
  players: PlayerCard[];
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const phrase = search.trim().toLocaleLowerCase("ar");
    if (!phrase) return players;
    return players.filter(player =>
      [
        player.name,
        player.position,
        player.academyName,
        player.nationality,
      ].some(value => value.toLocaleLowerCase("ar").includes(phrase))
    );
  }, [players, search]);

  return (
    <section
      className="section-stack profile-selector"
      aria-label="اختيار لاعب"
    >
      <PageHeading
        title="ملف اللاعب الرياضي"
        subtitle="اختر لاعبًا متاحًا للاطلاع على ملفه وتحليلاته المسجلة."
        icon={UserRound}
        actions={<span className="badge">بطاقات مصرح بها</span>}
      />
      <Panel title="اختيار لاعب" icon={UserRound}>
        <div className="profile-search-row">
          <label className="search-field" htmlFor="player-profile-search">
            <span className="sr-only">البحث عن لاعب</span>
            <input
              id="player-profile-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث بالاسم أو المركز أو الأكاديمية"
            />
          </label>
          {selectedId ? (
            <span className="badge">اللاعب المحدد: #{selectedId}</span>
          ) : null}
        </div>
        {filtered.length ? (
          <div className="player-choice-grid">
            {filtered.map(player => (
              <button
                className={`player-choice-card ${selectedId === player.id ? "is-selected" : ""}`}
                key={player.id}
                type="button"
                onClick={() => onSelect(player.id)}
              >
                <Avatar player={player} size="md" />
                <span className="player-choice-copy">
                  <strong>{player.name}</strong>
                  <small>
                    {player.position} · {player.academyName}
                  </small>
                </span>
                <span className="score-tag">
                  {documentedOverallText(player)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="لا توجد نتائج مطابقة"
            description="جرّب تغيير عبارة البحث أو راجع قائمة اللاعبين المتاحة."
          />
        )}
      </Panel>
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: AnalysisMetric[] }) {
  if (!metrics.length) {
    return (
      <EmptyState
        title="لا توجد مقاييس مسجلة"
        description="ستظهر المقاييس هنا عند اكتمال تحليل فيديو للاعب."
      />
    );
  }

  return (
    <div className="stats-grid analysis-metrics-grid">
      {metrics.map(metric => (
        <article className="stat-card" key={`${metric.name}-${metric.unit}`}>
          <span className="muted">{metric.name}</span>
          <strong>
            {formatNumber(metric.value)} <small>{metric.unit}</small>
          </strong>
          <span className="score-tag">{metric.rating}</span>
        </article>
      ))}
    </div>
  );
}

function LatestAnalysis({ analysis }: { analysis?: Analysis }) {
  if (!analysis) {
    return (
      <EmptyState
        title="لا يوجد تحليل مسجل بعد"
        description="عند توفر تحليل موثق، ستظهر القياسات المحفوظة مع طريقة القياس وسبب الصلاحية هنا."
      />
    );
  }

  const isPoseResult = Boolean(analysis.pose && !analysis.isDemo);
  const isSimulation = analysis.isDemo || analysis.method === "simulation";

  return (
    <div className="section-stack latest-analysis-content">
      <div className="analysis-summary-line">
        <span className="badge">{analysis.skill}</span>
        <span className="muted">{formatDate(analysis.createdAt)}</span>
        {isPoseResult ? (
          <span className="badge">
            تقدير رؤية حاسوبية من المقطع — زوايا 2D غير معايرة
          </span>
        ) : isSimulation ? (
          <DemoBadge compact />
        ) : (
          <span className="badge">سجل تحليل متاح</span>
        )}
      </div>
      {analysis.evaluation ? (
        <EvaluationSummary
          evaluation={analysis.evaluation}
          kind="session"
          includeFindings={false}
        />
      ) : (
        <EmptyState
          title="لم تُقيّم هذه الجلسة"
          description={
            isSimulation
              ? "هذا سجل تجريبي أرشيفي؛ لا يثبت قياسًا أو معيارًا صالحًا للتقييم الحالي."
              : "لا توجد قياسات محفوظة مع طريقة تقييم موثقة لهذه الجلسة."
          }
        />
      )}
    </div>
  );
}

function OverviewTab({
  player,
  videos,
  analysis,
  onOpenVideos,
}: {
  player: Player;
  videos: Video[];
  analysis?: Analysis;
  onOpenVideos: () => void;
}) {
  return (
    <div className="section-stack">
      <div className="grid-3 profile-overview-grid">
        <Panel title="التقييم العام" icon={Trophy} className="score-panel">
          <EvaluationSummary
            evaluation={player.evaluation}
            kind="player"
            includeFindings={false}
          />
        </Panel>
        <Panel title="الجوانب التي تحتاج تطوير" icon={Target}>
          <EvaluationFindingList
            findings={player.evaluation?.development}
            classification="development"
            emptyReason="لا يوجد جانب تطوير يستوفي قاعدة تقييم موثقة. لا تُنشأ خطة عامة بديلة."
          />
        </Panel>
        <Panel title="نقاط القوة" icon={CheckCircle2}>
          <EvaluationFindingList
            findings={player.evaluation?.strengths}
            classification="strength"
            emptyReason="لا توجد نقطة قوة تستوفي قاعدة تقييم موثقة في الجلسات المتاحة."
          />
        </Panel>
      </div>
      {/* Notes and training plans remain visible even after a session receives an evaluation. */}
      <SessionFollowUp playerId={player.id} />
      <div className="grid-2 profile-overview-lower">
        <Panel title="تطور الأداء عبر الزمن" icon={Activity}>
          <EmptyState
            title="لا يوجد اتجاه موثق للمقارنة"
            description="يعرض التطور بعد وجود جلستين متوافقتين في الطريقة والوحدة والمهارة والقدم وظروف الاختبار؛ لا تستخدم قيم الملف القديمة كبديل."
          />
        </Panel>
        <Panel
          title="أحدث الفيديوهات"
          icon={ClipboardCheck}
          actions={
            <button
              className="btn btn-ghost"
              type="button"
              onClick={onOpenVideos}
            >
              عرض الكل <ArrowLeft size={15} />
            </button>
          }
        >
          {videos.length ? (
            <ProfileVideoStrip videos={videos} />
          ) : (
            <EmptyState
              title="لا توجد فيديوهات موثقة"
              description="ستظهر الفيديوهات المصرح بها هنا."
            />
          )}
        </Panel>
      </div>
      <details className="profile-latest-analysis">
        <summary>
          <BarChart3 aria-hidden="true" size={18} />
          تفاصيل أحدث تحليل مسجل
        </summary>
        <div className="profile-latest-analysis-content">
          <LatestAnalysis analysis={analysis} />
        </div>
      </details>
    </div>
  );
}

function PhysicalTab({
  player,
  latestAnalysis,
}: {
  player: Player;
  latestAnalysis?: Analysis;
}) {
  return (
    <div className="section-stack">
      <Panel title="المؤشرات البدنية الموحّدة" icon={Dumbbell}>
        <PhysicalAssessments
          playerId={player.id}
          sport={player.sport}
          compact
        />
      </Panel>
      <Panel
        title="القياسات والاختبارات البدنية (سجل نصي قديم)"
        icon={Dumbbell}
      >
        <p className="helper">
          هذه القيم نصية حرة محفوظة من إصدار سابق، وتُعرض للقراءة فقط للحفاظ على
          السجل التاريخي. الإدخال الجديد يتم عبر المؤشرات الموحّدة أعلاه فقط. لا
          تُستخرج هذه القيم من الفيديو ولا من نموذج ذكاء اصطناعي.
        </p>
        {player.physicalTests.length ? (
          <div className="stats-grid physical-tests-grid">
            {player.physicalTests.map(test => (
              <article className="stat-card" key={`${test.name}-${test.value}`}>
                <span className="muted">{test.name}</span>
                <strong>
                  {test.value} <small>{test.unit}</small>
                </strong>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="لا توجد اختبارات بدنية مسجلة"
            description="أضف اختبارات بدنية للاعب لتظهر في هذا القسم."
          />
        )}
      </Panel>
      <Panel title="مقاييس أحدث تحليل" icon={Activity}>
        <p className="helper">
          {latestAnalysis?.pose && !latestAnalysis.isDemo
            ? "تعرض القراءة الحاسوبية زوايا 2D من المقطع ولا تحولها إلى اختبارات بدنية أو تقييم رياضي."
            : "هذه مقاييس محاكاة محفوظة منفصلة عن الاختبارات البدنية أعلاه؛ ليست قياسات مستخرجة فعليًا من الفيديو."}
        </p>
        <LatestAnalysis analysis={latestAnalysis} />
      </Panel>
    </div>
  );
}

function MotionTab({ analyses }: { analyses: Analysis[] }) {
  if (!analyses.length) {
    return (
      <>
        <EmptyState
          title="لا توجد تحليلات حركية مسجلة"
          description="ستظهر زوايا المفاصل والملاحظات عند توفر تحليل فيديو معتمد."
        />
      </>
    );
  }

  return (
    <div className="section-stack">
      {analyses.map(analysis => {
        const isPoseResult = Boolean(analysis.pose && !analysis.isDemo);
        const isSimulation =
          analysis.isDemo || analysis.method === "simulation";
        return (
          <Panel
            key={analysis.id}
            title={`تحليل ${analysis.skill}`}
            icon={Activity}
            actions={
              <span className="muted">{formatDate(analysis.createdAt)}</span>
            }
          >
            {isPoseResult ? (
              <div className="section-stack">
                <p className="helper">
                  تقدير رؤية حاسوبية من المقطع — زوايا 2D غير معايرة
                </p>
                <PoseResults analysis={analysis} />
              </div>
            ) : (
              <div className="section-stack">
                {isSimulation ? (
                  <p className="privacy-note">
                    مثال أرشيفي محفوظ — لا تدخل زواياه أو ملاحظاته القديمة في
                    التقييم أو في خطة تدريب.
                  </p>
                ) : (
                  <span className="badge">سجل تحليل متاح</span>
                )}
                <SessionMeasurementGrid evaluation={analysis.evaluation} />
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}

function SkillsTab({ analyses }: { analyses: Analysis[] }) {
  const evaluated = analyses.filter(analysis => Boolean(analysis.evaluation));
  return (
    <div className="section-stack">
      <Panel title="المهارات المختبرة" icon={Target}>
        <p className="helper">
          لا تظهر هنا درجات ملف يدوية أو افتراضية. المهارة تعد مختبرة فقط عند
          وجود جلسة تحفظ القياس وطريقته.
        </p>
        {evaluated.length ? (
          <div className="session-measurement-grid">
            {evaluated.map(analysis => (
              <article className="session-measurement" key={analysis.id}>
                <span className="metric-code">جلسة #{analysis.id}</span>
                <strong>{analysis.skill}</strong>
                <p>
                  {formatDate(analysis.createdAt)} ·{" "}
                  {analysis.evaluation?.measurements.length ?? 0} قياس محفوظ
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="لم تُختبر مهارات موثقة"
            description="لا توجد جلسة تحفظ قياس مهارة صالحًا مع طريقة قياس موثقة."
          />
        )}
      </Panel>
      {evaluated.map(analysis => (
        <Panel
          key={analysis.id}
          title={`${analysis.skill} — قياسات الجلسة`}
          icon={BarChart3}
        >
          <SessionMeasurementGrid evaluation={analysis.evaluation} />
        </Panel>
      ))}
      {!evaluated.length ? (
        <EmptyState
          title="لا توجد نتائج مهارة موثقة"
          description="لا تظهر بيانات الأرشيف أو درجات الملف بدل نتائج جلسة قابلة للمراجعة."
        />
      ) : null}
    </div>
  );
}

function ComparisonTab({
  player,
  candidates,
  analyses,
}: {
  player: Player;
  candidates: PlayerCard[];
  analyses: Analysis[];
}) {
  const [otherPlayerId, setOtherPlayerId] = useState<number | undefined>();
  const sessions = useMemo(
    () => analyses.filter(analysis => Boolean(analysis.evaluation)),
    [analyses]
  );
  const [baseId, setBaseId] = useState<number | undefined>();
  const [currentId, setCurrentId] = useState<number | undefined>();
  const baseline = sessions.find(analysis => analysis.id === baseId);
  const current = sessions.find(analysis => analysis.id === currentId);
  const compatibility = useMemo(() => {
    if (!baseline || !current)
      return { compatible: false, reasons: ["اختر جلستين محفوظتين للمقارنة."] };
    if (baseline.id === current.id)
      return {
        compatible: false,
        reasons: ["اختر جلستين مختلفتين؛ جلسة واحدة لا تثبت تطورًا."],
      };
    return compareSessionCompatibility(baseline, current);
  }, [baseline, current]);
  const matchingMeasurements = useMemo(() => {
    if (
      !baseline?.evaluation ||
      !current?.evaluation ||
      !compatibility.compatible
    )
      return [];
    return baseline.evaluation.measurements.flatMap(measurement => {
      const peer = current.evaluation?.measurements.find(
        candidate =>
          candidate.indicatorCode === measurement.indicatorCode &&
          candidate.unit === measurement.unit &&
          measurement.validity === "valid" &&
          candidate.validity === "valid" &&
          typeof measurement.value === "number" &&
          typeof candidate.value === "number"
      );
      return peer ? [{ left: measurement, right: peer }] : [];
    });
  }, [baseline, compatibility.compatible, current]);

  return (
    <div className="section-stack">
      <Panel title="مقارنة جلسات اللاعب" icon={BarChart3}>
        <p className="muted">
          لا يُستنتج تحسن من جلسة واحدة أو من أشرطة مهارات قديمة. تعرض هذه
          المقارنة قياسات الجلسات المتوافقة فقط وبقيمها ووحداتها الأصلية.
        </p>
        <div className="form-grid profile-comparison-controls">
          <label>
            <span>جلسة الأساس</span>
            <select
              className="field"
              value={baseId ?? ""}
              onChange={event =>
                setBaseId(
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
            >
              <option value="">اختر جلسة</option>
              {sessions.map(session => (
                <option key={session.id} value={session.id}>
                  #{session.id} · {session.skill} ·{" "}
                  {formatDate(session.createdAt)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>جلسة المقارنة</span>
            <select
              className="field"
              value={currentId ?? ""}
              onChange={event =>
                setCurrentId(
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
            >
              <option value="">اختر جلسة</option>
              {sessions.map(session => (
                <option key={session.id} value={session.id}>
                  #{session.id} · {session.skill} ·{" "}
                  {formatDate(session.createdAt)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {sessions.length < 2 ? (
          <EmptyState
            title="لا تتوفر جلستان موثقتان"
            description="تحتاج مقارنة التطور إلى جلستين على الأقل مع قياسات محفوظة، ولا تستخدم سجل الملف أو القيم الافتراضية بديلًا."
          />
        ) : baseline &&
          current &&
          compatibility.compatible &&
          matchingMeasurements.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المؤشر</th>
                  <th>جلسة #{baseline.id}</th>
                  <th>جلسة #{current.id}</th>
                  <th>المرجع</th>
                </tr>
              </thead>
              <tbody>
                {matchingMeasurements.map(({ left, right }) => (
                  <tr key={left.indicatorCode}>
                    <th>{left.name}</th>
                    <td>
                      {formatNumber(left.value)} {left.unit}
                    </td>
                    <td>
                      {formatNumber(right.value)} {right.unit}
                    </td>
                    <td>نفس الرمز والوحدة والطريقة المتوافقة</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              baseline && current
                ? "المقارنة غير متاحة"
                : "اختر جلستين للمقارنة"
            }
            description={
              compatibility.reasons.join(" ") ||
              "لا توجد قياسات متطابقة صالحة في الجلستين؛ لا تُولد أرقام بديلة."
            }
          />
        )}
      </Panel>
      <Panel title="مقارنة لاعب آخر" icon={LockKeyhole}>
        <p className="muted">
          المقارنة الكمية بين ملفات لاعبين غير مدعومة من بيانات الملف القديمة.
          يلزم نموذج جلسات متوافق ومصرّح به لكلا اللاعبين؛ لذلك لا تعرض هذه
          الواجهة أصفارًا أو أشرطة تقديرية.
        </p>
        <label className="field">
          لاعب آخر (للتنقل فقط)
          <select
            value={otherPlayerId ?? ""}
            onChange={event =>
              setOtherPlayerId(
                event.target.value ? Number(event.target.value) : undefined
              )
            }
          >
            <option value="">اختر لاعبًا</option>
            {candidates.map(candidate => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} — {candidate.academyName}
              </option>
            ))}
          </select>
        </label>
        {otherPlayerId ? (
          <p className="evaluation-no-rule">
            لم يُقيّم: لا توجد مقارنة جلسات متعددة اللاعبين موثقة في هذا المسار.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function VideosTab({
  videos,
  playerId,
  canUpload,
}: {
  videos: Video[];
  playerId: number;
  canUpload: boolean;
}) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const hasLicensedSource = videos.some(video =>
    Boolean(
      (
        video as Video & {
          source?: {
            url: string;
            license: string;
            credit: string;
            description: string;
          } | null;
        }
      ).source
    )
  );
  return (
    <div className="section-stack" id="profile-videos">
      <Panel
        title="مقاطع أداء المهارات"
        icon={ClipboardCheck}
        actions={
          canUpload ? (
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => setUploadOpen(true)}
            >
              <Upload size={16} /> رفع فيديو
            </button>
          ) : undefined
        }
      >
        {hasLicensedSource ? (
          <p className="privacy-note">
            <ShieldCheck size={17} />
            ملف تجريبي — بيانات ملف العرض افتراضية ولا تمثل اسم الشخص المصوَّر
            أو عمره أو هويته. المقاطع مرخّصة من المصدر الموضح، ونتائج الحركة
            مستخرجة من الفيديو نفسه وليست من بيانات الملف الافتراضية.
          </p>
        ) : null}
        {videos.length ? (
          <VideoLibrary
            videos={videos}
            playerId={playerId}
            onUpload={canUpload ? () => setUploadOpen(true) : undefined}
            canStartAnalysis={canUpload}
          />
        ) : (
          <EmptyState
            title="لا توجد فيديوهات متاحة"
            description="لم يتم توثيق فيديوهات مصرح بها لهذا اللاعب حتى الآن."
          />
        )}
      </Panel>
      {uploadOpen ? (
        <UploadModal playerId={playerId} onClose={() => setUploadOpen(false)} />
      ) : null}
    </div>
  );
}

function ReportsTab({ player }: { player: Player }) {
  return (
    <div className="section-stack">
      <Panel title="التقارير والتحليلات" icon={FileText}>
        <div className="report-link-card">
          <div>
            <strong>تقرير {player.name}</strong>
            <p>اعرض التحليلات والتطور ضمن فترة زمنية ومهارة تختارها.</p>
          </div>
          <a className="btn btn-primary" href={`/reports?player=${player.id}`}>
            فتح التقرير <ArrowLeft size={16} />
          </a>
        </div>
      </Panel>
    </div>
  );
}

export default function PlayerProfile({ id }: { id?: string }) {
  const { organization, session } = useAthlete();
  const [, navigate] = useLocation();
  const providedId = id && /^\d+$/.test(id) ? Number(id) : undefined;
  const invalidId = Boolean(id && !providedId);
  const [chosenId, setChosenId] = useState<number | undefined>(providedId);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const playersQuery = useApi<PlayerCard[]>("/players");

  useEffect(() => {
    setChosenId(providedId);
    setTab("overview");
  }, [providedId]);

  const playerId = providedId ?? chosenId;
  const profileQuery = useApi<Player>(
    playerId ? `/players/${playerId}` : "/players/0",
    Boolean(playerId)
  );
  const hasProfile = Boolean(profileQuery.data);
  const analysesQuery = useApi<Analysis[]>(
    playerId ? `/analyses?playerId=${playerId}` : "/analyses?playerId=0",
    hasProfile
  );
  const videosQuery = useApi<Video[]>(
    playerId ? `/videos?playerId=${playerId}` : "/videos?playerId=0",
    hasProfile
  );

  const analyses = useMemo(
    () =>
      [...(analysesQuery.data ?? [])].sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      ),
    [analysesQuery.data]
  );
  const videos = videosQuery.data ?? [];

  if (invalidId) {
    return <ErrorState error={new Error("معرّف اللاعب غير صالح.")} />;
  }

  if (!playerId) {
    if (playersQuery.isLoading)
      return <Loading label="يتم تحميل قائمة اللاعبين…" />;
    if (playersQuery.isError)
      return (
        <ErrorState
          error={playersQuery.error}
          retry={() => playersQuery.refetch()}
        />
      );
    if (!playersQuery.data?.length)
      return (
        <EmptyState
          title="لا يوجد لاعبون متاحون"
          description="أضف لاعبًا أو اختر مؤسسة تحتوي على ملفات لاعبين."
        />
      );
    return (
      <PlayerChooser
        players={playersQuery.data}
        selectedId={chosenId}
        onSelect={playerId => {
          setChosenId(playerId);
          navigate(`/players/${playerId}`);
        }}
      />
    );
  }

  if (profileQuery.isLoading) return <Loading label="يتم تحميل ملف اللاعب…" />;
  if (isForbidden(profileQuery.error)) {
    return (
      <section className="section-stack profile-access-denied">
        <PageHeading
          title="ملف اللاعب"
          subtitle="هذا الملف محمي بصلاحية وصول."
          icon={LockKeyhole}
          actions={<span className="badge">يتطلب تصريحًا</span>}
        />
        <Panel title="الوصول غير متاح" icon={LockKeyhole}>
          <div className="locked-panel">
            <LockKeyhole aria-hidden="true" />
            <div>
              <strong>لا تملك صلاحية الاطلاع على التفاصيل الكاملة للاعب</strong>
              <p>
                يمكن للنادي استكشاف المواهب وطلب الوصول إلى ملف اللاعب قبل عرض
                التحليلات والفيديوهات.
              </p>
              <div className="inline-actions">
                <a className="btn btn-primary" href="/clubs">
                  استكشاف المواهب
                </a>
                <a className="btn btn-outline" href="/requests">
                  طلبات الوصول
                </a>
              </div>
            </div>
          </div>
        </Panel>
      </section>
    );
  }
  if (profileQuery.isError)
    return (
      <ErrorState
        error={profileQuery.error}
        retry={() => profileQuery.refetch()}
      />
    );
  if (!profileQuery.data)
    return (
      <EmptyState
        title="تعذر العثور على الملف"
        description="قد يكون اللاعب غير متاح للمؤسسة الحالية."
      />
    );

  const player = profileQuery.data;
  const isVideoSample = player.isDemo && player.age === 0;
  const relatedLoading = analysesQuery.isLoading || videosQuery.isLoading;
  const relatedError = analysesQuery.error ?? videosQuery.error;
  const candidates = (playersQuery.data ?? []).filter(
    candidate => candidate.id !== player.id
  );

  let content: ReactNode;
  if (
    relatedLoading &&
    ["overview", "physical", "motion", "skills", "videos"].includes(tab)
  ) {
    content = <Loading label="يتم تحميل التحليلات والوسائط المصرح بها…" />;
  } else if (
    relatedError &&
    ["overview", "physical", "motion", "skills", "videos"].includes(tab)
  ) {
    content = (
      <ErrorState
        error={relatedError}
        retry={() => {
          void analysesQuery.refetch();
          void videosQuery.refetch();
        }}
      />
    );
  } else {
    switch (tab) {
      case "physical":
        content = <PhysicalTab player={player} latestAnalysis={analyses[0]} />;
        break;
      case "health":
        content = <HealthPanel playerId={player.id} />;
        break;
      case "motion":
        content = <MotionTab analyses={analyses} />;
        break;
      case "skills":
        content = <SkillsTab analyses={analyses} />;
        break;
      case "comparison":
        content = (
          <ComparisonTab
            player={player}
            candidates={candidates}
            analyses={analyses}
          />
        );
        break;
      case "videos":
        content = (
          <VideosTab
            videos={videos}
            playerId={player.id}
            canUpload={organization?.type === "academy"}
          />
        );
        break;
      case "reports":
        content = <ReportsTab player={player} />;
        break;
      default:
        content = (
          <OverviewTab
            player={player}
            videos={videos}
            analysis={analyses[0]}
            onOpenVideos={() => setTab("videos")}
          />
        );
    }
  }

  return (
    <section className="section-stack player-profile-page">
      <PageHeading
        title="ملف اللاعب الرياضي"
        subtitle="معلومات شاملة، نتائج التحليل، نقاط القوة والضعف، وتطور الأداء"
        icon={ShieldCheck}
        actions={
          <div className="profile-heading-actions">
            {session?.mode === "demo" ? (
              <span className="badge">بيانات افتراضية</span>
            ) : null}
            {organization?.type === "academy" && !isVideoSample ? (
              <a
                className="btn btn-outline"
                href={`/academies?edit=${player.id}`}
              >
                <Pencil size={16} />
                تعديل المعلومات
              </a>
            ) : null}
          </div>
        }
      />
      <Panel className="player-profile-header">
        <div className="profile-identity">
          <Avatar player={player} size="lg" />
          <div>
            <h2>{player.name}</h2>
            <p>
              {isVideoSample ? (
                "ملف فيديو مرخّص — بيانات الشخص غير منسوبة"
              ) : (
                <>
                  {player.age} سنة <span>·</span> {player.position}
                </>
              )}
            </p>
            <p className="muted">{player.academyName}</p>
            <p className="profile-nationality">{player.nationality}</p>
            {!isVideoSample && (
              <span className="jersey-badge">
                <Hash size={15} />
                رقم اللاعب: {player.jersey}
              </span>
            )}
          </div>
        </div>
        <div className="profile-details-grid">
          <DetailItem
            icon={UserRound}
            label="العمر"
            value={isVideoSample ? "غير منسوب" : `${player.age} سنة`}
          />
          <DetailItem
            icon={UserRound}
            label="الفئة العمرية"
            value={
              isVideoSample
                ? "غير منسوبة"
                : player.age <= 17
                  ? "الناشئين"
                  : `فئة ${player.age} سنة`
            }
          />
          <DetailItem
            icon={Scale}
            label="الوزن"
            value={
              isVideoSample ? "غير مقاس" : `${formatNumber(player.weight)} كغ`
            }
          />
          <DetailItem
            icon={Ruler}
            label="الطول"
            value={
              isVideoSample ? "غير مقاس" : `${formatNumber(player.height)} سم`
            }
          />
          <DetailItem
            icon={Footprints}
            label="القدم المفضلة"
            value={player.foot}
          />
          <DetailItem
            icon={UserRound}
            label={sportDefinition(player.sport).terminology.group}
            value={player.position}
          />
          <DetailItem
            icon={Activity}
            label="الرياضة"
            value={sportDefinition(player.sport).name}
          />
          <DetailItem
            icon={UserRound}
            label="الموقع"
            value={isVideoSample ? "غير منسوب" : player.region || "غير محدد"}
          />
          {player.sport === "gymnastics" && player.gymnasticsCategory ? (
            <DetailItem
              icon={Layers}
              label="فئة الجمباز"
              value={gymnasticsCategoryName(player.gymnasticsCategory)}
            />
          ) : null}
          <DetailItem
            icon={CalendarDays}
            label="تاريخ الميلاد"
            value={isVideoSample ? "غير منسوب" : formatDate(player.birthDate)}
          />
        </div>
      </Panel>
      <Tabs
        items={profileTabs}
        value={tab}
        onChange={(value: string) => setTab(value as ProfileTab)}
      />
      {content}
    </section>
  );
}
