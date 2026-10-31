import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChartNoAxesCombined,
  FileText,
  GraduationCap,
  Landmark,
  Loader2,
  LockKeyhole,
  Menu,
  Shield,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { clearDemoToken, useAthlete } from "@/lib/athleteApi";
import { startLogin } from "@/const";
import { toast } from "sonner";
import "./home-reference.css";

type DemoType = "academy" | "club";
type EntryType = DemoType | "ministry";

type RegulatoryMeResponse = {
  authorities?: Array<{
    id: number;
    name: string;
    role: "admin" | "reviewer" | "viewer";
  }>;
};

export default function Home() {
  const { session, enterDemo, loading, error, invalidate } = useAthlete();
  const [, navigate] = useLocation();
  const [entering, setEntering] = useState<EntryType | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isBusy = loading || entering !== null;

  const enterDemoSpace = async (type: DemoType) => {
    if (isBusy) return;
    setEntering(type);
    try {
      await enterDemo(type);
      navigate(type === "academy" ? "/academies" : "/clubs");
    } catch (problem) {
      toast.error(
        problem instanceof Error ? problem.message : "تعذر فتح مساحة العرض"
      );
    } finally {
      setEntering(null);
    }
  };

  const login = () => {
    try {
      clearDemoToken();
      startLogin();
    } catch (problem) {
      toast.error(
        problem instanceof Error ? problem.message : "تعذر تسجيل الدخول"
      );
    }
  };

  const enterMinistry = async () => {
    if (isBusy) return;
    setEntering("ministry");
    try {
      clearDemoToken();
      const response = await fetch("/api/regulatory/me", {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (response.status === 401) {
        navigate("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(
          `تعذر التحقق من صلاحيات الجهة التنظيمية (${response.status})`
        );
      }
      const data = (await response.json()) as RegulatoryMeResponse;
      if (!Array.isArray(data.authorities) || data.authorities.length === 0) {
        toast.error("حسابك غير مرتبط بجهة تنظيمية. يلزم تفويض من مسؤول الجهة.");
        return;
      }
      navigate("/ministry");
    } catch (problem) {
      toast.error(
        problem instanceof Error
          ? problem.message
          : "تعذر فتح بوابة الجهات التنظيمية"
      );
    } finally {
      setEntering(null);
    }
  };

  const openAccount = () => {
    if (session?.user) navigate("/academies");
    else login();
    setMenuOpen(false);
  };

  const features = [
    {
      title: "تحليل الحركة",
      description: "فهم أعمق للأداء الرياضي",
      icon: Activity,
    },
    {
      title: "ملف رياضي متكامل",
      description: "جميع بيانات الرياضي في مكان واحد",
      icon: FileText,
    },
    {
      title: "متابعة التطور",
      description: "مراقبة مستمرة لرحلة الرياضي",
      icon: TrendingUp,
    },
  ];

  return (
    <main className="athlete-landing" dir="rtl">
      <div className="landing-stage" id="top">
        <header className="landing-header">
          <Link href="/" className="landing-brand" aria-label="ATHLETE AI الرئيسية">
            <img src="/brand/mark.png" alt="" aria-hidden="true" />
            <span dir="ltr">ATHLETE <strong>AI</strong></span>
          </Link>

          <nav className={`landing-navigation ${menuOpen ? "is-open" : ""}`} aria-label="التنقل الرئيسي">
            <a className="is-current" href="#top" onClick={() => setMenuOpen(false)}>الرئيسية</a>
            <a href="#platform" onClick={() => setMenuOpen(false)}>عن المنصة</a>
          </nav>

          <button type="button" className="landing-header-login" onClick={openAccount}>
            <Users size={18} strokeWidth={1.7} aria-hidden="true" />
            {session?.user ? "دخول حسابي" : "تسجيل الدخول"}
          </button>

          <button
            type="button"
            className="landing-menu-toggle"
            aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(value => !value)}
          >
            {menuOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </header>

        <section className="landing-hero" aria-labelledby="landing-main-title">
          <div className="landing-hero-image" aria-hidden="true" />
          <div className="landing-hero-shade" aria-hidden="true" />
          <div className="landing-hero-copy">
            <div className="landing-eyebrow"><span />منصة رياضية متكاملة</div>
            <h1 id="landing-main-title">
              <span>حيث تبدأ</span>
              <span className="landing-gradient-text">رحلة الأبطال</span>
            </h1>
            <p className="landing-hero-description">
              تحليل ذكي للأداء الرياضي، وتطوير المواهب،
              <br className="landing-desktop-break" /> وربط الأكاديميات بالأندية
            </p>
            <div className="landing-promise">
              <ChartNoAxesCombined size={22} strokeWidth={1.8} aria-hidden="true" />
              <span>رؤية أعمق. تطور مستمر.</span>
            </div>
          </div>
        </section>

        <div className="landing-body">
          <section className="landing-spaces" id="platform" aria-label="مساحات العمل في المنصة">
            <div className="landing-primary-cards">
              <button
                type="button"
                className="landing-space-card landing-academy-card"
                onClick={() => void enterDemoSpace("academy")}
                disabled={isBusy}
                aria-busy={entering === "academy"}
              >
                <span className="landing-card-number">01</span>
                <GraduationCap className="landing-card-watermark" size={150} strokeWidth={0.65} aria-hidden="true" />
                <span className="landing-card-content">
                  <span className="landing-card-heading">الأكاديميات</span>
                  <span className="landing-card-desc">إدارة الرياضيين وتحليل الأداء<br />ومتابعة التطور</span>
                  <span className="landing-card-cta">
                    {entering === "academy" ? <Loader2 className="landing-spin" size={17} /> : <ArrowLeft size={18} />}
                    دخول الأكاديميات
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="landing-space-card landing-club-card"
                onClick={() => void enterDemoSpace("club")}
                disabled={isBusy}
                aria-busy={entering === "club"}
              >
                <span className="landing-card-number">02</span>
                <Shield className="landing-card-watermark" size={160} strokeWidth={0.65} aria-hidden="true" />
                <span className="landing-card-content">
                  <span className="landing-card-heading">الأندية</span>
                  <span className="landing-card-desc">اكتشاف المواهب<br />واستقطاب الرياضيين</span>
                  <span className="landing-card-cta">
                    {entering === "club" ? <Loader2 className="landing-spin" size={17} /> : <ArrowLeft size={18} />}
                    دخول الأندية
                  </span>
                </span>
              </button>
            </div>

            <button
              type="button"
              className="landing-ministry-card"
              onClick={() => void enterMinistry()}
              disabled={isBusy}
              aria-busy={entering === "ministry"}
            >
              <span className="landing-ministry-icon"><Landmark size={24} strokeWidth={1.5} aria-hidden="true" /></span>
              <span className="landing-ministry-text">
                <strong>الجهات التنظيمية</strong>
                <span>الإشراف على الأكاديميات والتراخيص والتقارير</span>
              </span>
              {entering === "ministry" ? <Loader2 className="landing-spin" size={19} /> : <ArrowLeft size={21} />}
            </button>
          </section>

          <section className="landing-features" id="features" aria-label="مميزات المنصة">
            {features.map(feature => {
              const Icon = feature.icon;
              return (
                <div className="landing-feature" key={feature.title}>
                  <Icon size={35} strokeWidth={1.3} aria-hidden="true" />
                  <div>
                    <strong>{feature.title}</strong>
                    <span>{feature.description}</span>
                  </div>
                </div>
              );
            })}
          </section>

          <div className="landing-access" aria-live="polite">
            {loading || entering ? (
              <span role="status"><Loader2 className="landing-spin" size={16} /> جارٍ تهيئة مساحة العمل...</span>
            ) : session?.user ? (
              <button type="button" onClick={() => navigate("/academies")}>
                فتح مساحة {session.user.name || "حسابك"} <ArrowLeft size={16} />
              </button>
            ) : (
              <button type="button" onClick={login}>
                <LockKeyhole size={15} /> تسجيل الدخول للبيانات الحقيقية
              </button>
            )}
            <p>نسخة العرض التجريبية تحتوي بيانات افتراضية؛ البيانات الحقيقية محمية بتسجيل الدخول.</p>
            <small>* التقييمات التجريبية افتراضية أو مُدخلة يدويًا، ولا تُستخرج من الفيديو. نتائج الرؤية الحاسوبية تعرض الزوايا ثنائية الأبعاد فقط.</small>
            {Boolean(error) && (
              <button className="landing-retry" type="button" onClick={() => void invalidate()}>
                تعذر التحقق من الجلسة — إعادة المحاولة
              </button>
            )}
          </div>
        </div>

        <footer className="landing-footer">
          <a href="#top" className="landing-footer-brand" aria-label="العودة لأعلى الصفحة">
            <img src="/brand/mark.png" alt="" aria-hidden="true" />
            <span dir="ltr">ATHLETE AI</span>
            <small>مستقبل الرياضة يبدأ من هنا</small>
          </a>
          <p>© {new Date().getFullYear()} ATHLETE AI</p>
        </footer>
      </div>
    </main>
  );
}
