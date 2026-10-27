import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileVideo,
  Hash,
  Ruler,
  ShieldQuestion,
} from "lucide-react";
import type {
  EvaluationFinding,
  IndicatorMeasurement,
  PlayerEvaluation,
  SessionEvaluation,
} from "@shared/evaluation-types";
import { EmptyState } from "./UI";
import "./session-evaluation.css";

type AnyEvaluation = PlayerEvaluation | SessionEvaluation;

type Overall = {
  score: number | null;
  method: string | null;
  reason: string;
};

export function hasDocumentedOverall(
  evaluation?: Pick<AnyEvaluation, "overall"> | null
): boolean {
  return Boolean(
    evaluation &&
      typeof evaluation.overall.score === "number" &&
      Number.isFinite(evaluation.overall.score) &&
      evaluation.overall.method?.trim()
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "غير متوفر";
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
    : "لم يُقيّم";
}

function OverallStatus({ overall }: { overall: Overall }) {
  const documented = hasDocumentedOverall({ overall });
  return (
    <div className="evaluation-overall-status">
      <span className={documented ? "evaluation-status is-documented" : "evaluation-status"}>
        {documented ? "تقييم موثق" : "لم يُقيّم"}
      </span>
      {documented ? (
        <strong className="evaluation-score-value">{formatNumber(overall.score)}</strong>
      ) : null}
      <p>
        {documented
          ? overall.method
          : overall.reason || "لا توجد طريقة حساب وأوزان موثقة لعرض درجة عامة."}
      </p>
    </div>
  );
}

function MeasurementEvidence({ measurement }: { measurement: IndicatorMeasurement }) {
  const hasValue =
    measurement.validity === "valid" &&
    typeof measurement.value === "number" &&
    Number.isFinite(measurement.value);
  const timeReference =
    measurement.timeStart === null && measurement.timeEnd === null
      ? "لا يوجد توقيت مقيد داخل الجلسة"
      : `${measurement.timeStart ?? "؟"} ث — ${measurement.timeEnd ?? "؟"} ث`;
  return (
    <dl className="finding-evidence">
      <div>
        <dt>القياس</dt>
        <dd>
          {measurement.name}: {hasValue ? formatNumber(measurement.value) : "لم يُقيّم"}
          {hasValue && measurement.unit ? ` ${measurement.unit}` : ""}
        </dd>
      </div>
      <div>
        <dt>صلاحية القياس</dt>
        <dd>{measurement.validity === "valid" ? "صالح" : "لم يُقيّم"}</dd>
      </div>
      <div>
        <dt>الجلسة والتاريخ</dt>
        <dd>
          #{measurement.sessionId} · {formatDate(measurement.sessionDate)}
        </dd>
      </div>
      <div>
        <dt>الفيديو والتوقيت</dt>
        <dd>
          {measurement.videoId ? `فيديو #${measurement.videoId}` : "لا يوجد فيديو مرتبط"} · {timeReference}
        </dd>
      </div>
      <div>
        <dt>الطريقة</dt>
        <dd>{measurement.method || "غير متوفر"}</dd>
      </div>
      <div>
        <dt>السبب / القيد</dt>
        <dd>{measurement.reason || "غير متوفر"}</dd>
      </div>
    </dl>
  );
}

function RuleReference({ measurement }: { measurement: IndicatorMeasurement }) {
  const rule = measurement.rule;
  if (!rule) {
    return (
      <p className="evaluation-no-rule">
        لا يوجد معيار تقييم موثق لهذا القياس؛ لذلك لا يُصنّف كنقطة قوة أو جانب تطوير.
      </p>
    );
  }
  return (
    <p className="evaluation-rule-reference">
      <Ruler aria-hidden="true" size={16} />
      القاعدة: {rule.id} — الإصدار {rule.version}. {rule.sourceUrl ? (
        <a href={rule.sourceUrl} target="_blank" rel="noreferrer">
          المصدر الموثق
        </a>
      ) : (
        "المصدر غير متوفر"
      )}
    </p>
  );
}

export function EvaluationFindingList({
  findings,
  classification,
  emptyReason,
}: {
  findings: EvaluationFinding[] | undefined;
  classification: EvaluationFinding["classification"];
  emptyReason?: string;
}) {
  const applicable = (findings ?? []).filter(
    finding => finding.classification === classification
  );
  const title = classification === "strength" ? "نقاط القوة" : "الجوانب التي تحتاج تطويرًا";
  const Icon = classification === "strength" ? CheckCircle2 : CircleAlert;
  if (!applicable.length) {
    return (
      <div className="evaluation-empty-inline">
        <ShieldQuestion aria-hidden="true" size={20} />
        <p>
          <strong>{title}: لم يُقيّم</strong>
          <span>{emptyReason || "لا توجد نتيجة تستوفي معيارًا موثقًا في الجلسات المتاحة."}</span>
        </p>
      </div>
    );
  }
  return (
    <div className={`evaluation-finding-list ${classification}`}>
      {applicable.map(finding => (
        <article className="evaluation-finding" key={finding.id}>
          <header>
            <Icon aria-hidden="true" size={20} />
            <div>
              <strong>{finding.title}</strong>
              <p>{finding.explanation}</p>
            </div>
          </header>
          <MeasurementEvidence measurement={finding.measurement} />
          <RuleReference measurement={finding.measurement} />
        </article>
      ))}
    </div>
  );
}

export function SessionMeasurementGrid({
  evaluation,
}: {
  evaluation?: SessionEvaluation | null;
}) {
  const measurements = evaluation?.measurements ?? [];
  if (!measurements.length) {
    return (
      <EmptyState
        title="لم تُسجل قياسات موثقة"
        description="لا يمكن إظهار نتيجة أو تصنيف قبل حفظ قياس صالح وطريقته وسبب صلاحيته."
      />
    );
  }
  return (
    <div className="session-measurement-grid">
      {measurements.map(measurement => {
        const hasValue =
          measurement.validity === "valid" &&
          typeof measurement.value === "number" &&
          Number.isFinite(measurement.value);
        return (
          <article className="session-measurement" key={`${measurement.sessionId}-${measurement.indicatorCode}`}>
            <div className="session-measurement-topline">
              <span>{measurement.name}</span>
              <span className="metric-code">{measurement.indicatorCode}</span>
            </div>
            <strong>
              {hasValue ? formatNumber(measurement.value) : "لم يُقيّم"}
              {hasValue && measurement.unit ? <small>{measurement.unit}</small> : null}
            </strong>
            <p>{measurement.reason || measurement.method || "سبب القياس غير متوفر"}</p>
            <dl>
              <div>
                <dt>الطريقة</dt>
                <dd>{measurement.method || "غير متوفر"}</dd>
              </div>
              <div>
                <dt>المرحلة/القدم</dt>
                <dd>{measurement.phase} · {measurement.usedFoot}</dd>
              </div>
              <div>
                <dt>التوقيت</dt>
                <dd>
                  {measurement.timeStart === null && measurement.timeEnd === null
                    ? "غير متوفر"
                    : `${measurement.timeStart ?? "؟"} ث — ${measurement.timeEnd ?? "؟"} ث`}
                </dd>
              </div>
            </dl>
            <RuleReference measurement={measurement} />
          </article>
        );
      })}
    </div>
  );
}

export default function EvaluationSummary({
  evaluation,
  kind = "player",
  includeFindings = true,
  includeMeasurements = true,
}: {
  evaluation?: AnyEvaluation | null;
  kind?: "player" | "session";
  includeFindings?: boolean;
  includeMeasurements?: boolean;
}) {
  if (!evaluation) {
    return (
      <div className="evaluation-summary-empty">
        <ShieldQuestion aria-hidden="true" size={22} />
        <div>
          <strong>لم يُقيّم</strong>
          <p>لا يوجد تقييم محفوظ يثبت طريقة القياس أو معيار التصنيف لهذه البيانات.</p>
        </div>
      </div>
    );
  }

  const playerEvaluation = kind === "player" ? (evaluation as PlayerEvaluation) : undefined;
  const sessionEvaluation = kind === "session" ? (evaluation as SessionEvaluation) : undefined;
  return (
    <section className="evaluation-summary" aria-label={kind === "player" ? "التقييم العام الموثق" : "نتائج الجلسة الموثقة"}>
      <div className="evaluation-summary-header">
        <div>
          <span className="evaluation-kicker">
            <Hash aria-hidden="true" size={15} />
            {kind === "player" ? "التقييم العام" : "نتائج الجلسة"}
          </span>
          <OverallStatus overall={evaluation.overall} />
        </div>
        {playerEvaluation ? (
          <dl className="evaluation-coverage">
            <div>
              <dt>المهارات المختبرة</dt>
              <dd>{playerEvaluation.testedSkills.length ? playerEvaluation.testedSkills.join("، ") : "لم تُختبر مهارة"}</dd>
            </div>
            <div>
              <dt>عدد الجلسات</dt>
              <dd>{playerEvaluation.sessionsCount}</dd>
            </div>
            <div>
              <dt>آخر تقييم</dt>
              <dd>
                <CalendarDays aria-hidden="true" size={14} />
                {formatDate(playerEvaluation.lastEvaluationAt)}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {sessionEvaluation && includeMeasurements ? <SessionMeasurementGrid evaluation={sessionEvaluation} /> : null}
      {includeFindings ? (
        <div className="evaluation-findings-columns">
          <section>
            <h3><CheckCircle2 aria-hidden="true" size={19} /> نقاط القوة الموثقة</h3>
            <EvaluationFindingList findings={evaluation.strengths} classification="strength" />
          </section>
          <section>
            <h3><CircleAlert aria-hidden="true" size={19} /> جوانب التطوير الموثقة</h3>
            <EvaluationFindingList findings={evaluation.development} classification="development" />
          </section>
        </div>
      ) : null}
    </section>
  );
}
