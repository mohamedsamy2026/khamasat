import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Link } from "wouter";
import {
  CheckCircle2,
  CircleAlert,
  FileVideo,
  Loader2,
  Play,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type { Player, Video } from "@shared/athlete";
import { MAX_VIDEO_BYTES, SKILLS } from "@shared/athlete";
import { skillsForPlayer } from "@shared/coaching";
import {
  downloadPrivate,
  uploadVideo,
  useApi,
  useAthlete,
} from "@/lib/athleteApi";
import { toast } from "sonner";
import "./skill-videos.css";

export type VideoSource = {
  url: string;
  license: string;
  credit: string;
  description: string;
};

export type SkillVideo = Video & {
  analysisStatus?: "not_analyzed" | "completed";
  latestAnalysisId?: number | null;
  analysisAt?: string | null;
  source?: VideoSource | null;
  latestAnalysisMethod?: "simulation" | "pose" | null;
};

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  closeDisabled?: boolean;
  closeDisabledReason?: string;
};

type VideoModalComponent = ComponentType<ModalProps>;

type NativeThumbnailStatus = "idle" | "loading" | "ready" | "error";
type UploadPhase =
  | "ready"
  | "transferring"
  | "awaiting-save"
  | "saved"
  | "error";
type UploadDraft = {
  id: string;
  file: File;
  title: string;
  skill: string;
  recordedAt: string;
  phase: UploadPhase;
  progress: number;
  error?: string;
  savedVideo?: Video;
};

const SUPPORTED_MIME_TYPES = ["video/mp4", "video/webm"];

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

function dateKey(value: string) {
  return value.slice(0, 10);
}

function titleFromFilename(name: string) {
  const withoutExtension = name.replace(/\.(mp4|webm)$/i, "").trim();
  return withoutExtension || name;
}

function supportedMime(file: File) {
  if (SUPPORTED_MIME_TYPES.includes(file.type)) return file.type;
  if (/\.mp4$/i.test(file.name)) return "video/mp4";
  if (/\.webm$/i.test(file.name)) return "video/webm";
  return null;
}

export function validateSkillVideoDraft(
  draft: Pick<UploadDraft, "file" | "title" | "recordedAt">
) {
  const mime = supportedMime(draft.file);
  if (!draft.file.size) return "الملف فارغ؛ اختر مقطعًا صالحًا.";
  if (draft.file.size > MAX_VIDEO_BYTES)
    return "يتجاوز الملف حد 10 ميغابايت لكل مقطع.";
  if (!mime) return "الصيغة غير مدعومة؛ اختر MP4 أو WebM.";
  if (!draft.title.trim()) return "أدخل عنوانًا واضحًا للمقطع.";
  if (!draft.recordedAt) return "حدد تاريخ تسجيل المقطع.";
  if (draft.recordedAt > new Date().toISOString().slice(0, 10))
    return "لا يمكن استخدام تاريخ تسجيل في المستقبل.";
  return "";
}

function analysisState(video: SkillVideo) {
  if (video.analysisStatus) return video.analysisStatus;
  return video.latestAnalysisId ? "completed" : "not_analyzed";
}

function analysisLabel(video: SkillVideo) {
  if (analysisState(video) === "not_analyzed") return "غير محلل بعد";
  if (video.latestAnalysisMethod === "pose") return "تحليل حركة محفوظ";
  if (video.latestAnalysisMethod === "simulation") return "محاكاة محفوظة";
  return "تحليل محفوظ";
}

function createVideoStill(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const video = document.createElement("video");
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      URL.revokeObjectURL(objectUrl);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("تعذر إنشاء معاينة للمقطع."));
    };
    const capture = () => {
      if (settled) return;
      if (!video.videoWidth || !video.videoHeight) {
        fail();
        return;
      }
      const canvas = document.createElement("canvas");
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        fail();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const still = canvas.toDataURL("image/jpeg", 0.82);
      settled = true;
      cleanup();
      resolve(still);
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.style.cssText =
      "position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    video.setAttribute("aria-hidden", "true");
    document.body.appendChild(video);
    timeout = setTimeout(fail, 15000);
    video.onloadeddata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = duration > 0 ? Math.min(0.25, duration / 2) : 0;
      if (target > 0 && Math.abs(video.currentTime - target) > 0.01) {
        video.onseeked = capture;
        video.currentTime = target;
      } else {
        capture();
      }
    };
    video.onerror = fail;
    video.src = objectUrl;
    video.load();
  });
}

