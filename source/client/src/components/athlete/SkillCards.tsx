import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Dumbbell,
  FileVideo,
  Loader2,
  Play,
  Target,
} from "lucide-react";
import type { Player, PlayerCard, Video } from "@shared/athlete";
import type { DemoDisplay, DemoSkill } from "@shared/demo-display";
import { downloadPrivate, useAthlete } from "@/lib/athleteApi";
import { Modal } from "@/components/athlete/UI";
import "./skill-cards.css";

type DisplayPlayer = (Player | PlayerCard) & {
  demoDisplay?: DemoDisplay;
  primaryApparatus?: string;
};
type DisplayVideo = NonNullable<DemoSkill["video"]>;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat("ar", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
}

function formatDuration(seconds: number | null | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0)
    return "—";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function motionHref(playerId: number, skill: DemoSkill) {
  if (!skill.video) return null;
  const query = new URLSearchParams({
    player: String(playerId),
    video: String(skill.video.id),
    skill: skill.name,
  });
  return `/analysis?${query.toString()}`;
}

function SkillFacts({ skill }: { skill: DemoSkill }) {
  return (
    <>
      <div className="skill-card-score-row">
        <span className="skill-card-level">{skill.level}</span>
        <strong>{skill.score === null ? "لم تُقيّم بعد" : `${skill.score.toLocaleString("ar")} / 100`}</strong>
      </div>
      <div
        className="skill-card-progress"
        role="progressbar"
        aria-label={`درجة ${skill.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={skill.score ?? undefined}
      >
        <i style={{ width: `${Math.max(0, Math.min(100, skill.score ?? 0))}%` }} />
      </div>
    </>
  );
}

function SkillDetail({ skill, playerId }: { skill: DemoSkill; playerId: number }) {
  const href = motionHref(playerId, skill);
  return (
    <div className="skill-detail section-stack">
      <div className="skill-detail-heading">
        <div>
          <h3>{skill.name}</h3>
          <p dir="ltr">{skill.englishName}</p>
        </div>
        <SkillFacts skill={skill} />
      </div>
      <SkillVideo video={skill.video} playerId={playerId} />
      <div className="skill-detail-grid">
        <section>
          <h4>
            <CheckCircle2 aria-hidden="true" /> نقاط القوة
          </h4>
          {skill.strengths.length ? (
            <ul>
              {skill.strengths.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>لا توجد نقطة قوة تفصيلية محفوظة لهذا المثال.</p>
          )}
        </section>
        <section className="is-development">
          <h4>
            <Target aria-hidden="true" /> جوانب التطوير
          </h4>
          {skill.development.length ? (
            <ul>
              {skill.development.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>لا توجد ملاحظة تطوير تفصيلية محفوظة لهذا المثال.</p>
          )}
        </section>
      </div>
      <section className="skill-detail-notes">
        <h4>
          <ClipboardList aria-hidden="true" /> ملاحظات العرض
        </h4>
        <p>{skill.notes || "لا توجد ملاحظة نصية محفوظة لهذه المهارة."}</p>
      </section>
      <section className="skill-detail-exercises">
        <h4>
          <Dumbbell aria-hidden="true" /> تمارين مناسبة
        </h4>
        {skill.exercises.length ? (
          <div>
            {skill.exercises.map(exercise => (
              <article key={`${exercise.title}-${exercise.description}`}>
                <strong>{exercise.title}</strong>
                <p>{exercise.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <p>لا توجد تمارين مقترحة محفوظة لهذه المهارة.</p>
        )}
      </section>
      <section className="skill-rubric-note">
        <h4>أبعاد تقييم توضيحية — غير معيار علمي</h4>
        {skill.criteria.length ? (
          <ul>
            {skill.criteria.map(criterion => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        ) : (
          <p>لا توجد أبعاد توضيحية محفوظة لهذه المهارة.</p>
        )}
      </section>
      {href ? (
        <a className="btn btn-outline skill-motion-link" href={href}>
          <BarChart3 size={17} /> فتح تحليل الحركة للمقطع
        </a>
      ) : (
        <p className="skill-video-pending" role="status">
          لا يتوفر رابط تحليل حركة إلى أن يضاف مقطع مرخّص لهذه المهارة.
        </p>
      )}
    </div>
  );
}

/**
 * Authenticated HTML5 playback for a demo skill video. Private media is never
 * inserted as an unauthenticated URL; its temporary object URL is revoked when
 * the player, organization, identity, or component scope changes.
 */
export function SkillVideo({
  video,
  playerId,
  compact = false,
}: {
  video: DemoSkill["video"];
  playerId: number;
  compact?: boolean;
}) {
  const { orgId, session } = useAthlete();
  const sessionScope = session?.user
    ? `member:${session.user.id}:${session.memberships
        .map(m => `${m.organizationId}:${m.role}`)
        .sort()
        .join(",")}`
    : session?.mode === "demo"
      ? `demo:${session.memberships
          .map(m => m.organizationId)
          .sort()
          .join(",")}`
      : "anonymous";
  const objectUrl = useRef<string | null>(null);
  const generation = useRef(0);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const videoKey = video ? `${video.id}:${video.posterKey ?? ""}` : "missing";
  const scopeKey = `${sessionScope}:${orgId ?? "none"}:${playerId}:${videoKey}`;

  const revoke = () => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
  };

  useEffect(() => {
    generation.current += 1;
    revoke();
    setUrl(null);
    setLoading(false);
    setError("");
    return () => {
      generation.current += 1;
      revoke();
    };
    // The scope deliberately includes identity, organization and player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const load = async () => {
    if (!video || loading) return;
    const current = generation.current;
    setLoading(true);
    setError("");
    try {
      const blob = await downloadPrivate(`/videos/${video.id}/content`);
      if (current !== generation.current) return;
      revoke();
      const next = URL.createObjectURL(blob);
      objectUrl.current = next;
      setUrl(next);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(
        cause instanceof Error ? cause.message : "تعذر تحميل المقطع الخاص."
      );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };

  if (!video) {
    return (
      <div className={`skill-video-player is-pending ${compact ? "is-compact" : ""}`}>
        <FileVideo aria-hidden="true" size={compact ? 20 : 28} />
        <div>
          <strong>الأصل المرخّص قيد الإضافة</strong>
          <p>لا يتوفر مقطع لهذا المثال بعد؛ لا تُعرض صورة أو زر تشغيل بديل.</p>
        </div>
      </div>
    );
  }

  const hasPoster = Boolean(video.posterKey);
  const generated = video.source?.license.startsWith("AI-generated simulation") ?? false;
  return (
    <div className={`skill-video-player ${compact ? "is-compact" : ""}`}>
      {generated ? <span className="skill-video-simulation-label">محاكاة مولدة · ليست تسجيل أداء حقيقي</span> : null}
      {url ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={url}
          poster={video.posterKey || undefined}
          aria-label={`فيديو ${video.title}`}
          onError={() =>
            setError(
              "تعذر تشغيل المقطع في هذا المتصفح. جرّب ملف MP4 بترميز H.264 أو متصفحًا يدعم ترميز الملف."
            )
          }
        />
      ) : (
        <div className={`skill-video-poster ${hasPoster ? "has-poster" : ""}`}>
          {hasPoster ? (
            <img
              src={video.posterKey || undefined}
              alt={`إطار فعلي من ${video.title}`}
            />
          ) : (
            <FileVideo aria-hidden="true" size={compact ? 26 : 40} />
          )}
          <span>{hasPoster ? "إطار من بيانات المقطع" : "لا تتوفر معاينة إطار"}</span>
        </div>
      )}
      <div className="skill-video-meta">
        <div>
          <strong>{video.title}</strong>
          <small>
            تاريخ إضافة عينة العرض: {formatDate(video.createdAt)} · {formatDuration(video.durationSeconds)}
          </small>
        </div>
        {!url ? (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            {loading ? "جارٍ التحميل" : "تحميل وتشغيل"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="form-error skill-video-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()} disabled={loading}>
            إعادة المحاولة
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function SkillCards({
  player,
  skills,
  compact = false,
}: {
  player: Player | PlayerCard;
  skills?: DemoSkill[];
  compact?: boolean;
}) {
  const displayPlayer = player as DisplayPlayer;
  const suppliedSkills = skills ?? displayPlayer.demoDisplay?.skills ?? [];
  const orderedSkills = useMemo(
    () => [...suppliedSkills].sort((left, right) => (right.score ?? -1) - (left.score ?? -1)),
    [suppliedSkills]
  );
  const [selected, setSelected] = useState<DemoSkill | null>(null);

  if (!orderedSkills.length) {
    return (
      <div className="skill-cards-empty">
        <FileVideo aria-hidden="true" size={28} />
        <div>
          <strong>لا توجد بطاقات مهارة للعرض</strong>
          <p>ستظهر بطاقات العرض عند توفر سجل مهارات محفوظ لهذا اللاعب.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`skill-cards-grid ${compact ? "is-compact" : ""}`}>
        {orderedSkills.map(skill => (
          <article
            className="skill-card"
            key={skill.name}
            data-skill={skill.name}
            data-player-id={player.id}
          >
            <header>
              <div>
                <h3>{skill.name}</h3>
                <p dir="ltr">{skill.englishName}</p>
              </div>
              <span className="skill-card-demo-source">عرض تجريبي</span>
            </header>
            <SkillVideo video={skill.video} playerId={player.id} compact={compact} />
            <SkillFacts skill={skill} />
            {!compact ? (
              <>
                <div className="skill-card-findings">
                  <p>
                    <CheckCircle2 aria-hidden="true" /> {skill.strengths.at(0) || "لا توجد قوة مفصلة"}
                  </p>
                  <p className="is-development">
                    <Target aria-hidden="true" /> {skill.development.at(0) || "لا توجد أولوية تطوير مفصلة"}
                  </p>
                </div>
                <p className="skill-card-note">{skill.notes || "لا توجد ملاحظة نصية محفوظة."}</p>
              </>
            ) : null}
            <button
              className="btn btn-outline skill-card-detail-action"
              type="button"
              onClick={() => setSelected(skill)}
              aria-haspopup="dialog"
            >
              ملف المهارة
            </button>
          </article>
        ))}
      </div>
      {selected ? (
        <Modal
          title={`ملف مهارة: ${selected.name}`}
          onClose={() => setSelected(null)}
          wide
        >
          <SkillDetail skill={selected} playerId={player.id} />
        </Modal>
      ) : null}
    </>
  );
}

export type { DemoDisplay, DemoSkill, DisplayVideo };
