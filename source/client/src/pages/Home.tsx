
import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  ArrowLeft,
  ChartNoAxesCombined,
  FileText,
  GraduationCap,
  Landmark,
  Loader2,
  LockKeyhole,
  Shield,
  TrendingUp,
  Users,
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
  const {
    session,
    enterDemo,
    loading,
    error,
    invalidate,
  } = useAthlete();

  const [, navigate] = useLocation();

  const [entering, setEntering] = useState<EntryType | null>(
    null
  );

  const isBusy = loading || entering !== null;

  const enterDemoSpace = async (type: DemoType) => {
    if (isBusy) return;

    setEntering(type);

    try {
      await enterDemo(type);

      navigate(
        type === "academy" ? "/academies" : "/clubs"
      );
    } catch (problem) {
      toast.error(
        problem instanceof Error
          ? problem.message
          : "تعذر فتح مساحة العرض"
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
        problem instanceof Error
          ? problem.message
          : "تعذر تسجيل الدخول"
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
        headers: {
          Accept: "application/json",
        },
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

      const data =
        (await response.json()) as RegulatoryMeResponse;

      if (
        !Array.isArray(data.authorities) ||
        data.authorities.length === 0
      ) {
        toast.error(
          "حسابك غير مرتبط بجهة تنظيمية. يلزم تفويض من مسؤول الجهة."
        );
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

  const entries = [
    {
      type: "academy" as const,
      title: "الأكاديميات",
      description: "إدارة اللاعبين وتحليل الأداء وتطويرهم",
      icon: GraduationCap,
      action: () => enterDemoSpace("academy"),
    },
    {
      type: "club" as const,
      title: "الأندية",
      description: "البحث عن المواهب واستقطاب اللاعبين",
      icon: Shield,
      action: () => enterDemoSpace("club"),
    },
    {
      type: "ministry" as const,
      title: "الجهات التنظيمية",
      description: "الإشراف على الأكاديميات والتراخيص والتقارير",
      icon: Landmark,
      action: enterMinistry,
    },
  ];

  const features = [
    {
      title: "ربط الأكاديميات بالأندية",
      icon: Users,
    },
    {
      title: "متابعة التطور والإمكانات المستقبلية",
      icon: TrendingUp,
    },
    {
      title: "ملف رقمي شامل لكل لاعب",
      icon: FileText,
    },
    {
      title: "تحليل الأداء بالذكاء الاصطناعي*",
      icon: ChartNoAxesCombined,
    },
  ];

  return (
    <main className="athlete-landing" dir="rtl">
      <div className="landing-stage">
        <div className="landing-scene" aria-hidden="true" />
        <div className="landing-lights" aria-hidden="true" />
        <div className="landing-grass" aria-hidden="true" />

        <div className="landing-content">
          <section
            className="landing-hero"
            aria-label="منصة ATHLETE AI"
          >
            <div className="landing-heading">
              <Link
                href="/"
                className="landing-brand"
                aria-label="ATHLETE AI الرئيسية"
              >
                <img
                  src="/brand/mark.png"
                  alt=""
                  aria-hidden="true"
                />

                <span dir="ltr">
                  ATHLETE <b>AI</b>
                </span>
              </Link>

              <h1>
                منصة ذكية لتحليل الأداء الرياضي
                <span>واكتشاف المواهب</span>
              </h1>

              <p className="landing-tagline">
                تحليل علمي · تطور مستمر · مستقبل واعد
              </p>

              <p className="landing-english" dir="ltr">
                Unlock Potential. Build the Future.
              </p>
            </div>

            <div
              className="landing-entries"
              aria-label="اختر مساحة العمل"
            >
              {entries.map(entry => {
                const Icon = entry.icon;
                const busy = entering === entry.type;

                return (
                  <button
                    key={entry.type}
                    type="button"
                    className={`landing-entry landing-${entry.type}`}
                    onClick={() => void entry.action()}
                    disabled={isBusy}
                    aria-busy={busy}
                  >
                    <span className="landing-entry-icon">
                      <Icon
                        size={35}
                        strokeWidth={1.7}
                        aria-hidden="true"
                      />
                    </span>

                    <span className="landing-entry-body">
                      <span className="landing-entry-title">
                        {entry.title}
                      </span>

                      <span className="landing-divider" />

                      <span className="landing-entry-description">
                        {entry.description}
                      </span>
                    </span>

                    <span className="landing-arrow">
                      {busy ? (
                        <Loader2
                          className="landing-spin"
                          size={20}
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowLeft
                          size={20}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            className="landing-features"
            aria-label="إمكانات المنصة"
          >
            {features.map(feature => {
              const Icon = feature.icon;

              return (
                <div
                  className="landing-feature"
                  key={feature.title}
                >
                  <Icon
                    size={27}
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                  <span>{feature.title}</span>
                </div>
              );
            })}
          </section>

          <div className="landing-access">
            {loading || entering ? (
              <span className="landing-access-link" role="status">
                <Loader2
                  size={17}
                  className="landing-spin"
                />
                جارٍ تهيئة مساحة العمل...
              </span>
            ) : session?.user ? (
              <button
                type="button"
                className="landing-access-link"
                onClick={() => navigate("/academies")}
              >
                فتح مساحة {session.user.name || "حسابك"}
                <ArrowLeft size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="landing-access-link"
                onClick={login}
              >
                <LockKeyhole size={16} />
                تسجيل الدخول للبيانات الحقيقية
                <ArrowLeft size={15} />
              </button>
            )}

            <p>
              نسخة العرض التجريبية تحتوي بيانات افتراضية،
              والبيانات الحقيقية محمية بتسجيل الدخول.
            </p>

            <small>
              * التقييمات التجريبية افتراضية أو مدخلة
              يدويًا، ولا تُستخرج من الفيديو. نتائج
              الرؤية الحاسوبية تعرض الزوايا ثنائية
              الأبعاد فقط.
            </small>

            {Boolean(error) && (
              <button
                type="button"
                className="landing-retry"
                onClick={() => void invalidate()}
              >
                تعذر التحقق من الجلسة — إعادة المحاولة
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