function NativePrivateThumbnail({
  video,
  scopeKey,
}: {
  video: SkillVideo;
  scopeKey: string;
}) {
  const target = useRef<HTMLSpanElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [status, setStatus] = useState<NativeThumbnailStatus>("idle");
  const [still, setStill] = useState<string | null>(null);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "180px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let active = true;
    setStatus("loading");
    setStill(null);
    void downloadPrivate(`/videos/${video.id}/content`)
      .then(createVideoStill)
      .then(image => {
        if (!active) return;
        setStill(image);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [nearViewport, scopeKey, video.id]);

  return (
    <span className="skill-video-thumbnail" ref={target} aria-hidden="true">
      {still ? <img src={still} alt="" /> : <FileVideo size={34} />}
      <span className="skill-video-thumbnail-state">
        {status === "loading" ? (
          <Loader2 className="spin" size={18} />
        ) : (
          <Play size={18} fill="currentColor" />
        )}
      </span>
      <small>
        {status === "loading"
          ? "جارٍ تجهيز معاينة خاصة"
          : status === "error"
            ? "معاينة غير متاحة"
            : "معاينة خاصة"}
      </small>
    </span>
  );
}

function analysisHref(video: SkillVideo, playerId?: number) {
  const params = new URLSearchParams({
    player: String(playerId ?? video.playerId),
    video: String(video.id),
    skill: video.skill,
  });
  if (video.latestAnalysisId)
    params.set("analysis", String(video.latestAnalysisId));
  return `/analysis?${params.toString()}`;
}

export function SkillVideoLibrary({
  videos,
  playerId,
  onUpload,
  canStartAnalysis = true,
  showFilters = true,
  ModalComponent,
}: {
  videos: SkillVideo[];
  playerId?: number;
  onUpload?: () => void;
  canStartAnalysis?: boolean;
  showFilters?: boolean;
  ModalComponent: VideoModalComponent;
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
  const scope = useRef(0);
  const [selected, setSelected] = useState<SkillVideo | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [failedVideo, setFailedVideo] = useState<SkillVideo | null>(null);
  const [skillFilter, setSkillFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const videoKey = videos.map(video => video.id).join(",");
  const scopeKey = `${sessionScope}:${orgId ?? "none"}:${playerId ?? "collection"}`;

  useEffect(() => {
    scope.current += 1;
    setSelected(null);
    setUrl(null);
    setBusy(null);
    setError("");
    setFailedVideo(null);
    setSkillFilter("all");
    setFrom("");
    setTo("");
    return () => {
      scope.current += 1;
    };
  }, [scopeKey]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );

  const availableSkills = useMemo(
    () => [...new Set(videos.map(video => video.skill))].sort(),
    [videos]
  );
  const visibleVideos = useMemo(
    () =>
      videos
        .filter(video => {
          const recorded = dateKey(video.recordedAt);
          return (
            (skillFilter === "all" || video.skill === skillFilter) &&
            (!from || recorded >= from) &&
            (!to || recorded <= to)
          );
        })
        .slice()
        .sort(
          (left, right) =>
            Date.parse(right.recordedAt) - Date.parse(left.recordedAt) ||
            Date.parse(right.createdAt) - Date.parse(left.createdAt)
        ),
    [from, skillFilter, to, videos]
  );

  const open = async (video: SkillVideo) => {
    const currentScope = scope.current;
    setError("");
    setFailedVideo(null);
    setBusy(video.id);
    try {
      const blob = await downloadPrivate(`/videos/${video.id}/content`);
      if (currentScope !== scope.current) return;
      setUrl(URL.createObjectURL(blob));
      setSelected(video);
    } catch (cause) {
      if (currentScope !== scope.current) return;
      const message =
        cause instanceof Error ? cause.message : "تعذر تشغيل الفيديو الخاص.";
      setError(message);
      setFailedVideo(video);
      toast.error(message);
    } finally {
      if (currentScope === scope.current) setBusy(null);
    }
  };

  if (!videos.length)
    return (
      <div className="skill-video-empty">
        <FileVideo size={28} />
        <div>
          <strong>لا توجد مقاطع أداء محفوظة</strong>
          <p>ستظهر المقاطع الخاصة المصرح بها هنا بعد رفعها.</p>
        </div>
        {onUpload ? (
          <button className="btn btn-outline" type="button" onClick={onUpload}>
            <Upload size={16} /> رفع مقاطع
          </button>
        ) : null}
      </div>
    );

  return (
    <>
      {showFilters ? (
        <div className="skill-video-filters" aria-label="تصفية مقاطع المهارات">
          <label>
            <span>المهارة</span>
            <select
              value={skillFilter}
              onChange={event => setSkillFilter(event.target.value)}
            >
              <option value="all">كل المهارات</option>
              {availableSkills.map(skill => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>من تاريخ</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={event => setFrom(event.target.value)}
            />
          </label>
          <label>
            <span>إلى تاريخ</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              max={new Date().toISOString().slice(0, 10)}
              onChange={event => setTo(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {visibleVideos.length ? (
        <div
          className={`skill-video-library ${showFilters ? "" : "is-compact"}`}
        >
          {visibleVideos.map(video => {
            const source = video.source;
            const isSavedAnalysis =
              analysisState(video) === "completed" &&
              Boolean(video.latestAnalysisId);
            return (
              <article
                className="skill-video-card"
                key={`${scopeKey}-${video.id}`}
              >
                <button
                  className="skill-video-play-button"
                  type="button"
                  onClick={() => void open(video)}
                  disabled={busy !== null}
                  title={
                    busy !== null
                      ? "يجري فتح مقطع خاص؛ انتظر اكتمال التحميل."
                      : `تشغيل ${video.title}`
                  }
                  aria-label={`تشغيل ${video.title}`}
                >
                  <NativePrivateThumbnail video={video} scopeKey={scopeKey} />
                </button>
                <div className="skill-video-card-copy">
                  <div className="skill-video-card-heading">
                    <span className="skill-video-skill">{video.skill}</span>
                    <span
                      className={`skill-video-analysis is-${analysisState(video)}`}
                    >
                      {analysisLabel(video)}
                    </span>
                  </div>
                  <strong>{video.title}</strong>
                  <div className="skill-video-dates">
                    <span>سُجل: {formatDate(video.recordedAt)}</span>
                    <span>رُفع: {formatDate(video.createdAt)}</span>
                  </div>
                  {analysisState(video) === "completed" && video.analysisAt ? (
                    <small className="skill-video-analysis-date">
                      آخر تحليل: {formatDate(video.analysisAt)}
                    </small>
                  ) : null}
                  {video.latestAnalysisMethod === "simulation" ? (
                    <small className="skill-video-method-note">
                      محاكاة محفوظة منفصلة عن قياسات الفيديو الفعلية.
                    </small>
                  ) : video.latestAnalysisMethod === "pose" ? (
                    <small className="skill-video-method-note">
                      تقدير حركة من إطارات الفيديو — زوايا 2D غير معايرة.
                    </small>
                  ) : null}
                  {source ? (
                    <span
                      className="skill-video-source"
                      title={source.description || source.url}
                    >
                      مادة مرخّصة · {source.license}
                      {source.credit ? ` · ${source.credit}` : ""}
                      {" · "}
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        مصدر المقطع
                      </a>
                    </span>
                  ) : null}
                  <div className="skill-video-actions">
                    {isSavedAnalysis ? (
                      <Link
                        className="btn btn-ghost btn-sm"
                        href={analysisHref(video, playerId)}
                      >
                        عرض التحليل المحفوظ
                      </Link>
                    ) : canStartAnalysis ? (
                      <Link
                        className="btn btn-outline btn-sm"
                        href={analysisHref(video, playerId)}
                      >
                        تحليل المقطع
                      </Link>
                    ) : (
                      <span className="skill-video-no-analysis">
                        لا يوجد تحليل محفوظ
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="skill-video-no-results" role="status">
          لا توجد مقاطع تطابق المرشحات المحددة.
        </div>
      )}

      {error ? (
        <div className="video-message" role="alert">
          {error}
          {failedVideo ? (
            <button
              type="button"
              onClick={() => void open(failedVideo)}
              disabled={busy !== null}
            >
              إعادة المحاولة
            </button>
          ) : null}
        </div>
      ) : null}

      {selected && url ? (
        <ModalComponent
          title={`${selected.skill} · ${selected.title}`}
          onClose={() => {
            setSelected(null);
            setUrl(null);
          }}
          wide
        >
          <video
            className="private-video"
            src={url}
            controls
            playsInline
            controlsList="nodownload"
            onError={() =>
              setError(
                "تعذر تشغيل المقطع في هذا المتصفح. جرّب MP4 بترميز H.264 أو متصفحًا يدعم ترميز الملف."
              )
            }
          />
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="helper">
            <ShieldCheck size={14} /> عرض خاص للمقطع بعد التحقق من الصلاحية.
          </p>
        </ModalComponent>
      ) : null}
    </>
  );
}

function phaseLabel(draft: UploadDraft) {
  if (draft.phase === "transferring")
    return `جارٍ نقل الملف… ${draft.progress}%`;
  if (draft.phase === "awaiting-save")
    return "اكتمل النقل؛ بانتظار تأكيد الحفظ…";
  if (draft.phase === "saved") return "تم حفظ المقطع بنجاح";
  if (draft.phase === "error") return draft.error || "تعذر رفع هذا المقطع.";
  return "جاهز للرفع";
}

function phaseClass(phase: UploadPhase) {
  return `is-${phase}`;
}

export function SkillVideoUploadModal({
  playerId,
  onClose,
  onComplete,
  ModalComponent,
  demoBadge,
}: {
  playerId: number;
  onClose: () => void;
  onComplete?: (video: Video) => void;
  ModalComponent: VideoModalComponent;
  demoBadge?: ReactNode;
}) {
  const { invalidate } = useAthlete();
  const playerQuery = useApi<Player>(`/players/${playerId}`);
  const player = playerQuery.data;
  const availableSkills = player
    ? skillsForPlayer(player.sport, player.position)
    : [];
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const closeReason = "لا يمكن إغلاق النافذة أثناء نقل مقطع أو انتظار حفظه.";

  const updateDraft = (id: string, update: Partial<UploadDraft>) => {
    setDrafts(current =>
      current.map(draft => (draft.id === id ? { ...draft, ...update } : draft))
    );
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}-${crypto.randomUUID()}`,
      file,
      title: titleFromFilename(file.name),
      skill: availableSkills[0] ?? "",
      recordedAt: today,
      phase: "ready" as const,
      progress: 0,
    }));
    setDrafts(current => [...current, ...next]);
    setBatchMessage("");
  };

  const removeDraft = (id: string) => {
    if (uploading) return;
    setDrafts(current => current.filter(draft => draft.id !== id));
  };

  const startBatch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (uploading) return;
    setBatchMessage("");
    const candidates = drafts.filter(
      draft => draft.phase === "ready" || draft.phase === "error"
    );
    if (!candidates.length) {
      setBatchMessage("أضف مقطعًا أو أعد محاولة مقطع فشل حفظه.");
      return;
    }

    const invalid = new Map(
      candidates
        .map(draft => [draft.id, validateSkillVideoDraft(draft)] as const)
        .filter(([, message]) => Boolean(message))
    );
    if (invalid.size) {
      setDrafts(current =>
        current.map(draft => {
          const message = invalid.get(draft.id);
          return message ? { ...draft, phase: "error", error: message } : draft;
        })
      );
    }

    const pending = candidates.filter(draft => !invalid.has(draft.id));
    if (!pending.length) {
      setBatchMessage("صحح المقاطع المشار إليها قبل بدء الرفع.");
      return;
    }

    setUploading(true);
    let lastSaved: Video | undefined;
    for (const draft of pending) {
      const mime = supportedMime(draft.file);
      if (!mime) continue;
      updateDraft(draft.id, {
        phase: "transferring",
        progress: 0,
        error: undefined,
      });
      try {
        const saved = await uploadVideo<Video>({
          playerId,
          title: draft.title.trim(),
          skill: draft.skill,
          recordedAt: draft.recordedAt,
          file: draft.file,
          mime,
          onProgress: (loaded, total) => {
            const progress =
              total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
            updateDraft(draft.id, {
              progress,
              phase: progress >= 100 ? "awaiting-save" : "transferring",
            });
          },
        });
        lastSaved = saved;
        updateDraft(draft.id, {
          phase: "saved",
          progress: 100,
          savedVideo: saved,
          error: undefined,
        });
      } catch (cause) {
        updateDraft(draft.id, {
          phase: "error",
          error:
            cause instanceof Error ? cause.message : "تعذر رفع هذا المقطع.",
        });
      }
    }
    setUploading(false);

    if (lastSaved) {
      onComplete?.(lastSaved);
      await invalidate();
      toast.success(
        "اكتمل حفظ المقاطع الناجحة. لا تُعاد المقاطع المحفوظة عند المحاولة التالية."
      );
    }
    setBatchMessage(
      lastSaved
        ? "اكتملت الدفعة. راجع أي مقطع فشل ثم استخدم «إعادة محاولة المقاطع الفاشلة»."
        : "لم يُحفظ أي مقطع. راجع رسائل الخطأ وحاول مرة أخرى."
    );
  };

  const retryableCount = drafts.filter(
    draft => draft.phase === "ready" || draft.phase === "error"
  ).length;

  return (
    <ModalComponent
      title="رفع مقاطع أداء اللاعب"
      onClose={() => {
        if (uploading) toast.info(closeReason);
        else onClose();
      }}
      closeDisabled={uploading}
      closeDisabledReason={closeReason}
      wide
    >
      <form onSubmit={startBatch} className="section-stack skill-upload-form">
        <div className="upload-area">
          <Upload size={29} />
          <strong>اختر مقطعًا أو عدة مقاطع</strong>
          <p>MP4 أو WebM · حتى 10 ميغابايت لكل مقطع</p>
          <input
            aria-label="اختيار مقاطع فيديو"
            type="file"
            accept="video/mp4,video/webm,.mp4,.webm"
            multiple
            disabled={uploading || !availableSkills.length}
            onChange={event => {
              addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        </div>

        {drafts.length ? (
          <div className="skill-upload-list" aria-live="polite">
            {drafts.map((draft, index) => {
              const validation = validateSkillVideoDraft(draft);
              const isEditable = !uploading && draft.phase !== "saved";
              return (
                <article className="skill-upload-item" key={draft.id}>
                  <header>
                    <div>
                      <span className="skill-upload-index">
                        مقطع {index + 1}
                      </span>
                      <strong>{draft.file.name}</strong>
                      <small>
                        {(draft.file.size / (1024 * 1024)).toFixed(2)} ميغابايت
                      </small>
                    </div>
                    <button
                      className="icon-btn"
                      type="button"
                      onClick={() => removeDraft(draft.id)}
                      disabled={!isEditable}
                      aria-label={`إزالة ${draft.file.name}`}
                      title={uploading ? closeReason : "إزالة المقطع"}
                    >
                      <X size={16} />
                    </button>
                  </header>
                  <div className="form-grid">
                    <label className="field">
                      عنوان المقطع
                      <input
                        value={draft.title}
                        disabled={!isEditable}
                        onChange={event =>
                          updateDraft(draft.id, {
                            title: event.target.value,
                            phase: "ready",
                            error: undefined,
                          })
                        }
                        maxLength={160}
                        required
                      />
                    </label>
                    <label className="field">
                      المهارة الرياضية
                      <select
                        value={draft.skill}
                        disabled={!isEditable}
                        onChange={event =>
                          updateDraft(draft.id, {
                            skill: event.target.value,
                            phase: "ready",
                            error: undefined,
                          })
                        }
                      >
                        {availableSkills.map(skill => (
                          <option key={skill}>{skill}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      تاريخ المقطع
                      <input
                        type="date"
                        max={today}
                        value={draft.recordedAt}
                        disabled={!isEditable}
                        onChange={event =>
                          updateDraft(draft.id, {
                            recordedAt: event.target.value,
                            phase: "ready",
                            error: undefined,
                          })
                        }
                        required
                      />
                    </label>
                  </div>
                  <div className="skill-upload-progress-row">
                    <span
                      className={`skill-upload-phase ${phaseClass(draft.phase)}`}
                    >
                      {draft.phase === "saved" ? (
                        <CheckCircle2 size={15} />
                      ) : null}
                      {draft.phase === "error" ? (
                        <CircleAlert size={15} />
                      ) : null}
                      {phaseLabel(draft)}
                    </span>
                    {draft.phase === "transferring" ||
                    draft.phase === "awaiting-save" ? (
                      <progress
                        value={draft.progress}
                        max={100}
                        aria-label={`تقدم رفع ${draft.title}`}
                      />
                    ) : null}
                  </div>
                  {validation && draft.phase !== "saved" ? (
                    <p className="form-error">{validation}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}

        <p className="privacy-note">
          <ShieldCheck size={18} />
          تُرفع المقاطع بصورة خاصة. لا يُرسل مصدر أو اعتماد خارجي للمقاطع التي
          ترفعها من جهازك.
        </p>
        {demoBadge}
        {uploading ? (
          <p className="helper" role="status">
            {closeReason}
          </p>
        ) : null}
        {batchMessage ? (
          <p className="helper" role="status">
            {batchMessage}
          </p>
        ) : null}
        <div className="modal-actions">
          <button
            className="btn btn-outline"
            type="button"
            onClick={onClose}
            disabled={uploading}
            title={uploading ? closeReason : undefined}
          >
            إغلاق
          </button>
          <button
            className="btn btn-primary"
            disabled={!retryableCount || uploading}
            title={
              !retryableCount
                ? "أضف مقطعًا أو صحح المقاطع الفاشلة أولًا."
                : undefined
            }
          >
            {uploading ? (
              <Loader2 size={17} className="spin" />
            ) : (
              <Upload size={17} />
            )}
            {uploading
              ? "جارٍ نقل الدفعة وحفظها…"
              : drafts.some(draft => draft.phase === "error")
                ? "إعادة محاولة المقاطع الفاشلة"
                : "رفع وحفظ المقاطع"}
          </button>
        </div>
      </form>
    </ModalComponent>
  );
}
