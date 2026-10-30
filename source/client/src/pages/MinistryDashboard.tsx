
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck2,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";

import MinistryAcademies from "./MinistryAcademies";
import MinistryLicenses from "./MinistryLicenses";
import MinistryCoaches from "./MinistryCoaches";
import MinistryReports from "./MinistryReports";
import MinistryNotifications from "./MinistryNotifications";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type AuthorityRole = "admin" | "reviewer" | "viewer";

type Authority = {
  id: number;
  name: string;
  code?: string;
  region: string;
  role: AuthorityRole;
};

type LicenseStats = {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
  suspended: number;
  revoked: number;
};

type DashboardData = {
  authority: {
    id: number;
    name: string;
    region: string;
  };

  generatedAt: string;

  academies: {
    official: number;
    byRegion: {
      region: string;
      count: number;
    }[];
  };

  coaches: {
    total: number;
    active: number;
    inactive: number;
  };

  licenses: {
    total: LicenseStats;
    academies: LicenseStats;
    coaches: LicenseStats;
  };

  reports: {
    total: number;
    submitted: number;
    underReview: number;
    reviewed: number;
    returned: number;
  };

  notifications: {
    total: number;
    unread: number;
  };
};

type Section =
  | "overview"
  | "academies"
  | "coaches"
  | "licenses"
  | "reports"
  | "notifications";

type NavigationItem = {
  id: Section;
  label: string;
  icon: typeof Building2;
};

const navigation: NavigationItem[] = [
  {
    id: "overview",
    label: "لوحة التحكم",
    icon: ShieldCheck,
  },
  {
    id: "academies",
    label: "الأكاديميات",
    icon: Building2,
  },
  {
    id: "coaches",
    label: "المدربون",
    icon: Users,
  },
  {
    id: "licenses",
    label: "التراخيص",
    icon: FileCheck2,
  },
  {
    id: "reports",
    label: "التقارير",
    icon: ClipboardList,
  },
  {
    id: "notifications",
    label: "الإشعارات",
    icon: Bell,
  },
];

// --------------------------------------------------
// API
// --------------------------------------------------

async function requestJson<T>(
  path: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("يرجى تسجيل الدخول أولًا.");
    }

    if (response.status === 403) {
      throw new Error(
        "ليس لديك صلاحية الوصول إلى بيانات الوزارة."
      );
    }

    throw new Error(
      `تعذر تحميل البيانات (${response.status}).`
    );
  }

  return (await response.json()) as T;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ar").format(value);
}

// --------------------------------------------------
// SHARED COMPONENTS
// --------------------------------------------------

function SummaryCard({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-sm text-slate-500">
          {label}
        </span>

        <span className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
          <Icon size={19} strokeWidth={1.8} />
        </span>
      </div>

      <div className="text-3xl font-semibold tracking-tight text-slate-900">
        {formatNumber(value)}
      </div>

      {detail && (
        <p className="mt-2 text-xs text-slate-500">
          {detail}
        </p>
      )}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="mb-5 text-base font-semibold text-slate-900">
        {title}
      </h2>

      {children}
    </section>
  );
}

function StatRow({
  label,
  count,
  icon: Icon,
}: {
  label: string;
  count: number;
  icon?: typeof Building2;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-2.5 text-sm text-slate-600">
        {Icon && (
          <Icon
            size={17}
            className="text-slate-400"
          />
        )}
        {label}
      </div>

      <span className="font-semibold text-slate-900">
        {formatNumber(count)}
      </span>
    </div>
  );
}

// --------------------------------------------------
// OVERVIEW
// --------------------------------------------------

