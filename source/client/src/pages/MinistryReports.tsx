
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Eye,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

type AuthorityRole = "admin" | "reviewer" | "viewer";

type ReportStatus =
  | "submitted"
  | "under_review"
  | "reviewed"
  | "returned";

type ReportType =
  | "performance"
  | "compliance"
  | "annual"
  | "other";

type ReviewAction = "start_review" | "approve" | "return";

type Report = {
  id: number;
  academyId: number;
  title: string;
  reportType: ReportType;
  content: unknown;
  status: ReportStatus;
  submittedByUserId: number;
  submittedAt: string;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
};

type Props = {
  authorityId: number;
  role: AuthorityRole;
  onChanged?: () => void;
};

const statusLabels: Record<ReportStatus, string> = {
  submitted: "بانتظار المراجعة",
  under_review: "قيد المراجعة",
  reviewed: "تمت المراجعة",
  returned: "معاد",
};

const statusStyles: Record<ReportStatus, string> = {
  submitted: "bg-amber-50 text-amber-700",
  under_review: "bg-blue-50 text-blue-700",
  reviewed: "bg-emerald-50 text-emerald-700",
  returned: "bg-red-50 text-red-700",
};

const typeLabels: Record<ReportType, string> = {
  performance: "الأداء",
  compliance: "الامتثال",
  annual: "سنوي",
  other: "أخرى",
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiError(data: unknown, fallback: string) {
  if (
    data !== null &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ReportBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-xs ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

export default function MinistryReports({
  authorityId,
  role,
  onChanged,
}: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ReportStatus | "all">("all");
  const [typeFilter, setTypeFilter] =
    useState<ReportType | "all">("all");

  const [selectedReport, setSelectedReport] =
    useState<Report | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canReview = role === "admin" || role === "reviewer";

  const refresh = () => {
    setReloadKey(value => value + 1);
  };

  useEffect(() => {
    const controller = new AbortController();

    async function loadReports() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/reports`,
          {
            credentials: "include",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }
        );

        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(
            apiError(
              result,
              `تعذر تحميل التقارير (${response.status})`
            )
          );
        }

        if (
          result === null ||
          typeof result !== "object" ||
          !("reports" in result) ||
          !Array.isArray(result.reports)
        ) {
          throw new Error("استجابة التقارير غير صالحة");
        }

        if (!controller.signal.aborted) {
          setReports(result.reports as Report[]);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "تعذر تحميل التقارير"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadReports();

    return () => controller.abort();
  }, [authorityId, reloadKey]);

  const stats = useMemo(
    () => ({
      total: reports.length,
      submitted: reports.filter(
        item => item.status === "submitted"
      ).length,
      underReview: reports.filter(
        item => item.status === "under_review"
      ).length,
      reviewed: reports.filter(
        item => item.status === "reviewed"
      ).length,
    }),
    [reports]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();

    return reports.filter(report => {
      if (
        statusFilter !== "all" &&
        report.status !== statusFilter
      ) {
        return false;
      }

      if (
        typeFilter !== "all" &&
        report.reportType !== typeFilter
      ) {
        return false;
      }

      return (
        !term ||
        report.title.toLocaleLowerCase().includes(term) ||
        String(report.id).includes(term) ||
        String(report.academyId).includes(term)
      );
    });
  }, [reports, search, statusFilter, typeFilter]);

  async function reviewReport(
    report: Report,
    action: ReviewAction
  ) {
    if (!canReview || busyId !== null) return;

    const labels: Record<ReviewAction, string> = {
      start_review: "بدء مراجعة",
      approve: "اعتماد",
      return: "إعادة",
    };

    if (
      !window.confirm(
        `هل تريد ${labels[action]} التقرير "${report.title}"؟`
      )
    ) {
      return;
    }

    setBusyId(report.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/regulatory/authorities/${authorityId}/reports/${report.id}`,
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
          apiError(
            result,
            `تعذر تحديث التقرير (${response.status})`
          )
        );
      }

      setNotice("تم تحديث حالة التقرير بنجاح.");
      setSelectedReport(null);
      refresh();
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر مراجعة التقرير"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            التقارير التنظيمية
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            التقارير المقدمة من الأكاديميات ومتابعة مراجعتها
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={loading || busyId !== null}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "إجمالي التقارير", value: stats.total, icon: ClipboardList },
          { label: "بانتظار المراجعة", value: stats.submitted, icon: Clock3 },
          { label: "قيد المراجعة", value: stats.underReview, icon: RefreshCw },
          { label: "تمت مراجعتها", value: stats.reviewed, icon: CheckCircle2 },
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
                {item.value}
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
          <AlertCircle size={18} className="shrink-0" />
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
          <div className="relative min-w-52 flex-1">
            <Search
              size={17}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث عن تقرير..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <select
            aria-label="حالة التقرير"
            value={statusFilter}
            onChange={event =>
              setStatusFilter(
                event.target.value as ReportStatus | "all"
              )
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">كل الحالات</option>
            {Object.entries(statusLabels).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </select>

          <select
            aria-label="نوع التقرير"
            value={typeFilter}
            onChange={event =>
              setTypeFilter(
                event.target.value as ReportType | "all"
              )
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">كل الأنواع</option>
            {Object.entries(typeLabels).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            جارٍ تحميل التقارير...
          </div>
        ) : error && reports.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            تعذر تحميل التقارير.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <ClipboardList size={30} className="text-slate-300" />
            <p className="text-sm text-slate-500">
              {reports.length === 0
                ? "لا توجد تقارير تنظيمية حاليًا."
                : "لا توجد نتائج مطابقة."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-right text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-medium">التقرير</th>
                  <th className="px-5 py-4 font-medium">الأكاديمية</th>
                  <th className="px-5 py-4 font-medium">النوع</th>
                  <th className="px-5 py-4 font-medium">تاريخ الإرسال</th>
                  <th className="px-5 py-4 font-medium">الحالة</th>
                  <th className="px-5 py-4 font-medium">الإجراءات</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.map(report => (
                  <tr key={report.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {report.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        ID: {report.id}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      أكاديمية #{report.academyId}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {typeLabels[report.reportType] ?? report.reportType}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(report.submittedAt)}
                    </td>
                    <td className="px-5 py-4">
                      <ReportBadge status={report.status} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedReport(report)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Eye size={15} />
                        التفاصيل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="report-dialog-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  {selectedReport.title}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  أكاديمية #{selectedReport.academyId}
                </p>
              </div>

              <button
                type="button"
                aria-label="إغلاق"
                disabled={busyId !== null}
                onClick={() => setSelectedReport(null)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <ReportBadge status={selectedReport.status} />

              <span className="text-sm text-slate-500">
                {typeLabels[selectedReport.reportType] ??
                  selectedReport.reportType}
              </span>

              <span className="text-sm text-slate-500">
                {formatDate(selectedReport.submittedAt)}
              </span>
            </div>

            <div className="mt-6">
              <h4 className="mb-3 text-sm font-semibold text-slate-800">
                محتوى التقرير المحفوظ
              </h4>

              <pre
                dir="ltr"
                className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs leading-6 text-slate-700"
              >
                {JSON.stringify(selectedReport.content, null, 2)}
              </pre>
            </div>

            <div className="mt-5 text-sm text-slate-500">
              {selectedReport.reviewedAt
                ? `تاريخ المراجعة: ${formatDate(selectedReport.reviewedAt)}`
                : "لم تتم مراجعة التقرير بعد."}
            </div>

            {canReview &&
              (selectedReport.status === "submitted" ||
                selectedReport.status === "under_review") && (
                <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
                  {selectedReport.status === "submitted" && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() =>
                        void reviewReport(selectedReport, "start_review")
                      }
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
                    >
                      بدء المراجعة
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void reviewReport(selectedReport, "return")
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm text-red-700 disabled:opacity-50"
                  >
                    <RotateCcw size={16} />
                    إعادة التقرير
                  </button>

                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      void reviewReport(selectedReport, "approve")
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    اعتماد المراجعة
                  </button>
                </div>
              )}
          </div>
        </div>
      )}
    </section>
  );
}
