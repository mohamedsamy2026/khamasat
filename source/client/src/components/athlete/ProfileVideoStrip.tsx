import { useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Loader2, Play, ShieldCheck } from "lucide-react";
import type { Video } from "@shared/athlete";
import { downloadPrivate, useAthlete } from "@/lib/athleteApi";
import { Modal } from "@/components/athlete/UI";

type PreviewStatus = "loading" | "ready" | "error";
type OpenVideo = { video: Video; url: string };
function formatRecordedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat("ar", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}
function formatDuration(seconds: number | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
export function ProfileVideoStrip({ videos }: { videos: Video[] }) {
  const { orgId } = useAthlete();
  const visibleVideos = useMemo(
    () =>
      [...videos]
        .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
        .slice(0, 3),
    [videos]
  );
  const videoKey = visibleVideos.map(video => video.id).join(",");
  const urls = useRef(new Set<string>());
  const generation = useRef(0);
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const [statuses, setStatuses] = useState<Record<number, PreviewStatus>>({});
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<OpenVideo | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  useEffect(() => {
    const scope = ++generation.current;
    urls.current.forEach(url => URL.revokeObjectURL(url));
    urls.current.clear();
    setSelected(null);
    setPreviewUrls({});
    setDurations({});
    setOpeningId(null);
    setPlaybackError("");
    setStatuses(
      Object.fromEntries(
        visibleVideos.map(video => [video.id, "loading" as PreviewStatus])
      )
    );
    const loadPreview = async (video: Video) => {
      try {
        const blob = await downloadPrivate(`/videos/${video.id}/content`);
        if (scope !== generation.current) return;
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        setPreviewUrls(current => ({ ...current, [video.id]: url }));
      } catch {
        if (scope === generation.current)
          setStatuses(current => ({ ...current, [video.id]: "error" }));
      }
    };
    void Promise.all(visibleVideos.map(loadPreview));
    return () => {
      generation.current += 1;
      urls.current.forEach(url => URL.revokeObjectURL(url));
      urls.current.clear();
    };
  }, [videoKey, orgId]);

  const openVideo = async (video: Video) => {
    setPlaybackError("");
    const currentUrl = previewUrls[video.id];
    if (currentUrl && statuses[video.id] !== "error") {
      setSelected({ video, url: currentUrl });
      return;
    }
    const scope = generation.current;
    setOpeningId(video.id);
    try {
      const blob = await downloadPrivate(`/videos/${video.id}/content`);
      if (scope !== generation.current) return;
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      setPreviewUrls(current => ({ ...current, [video.id]: url }));
      setSelected({ video, url });
    } catch {
      if (scope === generation.current)
        setStatuses(current => ({ ...current, [video.id]: "error" }));
    } finally {
      if (scope === generation.current) setOpeningId(null);
    }
  };
  return (
    <>
      <div className="profile-video-strip" aria-label="أحدث الفيديوهات الخاصة">
        {visibleVideos.map(video => {
          const url = previewUrls[video.id];
          const status = statuses[video.id] ?? "loading";
          const duration = formatDuration(durations[video.id]);
          const isOpening = openingId === video.id;
          return (
            <article className="profile-video-card" key={video.id}>
              <button
                className="profile-video-preview"
                type="button"
                onClick={() => void openVideo(video)}
                disabled={isOpening || status === "loading"}
                title={
                  status === "loading"
                    ? "يجري تحميل معاينة المقطع قبل التشغيل"
                    : status === "error"
                      ? "تعذر تحميل أو قراءة المقطع — اضغط لإعادة المحاولة"
                      : "تشغيل المقطع الخاص"
                }
                aria-label={`تشغيل فيديو ${video.title}`}
              >
                {url ? (
                  <video
                    aria-hidden="true"
                    src={url}
                    muted
                    playsInline
                    preload="auto"
                    onLoadedMetadata={event => {
                      const duration = event.currentTarget.duration;
                      if (Number.isFinite(duration))
                        setDurations(current => ({
                          ...current,
                          [video.id]: duration,
                        }));
                      if (Number.isFinite(duration) && duration > 0)
                        event.currentTarget.currentTime = Math.min(
                          0.08,
                          duration / 2
                        );
                    }}
                    onLoadedData={() =>
                      setStatuses(current => ({
                        ...current,
                        [video.id]: "ready",
                      }))
                    }
                    onError={() =>
                      setStatuses(current => ({
                        ...current,
                        [video.id]: "error",
                      }))
                    }
                  />
                ) : (
                  <span className="profile-video-loading" aria-hidden="true">
                    {status === "error" ? (
                      <CircleAlert size={23} />
                    ) : (
                      <Loader2 className="spin" size={22} />
                    )}
                  </span>
                )}
                <span className="profile-video-play" aria-hidden="true">
                  {isOpening || status === "loading" ? (
                    <Loader2 className="spin" size={19} />
                  ) : (
                    <Play size={19} fill="currentColor" />
                  )}
                </span>
                {duration ? (
                  <span className="profile-video-duration">{duration}</span>
                ) : null}
              </button>
              <strong>{video.skill}</strong>
              <span className="profile-video-title">{video.title}</span>
              <time dateTime={video.recordedAt}>
                {formatRecordedAt(video.recordedAt)}
              </time>
              <span
                className={`profile-video-status is-${status}`}
                role="status"
              >
                {status === "loading"
                  ? "جارٍ تحميل المعاينة الخاصة"
                  : status === "ready"
                    ? "المعاينة الخاصة جاهزة"
                    : "تعذر تحميل أو قراءة المقطع؛ أعد المحاولة أو استخدم MP4 بترميز مدعوم"}
              </span>
            </article>
          );
        })}
      </div>
      {selected ? (
        <Modal
          title={`${selected.video.skill} · ${selected.video.title}`}
          onClose={() => {
            setSelected(null);
            setPlaybackError("");
          }}
          wide
        >
          <video
            className="private-video"
            src={selected.url}
            controls
            playsInline
            controlsList="nodownload"
            onError={() =>
              setPlaybackError(
                "تعذر تشغيل المقطع في هذا المتصفح. جرّب ملف MP4 بترميز H.264 أو متصفحًا يدعم ترميز الملف."
              )
            }
          />
          {playbackError && (
            <p className="form-error" role="alert">
              {playbackError}
            </p>
          )}
          <p className="helper">
            <ShieldCheck size={14} /> عرض خاص للمقطع، بعد التحقق من الصلاحية
          </p>
        </Modal>
      ) : null}
    </>
  );
}
