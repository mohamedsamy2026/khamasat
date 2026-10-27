import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Dumbbell,
  LockKeyhole,
  Pencil,
  Plus,
  Save,
} from "lucide-react";
import type { Analysis } from "@shared/athlete";
import type { ExercisePlan, ExercisePlanInput } from "@shared/evaluation-types";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import { EmptyState, ErrorState, Loading } from "./UI";
import { formatDate } from "./EvaluationSummary";
import "./session-evaluation.css";

type PlanDraft = {
  analysisId: string;
  developmentId: string;
  name: string;
  goal: string;
  steps: string;
  tools: string;
  sets: string;
  repetitions: string;
  durationSeconds: string;
  restSeconds: string;
  progression: string;
  reassessAt: string;
  reassessMethod: string;
};

const emptyDraft = (analysisId?: number): PlanDraft => ({
  analysisId: analysisId ? String(analysisId) : "",
  developmentId: "",
  name: "",
  goal: "",
  steps: "",
  tools: "",
  sets: "",
  repetitions: "",
  durationSeconds: "",
  restSeconds: "",
  progression: "",
  reassessAt: "",
  reassessMethod: "",
});

function numberOrNull(value: string) {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
}

function PlanDetails({ plan }: { plan: ExercisePlan }) {
  return (
    <article className="exercise-plan-item">
      <header>
        <div>
          <strong>{plan.name}</strong>
          <span>
            بواسطة {plan.authorName || "غير متوفر من الخادم"} ·{" "}
            {plan.reviewed ? "مراجعة مسجلة" : "بانتظار مراجعة المدرب"}
          </span>
        </div>
        <time dateTime={plan.updatedAt}>{formatDate(plan.updatedAt)}</time>
      </header>
      <dl className="exercise-plan-details">
        <div>
          <dt>الهدف</dt>
          <dd>{plan.goal}</dd>
        </div>
        <div>
          <dt>جانب التطوير</dt>
          <dd>{plan.developmentId}</dd>
        </div>
        <div>
          <dt>الأدوات</dt>
          <dd>{plan.tools || "غير متوفرة"}</dd>
        </div>
        <div>
          <dt>الجرعة</dt>
          <dd>
            {plan.sets !== null ? `${plan.sets} مجموعات` : ""}
            {plan.repetitions !== null ? ` · ${plan.repetitions} تكرارات` : ""}
            {plan.durationSeconds !== null
              ? ` · ${plan.durationSeconds} ث`
              : ""}
            {plan.sets === null &&
            plan.repetitions === null &&
            plan.durationSeconds === null
              ? "غير محددة"
              : ""}
          </dd>
        </div>
        <div>
          <dt>الراحة</dt>
          <dd>
            {plan.restSeconds !== null ? `${plan.restSeconds} ث` : "غير محددة"}
          </dd>
        </div>
        <div>
          <dt>التدرج</dt>
          <dd>{plan.progression || "غير محدد"}</dd>
        </div>
        <div>
          <dt>إعادة التقييم</dt>
          <dd>
            {formatDate(plan.reassessAt)} ·{" "}
            {plan.reassessMethod || "الطريقة غير متوفرة"}
          </dd>
        </div>
        <div>
          <dt>مؤشر الإعادة</dt>
          <dd>{plan.reassessIndicatorCode || "غير متوفر"}</dd>
        </div>
      </dl>
      <div className="exercise-plan-steps">
        <strong>خطوات التنفيذ</strong>
        {plan.steps.length ? (
          <ol>
            {plan.steps.map((step, index) => (
              <li key={`${plan.id}-${index}`}>{step}</li>
            ))}
          </ol>
        ) : (
          <p>لم تُسجل خطوات.</p>
        )}
      </div>
    </article>
  );
}

