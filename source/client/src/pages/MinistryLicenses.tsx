
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Plus,
  RefreshCw,
  Search,
  ShieldX,
  X,
} from "lucide-react";

type AuthorityRole = "admin" | "reviewer" | "viewer";
type LicenseType = "academy" | "coach";
type StoredStatus = "active" | "suspended" | "revoked";
type EffectiveStatus =
  | StoredStatus
  | "expired"
  | "expiring_soon";

type License = {
  id: number;
  licenseNumber: string;
  issuedAt: string;
  expiresAt: string;
  status: StoredStatus;
  effectiveStatus: EffectiveStatus;
  type: LicenseType;
  academyId?: number;
  coachId?: number;
};

type LicenseResponse = {
  authorityId: number;
  academyLicenses: Omit<License, "type">[];
  coachLicenses: Omit<License, "type">[];
};

type Academy = {
  academyId: number;
  academyName: string;
  isDemo: boolean;
  status: string;
};

type AcademyResponse = {
  academies: Academy[];
};

type Coach = {
  id: number;
  name: string;
  academyId: number;
  status: string;
};

type CoachResponse = {
  coaches: Coach[];
};

type Props = {
  authorityId: number;
  role: AuthorityRole;
  onChanged?: () => void;
};

type FormState = {
  type: LicenseType;
  academyId: string;
  coachId: string;
  licenseNumber: string;
  issuedAt: string;
  expiresAt: string;
};

const statusNames: Record<EffectiveStatus, string> = {
  active: "ساري",
  expiring_soon: "قريب من الانتهاء",
  expired: "منتهي",
  suspended: "موقوف",
  revoked: "ملغى",
};

const statusStyles: Record<EffectiveStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  expiring_soon: "bg-amber-50 text-amber-700",
  expired: "bg-red-50 text-red-700",
  suspended: "bg-slate-100 text-slate-700",
  revoked: "bg-rose-50 text-rose-700",
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = data.error;
    if (typeof error === "string") return error;
  }
  return fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialForm(): FormState {
  const today = new Date();
  const nextYear = new Date(today);
  nextYear.setFullYear(today.getFullYear() + 1);

  return {
    type: "academy",
    academyId: "",
    coachId: "",
    licenseNumber: "",
    issuedAt: dateInputValue(today),
    expiresAt: dateInputValue(nextYear),
  };
}

function dateToIso(value: string) {
  const parts = value.split("-").map(Number);
  const [year, month, day] = parts;

  if (!year || !month || !day) {
    throw new Error("تاريخ غير صالح");
  }

  const result = new Date(year, month - 1, day, 12, 0, 0);

  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day
  ) {
    throw new Error("تاريخ غير صالح");
  }

  return result.toISOString();
}

function StatusBadge({ status }: { status: EffectiveStatus }) {
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}
    >
      {statusNames[status]}
    </span>
  );
}

