import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  ChevronLeft,
  CircleAlert,
  FileVideo,
  Loader2,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  HistoryPoint,
  PlayerCard,
  SkillValue,
  Video,
} from "@shared/athlete";
import { useAthlete } from "@/lib/athleteApi";
import { SkillVideoLibrary, SkillVideoUploadModal } from "./SkillVideos";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${compact ? "brand-compact" : ""}`}
      aria-label="ATHLETE AI الرئيسية"
    >
      <img src="/brand/mark.png" alt="رمز ATHLETE AI" />
      <span dir="ltr">
        ATHLETE <b>AI</b>
      </span>
    </Link>
  );
}
export function Panel({
  title,
  icon: Icon,
  actions,
  children,
  className = "",
}: {
  title?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <h2>
            {Icon && (
              <span className="panel-icon">
                <Icon size={19} />
              </span>
            )}
            {title}
          </h2>
          {actions}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
export function PageHeading({
  title,
  subtitle,
  icon: Icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="heading-copy">
        {Icon && (
          <span className="heading-icon">
            <Icon size={29} strokeWidth={1.8} />
          </span>
        )}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const { organization, session } = useAthlete();
  const demoData = session?.mode === "demo" || organization?.isDemo;
  const label = demoData
    ? "نسخة عرض تجريبية — بيانات لاعب افتراضية"
    : "نسخة تجريبية — بيانات المؤسسة محمية";
  return (
    <span className={`demo-badge ${compact ? "compact" : ""}`} title={label}>
      <ShieldCheck size={14} />
      {compact ? (demoData ? "بيانات افتراضية" : "نسخة تجريبية") : label}
    </span>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <FileVideo size={28} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error?: unknown;
  retry?: () => unknown;
}) {
  return (
    <div className="error-state" role="alert">
      <CircleAlert size={24} />
      <h3>تعذر تحميل البيانات</h3>
      <p>{error instanceof Error ? error.message : "يرجى المحاولة مرة أخرى"}</p>
      {retry && (
        <button className="btn btn-outline" onClick={() => retry()}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
export function Loading({
  label = "جارٍ تحميل البيانات…",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={25} />
      <span>{label}</span>
    </div>
  );
}
export function Avatar({
  player,
  size = "sm",
}: {
  player: Pick<PlayerCard, "name" | "photoKey">;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  // Legacy demo records used a rotating player-N image. It must never be
  // treated as this player's portrait, especially for new or unassigned files.
  const usablePhoto = Boolean(
    player.photoKey &&
      !/(?:^|\/)brand\/player-\d+\.(?:png|jpe?g|webp)$/i.test(player.photoKey)
  );
  return (
    <span className={`avatar avatar-${size}`}>
      {usablePhoto && !failed ? (
        <img
          src={player.photoKey}
          alt={`صورة توضيحية: ${player.name}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>
          {player.name
            .split(" ")
            .slice(0, 2)
            .map(n => n[0])
            .join("")}
        </span>
      )}
    </span>
  );
}
export function ScoreRing({
  score,
  label = "من 10",
  size = 132,
  documentedMethod,
  maxScore = 10,
}: {
  score?: number | null;
  label?: string;
  size?: number;
  /** A persisted calculation method is required before a numeric score is shown. */
  documentedMethod?: string | null;
  /** Only use when the documented method itself defines the scale. */
  maxScore?: number;
}) {
  const hasDocumentedScore =
    typeof score === "number" &&
    Number.isFinite(score) &&
    Boolean(documentedMethod?.trim()) &&
    Number.isFinite(maxScore) &&
    maxScore > 0;
  const value = hasDocumentedScore
    ? Math.max(0, Math.min(maxScore, score as number))
    : null;
  const degrees = value === null ? 0 : (value / maxScore) * 320;
  return (
    <div
      className="score-ring"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 220deg, #00bc80 0deg, #006844 ${degrees}deg, #e5edeb ${degrees}deg 320deg, transparent 320deg)`,
      }}
      role="img"
      aria-label={
        value === null
          ? `${label}: لم يُقيّم لغياب طريقة حساب موثقة`
          : `التقييم ${value} ${label}`
      }
    >
      <div>
        <strong>
          {value === null ? "لم يُقيّم" : value.toLocaleString("ar")}
        </strong>
        <span>{value === null ? "لا توجد طريقة موثقة" : label}</span>
      </div>
    </div>
  );
}
export function TrendChart({ history }: { history: HistoryPoint[] }) {
  if (!history.length) return <EmptyState title="لا توجد قياسات زمنية بعد" />;
  return (
    <div className="trend-chart" dir="ltr">
      <ResponsiveContainer width="100%" height={195}>
        <AreaChart
          data={history}
          margin={{ top: 12, right: 12, left: -23, bottom: 0 }}
        >
          <defs>
            <linearGradient id="trendGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#18b886" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#18b886" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#edf2f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#7a8884", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 10]}
            tick={{ fill: "#7a8884", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            labelFormatter={label => `${label} — قياس تجريبي`}
            formatter={(value: number) => [value.toFixed(1), "مستوى الأداء"]}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e0ede8",
              direction: "rtl",
              fontFamily: "Arial",
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#119775"
            strokeWidth={2.5}
            fill="url(#trendGreen)"
            dot={{ fill: "#119775", r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function SkillBars({ skills }: { skills: SkillValue[] }) {
  return (
    <div className="skill-bars">
      {skills.map(skill => (
        <div className="skill-row" key={skill.name}>
          <span>{skill.name}</span>
          <div className="progress">
            <i
              style={{ width: `${Math.max(0, Math.min(100, skill.value))}%` }}
            />
          </div>
          <strong dir="ltr">{skill.value}%</strong>
        </div>
      ))}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={item.id === value ? "active" : ""}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  closeDisabled = false,
  closeDisabledReason,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  closeDisabled?: boolean;
  closeDisabledReason?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) onClose();
    };
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", onKey);
    };
  }, [closeDisabled, onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        dir="rtl"
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="إغلاق"
            onClick={onClose}
            disabled={closeDisabled}
            title={closeDisabledReason}
          >
            <X size={21} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "قيد المراجعة",
    approved: "مقبول · وصول متاح",
    rejected: "مرفوض",
    revoked: "الصلاحية ملغاة",
  };
  return (
    <span className={`status-badge status-${status}`}>
      {labels[status] || status}
    </span>
  );
}
export function VideoLibrary({
  videos,
  playerId,
  onUpload,
  canStartAnalysis = true,
  showFilters = true,
}: {
  videos: Video[];
  playerId?: number;
  onUpload?: () => void;
  canStartAnalysis?: boolean;
  showFilters?: boolean;
}) {
  return (
    <SkillVideoLibrary
      videos={videos}
      playerId={playerId}
      onUpload={onUpload}
      canStartAnalysis={canStartAnalysis}
      showFilters={showFilters}
      ModalComponent={Modal}
    />
  );
}
export function UploadModal({
  playerId,
  onClose,
  onComplete,
}: {
  playerId: number;
  onClose: () => void;
  onComplete?: (video: Video) => void;
}) {
  return (
    <SkillVideoUploadModal
      playerId={playerId}
      onClose={onClose}
      onComplete={onComplete}
      ModalComponent={Modal}
      demoBadge={<DemoBadge />}
    />
  );
}
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="text-link">
      {children}
      <ChevronLeft size={15} />
    </Link>
  );
}
export function Improvement({ value }: { value: number }) {
  return (
    <span className="improvement" dir="ltr">
      <ArrowUpRight size={15} />
      {value > 0 ? "+" : ""}
      {value}%
    </span>
  );
}
