
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Search,
  RefreshCw,
  Check,
  X,
  Ban,
  AlertCircle,
} from "lucide-react";

type AuthorityRole = "admin" | "reviewer" | "viewer";

type AcademyStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

type AcademyLink = {
  linkId: number;
  academyId: number;
  academyName: string;
  region: string | null;
  isDemo: boolean;
  status: AcademyStatus;
  approvedAt: string | null;
  createdAt: string;
};

type AcademyResponse = {
  authorityId: number;
  academies: AcademyLink[];
  officialAcademies: number;
};

type LinkAction = "approve" | "reject" | "revoke";

type Props = {
  authorityId: number;
  role: AuthorityRole;
  onChanged?: () => void;
};

const statusLabels: Record<AcademyStatus, string> = {
  pending: "بانتظار الموافقة",
  approved: "معتمدة",
  rejected: "مرفوضة",
  revoked: "ملغى اعتمادها",
};

const statusStyles: Record<AcademyStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  revoked: "bg-slate-100 text-slate-600",
};

async function readResponse(
  response: Response
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(
  data: unknown,
  fallback: string
): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

function formatDate(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function MinistryAcademies({
  authorityId,
  role,
  onChanged,
}: Props) {
  const [data, setData] = useState<AcademyResponse | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyLinkId, setBusyLinkId] = useState<number | null>(
    null
  );

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    AcademyStatus | "all"
  >("all");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canManage = role === "admin";

  const refresh = () => {
    setRefreshKey(value => value + 1);
  };

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/academies`,
          {
            credentials: "include",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          }
        );

        const result = await readResponse(response);

        if (!response.ok) {
          throw new Error(
            errorMessage(
              result,
              `فشل تحميل الأكاديميات (${response.status})`
            )
          );
        }

        if (
          typeof result !== "object" ||
          result === null ||
          !("academies" in result) ||
          !Array.isArray(result.academies)
        ) {
          throw new Error("استجابة غير صالحة من السيرفر");
        }

        if (!controller.signal.aborted) {
          setData(result as AcademyResponse);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "تعذر تحميل الأكاديميات"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [authorityId, refreshKey]);

  const academies = data?.academies ?? [];

  const counts = useMemo(
    () => ({
      total: academies.length,
      pending: academies.filter(
        academy => academy.status === "pending"
      ).length,
      approved: academies.filter(
        academy => academy.status === "approved"
      ).length,
      official: data?.officialAcademies ?? 0,
    }),
    [academies, data]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();

    return academies.filter(academy => {
      const matchesStatus =
        filter === "all" || academy.status === filter;

      const matchesSearch =
        !term ||
        academy.academyName
          .toLocaleLowerCase()
          .includes(term) ||
        (academy.region ?? "")
          .toLocaleLowerCase()
          .includes(term) ||
        String(academy.academyId).includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [academies, search, filter]);

  const performAction = useCallback(
    async (
      academy: AcademyLink,
      action: LinkAction
    ) => {
      if (!canManage || busyLinkId !== null) return;

      const actionLabel =
        action === "approve"
          ? "الموافقة على"
          : action === "reject"
            ? "رفض"
            : "إلغاء اعتماد";

      const confirmed = window.confirm(
        `هل تريد ${actionLabel} الأكاديمية "${academy.academyName}"؟`
      );

      if (!confirmed) return;

      setBusyLinkId(academy.linkId);
      setError(null);
      setNotice(null);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/academy-links/${academy.linkId}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          }
        );

        const result = await readResponse(response);

        if (!response.ok) {
          throw new Error(
            errorMessage(
              result,
              `فشلت العملية (${response.status})`
            )
          );
        }

        setNotice("تم تحديث حالة الأكاديمية بنجاح");
        refresh();
        onChanged?.();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "حدث خطأ أثناء تحديث الأكاديمية"
        );
      } finally {
        setBusyLinkId(null);
      }
    },
    [authorityId, busyLinkId, canManage, onChanged]
  );

  return (
    <section dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            إدارة الأكاديميات
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            طلبات الربط والاعتماد لدى الجهة التنظيمية
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading || busyLinkId !== null}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { title: "إجمالي الطلبات", value: counts.total },
          { title: "بانتظار الموافقة", value: counts.pending },
          { title: "الروابط المعتمدة", value: counts.approved },
          { title: "الأكاديميات الرسمية", value: counts.official },
        ].map(item => (
          <div
            key={item.title}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <p className="text-sm text-slate-500">
              {item.title}
            </p>
            <p className="mt-4 text-3xl font-semibold text-slate-900">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <AlertCircle size={18} />
          {error}
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
          <div className="relative min-w-56 flex-1">
            <Search
              size={17}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث عن أكاديمية..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <select
            aria-label="تصفية حسب الحالة"
            value={filter}
            onChange={event =>
              setFilter(
                event.target.value as AcademyStatus | "all"
              )
            }
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm"
          >
            <option value="all">كل الحالات</option>
            <option value="pending">بانتظار الموافقة</option>
            <option value="approved">معتمدة</option>
            <option value="rejected">مرفوضة</option>
            <option value="revoked">ملغاة</option>
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
            <RefreshCw className="animate-spin" size={18} />
            جارٍ تحميل الأكاديميات...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center">
            <Building2 size={30} className="text-slate-300" />
            <p className="text-sm text-slate-500">
              {error
                ? "تعذر عرض الأكاديميات حاليًا"
                : academies.length === 0
                  ? "لا توجد طلبات ربط حاليًا"
                  : "لا توجد نتائج مطابقة"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-right text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">الأكاديمية</th>
                  <th className="px-5 py-4 font-medium">المنطقة</th>
                  <th className="px-5 py-4 font-medium">النوع</th>
                  <th className="px-5 py-4 font-medium">الحالة</th>
                  <th className="px-5 py-4 font-medium">تاريخ الطلب</th>
                  <th className="px-5 py-4 font-medium">الإجراءات</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map(academy => {
                  const busy =
                    busyLinkId === academy.linkId;

                  return (
                    <tr key={academy.linkId}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {academy.academyName}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          ID: {academy.academyId}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {academy.region || "غير محددة"}
                      </td>

                      <td className="px-5 py-4">
                        {academy.isDemo ? (
                          <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                            تجريبية
                          </span>
                        ) : (
                          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                            حقيقية
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-lg px-2.5 py-1 text-xs ${statusStyles[academy.status]}`}
                        >
                          {statusLabels[academy.status]}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(academy.createdAt)}
                      </td>

                      <td className="px-5 py-4">
                        {canManage &&
                        academy.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={busyLinkId !== null}
                              onClick={() =>
                                void performAction(
                                  academy,
                                  "approve"
                                )
                              }
                              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs text-white disabled:opacity-50"
                            >
                              <Check size={14} />
                              {busy ? "جارٍ التنفيذ" : "موافقة"}
                            </button>

                            <button
                              type="button"
                              disabled={busyLinkId !== null}
                              onClick={() =>
                                void performAction(
                                  academy,
                                  "reject"
                                )
                              }
                              className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600 disabled:opacity-50"
                            >
                              <X size={14} />
                              رفض
                            </button>
                          </div>
                        ) : canManage &&
                          academy.status === "approved" ? (
                          <button
                            type="button"
                            disabled={busyLinkId !== null}
                            onClick={() =>
                              void performAction(
                                academy,
                                "revoke"
                              )
                            }
                            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
                          >
                            <Ban size={14} />
                            {busy ? "جارٍ التنفيذ" : "إلغاء الاعتماد"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">
                            لا توجد إجراءات
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
