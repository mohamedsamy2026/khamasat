import { useEffect, useMemo, useState } from "react";
import VerifiedReportBody from "@/components/athlete/VerifiedReportBody";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Lightbulb,
  LockKeyhole,
  Printer,
  Search,
  Target,
  Trophy,
  Video,
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
import {
  SKILLS,
  type AccessRequest,
  type Analysis,
  type HistoryPoint,
  type PlayerCard,
  type Report,
} from "@shared/athlete";
import {
  ApiError,
  downloadPrivate,
  saveBlob,
  useApi,
  useAthlete,
} from "@/lib/athleteApi";
import {
  DemoBadge,
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  Panel,
  ScoreRing,
  SkillBars,
  TrendChart,
  VideoLibrary,
} from "@/components/athlete/UI";
import "./athlete-pages.css";

type ReportView = "overview" | "technical" | "progress";
type ReportFilters = {
  playerId?: number;
  from: string;
  to: string;
  skill: string;
  type: ReportView;
};
type ExportFormat = "html" | "csv";

function inputDate(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function initialDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  return { from: inputDate(from), to: inputDate(to) };
}

function readPlayerFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("player");
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

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
    : "غير مقاس";
}

function isForbidden(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

function average(values: number[]) {
  const valid = values.filter(value => Number.isFinite(value));
  return valid.length
    ? valid.reduce((total, value) => total + value, 0) / valid.length
    : undefined;
}

function periodComparison(history: HistoryPoint[], from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59`);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  )
    return undefined;

  const rangeDuration = end.getTime() - start.getTime() + 1;
  const previousStart = new Date(start.getTime() - rangeDuration);
  const previousEnd = new Date(start.getTime() - 1);
  const points = history.flatMap(point => {
    const date = new Date(point.date);
    return Number.isNaN(date.getTime()) || !Number.isFinite(point.score)
      ? []
      : [{ date, score: point.score }];
  });
  const current = average(
    points
      .filter(point => point.date >= start && point.date <= end)
      .map(point => point.score)
  );
  const previous = average(
    points
      .filter(point => point.date >= previousStart && point.date <= previousEnd)
      .map(point => point.score)
  );
  if (current === undefined || previous === undefined) return undefined;
  return { current, previous, previousStart, previousEnd };
}

function ObservationIcon({
  type,
}: {
  type: Analysis["observations"][number]["type"];
}) {
  if (type === "good")
    return (
      <CheckCircle2 className="observation-icon good" aria-hidden="true" />
    );
  if (type === "warning")
    return (
      <CircleAlert className="observation-icon warning" aria-hidden="true" />
    );
  return <Info className="observation-icon info" aria-hidden="true" />;
}

function ReportViewLabel({ view }: { view: ReportView }) {
  return (
    <span className="badge">
      {view === "overview"
        ? "تقرير شامل"
        : view === "technical"
          ? "تقرير تقني"
          : "تقرير تقدم"}
    </span>
  );
}

function AnalysisSource({ analysis }: { analysis: Analysis }) {
  if (analysis.pose && !analysis.isDemo) {
    return (
      <span className="badge">
        تقدير رؤية حاسوبية من المقطع — زوايا 2D غير معايرة
      </span>
    );
  }
  if (analysis.isDemo || analysis.method === "simulation")
    return <DemoBadge compact />;
  return <span className="badge">سجل تحليل متاح</span>;
}

function FilterForm({
  value,
  players,
  onChange,
  onApply,
  validationError,
}: {
  value: ReportFilters;
  players: PlayerCard[];
  onChange: (next: ReportFilters) => void;
  onApply: () => void;
  validationError?: string;
}) {
  return (
    <form
      className="report-filter-form"
      onSubmit={event => {
        event.preventDefault();
        onApply();
      }}
    >
      <label>
        <span>اختر اللاعب</span>
        <select
          className="field"
          value={value.playerId ?? ""}
          onChange={event =>
            onChange({
              ...value,
              playerId: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        >
          <option value="">اختر لاعبًا</option>
          {players.map(player => (
            <option value={player.id} key={player.id}>
              {player.name} — {player.academyName}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>من (ISO)</span>
        <input
          className="field"
          type="date"
          value={value.from}
          onChange={event => onChange({ ...value, from: event.target.value })}
          required
        />
      </label>
      <label>
        <span>إلى (ISO)</span>
        <input
          className="field"
          type="date"
          value={value.to}
          onChange={event => onChange({ ...value, to: event.target.value })}
          required
        />
      </label>
      <label>
        <span>المهارة</span>
        <select
          className="field"
          value={value.skill}
          onChange={event => onChange({ ...value, skill: event.target.value })}
        >
          <option value="all">جميع المهارات</option>
          {SKILLS.map(skill => (
            <option key={skill} value={skill}>
              {skill}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>نوع التقرير</span>
        <select
          className="field"
          value={value.type}
          onChange={event =>
            onChange({ ...value, type: event.target.value as ReportView })
          }
        >
          <option value="overview">شامل</option>
          <option value="technical">تقني</option>
          <option value="progress">تقدم</option>
        </select>
      </label>
      <button className="btn btn-primary report-apply-button" type="submit">
        <Search size={17} />
        عرض التقرير
      </button>
      {validationError ? (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      ) : null}
    </form>
  );
}

function ComparisonChart({
  report,
  filters,
}: {
  report: Report;
  filters: ReportFilters;
}) {
  const comparison = useMemo(
    () =>
      periodComparison(
        report.comparisonHistory ?? report.player.history,
        filters.from,
        filters.to
      ),
    [report.comparisonHistory, report.player.history, filters.from, filters.to]
  );
  if (!comparison) {
    return (
      <EmptyState
        title="بيانات المقارنة غير مكتملة"
        description="تحتاج المقارنة إلى نقاط أداء مسجلة في الفترة الحالية والفترة السابقة المكافئة؛ لا يتم إنشاء أرقام بديلة."
      />
    );
  }
  const data = [
    {
      name: "الأداء العام",
      "الفترة السابقة": Number(comparison.previous.toFixed(2)),
      "الفترة الحالية": Number(comparison.current.toFixed(2)),
    },
  ];
  return (
    <div className="comparison-chart-wrap">
      <div className="chart-source-note">
        <span className="score-tag">
          المصدر: سجل أداء مُدخل أو افتراضي، وليس قياسًا من المقطع
        </span>
        <span className="muted">
          الفترة السابقة: {formatDate(comparison.previousStart.toISOString())} —{" "}
          {formatDate(comparison.previousEnd.toISOString())}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={290}>
        <BarChart
          data={data}
          margin={{ top: 14, right: 10, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="الفترة السابقة" fill="#94a3b8" radius={[5, 5, 0, 0]} />
          <Bar dataKey="الفترة الحالية" fill="#10b981" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Observations({ analyses, notes }: Pick<Report, "analyses" | "notes">) {
  const observations = analyses.flatMap(analysis =>
    analysis.observations.map(observation => ({
      ...observation,
      analysisId: analysis.id,
      createdAt: analysis.createdAt,
      skill: analysis.skill,
    }))
  );
  if (!observations.length && !notes.length) {
    return (
      <EmptyState
        title="لا توجد ملاحظات مهمة ضمن هذه الفترة"
        description="ستظهر الملاحظات عند تسجيل تحليل أو ملاحظة للاعب."
      />
    );
  }
  return (
    <div className="report-observations">
      {observations.map((observation, index) => (
        <article
          className="observation-card"
          key={`${observation.analysisId}-${observation.title}-${index}`}
        >
          <ObservationIcon type={observation.type} />
          <div>
            <strong>{observation.title}</strong>
            <p>{observation.detail}</p>
            <small>
              {observation.skill} · {formatDate(observation.createdAt)}
            </small>
          </div>
        </article>
      ))}
      {notes.map(note => (
        <article className="observation-card note" key={note.id}>
          <Info aria-hidden="true" className="observation-icon info" />
          <div>
            <strong>ملاحظة المدرب</strong>
            <p>{note.text}</p>
            <small>{formatDate(note.createdAt)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function Recommendation({ analyses }: { analyses: Analysis[] }) {
  const simulationAnalyses = analyses.filter(
    analysis => analysis.isDemo || analysis.method === "simulation"
  );
  const exercises = simulationAnalyses.flatMap(analysis =>
    analysis.exercises.map(exercise => ({
      ...exercise,
      analysisId: analysis.id,
      skill: analysis.skill,
    }))
  );
  return (
    <div className="recommendation-box">
      <Lightbulb aria-hidden="true" />
      <div>
        <div className="recommendation-heading">
          <strong>توصيات وتمارين مسجلة</strong>
          {simulationAnalyses.length ? <DemoBadge /> : null}
        </div>
        {!simulationAnalyses.length ? (
          <p>
            لا يولد تحليل الرؤية الحاسوبية الحالي درجات رياضية أو توصيات
            تدريبية.
          </p>
        ) : exercises.length ? (
          <ul className="exercise-list">
            {exercises.map((exercise, index) => (
              <li key={`${exercise.analysisId}-${exercise.title}-${index}`}>
                <Target aria-hidden="true" size={17} />
                <span>
                  <strong>{exercise.title}</strong>
                  <small>
                    {exercise.description} · {exercise.skill}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>لا تتوفر توصيات أو تمارين مسجلة ضمن عوامل التصفية الحالية.</p>
        )}
      </div>
    </div>
  );
}

function LegacyReportBodyArchive({
  report,
  filters,
}: {
  report: Report;
  filters: ReportFilters;
}) {
  const averageAnalysisScore = average(
    report.analyses.flatMap(analysis =>
      (analysis.isDemo || analysis.method === "simulation") &&
      typeof analysis.score === "number" &&
      Number.isFinite(analysis.score)
        ? [analysis.score]
        : []
    )
  );
  const displayedScore = averageAnalysisScore ?? report.player.overall;
  const scoreSource =
    averageAnalysisScore === undefined
      ? "تقييم ملف مُدخل أو افتراضي (ليس من الفيديو)"
      : "متوسط التحليلات التجريبية المسجلة";
  const latest = [...report.analyses].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  )[0];

  return (
    <section className="section-stack report-results" id="report-results">
      <div className="report-player-heading">
        <div>
          <span className="eyebrow">تقرير اللاعب</span>
          <h2>{report.player.name}</h2>
          <p>
            {report.player.position} · {report.player.academyName} ·{" "}
            {formatDate(report.from)} — {formatDate(report.to)}
          </p>
        </div>
        <ReportViewLabel view={filters.type} />
      </div>

      {filters.type === "overview" ? (
        <>
          <span className="badge">بيانات ملف افتراضية أو مُدخلة</span>
          <div className="grid-2 report-top-grid">
            <Panel title="ملخص الأداء العام" icon={Trophy}>
              <div className="report-score-summary">
                <ScoreRing score={displayedScore} label="التقييم" size={154} />
                <div>
                  <strong>{scoreSource}</strong>
                  <p>
                    يعرض الملخص القيم المسجلة فقط ضمن التقرير ولا يستنتج درجات
                    إضافية.
                  </p>
                  <span className="score-tag">
                    {report.skill === "all" ? "كل المهارات" : report.skill}
                  </span>
                </div>
              </div>
              <div className="skill-score-cards">
                {report.player.skills.length ? (
                  report.player.skills.map(skill => (
                    <article key={skill.name} className="stat-card">
                      <span>{skill.name}</span>
                      <strong>{skill.value}%</strong>
                    </article>
                  ))
                ) : (
                  <p className="muted">لا توجد مهارات مسجلة.</p>
                )}
              </div>
            </Panel>
            <Panel title="مقارنة الأداء" icon={BarChart3}>
              <ComparisonChart report={report} filters={filters} />
            </Panel>
          </div>
          <div className="grid-2">
            <Panel title="تطور الأداء عبر الزمن" icon={Activity}>
              {report.player.history.length ? (
                <TrendChart history={report.player.history} />
              ) : (
                <EmptyState
                  title="لا يوجد سجل تطور"
                  description="لم تسجل نقاط أداء كافية لعرض المخطط الزمني."
                />
              )}
            </Panel>
            <Panel title="تقييم المهارات التفصيلي" icon={Target}>
              {report.player.skills.length ? (
                <SkillBars skills={report.player.skills} />
              ) : (
                <EmptyState
                  title="لا توجد مهارات مقيمة"
                  description="أضف تقييمات للاعب لتظهر في التقرير."
                />
              )}
            </Panel>
          </div>
          <div className="grid-2">
            <Panel title="أهم الملاحظات" icon={Info}>
              <Observations analyses={report.analyses} notes={report.notes} />
            </Panel>
            <Panel title="التوصيات والتمارين المسجلة" icon={Lightbulb}>
              <Recommendation analyses={report.analyses} />
            </Panel>
          </div>
          <Panel title="مقاطع الأداء المسجلة" icon={Video}>
            {report.videos.length ? (
              <VideoLibrary
                videos={report.videos}
                playerId={report.player.id}
              />
            ) : (
              <EmptyState
                title="لا توجد فيديوهات ضمن هذه الفترة"
                description="لا توجد فيديوهات مصرح بها تطابق عوامل التصفية الحالية."
              />
            )}
          </Panel>
        </>
      ) : filters.type === "technical" ? (
        <>
          <div className="grid-2">
            <Panel title="التحليلات التقنية المسجلة" icon={BarChart3}>
              {report.analyses.length ? (
                <div className="technical-analysis-list">
                  {report.analyses.map(analysis => (
                    <article className="technical-analysis" key={analysis.id}>
                      <header>
                        <span className="badge">{analysis.skill}</span>
                        <span className="muted">
                          {formatDate(analysis.createdAt)}
                        </span>
                        <AnalysisSource analysis={analysis} />
                        <span className="score-tag">
                          {analysis.score === null
                            ? "غير مقاس"
                            : formatNumber(analysis.score)}
                        </span>
                      </header>
                      {analysis.metrics.length ? (
                        <div className="metric-chip-list">
                          {analysis.metrics.map(metric => (
                            <span
                              className="metric-chip"
                              key={`${analysis.id}-${metric.name}`}
                            >
                              {metric.name}:{" "}
                              <strong>
                                {metric.value} {metric.unit}
                              </strong>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">لا توجد مقاييس في هذا التحليل.</p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="لا توجد تحليلات تقنية"
                  description="لم يتم العثور على تحليلات تطابق الفترة والمهارة المحددتين."
                />
              )}
            </Panel>
            <Panel title="الملاحظات التقنية" icon={Info}>
              <Observations analyses={report.analyses} notes={report.notes} />
            </Panel>
          </div>
          <div className="grid-2">
            <Panel title="تمارين وتوصيات مسجلة" icon={Lightbulb}>
              <Recommendation analyses={report.analyses} />
            </Panel>
            <Panel title="فيديوهات التحليل" icon={Video}>
              {report.videos.length ? (
                <VideoLibrary
                  videos={report.videos}
                  playerId={report.player.id}
                />
              ) : (
                <EmptyState
                  title="لا توجد فيديوهات"
                  description="لا توجد فيديوهات مصرح بها في هذه الفترة."
                />
              )}
            </Panel>
          </div>
        </>
      ) : (
        <>
          <div className="grid-2">
            <Panel title="تطور الأداء عبر الزمن" icon={Activity}>
              {report.player.history.length ? (
                <TrendChart history={report.player.history} />
              ) : (
                <EmptyState
                  title="لا يوجد سجل تطور"
                  description="لم تسجل نقاط أداء كافية لعرض المخطط الزمني."
                />
              )}
            </Panel>
            <Panel title="مقارنة الفترة الحالية والسابقة" icon={BarChart3}>
              <ComparisonChart report={report} filters={filters} />
            </Panel>
          </div>
          <div className="grid-2">
            <Panel title="تقييم المهارات" icon={Target}>
              {report.player.skills.length ? (
                <SkillBars skills={report.player.skills} />
              ) : (
                <EmptyState
                  title="لا توجد مهارات مقيمة"
                  description="لا توجد قيم مهارات متاحة ضمن التقرير."
                />
              )}
            </Panel>
            <Panel title="التحسينات والملاحظات" icon={Info}>
              <Observations analyses={report.analyses} notes={report.notes} />
            </Panel>
          </div>
          <Panel title="توصيات التقدم" icon={Lightbulb}>
            <Recommendation analyses={report.analyses} />
          </Panel>
        </>
      )}

      {latest ? (
        <p className="report-record-note">
          آخر تحليل ضمن التقرير: {latest.skill} في{" "}
          {formatDate(latest.createdAt)}.
        </p>
      ) : null}
    </section>
  );
}

function ReportBody({
  report,
  filters,
}: {
  report: Report;
  filters: ReportFilters;
}) {
  return <VerifiedReportBody report={report} view={filters.type} />;
}

export default function Reports() {
  const { organization, session } = useAthlete();
  const isDemoSession = session?.mode === "demo";
  const canExport =
    organization?.type === "academy" && organization.role === "owner";
  const exportReason =
    "تصدير التقرير متاح لمالك الأكاديمية فقط؛ صلاحية المشاهدة لا تعني صلاحية التنزيل.";
  const playersQuery = useApi<PlayerCard[]>("/players");
  const requestsQuery = useApi<AccessRequest[]>(
    "/requests",
    organization?.type === "club"
  );
  const urlPlayerId = useMemo(readPlayerFromUrl, []);
  const initialRange = useMemo(initialDateRange, []);
  const initialFilters = useMemo<ReportFilters>(
    () => ({
      playerId: urlPlayerId,
      ...initialRange,
      skill: "all",
      type: "overview",
    }),
    [initialRange, urlPlayerId]
  );
  const [draft, setDraft] = useState<ReportFilters>(initialFilters);
  const [applied, setApplied] = useState<ReportFilters>(initialFilters);
  const [validationError, setValidationError] = useState<string>();
  const [exporting, setExporting] = useState<ExportFormat>();
  const [exportError, setExportError] = useState<string>();

  const reportPlayers = useMemo(() => {
    const cards = playersQuery.data ?? [];
    if (organization?.type !== "club") return cards;
    const allowedIds = new Set(
      (requestsQuery.data ?? [])
        .filter(request => request.status === "approved")
        .map(request => request.playerId)
    );
    return cards.filter(
      card => allowedIds.has(card.id) || (isDemoSession && card.isDemo === true)
    );
  }, [
    isDemoSession,
    organization?.type,
    playersQuery.data,
    requestsQuery.data,
  ]);

  useEffect(() => {
    if (
      urlPlayerId ||
      draft.playerId ||
      applied.playerId ||
      !reportPlayers.length
    )
      return;
    const firstId = reportPlayers[0].id;
    setDraft(current => ({ ...current, playerId: firstId }));
    setApplied(current => ({ ...current, playerId: firstId }));
  }, [applied.playerId, draft.playerId, reportPlayers, urlPlayerId]);

  const reportPath = applied.playerId
    ? `/reports/${applied.playerId}?from=${encodeURIComponent(applied.from)}&to=${encodeURIComponent(applied.to)}&skill=${encodeURIComponent(applied.skill)}`
    : "/reports/0?from=&to=&skill=all";
  const validAppliedDates = Boolean(
    applied.from && applied.to && applied.from <= applied.to
  );
  const reportQuery = useApi<Report>(
    reportPath,
    Boolean(applied.playerId && validAppliedDates)
  );

  const applyFilters = () => {
    if (!draft.playerId) {
      setValidationError("اختر لاعبًا قبل عرض التقرير.");
      return;
    }
    if (!draft.from || !draft.to || draft.from > draft.to) {
      setValidationError(
        "تأكد من أن فترة التقرير صالحة وأن تاريخ البداية لا يأتي بعد تاريخ النهاية."
      );
      return;
    }
    setValidationError(undefined);
    setApplied({ ...draft });
  };

  const exportReport = async (format: ExportFormat) => {
    if (!applied.playerId) return;
    if (!canExport) {
      setExportError(exportReason);
      return;
    }
    setExportError(undefined);
    setExporting(format);
    try {
      const query = `from=${encodeURIComponent(applied.from)}&to=${encodeURIComponent(applied.to)}&skill=${encodeURIComponent(applied.skill)}`;
      const blob = await downloadPrivate(
        `/reports/${applied.playerId}/export?format=${format}&${query}`
      );
      saveBlob(blob, `athlete-ai-report-${applied.playerId}.${format}`);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "تعذر تصدير التقرير، يرجى المحاولة مجددًا."
      );
    } finally {
      setExporting(undefined);
    }
  };

  const reportLoading = Boolean(applied.playerId && reportQuery.isLoading);
  const isClub = organization?.type === "club";

  return (
    <section className="section-stack reports-page">
      <PageHeading
        title="التقارير والتحليلات"
        subtitle="تابع تطور اللاعبين عبر فترات ومهارات محددة، بالاعتماد على السجلات المتاحة فقط."
        icon={FileText}
        actions={<span className="badge">سجلات مصرح بها</span>}
      />
      <Panel title="إعداد التقرير" icon={Filter} className="report-controls">
        {playersQuery.isLoading ||
        (organization?.type === "club" && requestsQuery.isLoading) ? (
          <Loading label="يتم تحميل اللاعبين المتاحين…" />
        ) : null}
        {playersQuery.isError ? (
          <ErrorState
            error={playersQuery.error}
            retry={() => playersQuery.refetch()}
          />
        ) : null}
        {organization?.type === "club" && requestsQuery.isError ? (
          <ErrorState
            error={requestsQuery.error}
            retry={() => requestsQuery.refetch()}
          />
        ) : null}
        {!playersQuery.isLoading &&
        !playersQuery.isError &&
        !(organization?.type === "club" && requestsQuery.isLoading) &&
        !requestsQuery.isError ? (
          reportPlayers.length ? (
            <FilterForm
              value={draft}
              players={reportPlayers}
              onChange={setDraft}
              onApply={applyFilters}
              validationError={validationError}
            />
          ) : (
            <EmptyState
              title={
                isClub
                  ? "لا توجد ملفات مصرح بها للنادي"
                  : "لا يوجد لاعبون للتقارير"
              }
              description={
                isClub
                  ? "يحتاج النادي إلى طلب وصول تمت الموافقة عليه قبل عرض تقرير اللاعب."
                  : "أضف لاعبًا أولاً ثم أعد فتح صفحة التقارير."
              }
            />
          )
        ) : null}
      </Panel>

      {applied.playerId &&
      reportQuery.isSuccess &&
      organization?.type === "academy" ? (
        <div className="report-actions print-hide">
          <span className="muted">تنزيل التقرير متاح للأكاديمية فقط.</span>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => void exportReport("html")}
            disabled={Boolean(exporting) || !canExport}
            title={!canExport ? exportReason : undefined}
          >
            <Download size={16} />
            {exporting === "html" ? "جارٍ التنزيل…" : "تنزيل HTML"}
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => void exportReport("csv")}
            disabled={Boolean(exporting) || !canExport}
            title={!canExport ? exportReason : undefined}
          >
            <FileSpreadsheet size={16} />
            {exporting === "csv" ? "جارٍ التنزيل…" : "تنزيل CSV"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => window.print()}
            disabled={!canExport}
            title={!canExport ? exportReason : undefined}
          >
            <Printer size={16} />
            طباعة / حفظ PDF
          </button>
        </div>
      ) : null}
      {applied.playerId && reportQuery.isSuccess && isClub ? (
        <p className="muted report-role-note">
          يمكن للنادي عرض التقرير الموافق عليه، بينما يظل التنزيل متاحًا
          للأكاديمية فقط.
        </p>
      ) : null}
      {exportError ? (
        <p className="form-error print-hide" role="alert">
          {exportError}
        </p>
      ) : null}

      {reportLoading ? (
        <Loading label="يتم إعداد التقرير من السجلات المتاحة…" />
      ) : null}
      {isForbidden(reportQuery.error) ? (
        <Panel title="الوصول إلى التقرير غير متاح" icon={LockKeyhole}>
          <div className="locked-panel">
            <LockKeyhole aria-hidden="true" />
            <div>
              <strong>لا تملك صلاحية عرض هذا التقرير</strong>
              <p>يمكن للنادي طلب الوصول إلى ملف اللاعب قبل فتح التقرير.</p>
              <a className="btn btn-outline" href="/requests">
                مراجعة طلبات الوصول
              </a>
            </div>
          </div>
        </Panel>
      ) : null}
      {reportQuery.isError && !isForbidden(reportQuery.error) ? (
        <ErrorState
          error={reportQuery.error}
          retry={() => reportQuery.refetch()}
        />
      ) : null}
      {!applied.playerId && !playersQuery.isLoading && !playersQuery.isError ? (
        <EmptyState
          title="اختر لاعبًا لبدء التقرير"
          description="حدد اللاعب والفترة والمهارة، ثم اضغط «عرض التقرير»."
        />
      ) : null}
      {reportQuery.data ? (
        <ReportBody report={reportQuery.data} filters={applied} />
      ) : null}
    </section>
  );
}