function Overview({
  data,
}: {
  data: DashboardData;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="الأكاديميات المعتمدة"
          value={data.academies.official}
          icon={Building2}
          detail="الأكاديميات الرسمية فقط"
        />

        <SummaryCard
          label="المدربون"
          value={data.coaches.total}
          icon={Users}
          detail="في الأكاديميات المعتمدة"
        />

        <SummaryCard
          label="التراخيص"
          value={data.licenses.total.total}
          icon={FileCheck2}
          detail="تراخيص الأكاديميات والمدربين"
        />

        <SummaryCard
          label="التقارير"
          value={data.reports.total}
          icon={ClipboardList}
          detail="التقارير التنظيمية المسجلة"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard title="حالة التراخيص">
          <div className="divide-y divide-slate-100">
            <StatRow
              label="سارية"
              count={data.licenses.total.active}
              icon={CheckCircle2}
            />

            <StatRow
              label="قريبة من الانتهاء"
              count={data.licenses.total.expiringSoon}
              icon={Clock3}
            />

            <StatRow
              label="منتهية"
              count={data.licenses.total.expired}
              icon={AlertTriangle}
            />

            <StatRow
              label="موقوفة"
              count={data.licenses.total.suspended}
            />

            <StatRow
              label="ملغاة"
              count={data.licenses.total.revoked}
            />
          </div>
        </SectionCard>

        <SectionCard title="حالة التقارير">
          <div className="divide-y divide-slate-100">
            <StatRow
              label="بانتظار المراجعة"
              count={data.reports.submitted}
            />

            <StatRow
              label="قيد المراجعة"
              count={data.reports.underReview}
              icon={Clock3}
            />

            <StatRow
              label="تمت مراجعتها"
              count={data.reports.reviewed}
              icon={CheckCircle2}
            />

            <StatRow
              label="تمت إعادتها"
              count={data.reports.returned}
            />
          </div>
        </SectionCard>

        <SectionCard title="المدربون">
          <div className="divide-y divide-slate-100">
            <StatRow
              label="إجمالي المدربين"
              count={data.coaches.total}
              icon={Users}
            />

            <StatRow
              label="نشطون"
              count={data.coaches.active}
            />

            <StatRow
              label="غير نشطين"
              count={data.coaches.inactive}
            />
          </div>
        </SectionCard>

        <SectionCard title="توزيع الأكاديميات حسب المنطقة">
          {data.academies.byRegion.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center text-center text-sm text-slate-400">
              لا توجد أكاديميات رسمية مسجلة حاليًا.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.academies.byRegion.map(region => (
                <StatRow
                  key={region.region}
                  label={region.region}
                  count={region.count}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <Bell
          size={19}
          className="text-slate-600"
        />

        <span className="flex-1 text-sm text-slate-600">
          الإشعارات غير المقروءة
        </span>

        <span className="font-semibold text-slate-900">
          {formatNumber(data.notifications.unread)}
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------
// MAIN DASHBOARD
// --------------------------------------------------

export default function MinistryDashboard() {
  const [authority, setAuthority] =
    useState<Authority | null>(null);

  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null);

  const [activeSection, setActiveSection] =
    useState<Section>("overview");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError(null);

      try {
        const user = await requestJson<{
          authorities: Authority[];
        }>(
          "/api/regulatory/me",
          controller.signal
        );

        if (!user.authorities?.length) {
          throw new Error(
            "هذا الحساب غير مرتبط بأي جهة تنظيمية."
          );
        }

        const selectedAuthority = user.authorities[0];

        const data = await requestJson<DashboardData>(
          `/api/regulatory/authorities/${selectedAuthority.id}/dashboard`,
          controller.signal
        );

        if (controller.signal.aborted) return;

        setAuthority(selectedAuthority);
        setDashboard(data);
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "حدث خطأ غير متوقع."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [reloadKey]);

  const reload = () => {
    setRefreshing(true);
    setReloadKey(value => value + 1);
  };

  const pageTitle =
    navigation.find(
      item => item.id === activeSection
    )?.label ?? "لوحة التحكم";

  if (loading && !dashboard) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600"
      >
        <RefreshCw
          size={20}
          className="ml-3 animate-spin"
        />
        جارٍ تحميل لوحة التحكم...
      </main>
    );
  }

  if (error && !dashboard) {
    return (
      <main
        dir="rtl"
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4"
      >
        <AlertTriangle
          size={32}
          className="text-rose-500"
        />

        <p className="text-center text-slate-700">
          {error}
        </p>

        <button
          type="button"
          onClick={reload}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm text-white"
        >
          إعادة المحاولة
        </button>
      </main>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-50 text-slate-900 lg:flex"
    >
      {/* Sidebar */}

      <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-l">
        <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
            <ShieldCheck size={23} />
          </div>

          <div>
            <h1 className="text-base font-bold">
              ATHLETE AI
            </h1>

            <p className="text-xs text-slate-500">
              البوابة التنظيمية
            </p>
          </div>
        </div>

        {/* Navigation */}

        <nav className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1 lg:p-4">
          {navigation.map(item => {
            const Icon = item.icon;
            const selected = item.id === activeSection;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={[
                  "flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors lg:w-full",
                  selected
                    ? "bg-slate-900 font-medium text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                <Icon size={19} strokeWidth={1.8} />

                <span>{item.label}</span>

                {item.id === "notifications" &&
                  !!dashboard?.notifications.unread && (
                    <span className="mr-auto rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                      {formatNumber(
                        dashboard.notifications.unread
                      )}
                    </span>
                  )}
              </button>
            );
          })}
        </nav>

        {/* Authority details */}

        <div className="hidden border-t border-slate-100 px-5 py-5 lg:block">
          <p className="text-xs text-slate-500">
            الجهة التنظيمية
          </p>

          <p className="mt-1 text-sm font-semibold">
            {authority?.name}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {authority?.region}
          </p>
        </div>
      </aside>

      {/* Main content */}

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold sm:text-2xl">
                {pageTitle}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {authority?.name}
              </p>
            </div>

            <button
              type="button"
              onClick={reload}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing ? "animate-spin" : ""
                }
              />

              تحديث البيانات
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl p-5 sm:p-8">
          {error && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
            >
              {error}
            </div>
          )}

          {activeSection === "overview" && dashboard ? (
            <Overview data={dashboard} />
          ) : activeSection === "academies" && authority ? (
            <MinistryAcademies
              authorityId={authority.id}
              role={authority.role}
              onChanged={reload}
            />
          ) : activeSection === "coaches" && authority ? (
            <MinistryCoaches
              authorityId={authority.id}
              role={authority.role}
              onChanged={reload}
            />
          ) : activeSection === "licenses" && authority ? (
            <MinistryLicenses
              authorityId={authority.id}
              role={authority.role}
              onChanged={reload}
            />
          ) : activeSection === "reports" && authority ? (
            <MinistryReports
              authorityId={authority.id}
              role={authority.role}
              onChanged={reload}
            />
          ) : activeSection === "notifications" && authority ? (
            <MinistryNotifications
              authorityId={authority.id}
              role={authority.role}
              onChanged={reload}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