export default function MinistryLicenses({
  authorityId,
  role,
  onChanged,
}: Props) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | LicenseType>(
    "all"
  );
  const [statusFilter, setStatusFilter] =
    useState<"all" | EffectiveStatus>("all");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = role === "admin";

  const refresh = useCallback(() => {
    setReloadKey(value => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/licenses`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getError(
              result,
              `تعذر تحميل التراخيص (${response.status})`
            )
          );
        }

        const data = result as LicenseResponse;

        if (
          !Array.isArray(data.academyLicenses) ||
          !Array.isArray(data.coachLicenses)
        ) {
          throw new Error("بيانات التراخيص غير صالحة");
        }

        const combined: License[] = [
          ...data.academyLicenses.map(item => ({
            ...item,
            type: "academy" as const,
          })),
          ...data.coachLicenses.map(item => ({
            ...item,
            type: "coach" as const,
          })),
        ];

        if (!controller.signal.aborted) {
          setLicenses(combined);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "حدث خطأ أثناء تحميل التراخيص"
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [authorityId, reloadKey]);

  useEffect(() => {
    if (!showForm || !canManage) return;

    const controller = new AbortController();

    async function loadAcademies() {
      setLoadingOptions(true);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/academies`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getError(result, "تعذر تحميل الأكاديميات")
          );
        }

        const data = result as AcademyResponse;

        if (!controller.signal.aborted) {
          setAcademies(
            (data.academies ?? []).filter(
              item => item.status === "approved" && !item.isDemo
            )
          );
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "تعذر تحميل الأكاديميات"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingOptions(false);
        }
      }
    }

    void loadAcademies();
    return () => controller.abort();
  }, [authorityId, showForm, canManage]);

  useEffect(() => {
    if (
      !showForm ||
      form.type !== "coach" ||
      !form.academyId
    ) {
      setCoaches([]);
      return;
    }

    const controller = new AbortController();

    async function loadCoaches() {
      setLoadingOptions(true);
      setCoaches([]);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/academies/${form.academyId}/coaches`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getError(result, "تعذر تحميل المدربين")
          );
        }

        const data = result as CoachResponse;

        if (!controller.signal.aborted) {
          setCoaches(
            (data.coaches ?? []).filter(
              coach => coach.status === "active"
            )
          );
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "تعذر تحميل المدربين"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingOptions(false);
        }
      }
    }

    void loadCoaches();
    return () => controller.abort();
  }, [authorityId, form.academyId, form.type, showForm]);

  const stats = useMemo(() => {
    return {
      total: licenses.length,
      active: licenses.filter(
        item => item.effectiveStatus === "active"
      ).length,
      expiring: licenses.filter(
        item => item.effectiveStatus === "expiring_soon"
      ).length,
      expired: licenses.filter(
        item => item.effectiveStatus === "expired"
      ).length,
    };
  }, [licenses]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return licenses.filter(item => {
      if (typeFilter !== "all" && item.type !== typeFilter) {
        return false;
      }

      if (
        statusFilter !== "all" &&
        item.effectiveStatus !== statusFilter
      ) {
        return false;
      }

      if (!term) return true;

      return (
        item.licenseNumber.toLowerCase().includes(term) ||
        String(item.academyId ?? "").includes(term) ||
        String(item.coachId ?? "").includes(term)
      );
    });
  }, [licenses, search, typeFilter, statusFilter]);

  async function submitLicense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || saving) return;

    setError(null);
    setNotice(null);

    const academyId = Number(form.academyId);
    const coachId = Number(form.coachId);

    if (
      !Number.isSafeInteger(academyId) ||
      academyId <= 0 ||
      !academies.some(item => item.academyId === academyId)
    ) {
      setError("اختر أكاديمية رسمية معتمدة.");
      return;
    }

    if (
      form.type === "coach" &&
      (!Number.isSafeInteger(coachId) ||
        coachId <= 0 ||
        !coaches.some(item => item.id === coachId))
    ) {
      setError("اختر مدربًا نشطًا.");
      return;
    }

    let issuedAt: string;
    let expiresAt: string;

    try {
      issuedAt = dateToIso(form.issuedAt);
      expiresAt = dateToIso(form.expiresAt);
    } catch {
      setError("تأكد من صحة تاريخ الإصدار والانتهاء.");
      return;
    }

    if (new Date(expiresAt) <= new Date(issuedAt)) {
      setError("تاريخ الانتهاء يجب أن يكون بعد تاريخ الإصدار.");
      return;
    }

    const path =
      form.type === "academy"
        ? "academy-licenses"
        : "coach-licenses";

    const body =
      form.type === "academy"
        ? {
            academyId,
            licenseNumber: form.licenseNumber.trim(),
            issuedAt,
            expiresAt,
          }
        : {
            coachId,
            licenseNumber: form.licenseNumber.trim(),
            issuedAt,
            expiresAt,
          };

    setSaving(true);

    try {
      const response = await fetch(
        `/api/regulatory/authorities/${authorityId}/${path}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getError(
            result,
            `فشل إصدار الترخيص (${response.status})`
          )
        );
      }

      setNotice("تم إصدار الترخيص بنجاح.");
      setShowForm(false);
      setForm(initialForm());
      refresh();
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر إصدار الترخيص"
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    license: License,
    action: "suspend" | "revoke"
  ) {
    if (!canManage || busyId) return;

    const word = action === "suspend" ? "إيقاف" : "إلغاء";

    if (
      !window.confirm(
        `هل تريد ${word} الترخيص "${license.licenseNumber}"؟`
      )
    ) {
      return;
    }

    const key = `${license.type}-${license.id}`;
    setBusyId(key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/regulatory/authorities/${authorityId}/licenses/${license.type}/${license.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getError(result, `فشلت العملية (${response.status})`)
        );
      }

      setNotice("تم تحديث حالة الترخيص بنجاح.");
      refresh();
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر تعديل حالة الترخيص"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            إدارة التراخيص
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            تراخيص الأكاديميات والمدربين التابعة للجهة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            تحديث
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setForm(initialForm());
                setShowForm(true);
              }}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white"
            >
              <Plus size={17} />
              إصدار ترخيص
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          {
            label: "إجمالي التراخيص",
            count: stats.total,
            icon: FileCheck2,
          },
          {
            label: "التراخيص السارية",
            count: stats.active,
            icon: CheckCircle2,
          },
          {
            label: "قريبة من الانتهاء",
            count: stats.expiring,
            icon: Clock3,
          },
          {
            label: "التراخيص المنتهية",
            count: stats.expired,
            icon: AlertCircle,
          },
        ].map(item => {
          const Icon = item.icon;

          return (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {item.label}
                </span>
                <Icon size={18} className="text-slate-400" />
              </div>

              <p className="mt-5 text-3xl font-semibold text-slate-900">
                {item.count}
              </p>
            </div>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          {notice}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
          <div className="relative min-w-52 flex-1">
            <Search
              size={17}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث برقم الترخيص أو المعرّف..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <select
            aria-label="نوع الترخيص"
            value={typeFilter}
            onChange={event =>
              setTypeFilter(
                event.target.value as "all" | LicenseType
              )
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">كل الأنواع</option>
            <option value="academy">الأكاديميات</option>
            <option value="coach">المدربون</option>
          </select>

          <select
            aria-label="حالة الترخيص"
            value={statusFilter}
            onChange={event =>
              setStatusFilter(
                event.target.value as "all" | EffectiveStatus
              )
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">كل الحالات</option>
            {Object.entries(statusNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
            <RefreshCw className="animate-spin" size={18} />
            جارٍ تحميل التراخيص...
          </div>
        ) : error && licenses.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            تعذر تحميل التراخيص. اضغط تحديث للمحاولة مجددًا.
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            {licenses.length
              ? "لا توجد نتائج مطابقة."
              : "لا توجد تراخيص مسجلة حاليًا."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">
                    رقم الترخيص
                  </th>
                  <th className="px-5 py-4 font-medium">
                    النوع
                  </th>
                  <th className="px-5 py-4 font-medium">
                    المستفيد
                  </th>
                  <th className="px-5 py-4 font-medium">
                    تاريخ الإصدار
                  </th>
                  <th className="px-5 py-4 font-medium">
                    تاريخ الانتهاء
                  </th>
                  <th className="px-5 py-4 font-medium">
                    الحالة
                  </th>
                  <th className="px-5 py-4 font-medium">
                    الإجراءات
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map(license => (
                  <tr key={`${license.type}-${license.id}`}>
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {license.licenseNumber}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {license.type === "academy"
                        ? "أكاديمية"
                        : "مدرب"}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {license.type === "academy"
                        ? `أكاديمية #${license.academyId}`
                        : `مدرب #${license.coachId}`}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(license.issuedAt)}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(license.expiresAt)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        status={license.effectiveStatus}
                      />
                    </td>
                    <td className="px-5 py-4">
                      {canManage && license.status === "active" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() =>
                              void changeStatus(license, "suspend")
                            }
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
                          >
                            <Ban size={14} />
                            إيقاف
                          </button>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() =>
                              void changeStatus(license, "revoke")
                            }
                            className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 disabled:opacity-50"
                          >
                            <ShieldX size={14} />
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">
                          لا توجد إجراءات
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showForm && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="license-form-title"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3
                id="license-form-title"
                className="text-lg font-semibold text-slate-900"
              >
                إصدار ترخيص جديد
              </h3>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
                aria-label="إغلاق"
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <form onSubmit={event => void submitLicense(event)}>
              <div className="space-y-4">
                <label className="block text-sm text-slate-700">
                  نوع الترخيص
                  <select
                    value={form.type}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        type: event.target.value as LicenseType,
                        academyId: "",
                        coachId: "",
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <option value="academy">
                      ترخيص أكاديمية
                    </option>
                    <option value="coach">
                      ترخيص مدرب
                    </option>
                  </select>
                </label>

                <label className="block text-sm text-slate-700">
                  الأكاديمية المعتمدة
                  <select
                    required
                    value={form.academyId}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        academyId: event.target.value,
                        coachId: "",
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <option value="">اختر الأكاديمية</option>
                    {academies.map(academy => (
                      <option
                        key={academy.academyId}
                        value={academy.academyId}
                      >
                        {academy.academyName}
                      </option>
                    ))}
                  </select>
                </label>

                {academies.length === 0 && !loadingOptions && (
                  <p className="text-xs text-amber-700">
                    لا توجد أكاديميات حقيقية معتمدة لإصدار
                    تراخيص لها.
                  </p>
                )}

                {form.type === "coach" && (
                  <label className="block text-sm text-slate-700">
                    المدرب
                    <select
                      required
                      value={form.coachId}
                      onChange={event =>
                        setForm(previous => ({
                          ...previous,
                          coachId: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <option value="">اختر المدرب</option>
                      {coaches.map(coach => (
                        <option key={coach.id} value={coach.id}>
                          {coach.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="block text-sm text-slate-700">
                  رقم الترخيص
                  <input
                    required
                    maxLength={100}
                    value={form.licenseNumber}
                    onChange={event =>
                      setForm(previous => ({
                        ...previous,
                        licenseNumber: event.target.value,
                      }))
                    }
                    placeholder="LIC-2026-001"
                    className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                  />
                </label>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    تاريخ الإصدار
                    <input
                      required
                      type="date"
                      value={form.issuedAt}
                      onChange={event =>
                        setForm(previous => ({
                          ...previous,
                          issuedAt: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                    />
                  </label>

                  <label className="block text-sm text-slate-700">
                    تاريخ الانتهاء
                    <input
                      required
                      type="date"
                      value={form.expiresAt}
                      onChange={event =>
                        setForm(previous => ({
                          ...previous,
                          expiresAt: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 p-3"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-7 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={
                    saving ||
                    loadingOptions ||
                    academies.length === 0
                  }
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {saving ? "جارٍ الإصدار..." : "إصدار الترخيص"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
