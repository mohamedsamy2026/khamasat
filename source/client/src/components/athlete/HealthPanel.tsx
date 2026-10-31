import { useEffect, useState } from "react";
import {
  AlertTriangle,
  HeartPulse,
  LockKeyhole,
  Phone,
  Save,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import {
  SENSITIVE_SCOPES,
  SENSITIVE_SCOPE_LABELS,
  type EmergencyContactResponse,
  type HealthProfileResponse,
  type SensitiveAccessState,
  type SensitiveScope,
} from "@shared/health";
import { ApiError, api, useApi, useAthlete } from "@/lib/athleteApi";
import { EmptyState, ErrorState, Loading, Panel } from "./UI";
import { formatDate } from "./EvaluationSummary";
import "./sport-forms.css";

const healthFields: Array<{
  key: keyof HealthForm;
  label: string;
  placeholder: string;
}> = [
  {
    key: "previousInjuries",
    label: "الإصابات السابقة",
    placeholder: "نوع الإصابة وتاريخها ومدتها…",
  },
  {
    key: "chronicDiseases",
    label: "الأمراض المزمنة",
    placeholder: "التشخيصات أو المتابعات الطبية المستمرة، أو «لا يوجد»…",
  },
  {
    key: "currentMedications",
    label: "الأدوية الحالية",
    placeholder: "اسم الدواء والجرعة أو «لا يوجد»…",
  },
  {
    key: "physiotherapy",
    label: "معلومات العلاج الطبيعي",
    placeholder: "البرنامج الحالي، التكرار، ملاحظات المعالج…",
  },
  {
    key: "availableExams",
    label: "الفحوصات المتاحة",
    placeholder: "الفحوصات أو التقارير المتاحة وتواريخها…",
  },
  {
    key: "otherNotes",
    label: "ملاحظات صحية أخرى",
    placeholder: "حساسية، قيود مشاركة، متابعة طبية…",
  },
];

type HealthForm = {
  previousInjuries: string;
  chronicDiseases: string;
  currentMedications: string;
  physiotherapy: string;
  availableExams: string;
  otherNotes: string;
};

const emptyHealth: HealthForm = {
  previousInjuries: "",
  chronicDiseases: "",
  currentMedications: "",
  physiotherapy: "",
  availableExams: "",
  otherNotes: "",
};

function ScopeBadge({ active }: { active: boolean }) {
  return (
    <span className={`scope-badge ${active ? "is-active" : ""}`}>
      {active ? "مسموح" : "محجوب"}
    </span>
  );
}

function LockedNotice({ scope }: { scope: SensitiveScope }) {
  return (
    <div className="sensitive-locked">
      <LockKeyhole aria-hidden="true" size={22} />
      <div>
        <strong>{SENSITIVE_SCOPE_LABELS[scope]} محجوب عن مؤسستك</strong>
        <p>
          هذا القسم يتطلب صلاحية صريحة ومستقلة لا تُمنح تلقائيًا عند اعتماد
          الوصول إلى ملف اللاعب. يمكن لمالك الأكاديمية المالكة للملف منحها أو
          إلغاؤها من تبويب الصحة.
        </p>
      </div>
    </div>
  );
}

export default function HealthPanel({ playerId }: { playerId: number }) {
  const { invalidate } = useAthlete();
  const accessQuery = useApi<SensitiveAccessState>(
    `/players/${playerId}/sensitive-access`,
    Boolean(playerId)
  );
  const healthQuery = useApi<HealthProfileResponse>(
    `/players/${playerId}/health`,
    Boolean(playerId)
  );
  const emergencyQuery = useApi<EmergencyContactResponse>(
    `/players/${playerId}/emergency-contact`,
    Boolean(playerId)
  );
  const [health, setHealth] = useState<HealthForm>(emptyHealth);
  const [contact, setContact] = useState({
    contactName: "",
    relationship: "",
    phone: "",
    alternatePhone: "",
    notes: "",
  });
  const [savingScope, setSavingScope] = useState<SensitiveScope | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const healthForbidden =
    healthQuery.error instanceof ApiError && healthQuery.error.status === 403;
  const emergencyForbidden =
    emergencyQuery.error instanceof ApiError &&
    emergencyQuery.error.status === 403;

  useEffect(() => {
    const profile = healthQuery.data?.profile;
    setHealth(
      profile
        ? {
            previousInjuries: profile.previousInjuries,
            chronicDiseases:
              "chronicDiseases" in profile &&
              typeof profile.chronicDiseases === "string"
                ? profile.chronicDiseases
                : "",
            currentMedications: profile.currentMedications,
            physiotherapy: profile.physiotherapy,
            availableExams:
              "availableExams" in profile &&
              typeof profile.availableExams === "string"
                ? profile.availableExams
                : "",
            otherNotes: profile.otherNotes,
          }
        : emptyHealth
    );
  }, [healthQuery.data?.profile]);

  useEffect(() => {
    const current = emergencyQuery.data?.contact;
    setContact(
      current
        ? {
            contactName: current.contactName,
            relationship: current.relationship,
            phone: current.phone,
            alternatePhone: current.alternatePhone,
            notes: current.notes,
          }
        : {
            contactName: "",
            relationship: "",
            phone: "",
            alternatePhone: "",
            notes: "",
          }
    );
  }, [emergencyQuery.data?.contact]);

  async function saveHealth(event: React.FormEvent) {
    event.preventDefault();
    setSavingScope("health");
    setError("");
    setNotice("");
    try {
      await api<HealthProfileResponse>(`/players/${playerId}/health`, {
        method: "PUT",
        body: JSON.stringify(health),
      });
      setNotice("تم حفظ الملف الصحي ومنح صلاحية صحية للأكاديمية المالكة فقط.");
      await Promise.all([
        accessQuery.refetch(),
        healthQuery.refetch(),
        emergencyQuery.refetch(),
        invalidate(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ الملف الصحي."
      );
    } finally {
      setSavingScope(null);
    }
  }

  async function saveEmergency(event: React.FormEvent) {
    event.preventDefault();
    setSavingScope("emergency");
    setError("");
    setNotice("");
    try {
      await api<EmergencyContactResponse>(
        `/players/${playerId}/emergency-contact`,
        { method: "PUT", body: JSON.stringify(contact) }
      );
      setNotice(
        "تم حفظ جهة الاتصال في الطوارئ ومنح صلاحية الطوارئ فقط دون كشف الملف الصحي."
      );
      await Promise.all([
        accessQuery.refetch(),
        healthQuery.refetch(),
        emergencyQuery.refetch(),
        invalidate(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر حفظ جهة الاتصال."
      );
    } finally {
      setSavingScope(null);
    }
  }

  async function toggleGrant(
    organizationId: number,
    scope: SensitiveScope,
    active: boolean
  ) {
    setError("");
    setNotice("");
    try {
      await api<SensitiveAccessState>(`/players/${playerId}/sensitive-access`, {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          scope,
          action: active ? "revoke" : "grant",
        }),
      });
      await accessQuery.refetch();
      await healthQuery.refetch();
      await emergencyQuery.refetch();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر تحديث صلاحية البيانات الحساسة."
      );
    }
  }

  if (
    accessQuery.isLoading ||
    healthQuery.isLoading ||
    emergencyQuery.isLoading
  )
    return (
      <Loading label="جارٍ التحقق من الصلاحيات وتحميل البيانات الصحية المحفوظة…" />
    );
  if (accessQuery.isError) {
    // 403 here means the organization has no access at all to this player's
    // sensitive records; the server never reveals which scope exists.
    if (
      accessQuery.error instanceof ApiError &&
      accessQuery.error.status === 403
    )
      return (
        <div className="sensitive-locked" role="status">
          <LockKeyhole aria-hidden="true" size={22} />
          <div>
            <strong>لا تملك صلاحية البيانات الحساسة لهذا اللاعب</strong>
            <p>
              الوصول إلى الملف الصحي وجهة الاتصال في الطوارئ يتطلب صلاحيتين
              صريحتين ومستقلتين. اعتماد وصولك إلى ملف اللاعب الرياضي لا يمنحك
              أيهما.
            </p>
          </div>
        </div>
      );
    return (
      <ErrorState
        error={accessQuery.error}
        retry={() => accessQuery.refetch()}
      />
    );
  }

  const access = accessQuery.data;
  const grants = access?.grants ?? [];
  const candidates = access?.candidates ?? [];
  const canManage = Boolean(access?.canManageGrants);
  const canWrite = Boolean(access?.canWrite);

  return (
    <div className="section-stack health-panel">
      <div className="sensitive-privacy-banner">
        <ShieldCheck aria-hidden="true" size={22} />
        <div>
          <strong>بيانات صحية حساسة</strong>
          <p>
            الوصول محكوم على الخادم بصلاحيتين منفصلتين: الملف الصحي وجهة الاتصال
            في الطوارئ. رؤية الملف الرياضي العادي لا تمنح أيهما، والنادي لا يحصل
            عليها تلقائيًا عند اعتماد وصوله أو انتقال اللاعب.
          </p>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="form-success" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid-2 sensitive-columns">
        <Panel title="الملف الصحي" icon={HeartPulse}>
          {healthForbidden && !canWrite ? (
            <LockedNotice scope="health" />
          ) : (
            <>
              {healthQuery.data?.profile ? (
                <p className="helper">
                  آخر تحديث:{" "}
                  {healthQuery.data.profile.updatedByName || "غير منسوب"} ·{" "}
                  {formatDate(healthQuery.data.profile.updatedAt)}
                </p>
              ) : (
                <p className="helper">لا يوجد ملف صحي محفوظ لهذا اللاعب بعد.</p>
              )}
              {canWrite ? (
                <form className="sensitive-form" onSubmit={saveHealth}>
                  {healthFields.map(field => (
                    <label className="field" key={field.key}>
                      {field.label}
                      <textarea
                        aria-label={field.label}
                        rows={2}
                        maxLength={2000}
                        value={health[field.key]}
                        placeholder={field.placeholder}
                        onChange={event =>
                          setHealth(current => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        disabled={savingScope === "health"}
                      />
                    </label>
                  ))}
                  <button
                    className="btn btn-primary btn-sm"
                    type="submit"
                    disabled={savingScope === "health"}
                  >
                    <Save size={15} />
                    {savingScope === "health"
                      ? "جارٍ الحفظ…"
                      : "حفظ الملف الصحي"}
                  </button>
                </form>
              ) : healthQuery.data?.profile ? (
                <dl className="sensitive-readonly">
                  {healthFields.map(field => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>{health[field.key] || "غير مسجل"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <EmptyState
                  title="لم يُسجل ملف صحي"
                  description="يسجل الملف الصحي مالك الأكاديمية المالكة للملف فقط."
                />
              )}
            </>
          )}
        </Panel>

        <Panel title="جهة الاتصال في الطوارئ" icon={Phone}>
          {emergencyForbidden && !canWrite ? (
            <LockedNotice scope="emergency" />
          ) : (
            <>
              {emergencyQuery.data?.contact ? (
                <p className="helper">
                  آخر تحديث:{" "}
                  {emergencyQuery.data.contact.updatedByName || "غير منسوب"} ·{" "}
                  {formatDate(emergencyQuery.data.contact.updatedAt)}
                </p>
              ) : (
                <p className="helper">
                  {emergencyForbidden
                    ? "لم تُمنح صلاحية جهة الاتصال بعد. حفظ جهة الاتصال يمنح أكاديميتك صلاحية الطوارئ وحدها دون الملف الصحي."
                    : "لا توجد جهة اتصال محفوظة بعد."}
                </p>
              )}
              {canWrite ? (
                <form className="sensitive-form" onSubmit={saveEmergency}>
                  <label className="field">
                    اسم جهة الاتصال
                    <input
                      required
                      minLength={2}
                      maxLength={140}
                      value={contact.contactName}
                      onChange={event =>
                        setContact(current => ({
                          ...current,
                          contactName: event.target.value,
                        }))
                      }
                      disabled={savingScope === "emergency"}
                    />
                  </label>
                  <label className="field">
                    صلة القرابة
                    <input
                      maxLength={80}
                      value={contact.relationship}
                      onChange={event =>
                        setContact(current => ({
                          ...current,
                          relationship: event.target.value,
                        }))
                      }
                      disabled={savingScope === "emergency"}
                    />
                  </label>
                  <label className="field">
                    رقم الهاتف
                    <input
                      required
                      type="tel"
                      inputMode="tel"
                      maxLength={32}
                      dir="ltr"
                      value={contact.phone}
                      onChange={event =>
                        setContact(current => ({
                          ...current,
                          phone: event.target.value,
                        }))
                      }
                      disabled={savingScope === "emergency"}
                    />
                  </label>
                  <label className="field">
                    رقم بديل (اختياري)
                    <input
                      type="tel"
                      inputMode="tel"
                      maxLength={32}
                      dir="ltr"
                      value={contact.alternatePhone}
                      onChange={event =>
                        setContact(current => ({
                          ...current,
                          alternatePhone: event.target.value,
                        }))
                      }
                      disabled={savingScope === "emergency"}
                    />
                  </label>
                  <label className="field">
                    ملاحظات
                    <input
                      maxLength={500}
                      value={contact.notes}
                      onChange={event =>
                        setContact(current => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                      disabled={savingScope === "emergency"}
                    />
                  </label>
                  <button
                    className="btn btn-primary btn-sm"
                    type="submit"
                    disabled={savingScope === "emergency"}
                  >
                    <Save size={15} />
                    {savingScope === "emergency"
                      ? "جارٍ الحفظ…"
                      : "حفظ جهة الاتصال"}
                  </button>
                </form>
              ) : emergencyQuery.data?.contact ? (
                <dl className="sensitive-readonly">
                  <div>
                    <dt>جهة الاتصال</dt>
                    <dd>{contact.contactName || "غير مسجل"}</dd>
                  </div>
                  <div>
                    <dt>الصلة</dt>
                    <dd>{contact.relationship || "غير مسجل"}</dd>
                  </div>
                  <div>
                    <dt>الهاتف</dt>
                    <dd dir="ltr">{contact.phone || "غير مسجل"}</dd>
                  </div>
                  <div>
                    <dt>ملاحظات</dt>
                    <dd>{contact.notes || "لا توجد"}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState
                  title="لم تُسجل جهة اتصال"
                  description="تسجل جهة الاتصال مالك الأكاديمية المالكة للملف فقط."
                />
              )}
            </>
          )}
        </Panel>
      </div>

      {canManage ? (
        <Panel title="صلاحيات البيانات الحساسة" icon={UserRoundCheck}>
          <div className="scope-table-wrap">
            <table className="scope-table">
              <caption className="sr-only">
                صلاحيات الملف الصحي وجهة الاتصال لكل مؤسسة
              </caption>
              <thead>
                <tr>
                  <th scope="col">المؤسسة</th>
                  {SENSITIVE_SCOPES.map(scope => (
                    <th scope="col" key={scope}>
                      {SENSITIVE_SCOPE_LABELS[scope]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.length ? (
                  candidates.map(candidate => (
                    <tr key={candidate.organizationId}>
                      <td>
                        <strong>{candidate.name}</strong>
                        <small>{candidate.reason}</small>
                      </td>
                      {SENSITIVE_SCOPES.map(scope => {
                        const grant = grants.find(
                          item =>
                            item.organizationId === candidate.organizationId &&
                            item.scope === scope
                        );
                        const active = Boolean(grant?.active);
                        return (
                          <td key={scope}>
                            <ScopeBadge active={active} />
                            {canManage ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                type="button"
                                onClick={() =>
                                  void toggleGrant(
                                    candidate.organizationId,
                                    scope,
                                    active
                                  )
                                }
                                disabled={!access?.canManageGrants}
                              >
                                {active ? "إلغاء" : "منح"}
                              </button>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3}>
                      <span className="muted">
                        لا توجد مؤسسات مؤهلة لمنحها صلاحية حساسة؛ يلزم أولًا
                        اعتماد وصولها إلى ملف اللاعب.
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="privacy-note">
            <AlertTriangle aria-hidden="true" size={17} />
            إلغاء وصول النادي إلى الملف يلغي تلقائيًا صلاحياته الحساسة لهذا
            اللاعب. الصلاحيات أعلاه منفصلة: منح الملف الصحي لا يمنح جهة الاتصال
            في الطوارئ. إدارة الصلاحيات متاحة لمالك الأكاديمية المالكة للملف
            فقط.
          </p>
        </Panel>
      ) : (
        <p className="privacy-note">
          <AlertTriangle aria-hidden="true" size={17} />
          إدارة صلاحيات البيانات الحساسة متاحة لمالك الأكاديمية المالكة للملف
          فقط. الصلاحيتان منفصلتان: الملف الصحي وجهة الاتصال في الطوارئ.
        </p>
      )}
    </div>
  );
}
