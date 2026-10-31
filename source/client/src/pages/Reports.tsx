import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  LockKeyhole,
  Search,
} from "lucide-react";
import type { AccessRequest, PlayerCard, Report } from "@shared/athlete";
import { skillsForPlayer } from "@shared/coaching";
import { apparatusName, apparatusOrderForCategory, gymnasticsCategoryName, type SportId } from "@shared/sports";
import {
  ApiError,
  downloadPrivate,
  saveBlob,
  useApi,
  useAthlete,
} from "@/lib/athleteApi";
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeading,
  Panel,
} from "@/components/athlete/UI";
import VerifiedReportBody from "@/components/athlete/VerifiedReportBody";
import "./athlete-pages.css";
import "./reports-reference.css";

type ReportView = "overview" | "technical" | "progress";
type Filters = {
  playerId?: number;
  from: string;
  to: string;
  skill: string;
  type: ReportView;
};
type ExportFormat = "html" | "csv" | "pdf";
function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
function range(days = 90) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: localDate(from), to: localDate(to) };
}
function urlPlayer() {
  const raw = new URLSearchParams(window.location.search).get("player");
  return raw && /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : undefined;
}

export default function Reports() {
  const { organization } = useAthlete();
  const playersQuery = useApi<PlayerCard[]>("/players");
  const requestsQuery = useApi<AccessRequest[]>(
    "/requests",
    organization?.type === "club"
  );
  const initial = useMemo<Filters>(
    () => ({
      playerId: urlPlayer(),
      ...range(),
      skill: "all",
      type: "overview",
    }),
    []
  );
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState<ExportFormat>();
  const [sport, setSport] = useState<SportId | "all">("all");
  const [gymCategory, setGymCategory] = useState<"womens_artistic" | "mens_artistic" | "">("");
  const [apparatus, setApparatus] = useState("");
  const isClub = organization?.type === "club";
  const canExport =
    organization?.type === "academy" && organization.role === "owner";
  const reportPlayers = useMemo(() => {
    const all = playersQuery.data ?? [];
    const allowed = new Set(
      (requestsQuery.data ?? [])
        .filter(r => r.status === "approved")
        .map(r => r.playerId)
    );
    return all.filter(p =>
      (!isClub || allowed.has(p.id) || Boolean(organization?.isDemo && p.demoDisplay)) &&
      (sport === "all" || p.sport === sport) &&
      (!gymCategory || sport !== "gymnastics" || p.gymnasticsCategory === gymCategory) &&
      (!apparatus || sport !== "gymnastics" || p.primaryApparatus === apparatus)
    );
  }, [isClub, organization?.isDemo, playersQuery.data, requestsQuery.data, sport, gymCategory, apparatus]);
  useEffect(() => {
    if (reportPlayers.length && (!draft.playerId || !reportPlayers.some(player => player.id === draft.playerId))) {
      const next = { ...draft, playerId: reportPlayers[0].id };
      setDraft(next);
      setApplied(next);
    }
  }, [reportPlayers, draft]);
  const selected = reportPlayers.find(p => p.id === draft.playerId);
  const skillOptions = selected
    ? selected.demoDisplay?.skills.map(skill => skill.name) ?? skillsForPlayer(selected.sport, selected.position, selected.primaryApparatus)
    : [];
  const reportPath = `/reports/${applied.playerId ?? 0}?${new URLSearchParams({ from: applied.from, to: applied.to, skill: applied.skill })}`;
  const query = useApi<Report>(
    reportPath,
    Boolean(
      applied.playerId &&
        applied.from &&
        applied.to &&
        applied.from <= applied.to
    )
  );
  const loadingPlayers =
    playersQuery.isLoading || (isClub && requestsQuery.isLoading);
  function apply(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!draft.playerId) {
      setError("اختر لاعبًا قبل عرض التقرير.");
      return;
    }
    if (!draft.from || !draft.to || draft.from > draft.to) {
      setError("تاريخ بداية الفترة يجب أن يسبق تاريخ نهايتها.");
      return;
    }
    setApplied({ ...draft });
  }
  async function exportReport(format: ExportFormat) {
    if (!canExport || !applied.playerId) return;
    setExportError("");
    setExporting(format);
    try {
      const params = new URLSearchParams({
        from: applied.from,
        to: applied.to,
        skill: applied.skill,
        format,
      });
      const blob = await downloadPrivate(
        `/reports/${applied.playerId}/export?${params}`
      );
      saveBlob(
        blob,
        `ATHLETE-AI-${applied.playerId}-${applied.from}-${applied.to}.${format}`
      );
    } catch (problem) {
      setExportError(
        problem instanceof Error ? problem.message : "تعذر تصدير التقرير."
      );
    } finally {
      setExporting(undefined);
    }
  }
  return (
    <section className="section-stack reports-page">
      <PageHeading
        title="التقارير والتحليلات"
        subtitle="متابعة تطور اللاعبين وإصدار تقارير شاملة من التقييمات والتحليلات المحفوظة"
        icon={FileText}
        actions={
          query.data && canExport ? (
            <div className="inline-actions print-hide">
              <button
                className="btn btn-primary"
                disabled={Boolean(exporting)}
                onClick={() => void exportReport("pdf")}
              >
                <Download size={18} />
                {exporting === "pdf" ? "جارٍ إنشاء PDF…" : "تصدير التقرير PDF"}
              </button>
              <button
                className="btn btn-outline"
                disabled={Boolean(exporting)}
                aria-label="تصدير CSV"
                onClick={() => void exportReport("csv")}
              >
                <FileSpreadsheet size={18} />
                CSV
              </button>
              <button
                className="btn btn-outline"
                disabled={Boolean(exporting)}
                aria-label="تصدير HTML"
                onClick={() => void exportReport("html")}
              >
                <FileText size={18} />
                HTML
              </button>
            </div>
          ) : undefined
        }
      />
      <Panel className="report-controls" title="إعداد التقرير" icon={Filter}>
        <div className="report-sport-controls">
          <label>الرياضة<select className="field" aria-label="رياضة التقرير" value={sport} onChange={event => { setSport(event.target.value as SportId | "all"); setGymCategory(""); setApparatus(""); setDraft(current => ({ ...current, skill: "all", playerId: undefined })); }}><option value="all">جميع الرياضات</option><option value="football">كرة القدم</option><option value="gymnastics">الجمباز</option></select></label>
          {sport === "gymnastics" && <label>الفئة الرياضية<select className="field" aria-label="فئة التقرير" value={gymCategory} onChange={event => { setGymCategory(event.target.value as typeof gymCategory); setApparatus(""); setDraft(current => ({ ...current, skill: "all", playerId: undefined })); }}><option value="">اختر الفئة</option><option value="womens_artistic">الجمباز الفني للسيدات — WAG</option><option value="mens_artistic">الجمباز الفني للرجال — MAG</option></select></label>}
          {sport === "gymnastics" && gymCategory && <label>الجهاز<select className="field" aria-label="جهاز التقرير" value={apparatus} onChange={event => { setApparatus(event.target.value); setDraft(current => ({ ...current, skill: "all", playerId: undefined })); }}><option value="">جميع أجهزة الفئة</option>{apparatusOrderForCategory(gymCategory).map(id => <option value={id} key={id}>{apparatusName(id)}</option>)}</select></label>}
        </div>
        {loadingPlayers ? (
          <Loading label="جارٍ تحميل اللاعبين المصرح بهم…" />
        ) : playersQuery.isError || (isClub && requestsQuery.isError) ? (
          <ErrorState
            error={playersQuery.error ?? requestsQuery.error}
            retry={() => {
              void playersQuery.refetch();
              void requestsQuery.refetch();
            }}
          />
        ) : reportPlayers.length ? (
          <form className="report-filter-form" onSubmit={apply}>
            <label>
              <span>اختر اللاعب</span>
              <select
                className="field"
                aria-label="اختر اللاعب"
                value={draft.playerId ?? ""}
                onChange={e =>
                  setDraft({
                    ...draft,
                    playerId: Number(e.target.value),
                    skill: "all",
                  })
                }
              >
                <option value="">اختر لاعبًا</option>
                {reportPlayers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.sport === "gymnastics" && p.primaryApparatus ? `${gymnasticsCategoryName(p.gymnasticsCategory || "womens_artistic")} / ${apparatusName(p.primaryApparatus)}` : p.position}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>نوع التقرير</span>
              <select
                className="field"
                aria-label="نوع التقرير"
                value={draft.type}
                onChange={e =>
                  setDraft({ ...draft, type: e.target.value as ReportView })
                }
              >
                <option value="overview">تقرير شامل</option>
                <option value="technical">تقرير تقني</option>
                <option value="progress">تقرير تطور الأداء</option>
              </select>
            </label>
            <div className="report-period-fields">
              <label>
                <span>من تاريخ</span>
                <input
                  className="field"
                  aria-label="من تاريخ"
                  type="date"
                  value={draft.from}
                  onChange={e => setDraft({ ...draft, from: e.target.value })}
                  required
                />
              </label>
              <label>
                <span>إلى تاريخ</span>
                <input
                  className="field"
                  aria-label="إلى تاريخ"
                  type="date"
                  value={draft.to}
                  onChange={e => setDraft({ ...draft, to: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              <span>المهارة المحددة</span>
              <select
                className="field"
                aria-label="المهارة المحددة"
                value={draft.skill}
                onChange={e => setDraft({ ...draft, skill: e.target.value })}
              >
                <option value="all">جميع المهارات</option>
                {skillOptions.map(skill => (
                  <option key={skill}>{skill}</option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-primary report-apply-button"
              type="submit"
            >
              <Search size={20} />
              عرض التقرير
            </button>
            <div className="report-period-shortcuts">
              <span>الفترة الزمنية:</span>
              {[
                { label: "آخر شهر", days: 30 },
                { label: "آخر 3 أشهر", days: 90 },
                { label: "آخر 6 أشهر", days: 180 },
                { label: "آخر سنة", days: 365 },
              ].map(p => (
                <button
                  className="btn btn-ghost"
                  key={p.days}
                  type="button"
                  onClick={() => setDraft({ ...draft, ...range(p.days) })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
        ) : (
          <EmptyState
            title={
              isClub
                ? "لا توجد ملفات مصرح بها للنادي"
                : "لا يوجد لاعبون للتقارير"
            }
            description={
              isClub
                ? "أرسل طلب الملف الكامل وانتظر موافقة الأكاديمية قبل فتح التقرير."
                : "أضف لاعبًا ثم افتح تقريره."
            }
            action={
              isClub ? (
                <a href="/clubs" className="btn btn-primary">
                  اكتشاف المواهب
                </a>
              ) : (
                <a href="/academies" className="btn btn-primary">
                  واجهة الأكاديميات
                </a>
              )
            }
          />
        )}
      </Panel>
      {exportError && (
        <p className="form-error" role="alert">
          {exportError}
        </p>
      )}
      {query.isLoading && applied.playerId ? (
        <Loading label="جارٍ إعداد التقرير من السجلات المحفوظة…" />
      ) : query.isError ? (
        query.error instanceof ApiError && query.error.status === 403 ? (
          <Panel title="هذا التقرير محمي" icon={LockKeyhole}>
            <p>
              تحتاج موافقة الأكاديمية للوصول إلى التقرير. البيانات الصحية تحتاج
              تصريحًا منفصلًا.
            </p>
            <a href="/requests" className="btn btn-outline">
              مراجعة الطلبات
            </a>
          </Panel>
        ) : (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        )
      ) : query.data ? (
        <VerifiedReportBody
          key={`${applied.playerId}-${applied.from}-${applied.to}-${applied.skill}`}
          report={query.data}
          view={applied.type}
        />
      ) : null}
      {isClub && query.data && (
        <p className="helper">
          صلاحية النادي للمشاهدة فقط؛ تصدير التقرير متاح لمالك الأكاديمية.
        </p>
      )}
    </section>
  );
}
