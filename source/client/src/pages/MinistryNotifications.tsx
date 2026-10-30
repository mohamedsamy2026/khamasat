
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  Clock3,
  RefreshCw,
  Search,
} from "lucide-react";

type AuthorityRole = "admin" | "reviewer" | "viewer";
type NotificationType = "expiring_soon" | "expired";

type LicenseNotification = {
  id: number;
  academyLicenseId: number | null;
  coachLicenseId: number | null;
  notificationType: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
};

type NotificationsResponse = {
  authorityId: number;
  notifications: LicenseNotification[];
  unreadCount: number;
};

type ScanResponse = {
  authorityId: number;
  checkedLicenses: number;
  recipients: number;
  created: number;
  skipped: number;
};

type Props = {
  authorityId: number;
  role: AuthorityRole;
  onChanged?: () => void;
};

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getError(data: unknown, fallback: string): string {
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

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function MinistryNotifications({
  authorityId,
  role,
  onChanged,
}: Props) {
  const [notifications, setNotifications] =
    useState<LicenseNotification[]>([]);

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [search, setSearch] = useState("");
  const [filter, setFilter] =
    useState<"all" | "unread" | NotificationType>("all");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canScan = role === "admin";

  const refresh = () => {
    setReloadKey(value => value + 1);
  };

  useEffect(() => {
    const controller = new AbortController();

    async function loadNotifications() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/regulatory/authorities/${authorityId}/notifications`,
          {
            credentials: "include",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }
        );

        const result = await readJson(response);

        if (!response.ok) {
          throw new Error(
            getError(
              result,
              `تعذر تحميل الإشعارات (${response.status})`
            )
          );
        }

        if (
          result === null ||
          typeof result !== "object" ||
          !("notifications" in result) ||
          !Array.isArray(result.notifications)
        ) {
          throw new Error("استجابة الإشعارات غير صالحة");
        }

        if (!controller.signal.aborted) {
          setNotifications(
            result.notifications as LicenseNotification[]
          );
        }
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "تعذر تحميل الإشعارات"
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadNotifications();

    return () => controller.abort();
  }, [authorityId, reloadKey]);

  const stats = useMemo(
    () => ({
      total: notifications.length,
      unread: notifications.filter(item => !item.isRead).length,
      expiring: notifications.filter(
        item => item.notificationType === "expiring_soon"
      ).length,
      expired: notifications.filter(
        item => item.notificationType === "expired"
      ).length,
    }),
    [notifications]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();

    return notifications
      .filter(item => {
        if (filter === "unread" && item.isRead) {
          return false;
        }

        if (
          filter !== "all" &&
          filter !== "unread" &&
          item.notificationType !== filter
        ) {
          return false;
        }

        return (
          !term ||
          item.message.toLocaleLowerCase().includes(term) ||
          String(item.id).includes(term)
        );
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
      );
  }, [notifications, search, filter]);

  async function scanLicenses() {
    if (!canScan || scanning) return;

    setScanning(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/regulatory/authorities/${authorityId}/notifications/scan`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getError(
            result,
            `فشل فحص التراخيص (${response.status})`
          )
        );
      }

      const scan = result as ScanResponse;

      setNotice(
        `تم فحص ${scan.checkedLicenses} ترخيص. ` +
        `الإشعارات الجديدة: ${scan.created}، ` +
        `الموجودة مسبقًا: ${scan.skipped}.`
      );

      refresh();
      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "فشل فحص التراخيص"
      );
    } finally {
      setScanning(false);
    }
  }

  async function markAsRead(notification: LicenseNotification) {
    if (notification.isRead || busyId !== null) return;

    setBusyId(notification.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/regulatory/authorities/${authorityId}/notifications/${notification.id}/read`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      const result = await readJson(response);

      if (!response.ok) {
        throw new Error(
          getError(
            result,
            `تعذر تحديث الإشعار (${response.status})`
          )
        );
      }

      setNotifications(previous =>
        previous.map(item =>
          item.id === notification.id
            ? { ...item, isRead: true }
            : item
        )
      );

      onChanged?.();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "تعذر تحديث الإشعار"
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
            الإشعارات التنظيمية
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            تنبيهات تراخيص الأكاديميات والمدربين
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={loading || scanning}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            تحديث
          </button>

          {canScan && (
            <button
              type="button"
              onClick={() => void scanLicenses()}
              disabled={scanning || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={scanning ? "animate-spin" : ""}
              />
              {scanning ? "جارٍ الفحص..." : "فحص التراخيص"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "إجمالي الإشعارات", value: stats.total, icon: Bell },
          { label: "غير المقروءة", value: stats.unread, icon: BellRing },
          { label: "قريبة من الانتهاء", value: stats.expiring, icon: Clock3 },
          { label: "انتهت صلاحيتها", value: stats.expired, icon: AlertCircle },
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
              placeholder="ابحث في الإشعارات..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <select
            aria-label="تصفية الإشعارات"
            value={filter}
            onChange={event =>
              setFilter(
                event.target.value as
                  | "all"
                  | "unread"
                  | NotificationType
              )
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">كل الإشعارات</option>
            <option value="unread">غير المقروءة</option>
            <option value="expiring_soon">قريبة من الانتهاء</option>
            <option value="expired">منتهية</option>
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            جارٍ تحميل الإشعارات...
          </div>
        ) : error && notifications.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            تعذر تحميل الإشعارات.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <Bell size={30} className="text-slate-300" />
            <p className="text-sm text-slate-500">
              {notifications.length === 0
                ? "لا توجد إشعارات حاليًا."
                : "لا توجد نتائج مطابقة."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(notification => (
              <div
                key={notification.id}
                className={`flex flex-wrap items-start gap-4 p-5 ${
                  notification.isRead ? "bg-white" : "bg-slate-50"
                }`}
              >
                <div
                  className={`rounded-xl p-3 ${
                    notification.notificationType === "expired"
                      ? "bg-red-50 text-red-600"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {notification.notificationType === "expired" ? (
                    <AlertCircle size={20} />
                  ) : (
                    <Clock3 size={20} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {notification.notificationType === "expired"
                        ? "ترخيص منتهي"
                        : "ترخيص قريب من الانتهاء"}
                    </h3>

                    {!notification.isRead && (
                      <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        جديد
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {notification.message}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    {formatDate(notification.createdAt)}
                    {" · "}
                    {notification.academyLicenseId !== null
                      ? `ترخيص أكاديمية #${notification.academyLicenseId}`
                      : `ترخيص مدرب #${notification.coachLicenseId}`}
                  </p>
                </div>

                {!notification.isRead && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void markAsRead(notification)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
                  >
                    <Check size={15} />
                    تحديد كمقروء
                  </button>
                )}

                {notification.isRead && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <CheckCheck size={15} />
                    مقروء
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