function PlanEditor({
  analyses,
  preferredAnalysisId,
  initial,
  onSaved,
  onCancel,
}: {
  analyses: Analysis[];
  preferredAnalysisId?: number;
  initial?: ExercisePlan;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PlanDraft>(() =>
    initial
      ? {
          analysisId: String(initial.analysisId),
          developmentId: initial.developmentId,
          name: initial.name,
          goal: initial.goal,
          steps: initial.steps.join("\n"),
          tools: initial.tools,
          sets: initial.sets === null ? "" : String(initial.sets),
          repetitions:
            initial.repetitions === null ? "" : String(initial.repetitions),
          durationSeconds:
            initial.durationSeconds === null
              ? ""
              : String(initial.durationSeconds),
          restSeconds:
            initial.restSeconds === null ? "" : String(initial.restSeconds),
          progression: initial.progression,
          reassessAt: initial.reassessAt?.slice(0, 10) ?? "",
          reassessMethod: initial.reassessMethod,
        }
      : emptyDraft(preferredAnalysisId)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedAnalysis = analyses.find(
    analysis => analysis.id === Number(draft.analysisId)
  );
  const development = selectedAnalysis?.evaluation?.development ?? [];
  const selectedFinding = development.find(
    finding => finding.id === draft.developmentId
  );

  useEffect(() => {
    if (
      !selectedAnalysis ||
      !development.some(finding => finding.id === draft.developmentId)
    ) {
      setDraft(current =>
        current.developmentId ? { ...current, developmentId: "" } : current
      );
    }
  }, [draft.developmentId, development, selectedAnalysis]);

  const change = (key: keyof PlanDraft, value: string) =>
    setDraft(current => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAnalysis || !selectedFinding) {
      setError("اختر جلسة تحتوي على جانب تطوير موثق ثم اختر الجانب نفسه.");
      return;
    }
    if (
      !draft.name.trim() ||
      !draft.goal.trim() ||
      !draft.steps.trim() ||
      !draft.progression.trim() ||
      !draft.reassessAt ||
      !draft.reassessMethod.trim()
    ) {
      setError("أكمل اسم الخطة وهدفها وخطواتها وموعد وطريقة إعادة التقييم.");
      return;
    }
    const input: ExercisePlanInput = {
      playerId: selectedAnalysis.playerId,
      analysisId: selectedAnalysis.id,
      developmentId: selectedFinding.id,
      name: draft.name.trim(),
      goal: draft.goal.trim(),
      steps: draft.steps
        .split("\n")
        .map(step => step.trim())
        .filter(Boolean),
      tools: draft.tools.trim(),
      sets: numberOrNull(draft.sets),
      repetitions: numberOrNull(draft.repetitions),
      durationSeconds: numberOrNull(draft.durationSeconds),
      restSeconds: numberOrNull(draft.restSeconds),
      progression: draft.progression.trim(),
      reassessAt: draft.reassessAt,
      reassessMethod: draft.reassessMethod.trim(),
      reassessIndicatorCode: selectedFinding.measurement.indicatorCode,
      reviewed: initial?.reviewed ?? false,
    };
    setSaving(true);
    setError("");
    try {
      await api<ExercisePlan>(
        initial ? `/exercise-plans/${initial.id}` : "/exercise-plans",
        {
          method: initial ? "PATCH" : "POST",
          body: JSON.stringify(input),
        }
      );
      await onSaved();
      onCancel();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ خطة التمرين."
      );
    } finally {
      setSaving(false);
    }
  }

  const supportedAnalyses = analyses.filter(
    analysis => (analysis.evaluation?.development.length ?? 0) > 0
  );
  return (
    <form className="exercise-plan-editor" onSubmit={submit}>
      <p className="exercise-plan-no-auto">
        <LockKeyhole aria-hidden="true" size={17} /> لا تُنشأ توصية آلية قبل
        وجود معيار تقييم موثق؛ الخطة التالية يراجعها المدرب ويحدد جرعتها.
      </p>
      {!supportedAnalyses.length ? (
        <EmptyState
          title="لا يتوفر جانب تطوير موثق"
          description="لا يمكن إنشاء خطة عامة من قوالب ثابتة. يلزم تحليل محفوظ يحتوي على جانب تطوير مدعوم بمعيار."
        />
      ) : (
        <>
          <div className="form-grid">
            <label>
              <span>جلسة التحليل</span>
              <select
                className="field"
                value={draft.analysisId}
                onChange={event => change("analysisId", event.target.value)}
                required
              >
                <option value="">اختر جلسة ذات جانب تطوير موثق</option>
                {supportedAnalyses.map(analysis => (
                  <option key={analysis.id} value={analysis.id}>
                    #{analysis.id} · {analysis.skill} ·{" "}
                    {formatDate(analysis.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>جانب التطوير الموثق</span>
              <select
                className="field"
                value={draft.developmentId}
                onChange={event => change("developmentId", event.target.value)}
                required
                disabled={!selectedAnalysis}
              >
                <option value="">اختر الجانب</option>
                {development.map(finding => (
                  <option key={finding.id} value={finding.id}>
                    {finding.title} — {finding.measurement.indicatorCode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>اسم الخطة</span>
              <input
                className="field"
                value={draft.name}
                onChange={event => change("name", event.target.value)}
                required
              />
            </label>
            <label>
              <span>الهدف</span>
              <input
                className="field"
                value={draft.goal}
                onChange={event => change("goal", event.target.value)}
                required
              />
            </label>
            <label>
              <span>الأدوات</span>
              <input
                className="field"
                value={draft.tools}
                onChange={event => change("tools", event.target.value)}
              />
            </label>
            <label>
              <span>المجموعات</span>
              <input
                className="field"
                type="number"
                min="0"
                value={draft.sets}
                onChange={event => change("sets", event.target.value)}
              />
            </label>
            <label>
              <span>التكرارات</span>
              <input
                className="field"
                type="number"
                min="0"
                value={draft.repetitions}
                onChange={event => change("repetitions", event.target.value)}
              />
            </label>
            <label>
              <span>المدة (ث)</span>
              <input
                className="field"
                type="number"
                min="0"
                value={draft.durationSeconds}
                onChange={event =>
                  change("durationSeconds", event.target.value)
                }
              />
            </label>
            <label>
              <span>الراحة (ث)</span>
              <input
                className="field"
                type="number"
                min="0"
                value={draft.restSeconds}
                onChange={event => change("restSeconds", event.target.value)}
              />
            </label>
            <label>
              <span>التدرج</span>
              <input
                className="field"
                value={draft.progression}
                onChange={event => change("progression", event.target.value)}
                required
              />
            </label>
            <label>
              <span>تاريخ إعادة التقييم</span>
              <input
                className="field"
                type="date"
                value={draft.reassessAt}
                onChange={event => change("reassessAt", event.target.value)}
                required
              />
            </label>
            <label>
              <span>طريقة إعادة التقييم</span>
              <input
                className="field"
                value={draft.reassessMethod}
                onChange={event => change("reassessMethod", event.target.value)}
                required
              />
            </label>
          </div>
          <label>
            <span>خطوات التنفيذ (كل خطوة في سطر)</span>
            <textarea
              className="field"
              rows={4}
              value={draft.steps}
              onChange={event => change("steps", event.target.value)}
              required
            />
          </label>
          {selectedFinding ? (
            <p className="exercise-plan-link">
              مرجع الخطة: {selectedFinding.title} ·{" "}
              {selectedFinding.measurement.name} · الجلسة #
              {selectedFinding.measurement.sessionId}
            </p>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="inline-actions">
            <button
              className="btn btn-primary btn-sm"
              type="submit"
              disabled={saving}
            >
              <Save size={15} /> {saving ? "جارٍ الحفظ…" : "حفظ الخطة"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={onCancel}
              disabled={saving}
            >
              إلغاء
            </button>
          </div>
        </>
      )}
    </form>
  );
}

export default function ExercisePlans({
  playerId,
  analysisId,
}: {
  playerId: number;
  analysisId?: number;
}) {
  const { organization, invalidate } = useAthlete();
  const isAcademy = organization?.type === "academy";
  const plansQuery = useApi<ExercisePlan[]>(
    `/exercise-plans?playerId=${playerId}`,
    Boolean(playerId)
  );
  const analysesQuery = useApi<Analysis[]>(
    `/analyses?playerId=${playerId}`,
    Boolean(playerId) && isAcademy
  );
  const [editing, setEditing] = useState<ExercisePlan | undefined>();
  const [creating, setCreating] = useState(false);
  const plans = useMemo(
    () =>
      (plansQuery.data ?? []).filter(
        plan => analysisId === undefined || plan.analysisId === analysisId
      ),
    [analysisId, plansQuery.data]
  );

  if (
    !organization ||
    plansQuery.isLoading ||
    (isAcademy && analysesQuery.isLoading)
  )
    return (
      <section className="session-evaluation-card">
        <Loading label="جارٍ تحميل خطط التمرين…" />
      </section>
    );
  if (plansQuery.isError || (isAcademy && analysesQuery.isError))
    return (
      <section className="session-evaluation-card">
        <ErrorState
          error={plansQuery.error ?? analysesQuery.error}
          retry={() => {
            void plansQuery.refetch();
            void analysesQuery.refetch();
          }}
        />
      </section>
    );
  const analyses = analysesQuery.data ?? [];
  const supportedAnalyses = analyses.filter(
    analysis => (analysis.evaluation?.development.length ?? 0) > 0
  );

  return (
    <section
      className="session-evaluation-card exercise-plans-card"
      aria-label="التمارين الموصى بها"
    >
      <header className="session-card-heading">
        <Dumbbell aria-hidden="true" size={21} />
        <div>
          <h2>التمارين الموصى بها</h2>
          <p>خطط محفوظة يراجعها المدرب، مرتبطة بجانب تطوير موثق.</p>
        </div>
        {isAcademy ? (
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => {
              setEditing(undefined);
              setCreating(true);
            }}
            disabled={!supportedAnalyses.length}
          >
            <Plus size={15} /> إضافة خطة
          </button>
        ) : null}
      </header>
      <p className="exercise-plan-no-auto">
        <LockKeyhole aria-hidden="true" size={17} /> لا توجد توصيات آلية أو خطة
        عامة عند غياب معيار تقييم موثق.
      </p>
      {creating || editing ? (
        <PlanEditor
          analyses={analyses}
          preferredAnalysisId={analysisId}
          initial={editing}
          onSaved={invalidate}
          onCancel={() => {
            setCreating(false);
            setEditing(undefined);
          }}
        />
      ) : null}
      {plans.length ? (
        <div className="exercise-plan-list">
          {plans.map(plan => (
            <div key={plan.id} className="exercise-plan-row">
              <PlanDetails plan={plan} />
              {isAcademy ? (
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setEditing(plan);
                  }}
                >
                  <Pencil size={15} /> تعديل
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : !creating ? (
        <EmptyState
          title="لا توجد خطط تمرين محفوظة"
          description={
            supportedAnalyses.length
              ? "يمكن للمدرب إضافة خطة من جانب تطوير موثق في الجلسة."
              : "لا يتوفر جانب تطوير موثق لإنشاء خطة؛ لا تُعرض خطة بديلة."
          }
        />
      ) : null}
    </section>
  );
}
