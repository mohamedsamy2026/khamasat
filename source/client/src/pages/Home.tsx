import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  ArrowRight,
  ChartNoAxesCombined,
  FileText,
  GraduationCap,
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

export default function Home() {
  const { session, enterDemo, loading, error, invalidate } = useAthlete();
  const [entering, setEntering] = useState<"academy" | "club" | null>(null);
  const [, navigate] = useLocation();
  const enter = async (type: "academy" | "club") => {
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

  return (
    <main className="athlete-landing" dir="rtl">
      <section className="landing-stage" aria-label="منصة ATHLETE AI">
        <div className="landing-scene" aria-hidden="true" />
        <div className="landing-lights" aria-hidden="true" />
        <div className="landing-grass" aria-hidden="true" />
        <div className="landing-content">
          <div className="landing-heading">
            <Link
              className="landing-brand"
              href="/"
              aria-label="ATHLETE AI الرئيسية"
            >
              <img src="/brand/mark.png" alt="رمز ATHLETE AI" />
              <span dir="ltr">
                ATHLETE <b>AI</b>
              </span>
            </Link>
            <h1>
              منصة ذكية لتحليل الأداء الرياضي
              <br />
              واكتشاف المواهب
            </h1>
            <p className="landing-tagline">
              تحليل علمي .. تطور مستمر .. مستقبل واعد
            </p>
            <p className="landing-english" dir="ltr">
              Unlock Potential. Build the Future.
            </p>
          </div>

          <div className="landing-entries">
            <button
              className="landing-entry"
              onClick={() => void enter("academy")}
              disabled={loading || Boolean(entering)}
              type="button"
            >
              <GraduationCap size={56} strokeWidth={1.65} aria-hidden="true" />
              <h2>الأكاديميات</h2>
              <span className="landing-divider" />
              <p>
                إدارة اللاعبين
                <br />
                وتحليل الأداء وتطويرهم
              </p>
              <span className="landing-arrow">
                <ArrowRight size={25} aria-hidden="true" />
              </span>
            </button>
            <button
              className="landing-entry landing-club"
              onClick={() => void enter("club")}
              disabled={loading || Boolean(entering)}
              type="button"
            >
              <Shield size={53} strokeWidth={2.4} aria-hidden="true" />
              <h2>الأندية</h2>
              <span className="landing-divider" />
              <p>
                البحث عن المواهب
                <br />
                واستقطاب اللاعبين
              </p>
              <span className="landing-arrow">
                <ArrowRight size={25} aria-hidden="true" />
              </span>
            </button>
          </div>

          <section
            className="landing-features"
            aria-label="نبذة عن إمكانات المنصة"
          >
            <div className="landing-feature">
              <Users size={38} strokeWidth={1.8} aria-hidden="true" />
              <span>
                ربط الأكاديميات
                <br />
                بالأندية
              </span>
            </div>
            <div className="landing-feature">
              <TrendingUp size={38} strokeWidth={1.8} aria-hidden="true" />
              <span>
                متابعة التطور
                <br />
                والإمكانات المستقبلية
              </span>
            </div>
            <div className="landing-feature">
              <FileText size={37} strokeWidth={1.6} aria-hidden="true" />
              <span>
                ملف رقمي شامل
                <br />
                لكل لاعب
              </span>
            </div>
            <div className="landing-feature">
              <ChartNoAxesCombined
                size={38}
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span>
                تحليل الأداء
                <br />
                بالذكاء الاصطناعي*
              </span>
            </div>
          </section>

          <div className="landing-access">
            {loading || entering ? (
              <span role="status">
                <Loader2 className="spin" size={16} /> جارٍ تهيئة مساحة العرض…
              </span>
            ) : session?.user ? (
              <Link href="/academies">
                فتح مساحة {session.user.name || "حسابك"}{" "}
                <ArrowRight size={16} />
              </Link>
            ) : (
              <button onClick={login} type="button">
                <LockKeyhole size={16} /> تسجيل الدخول للبيانات الحقيقية
              </button>
            )}
            <p>
              نسخة عرض تجريبية — بيانات افتراضية متاحة دون تسجيل دخول؛ البيانات
              الحقيقية محمية
            </p>
            <small>
              * تقييمات الملف قيم افتراضية أو مُدخلة يدويًا وليست مستخرجة من
              الفيديو؛ تعرض نتائج الرؤية الحاسوبية الزوايا ثنائية الأبعاد فقط.
            </small>
            {Boolean(error) && (
              <button
                className="landing-retry"
                onClick={() => void invalidate()}
                type="button"
              >
                تعذر التحقق من الجلسة — إعادة المحاولة
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
