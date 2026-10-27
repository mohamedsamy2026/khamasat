import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Bell,
  ChartNoAxesCombined,
  ChevronLeft,
  ClipboardList,
  FileChartColumn,
  GraduationCap,
  Heart,
  Home,
  LockKeyhole,
  Menu,
  MessageSquare,
  Settings2,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
  Workflow,
  Loader2,
} from "lucide-react";
import { Brand, DemoBadge, ErrorState, Loading } from "./UI";
import { clearDemoToken, useAthlete } from "@/lib/athleteApi";
import { startLogin } from "@/const";
import { toast } from "sonner";
import "../../app-readability.css";

export const mainRoutes = [
  { path: "/", title: "الرئيسية", icon: Home },
  { path: "/academies", title: "الأكاديميات", icon: GraduationCap },
  { path: "/analysis", title: "تحليل الأداء", icon: ChartNoAxesCombined },
  { path: "/players", title: "ملف اللاعب", icon: Users },
  { path: "/clubs", title: "الأندية", icon: Shield },
  { path: "/reports", title: "التقارير", icon: FileChartColumn },
];
function login() {
  try {
    clearDemoToken();
    startLogin();
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "الدخول غير متاح الآن"
    );
  }
}
export function LoginPanel() {
  const { session, loading } = useAthlete();
  return (
    <div className="access-gate">
      <div className="gate-symbol">
        <LockKeyhole size={32} />
      </div>
      <span className="badge">نسخة تجريبية</span>
      <h1 style={{ marginTop: 17 }}>كل موهبة تستحق أن تُرى.</h1>
      <p>
        {session?.user
          ? "أنت مسجل الدخول. انتقل إلى مساحة مؤسستك لتجربة إدارة اللاعبين والتحليلات وطلبات الأندية."
          : "سجّل دخولك للوصول إلى ATHLETE AI. تتطلب ملفات اللاعبين والفيديوهات جلسة موثقة وصلاحية من الأكاديمية."}
      </p>
      {session?.user ? (
        <Link href="/academies" className="btn btn-primary">
          الانتقال إلى لوحة التحكم <ChevronLeft size={17} />
        </Link>
      ) : (
        <button
          className="btn btn-primary"
          onClick={login}
          disabled={loading}
          type="button"
        >
          {loading ? <Loader2 className="spin" size={17} /> : null}
          {loading ? "جارٍ التحقق من الدخول…" : "تسجيل الدخول عبر Manus"}
          <ChevronLeft size={17} />
        </button>
      )}
      <p className="gate-footnote">
        تسجيل الدخول مخصص للوصول إلى البيانات الحقيقية المرتبطة بحسابك.
      </p>
    </div>
  );
}
function SetupPanel() {
  const { initialize, session } = useAthlete();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setup = async () => {
    setBusy(true);
    setError("");
    try {
      await initialize();
      toast.success("تم حفظ مساحة التجربة الخاصة بحسابك");
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : "تعذر إنشاء مساحة التجربة"
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="access-gate">
      <div className="gate-symbol">
        <Workflow size={32} />
      </div>
      <span className="badge">أهلًا {session?.user?.name || "بك"}</span>
      <h1 style={{ marginTop: 17 }}>مساحتك جاهزة للانطلاق</h1>
      <p>
        أنشئ أكاديمية وناديًا تجريبيين خاصين بحسابك، مع ملفات خمسة لاعبين
        افتراضيين. يمكنك التبديل بين عضويتيك لتجربة طلب الوصول والموافقة عليه
        دون تجاوز الصلاحيات.
      </p>
      <button
        className="btn btn-primary"
        onClick={setup}
        disabled={busy}
        type="button"
        title={busy ? "انتظر اكتمال حفظ مساحة التجربة" : undefined}
      >
        {busy ? (
          <Loader2 size={17} className="spin" />
        ) : (
          <GraduationCap size={18} />
        )}
        {busy ? "جارٍ تهيئة مساحتك…" : "إنشاء مساحة التجربة الخاصة بي"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="gate-footnote">
        الحساب حقيقي، والمؤسسات واللاعبون والتحليلات بيانات تجريبية فقط.
      </p>
    </div>
  );
}
export function AccessGate({ children }: { children: ReactNode }) {
  const { loading, error, session, organization, invalidate } = useAthlete();
  if (loading) return <Loading label="جارٍ التحقق من جلسة الدخول…" />;
  if (error) return <ErrorState error={error} retry={invalidate} />;
  if (!session?.user && session?.mode !== "demo") return <LoginPanel />;
  if (!organization && session?.user) return <SetupPanel />;
  if (!organization)
    return (
      <ErrorState
        error={new Error("لم تصل مساحة العرض التجريبي من الخادم.")}
        retry={invalidate}
      />
    );
  return <>{children}</>;
}
export default function Layout({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const [open, setOpen] = useState(false);
  const { organization, session, setOrgId, loading } = useAthlete();
  const isProfile = path === "/players" || path.startsWith("/players/");
  const isDemo = session?.mode === "demo";
  const demoWorkspace = organization
    ? `${organization.type === "academy" ? "عرض الأكاديمية" : "عرض النادي"} · بيانات افتراضية`
    : "عرض تجريبي · بيانات افتراضية";
  const active = (route: string) =>
    route === "/"
      ? path === "/"
      : path === route || path.startsWith(`${route}/`);
  const title =
    mainRoutes.find(route => active(route.path))?.title ||
    (
      {
        "/requests": "طلبات الوصول",
        "/training": "البرامج التدريبية",
        "/notes": "الملاحظات",
        "/settings": "الإعدادات",
        "/favorites": "المفضلة",
        "/login": "تسجيل الدخول",
      } as Record<string, string>
    )[path] ||
    "ATHLETE AI";
  const nav =
    organization?.type === "club"
      ? [
          { path: "/clubs", title: "اكتشاف المواهب", icon: Users },
          { path: "/players", title: "ملف اللاعب", icon: UserRound },
          {
            path: "/analysis",
            title: "تحليل الأداء",
            icon: ChartNoAxesCombined,
          },
          { path: "/favorites", title: "المفضلة", icon: Heart },
          { path: "/requests", title: "طلبات الملفات", icon: ClipboardList },
          { path: "/reports", title: "التقارير", icon: FileChartColumn },
          ...(organization?.sports?.includes("gymnastics")
            ? [{ path: "/gymnastics", title: "قسم الجمباز", icon: Activity }]
            : []),
          {
            path: "/training",
            title: "البرامج التدريبية",
            icon: ClipboardList,
          },
        ]
      : [
          { path: "/academies", title: "لوحة الأكاديمية", icon: GraduationCap },
          { path: "/players", title: "ملف اللاعب", icon: Users },
          {
            path: "/analysis",
            title: "تحليل الأداء",
            icon: ChartNoAxesCombined,
          },
          { path: "/clubs", title: "الأندية", icon: Shield },
          {
            path: "/training",
            title: "البرامج التدريبية",
            icon: ClipboardList,
          },
          { path: "/reports", title: "التقارير", icon: FileChartColumn },
          { path: "/requests", title: "طلبات الأندية", icon: Shield },
          ...(organization?.sports?.includes("gymnastics")
            ? [{ path: "/gymnastics", title: "قسم الجمباز", icon: Activity }]
            : []),
        ];
  const organizationSelect =
    organization && (session?.user || isDemo) ? (
      <select
        className="org-select"
        value={organization.organizationId}
        onChange={event => setOrgId(Number(event.target.value))}
        aria-label="اختيار مؤسستك"
      >
        {session.memberships.map(member => (
          <option key={member.organizationId} value={member.organizationId}>
            {member.name}
          </option>
        ))}
      </select>
    ) : (
      <span className="org-select">
        {loading ? "جارٍ التحقق…" : session?.user?.name || "عرض تجريبي"}
      </span>
    );
  return (
    <div className={`app-shell ${isProfile ? "profile-layout" : ""}`}>
      <aside
        className={`sidebar ${open ? "is-open" : ""}`}
        aria-label="القائمة الرئيسية"
      >
        <div className="sidebar-brand">
          <Brand />
        </div>
        <span className="sidebar-label">منصة تحليل الأداء الرياضي</span>
        <nav className="sidebar-nav">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            aria-current={path === "/" ? "page" : undefined}
          >
            <Home size={18} /> الرئيسية
          </Link>
          {nav.map(item => (
            <Link
              href={item.path}
              key={item.path}
              className={active(item.path) ? "active" : ""}
              aria-current={active(item.path) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <item.icon size={18} />
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <nav className="sidebar-nav">
          <Link
            href="/notes"
            className={active("/notes") ? "active" : ""}
            onClick={() => setOpen(false)}
          >
            <MessageSquare size={18} />
            الملاحظات
          </Link>
          <Link
            href="/settings"
            className={active("/settings") ? "active" : ""}
            onClick={() => setOpen(false)}
          >
            <Settings2 size={18} />
            الإعدادات
          </Link>
        </nav>
        <div className="sidebar-footer">
          {isProfile && (
            <div className="profile-organization">
              <small>المؤسسة الحالية</small>
              {organizationSelect}
            </div>
          )}
          <div className="private-tag">
            <ShieldCheck size={21} />
            <div>
              <strong>
                {loading
                  ? "جارٍ التحقق من الجلسة"
                  : isDemo
                    ? demoWorkspace
                    : session?.user
                      ? "مساحة مرتبطة بحسابك"
                      : "الدخول غير موثق"}
              </strong>
              <small>
                {loading
                  ? "لم يتم تأكيد الدخول بعد"
                  : isDemo
                    ? "بيانات افتراضية متاحة دون تسجيل دخول"
                    : "تتحقق الصلاحيات من العضوية على الخادم"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      {open && <div className="sidebar-shade" onClick={() => setOpen(false)} />}
      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <GraduationCap size={16} />
            <span>ATHLETE AI</span>
            <ChevronLeft size={12} />
            <strong>{title}</strong>
          </div>
          <div className="mobile-brand">
            <button
              className="mobile-menu"
              onClick={() => setOpen(value => !value)}
              aria-label="القائمة الرئيسية"
              aria-expanded={open}
              type="button"
            >
              <Menu size={21} />
            </button>
            <Brand compact />
          </div>
          <div className="topbar-actions">
            <DemoBadge compact />
            {(session?.user || isDemo) && (
              <Link
                className="notification-button"
                href="/requests"
                aria-label="عرض طلبات الوصول"
              >
                <Bell size={20} />
              </Link>
            )}
            <div className="topbar-user">
              <span className="user-bubble">
                {loading ? (
                  <Loader2 className="spin" size={19} />
                ) : (
                  <UserRound size={19} />
                )}
              </span>
              <div>
                {organizationSelect}
                <div className="org-subtitle">
                  {loading
                    ? "جارٍ التحقق من الجلسة"
                    : isDemo
                      ? demoWorkspace
                      : !session?.user
                        ? "يلزم تسجيل الدخول"
                        : organization
                          ? `${organization.type === "academy" ? "مسؤول الأكاديمية" : "مسؤول النادي"}`
                          : "تم تسجيل الدخول — اختر مؤسسة"}
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="page-content" dir="rtl">
          <AccessGate>{children}</AccessGate>
          <footer className="page-bottom">
            <span>ATHLETE AI · منصة تطوير المواهب الرياضية</span>
            <span>
              {isDemo
                ? "نسخة عرض تجريبية — بيانات افتراضية متاحة دون تسجيل دخول؛ البيانات الحقيقية محمية"
                : "تُدار صلاحيات البيانات الحقيقية على الخادم"}
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="التنقل السريع للجوال">
        {(organization?.type === "club"
          ? [
              { path: "/clubs", title: "المواهب", icon: Shield },
              { path: "/players", title: "اللاعبون", icon: Users },
              {
                path: "/analysis",
                title: "التحليل",
                icon: ChartNoAxesCombined,
              },
              { path: "/requests", title: "الطلبات", icon: ClipboardList },
              { path: "/reports", title: "التقارير", icon: FileChartColumn },
            ]
          : [
              { path: "/academies", title: "الأكاديمية", icon: GraduationCap },
              { path: "/players", title: "اللاعبون", icon: Users },
              {
                path: "/analysis",
                title: "التحليل",
                icon: ChartNoAxesCombined,
              },
              { path: "/clubs", title: "المواهب", icon: Shield },
              { path: "/reports", title: "التقارير", icon: FileChartColumn },
            ]
        ).map(route => (
          <Link
            key={route.path}
            href={route.path}
            className={active(route.path) ? "active" : ""}
            aria-current={active(route.path) ? "page" : undefined}
          >
            <route.icon size={20} />
            <span>{route.title}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
