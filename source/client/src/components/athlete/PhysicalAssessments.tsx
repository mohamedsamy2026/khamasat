import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Info,
  Plus,
  Save,
  ShieldQuestion,
  Trash2,
} from "lucide-react";
import type { PhysicalAssessment } from "@shared/physical-assessment";
import {
  PROVISIONAL_CRITERION_LABEL,
  PHYSICAL_INDICATOR_VERSION,
} from "@shared/physical-assessment";
import {
  indicatorsFor,
  sportDefinition,
  type SportId,
  type StrengthIndicator,
} from "@shared/sports";
import { api, useApi, useAthlete } from "@/lib/athleteApi";
import { EmptyState, ErrorState, Loading } from "./UI";
import { formatDate } from "./EvaluationSummary";
import "./sport-forms.css";

type Draft = {
  code: string;
  label: string;
  unit: string;
  units: readonly string[];
  value: string;
  note: string;
};

function formatValue(value: number) {
  return value.toLocaleString("ar", { maximumFractionDigits: 2 });
}

function groupAssessments(rows: PhysicalAssessment[]) {
  const groups = new Map<string, PhysicalAssessment[]>();
  for (const row of rows) {
    const key = row.sessionKey || `row-${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    items,
    recordedAt: items[0]?.recordedAt ?? "",
    authorName: items[0]?.authorName ?? "",
  }));
}

function IndicatorPicker({
  indicators,
  selected,
  onToggle,
  disabled,
}: {
  indicators: readonly StrengthIndicator[];
  selected: string[];
  onToggle: (indicator: StrengthIndicator) => void;
  disabled: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, StrengthIndicator[]>();
    for (const indicator of indicators) {
      map.set(indicator.group, [
        ...(map.get(indicator.group) ?? []),
        indicator,
      ]);
    }
    return [...map.entries()];
  }, [indicators]);

  return (
    <div
      className="indicator-picker"
      role="group"
      aria-label="اختيار المؤشرات البدنية"
    >
      {groups.map(([group, items]) => (
        <fieldset key={group} className="indicator-group">
          <legend>{group}</legend>
          <div className="indicator-options">
            {items.map(indicator => (
              <label
                key={indicator.code}
                className={`indicator-option ${
                  selected.includes(indicator.code) ? "is-selected" : ""
                }`}
                title={indicator.definition}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(indicator.code)}
                  onChange={() => onToggle(indicator)}
                  disabled={disabled}
                />
                <span>
                  <strong>{indicator.label}</strong>
                  <small>{indicator.definition}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

export default function PhysicalAssessments({
  playerId,
  sport,
  apparatus,
  skillOptions,
  compact = false,
}: {
  playerId: number;
  sport: SportId;
  apparatus?: string;
  skillOptions?: readonly string[];
  compact?: boolean;
}) {
  const { organization, invalidate } = useAthlete();
  // Recording and deleting indicators is limited to the owning academy; the
  // server re-checks ownership on every write.
  const isAcademy = organization?.type === "academy";
  const definition = sportDefinition(sport);
  const indicators = useMemo(
    () => indicatorsFor(sport, apparatus ?? null),
    [sport, apparatus]
  );
  const queryPath = `/physical-assessments?playerId=${playerId}${
    apparatus ? `&apparatus=${encodeURIComponent(apparatus)}` : ""
  }`;
  const assessmentsQuery = useApi<PhysicalAssessment[]>(
    queryPath,
    Boolean(playerId)
  );
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [skill, setSkill] = useState(skillOptions?.[0] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const selectedCodes = drafts.map(draft => draft.code);
  // A new array identity on every render must not wipe in-progress input.
  const skillKey = (skillOptions ?? []).join("|");

  useEffect(() => {
    setSkill(skillOptions?.[0] ?? "");
    setDrafts([]);
    setOpen(false);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, apparatus, skillKey]);

  function toggleIndicator(indicator: StrengthIndicator) {
    setError("");
    setDrafts(current => {
      if (current.some(draft => draft.code === indicator.code))
        return current.filter(draft => draft.code !== indicator.code);
      return [
        ...current,
        {
          code: indicator.code,
          label: indicator.label,
          unit: indicator.units[0] ?? "",
          units: indicator.units,
          value: "",
          note: "",
        },
      ];
    });
  }

  function updateDraft(code: string, patch: Partial<Draft>) {
    setDrafts(current =>
      current.map(draft =>
        draft.code === code ? { ...draft, ...patch } : draft
      )
    );
  }

  async function save() {
    if (!drafts.length) {
      setError(
        "اختر مؤشرًا واحدًا على الأقل من قائمة المؤشرات المعتمدة للرياضة."
      );
      return;
    }
    const missing = drafts.find(
      draft =>
        draft.value.trim() === "" || !Number.isFinite(Number(draft.value))
    );
    if (missing) {
      setError(`أدخل قيمة رقمية للمؤشر: ${missing.label}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api<{ sessionKey: string }>("/physical-assessments", {
        method: "POST",
        body: JSON.stringify({
          playerId,
          apparatus: apparatus ?? "",
          skill: skillOptions ? skill : "",
          indicators: drafts.map(draft => ({
            code: draft.code,
            value: Number(draft.value),
            unit: draft.unit,
            ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
          })),
        }),
      });
      setDrafts([]);
      setOpen(false);
      await invalidate();
      await assessmentsQuery.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ التقييم البدني."
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setDeletingId(id);
    setError("");
    try {
      await api<undefined>(`/physical-assessments/${id}`, { method: "DELETE" });
      await assessmentsQuery.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف التقييم.");
    } finally {
      setDeletingId(null);
    }
  }

  if (assessmentsQuery.isLoading)
    return <Loading label="جارٍ تحميل المؤشرات البدنية…" />;
  if (assessmentsQuery.isError)
    return (
      <ErrorState
        error={assessmentsQuery.error}
        retry={() => assessmentsQuery.refetch()}
      />
    );

  const rows = assessmentsQuery.data ?? [];
  const groups = groupAssessments(rows);

  return (
    <section className={`physical-assessments ${compact ? "is-compact" : ""}`}>
      <header className="physical-assessments-heading">
        <div>
          <h3>
            <ClipboardCheck aria-hidden="true" size={19} /> المؤشرات البدنية
            الموحّدة
          </h3>
          <p>
            اختيار من قائمة {definition.name} المعتمدة في إعدادات الرياضة (
            {definition.indicators.length} مؤشرًا). لا تُدخل مؤشرات حرة النص
            هنا.
          </p>
        </div>
        {isAcademy ? (
          <button
            className="btn btn-outline btn-sm"
            type="button"
            onClick={() => {
              setOpen(value => !value);
              setError("");
            }}
          >
            <Plus size={15} /> {open ? "إغلاق النموذج" : "تسجيل تقييم"}
          </button>
        ) : null}
      </header>

      <p className="provisional-notice">
        <ShieldQuestion aria-hidden="true" size={17} />
        <span>
          {PROVISIONAL_CRITERION_LABEL}. الإصدار: {PHYSICAL_INDICATOR_VERSION}.
          لا توجد عتبات أو تصنيف قوة/تطوير لهذه المؤشرات في هذه النسخة.
        </span>
      </p>

      {open ? (
        <div className="physical-assessment-form">
          {skillOptions && skillOptions.length > 1 ? (
            <label className="field">
              المهارة أو الحركة
              <select
                value={skill}
                onChange={event => setSkill(event.target.value)}
                disabled={saving}
              >
                {skillOptions.map(option => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ) : null}
          <IndicatorPicker
            indicators={indicators}
            selected={selectedCodes}
            onToggle={toggleIndicator}
            disabled={saving}
          />
          {drafts.length ? (
            <div className="indicator-values">
              {drafts.map(draft => (
                <div className="indicator-value-row" key={draft.code}>
                  <div className="indicator-value-title">
                    <strong>{draft.label}</strong>
                    <span className="metric-code">{draft.code}</span>
                  </div>
                  <label className="field">
                    القيمة
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={draft.value}
                      onChange={event =>
                        updateDraft(draft.code, { value: event.target.value })
                      }
                      disabled={saving}
                      required
                    />
                  </label>
                  <label className="field">
                    الوحدة
                    <select
                      value={draft.unit}
                      onChange={event =>
                        updateDraft(draft.code, { unit: event.target.value })
                      }
                      disabled={saving}
                    >
                      {draft.units.map(unit => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field indicator-note">
                    ملاحظة (اختياري)
                    <input
                      maxLength={500}
                      value={draft.note}
                      onChange={event =>
                        updateDraft(draft.code, { note: event.target.value })
                      }
                      disabled={saving}
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="helper">
              <Info size={16} /> لم يتم اختيار أي مؤشر بعد.
            </p>
          )}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="inline-actions">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => void save()}
              disabled={saving || !drafts.length}
            >
              <Save size={15} /> {saving ? "جارٍ الحفظ…" : "حفظ التقييم"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => {
                setOpen(false);
                setDrafts([]);
                setError("");
              }}
              disabled={saving}
            >
              إلغاء
            </button>
          </div>
        </div>
      ) : null}

      {!open && error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {groups.length ? (
        <div className="assessment-session-list">
          {groups.map(group => (
            <article className="assessment-session" key={group.key}>
              <header>
                <strong>{formatDate(group.recordedAt)}</strong>
                <span className="muted">
                  {group.items[0]?.apparatusName
                    ? `${group.items[0].apparatusName} · `
                    : ""}
                  {group.items[0]?.authorName || "غير منسوب"}
                </span>
              </header>
              <ul>
                {group.items.map(item => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.indicatorLabel}</strong>
                      <span className="metric-code">{item.indicatorCode}</span>
                    </div>
                    <span className="assessment-value">
                      {formatValue(item.value)} <small>{item.unit}</small>
                    </span>
                    {item.note ? <p className="muted">{item.note}</p> : null}
                    {isAcademy ? (
                      <button
                        className="icon-btn assessment-delete"
                        type="button"
                        aria-label={`حذف تقييم ${item.indicatorLabel}`}
                        onClick={() => void remove(item.id)}
                        disabled={deletingId === item.id}
                      >
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <span className="provisional-chip">مسودة علمية</span>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="لا توجد مؤشرات بدنية مسجلة"
          description="تُسجل المؤشرات من القائمة الموحّدة للرياضة، دون قيم افتراضية."
        />
      )}
    </section>
  );
}
