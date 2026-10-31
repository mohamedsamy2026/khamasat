import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Dumbbell,
  FileVideo,
  Info,
  Loader2,
  Play,
  Upload,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import type {
  AccessRequest,
  Analysis as AnalysisData,
  PlayerCard,
  Video,
} from "@shared/athlete";
import { DEMO_LABEL } from "@shared/athlete";
import { skillsForPlayer } from "@shared/coaching";
import type { PoseProgress } from "@shared/pose";
import { ACADEMY_TENURE_NOTE, calendarToday, formatAcademyTenure } from "@shared/academy-tenure";
import { MAX_POSE_SECONDS } from "@shared/pose";
import { api, downloadPrivate, useApi, useAthlete } from "@/lib/athleteApi";
import { analyzeVideo } from "@/lib/poseEngine";
import {
  EMPTY_ANALYSIS_CONTEXT,
  type AnalysisContext,
} from "@shared/evaluation-types";
import {
  DemoBadge,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
  Panel,
  TextLink,
  UploadModal,
} from "@/components/athlete/UI";
import PoseResults from "@/components/athlete/PoseResults";
import "./analysis-workflow.css";
import "./analysis-cv.css";

function initialSelection() {
  const params = new URLSearchParams(window.location.search);
  return {
    playerId: Number(params.get("player")) || 0,
    videoId: Number(params.get("video")) || 0,
    skill: params.get("skill") ?? "",
    analysisId: Number(params.get("analysis")) || 0,
  };
}

export default function Analysis() {
  const initial = useMemo(initialSelection, []);
  const { organization, orgId, session, invalidate } =
    useAthlete();
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
  const isAcademy = organization?.type === "academy";
  const isDemoMode = session?.mode === "demo";
  const playersQuery = useApi<PlayerCard[]>("/players");
  const requests = useApi<AccessRequest[]>("/requests", !isAcademy);
  const cards = playersQuery.data ?? [];
  const players = isAcademy
    ? cards
    : cards.filter(player =>
        requests.data?.some(
          request =>
            request.playerId === player.id && request.status === "approved"
        )
      );
  const [playerId, setPlayerId] = useState(initial.playerId);
  const [selectedVideo, setSelectedVideo] = useState(initial.videoId);
  const [skill, setSkill] = useState(initial.skill);
  const [selectedSession, setSelectedSession] = useState(initial.analysisId);
  const [upload, setUpload] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<PoseProgress | null>(null);
  const [actionError, setActionError] = useState("");
  const [saved, setSaved] = useState<AnalysisData | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [legacy, setLegacy] = useState<AnalysisData | null>(null);
  const [context, setContext] = useState<AnalysisContext>({
    ...EMPTY_ANALYSIS_CONTEXT,
  });
  const [exercise, setExercise] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const runRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const previewGeneration = useRef(0);
  const previewOwnedUrl = useRef<string | null>(null);
  const priorScope = useRef({ orgId, playerId, sessionScope });
  const player = players.find(item => item.id === playerId);
  const allowed = Boolean(player);
  const availableSkills = useMemo(
    () => (player ? skillsForPlayer(player.sport, player.position) : []),
    [player?.sport, player?.position]
  );
  const videosQuery = useApi<Video[]>(`/videos?playerId=${playerId}`, allowed);
  const analysesQuery = useApi<AnalysisData[]>(
    `/analyses?playerId=${playerId}`,
    allowed
  );
  const videos = videosQuery.data ?? [];
  const history = [...(analysesQuery.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const stored = history.find(
    item =>
      item.videoId === selectedVideo &&
      item.skill === skill &&
      item.pose &&
      !item.isDemo &&
      (!selectedSession || item.id === selectedSession)
  );
  const result =
    saved?.playerId === playerId &&
    saved.videoId === selectedVideo &&
    saved.skill === skill
      ? saved
      : stored;
  const selected = videos.find(video => video.id === selectedVideo);

  function clearPreview() {
    previewGeneration.current += 1;
    if (previewOwnedUrl.current) URL.revokeObjectURL(previewOwnedUrl.current);
    previewOwnedUrl.current = null;
    setVideoUrl(null);
    setVideoError("");
    setVideoLoading(false);
  }

  useEffect(() => {
    const old = priorScope.current;
    if (
      old.playerId !== playerId ||
      (old.orgId !== undefined && old.orgId !== orgId) ||
      old.sessionScope !== sessionScope
    ) {
      controllerRef.current?.abort();
      runRef.current += 1;
      setWorking(false);
      setProgress(null);
      setSaved(null);
      setSelectedVideo(0);
      setSelectedSession(0);
      setContext({ ...EMPTY_ANALYSIS_CONTEXT });
      setLegacy(null);
      setActionError("");
      clearPreview();
    }
    priorScope.current = { orgId, playerId, sessionScope };
  }, [orgId, playerId, sessionScope]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      runRef.current += 1;
      previewGeneration.current += 1;
      if (previewOwnedUrl.current) URL.revokeObjectURL(previewOwnedUrl.current);
    },
    []
  );

  useEffect(() => {
    if (
      playersQuery.isLoading ||
      (!isAcademy && !isDemoMode && requests.isLoading)
    )
      return;
    if (playerId && !players.some(item => item.id === playerId)) setPlayerId(0);
  }, [
    playerId,
    players,
    playersQuery.isLoading,
    requests.isLoading,
    isAcademy,
    isDemoMode,
  ]);

  useEffect(() => {
    if (
      !videosQuery.isLoading &&
      !videosQuery.isFetching &&
      allowed &&
      selectedVideo &&
      !videos.some(video => video.id === selectedVideo)
    ) {
      setSelectedVideo(0);
      clearPreview();
    }
  }, [
    allowed,
    selectedVideo,
    videos,
    videosQuery.isLoading,
    videosQuery.isFetching,
  ]);

  useEffect(() => {
    if (player && skill && !availableSkills.includes(skill)) setSkill("");
  }, [skill, player, availableSkills]);

  useEffect(() => {
    if (
      playersQuery.isLoading ||
      (!isAcademy && !isDemoMode && requests.isLoading)
    )
      return;
    const params = new URLSearchParams(window.location.search);
    if (allowed) params.set("player", String(playerId));
    else params.delete("player");
    if (allowed && !videosQuery.isLoading && !videosQuery.isFetching) {
      if (selectedVideo && videos.some(video => video.id === selectedVideo))
        params.set("video", String(selectedVideo));
      else params.delete("video");
    }
    if (availableSkills.includes(skill)) params.set("skill", skill);
    else params.delete("skill");
    if (selectedSession) params.set("analysis", String(selectedSession));
    else params.delete("analysis");
    const next = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    if (
      next !==
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    )
      window.history.replaceState(window.history.state, "", next);
  }, [
    allowed,
    playerId,
    selectedVideo,
    selectedSession,
    skill,
    videos,
    playersQuery.isLoading,
    videosQuery.isLoading,
    videosQuery.isFetching,
    requests.isLoading,
    isAcademy,
    isDemoMode,
  ]);

  let disabledReason = "";
  if (!allowed) disabledReason = "اختر لاعبًا مصرحًا لك بملفه أولًا.";
  else if (!isAcademy)
    disabledReason =
      "يمكن للنادي مشاهدة النتائج؛ بدء التحليل وحفظه متاحان للأكاديمية المالكة فقط.";
  else if (videosQuery.isLoading || videosQuery.isFetching)
    disabledReason = "جارٍ تحميل مقاطع اللاعب…";
  else if (!selected)
    disabledReason = "اختر فيديو مرفوعًا، أو ارفع مقطعًا من زر رفع فيديو.";
  else if (!skill)
    disabledReason = "حدد المهارة التي يربط بها المدرب هذا المقطع.";
  else if (working || videoLoading)
    disabledReason = "جارٍ تنفيذ الطلب؛ انتظر اكتماله.";

  async function runAnalysis() {
    if (disabledReason || !orgId) {
      setActionError(disabledReason);
      return;
    }
    const request = ++runRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setActionError("");
    setWorking(true);
    setProgress({
      phase: "decoding",
      current: 0,
      total: 0,
      message: "تحميل الفيديو المرتبط باللاعب…",
    });
    try {
      const blob = await downloadPrivate(`/videos/${selectedVideo}/content`);
      if (controller.signal.aborted || request !== runRef.current) return;
      const pose = await analyzeVideo(blob, {
        signal: controller.signal,
        onProgress: next => {
          if (request === runRef.current && !controller.signal.aborted)
            setProgress(next);
        },
      });
      if (controller.signal.aborted || request !== runRef.current) return;
      setProgress({
        phase: "analyzing",
        current: pose.totalFrames,
        total: pose.totalFrames,
        message: "اكتمل الاستدلال؛ جارٍ حفظ التتبع والقياسات مع الفيديو…",
      });
      const returned = await api<AnalysisData>("/analyses", {
        method: "POST",
        headers: { "X-Organization-Id": String(orgId) },
        body: JSON.stringify({
          playerId,
          videoId: selectedVideo,
          skill,
          pose,
          context,
        }),
      });
      if (request !== runRef.current || controller.signal.aborted) return;
      if (!returned.pose || returned.isDemo)
        throw new Error(
          "لم يُعد الخادم نتائج تتبع فعلية محفوظة؛ لم نعلن نجاح التحليل."
        );
      setSaved(returned);
      setSelectedSession(returned.id);
      await invalidate();
      toast.success("تم تحليل المقطع وحفظ التتبع والقياسات في ملف اللاعب");
    } catch (problem) {
      if (request === runRef.current && !controller.signal.aborted)
        setActionError(
          problem instanceof Error
            ? problem.message
            : "تعذر تحليل المقطع أو حفظ النتائج"
        );
    } finally {
      if (request === runRef.current) {
        setWorking(false);
        setProgress(null);
      }
    }
  }

  async function watchVideo() {
    if (!selectedVideo) return;
    const request = ++previewGeneration.current;
    setVideoLoading(true);
    setVideoError("");
    try {
      const blob = await downloadPrivate(`/videos/${selectedVideo}/content`);
      if (request !== previewGeneration.current) return;
      if (previewOwnedUrl.current) URL.revokeObjectURL(previewOwnedUrl.current);
      previewOwnedUrl.current = URL.createObjectURL(blob);
      setVideoUrl(previewOwnedUrl.current);
    } catch (problem) {
      if (request === previewGeneration.current)
        setVideoError(
          problem instanceof Error ? problem.message : "تعذر تشغيل المقطع"
        );
    } finally {
      if (request === previewGeneration.current) setVideoLoading(false);
    }
  }

  function selectVideo(id: number) {
    clearPreview();
    setSelectedVideo(id);
    setSaved(null);
    setActionError("");
    setSelectedSession(0);
    const video = videos.find(item => item.id === id);
    if (video && availableSkills.includes(video.skill)) setSkill(video.skill);
  }

  if (
    playersQuery.isLoading ||
    (!isAcademy && !isDemoMode && requests.isLoading)
  )
    return <Loading />;
  if (playersQuery.error)
    return (
      <ErrorState error={playersQuery.error} retry={playersQuery.refetch} />
    );
  if (!isAcademy && !isDemoMode && requests.error)
    return <ErrorState error={requests.error} retry={requests.refetch} />;

  return (
    <>
      <PageHeading
        title="تحليل الأداء"
        subtitle="التحليل الحركي — تتبع الجسم من الفيديو وقياس زوايا ثنائية الأبعاد"
        icon={Activity}
        actions={<DemoBadge compact />}
      />
      <section className="analysis-workflow" aria-label="رحلة تحليل الفيديو">
        <div className="notice-box analysis-disclosure">
          <Info size={20} />
          <span>
            <strong>النموذج يقرأ إطارات المقطع فعليًا داخل المتصفح.</strong>{" "}
            الزوايا تقديرية في مستوى الصورة، وليست قياسًا طبيًا أو تقييمًا
            للمهارة. المهارة تصنيف يختاره المدرب؛ لا تُرسل الفيديوهات إلى مزود
            تحليل خارجي.
          </span>
        </div>
        {!players.length ? (
          <EmptyState
            title={
              isAcademy
                ? "أضف لاعبًا ثم ارفع فيديو الأداء"
                : "لا توجد ملفات متاحة بعد"
            }
            description={
              isDemoMode
                ? "استخدم بيانات مساحة العرض نفسها للتنقل بين منظور الأكاديمية والنادي."
                : "ملفات اللاعبين الحقيقية تتطلب صلاحية الأكاديمية أو موافقتها للنادي."
            }
            action={
              <Link
                className="btn btn-primary"
                href={isAcademy ? "/academies" : "/clubs"}
              >
                {isAcademy ? "إدارة اللاعبين" : "اكتشاف المواهب"}
              </Link>
            }
          />
        ) : (
          <>
            <div className="analysis-steps analysis-five-steps">
              {[
                "اختيار اللاعب",
                "اختيار أو رفع الفيديو",
                "تحديد المهارة",
                "تحليل المقطع",
                "النتائج المحفوظة",
              ].map((label, index) => (
                <div className="analysis-step" key={label}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{label}</strong>
                  </div>
                </div>
              ))}
            </div>
            <section
              className="analysis-toolbar"
              aria-label="اختيار الفيديو والمهارة"
            >
              <label className="field">
                اللاعب
                <select
                  value={playerId}
                  onChange={event => setPlayerId(Number(event.target.value))}
                  disabled={working || videoLoading}
                >
                  <option value={0}>اختر اللاعب</option>
                  {players.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.position}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                فيديو الأداء
                <select
                  value={selectedVideo}
                  onChange={event => selectVideo(Number(event.target.value))}
                  disabled={
                    !allowed || videosQuery.isLoading || working || videoLoading
                  }
                >
                  <option value={0}>
                    {videosQuery.isLoading
                      ? "جارٍ تحميل المقاطع…"
                      : "اختر فيديو مرفوعًا"}
                  </option>
                  {videos.map(video => (
                    <option key={video.id} value={video.id}>
                      {video.title} · {video.skill}
                    </option>
                  ))}
                </select>
              </label>
              {isAcademy && (
                <button
                  className="btn btn-outline analysis-upload-button"
                  type="button"
                  disabled={!allowed || working || videoLoading}
                  onClick={() => setUpload(true)}
                  title={
                    !allowed
                      ? "اختر اللاعب قبل الرفع"
                      : "رفع فيديو خاص مرتبط باللاعب"
                  }
                >
                  <Upload size={17} />
                  رفع فيديو
                </button>
              )}
              <label className="field">
                المهارة
                <select
                  value={skill}
                  onChange={event => {
                    setSkill(event.target.value);
                    setSaved(null);
                    setActionError("");
                  }}
                  disabled={!allowed || working || videoLoading}
                >
                  <option value="">اختر المهارة</option>
                  {availableSkills.map(item => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <div className="analysis-action-group">
                <button
                  type="button"
                  className="btn btn-primary analysis-start-button"
                  disabled={Boolean(disabledReason)}
                  aria-describedby="analysis-start-reason"
                  onClick={runAnalysis}
                >
                  {working ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <WandSparkles size={18} />
                  )}
                  بدء التحليل وحفظ النتائج
                </button>
                <p
                  className="analysis-action-reason"
                  id="analysis-start-reason"
                >
                  {disabledReason ||
                    `تحليل فعلي على عينات المقطع · حد المدة ${MAX_POSE_SECONDS} ثانية وحد الحجم 10MiB.`}
                </p>
              </div>
            </section>
            {isAcademy && allowed && (
              <Panel title="توثيق الجلسة وظروف التصوير" icon={Info}>
                <p className="helper">
                  الحقول التالية تصريح المدرب، وليست استنتاجًا آليًا. تبقى
                  المقارنات غير مُقيّمة إذا كانت القدم أو ظروف الاختبار مجهولة.
                  المرحلة الحالية هي المقطع كاملًا دون تقسيم مراحل الركل آليًا.
                </p>
                <fieldset className="analysis-context-grid" disabled={working}>
                  <label>
                    القدم المستخدمة — اختيار المدرب
                    <select
                      aria-label="القدم المستخدمة"
                      value={context.usedFoot}
                      onChange={e =>
                        setContext(v => ({
                          ...v,
                          usedFoot: e.target
                            .value as AnalysisContext["usedFoot"],
                        }))
                      }
                    >
                      <option value="unknown">غير محددة</option>
                      <option value="right">اليمنى</option>
                      <option value="left">اليسرى</option>
                    </select>
                  </label>
                  <label>
                    زاوية التصوير
                    <select
                      aria-label="زاوية التصوير"
                      value={context.cameraView}
                      onChange={e =>
                        setContext(v => ({
                          ...v,
                          cameraView: e.target
                            .value as AnalysisContext["cameraView"],
                        }))
                      }
                    >
                      <option value="unknown">غير معروفة</option>
                      <option value="side">جانبية</option>
                      <option value="front">أمامية</option>
                      <option value="oblique">مائلة</option>
                    </select>
                  </label>
                  <label>
                    ثبات الكاميرا
                    <select
                      aria-label="ثبات الكاميرا"
                      value={
                        context.staticCamera === null
                          ? "unknown"
                          : String(context.staticCamera)
                      }
                      onChange={e =>
                        setContext(v => ({
                          ...v,
                          staticCamera:
                            e.target.value === "unknown"
                              ? null
                              : e.target.value === "true",
                        }))
                      }
                    >
                      <option value="unknown">غير معروف</option>
                      <option value="true">ثابتة</option>
                      <option value="false">متحركة</option>
                    </select>
                  </label>
                  <label>
                    بروتوكول الاختبار المتبع
                    <input
                      aria-label="بروتوكول الاختبار"
                      value={context.protocolId}
                      maxLength={120}
                      placeholder="غير متوفر — لا تفترض بروتوكولًا"
                      onChange={e =>
                        setContext(v => ({ ...v, protocolId: e.target.value }))
                      }
                    />
                  </label>
                  <label className="analysis-context-wide">
                    ظروف الاختبار المعروفة
                    <input
                      aria-label="ظروف الاختبار"
                      value={context.conditionsNote}
                      maxLength={500}
                      placeholder="موضع الكاميرا والبيئة وأي حجب؛ اتركه فارغًا إذا لم تعرف"
                      onChange={e =>
                        setContext(v => ({
                          ...v,
                          conditionsNote: e.target.value,
                        }))
                      }
                    />
                  </label>
                </fieldset>
                <p className="helper">
                  صوّر شخصًا واحدًا بكامل جسمه وبإضاءة واضحة، دون حجب المفاصل أو
                  قطع اللقطة. يدعم التحليل MP4/WebM القابل للفك، حتى 60 ثانية
                  و10MiB. لا يقيس سرعة الكرة أو دقة الهدف أو القوة العضلية أو
                  المسافات المعايرة.
                </p>
              </Panel>
            )}
            {player && (
              <div className="analysis-player-card">
                <div>
                  <small>الملف المحدد</small>
                  <strong>{player.name}</strong>
                  <span>
                    {player.position} ·{" "}
                    {player.age > 0
                      ? `${player.age} سنة`
                      : "بيانات العمر غير متوفرة"}
                  </span>
                  <span data-testid="analysis-academy-tenure">تاريخ الانضمام: {player.academyJoinDate || "غير محدد"} · مدة الانضمام {result?.createdAt ? "عند التحليل" : "حتى اليوم"}: {formatAcademyTenure(player.academyJoinDate, (result?.createdAt || calendarToday()).slice(0, 10))}</span>
                  <small>{ACADEMY_TENURE_NOTE}</small>
                </div>
                <div className="analysis-player-links">
                  <TextLink href={`/players/${player.id}`}>ملف اللاعب</TextLink>
                  <TextLink href={`/reports?player=${player.id}`}>
                    تقرير اللاعب
                  </TextLink>
                </div>
              </div>
            )}
            {videosQuery.error && (
              <ErrorState
                error={videosQuery.error}
                retry={videosQuery.refetch}
              />
            )}
            {analysesQuery.error && (
              <ErrorState
                error={analysesQuery.error}
                retry={analysesQuery.refetch}
              />
            )}
            {progress && (
              <div
                className="analysis-model-progress"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="spin" size={22} />
                <div>
                  <strong>{progress.message}</strong>
                  {progress.total > 0 && (
                    <>
                      <progress max={progress.total} value={progress.current} />
                      <span dir="ltr">
                        {progress.current} / {progress.total}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
            {actionError && (
              <div
                className="analysis-message analysis-message-error"
                role="alert"
              >
                <CircleAlert size={19} />
                <span>{actionError}</span>
                <button
                  type="button"
                  disabled={Boolean(disabledReason)}
                  onClick={runAnalysis}
                >
                  إعادة المحاولة
                </button>
              </div>
            )}
            {result?.pose && !result.isDemo ? (
              <PoseResults analysis={result} />
            ) : (
              <div className="analysis-pending-grid">
                <Panel title="فيديو الأداء" icon={FileVideo}>
                  {videoUrl ? (
                    <video
                      className="analysis-actual-preview"
                      src={videoUrl}
                      controls
                      playsInline
                      controlsList="nodownload"
                      onError={() =>
                        setVideoError(
                          "لا يدعم المتصفح ترميز المقطع؛ جرّب MP4/H.264."
                        )
                      }
                    />
                  ) : (
                    <EmptyState
                      title={selected ? "المقطع محفوظ وجاهز" : "لم يُحدد مقطع"}
                      description={
                        selected
                          ? "شاهد الفيديو، ثم ابدأ التحليل لقياس نقاط الجسم الفعلية."
                          : "اختر فيديو اللاعب أو ارفعه من واجهة الأكاديمية."
                      }
                    />
                  )}
                  {selected && (
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={watchVideo}
                      disabled={working || videoLoading}
                    >
                      {videoLoading ? (
                        <Loader2 className="spin" size={17} />
                      ) : (
                        <Play size={17} />
                      )}
                      مشاهدة الفيديو المحفوظ
                    </button>
                  )}
                  {videoError && (
                    <p className="form-error" role="alert">
                      {videoError}
                    </p>
                  )}
                </Panel>
                <Panel title="التحليل الحركي" icon={Activity}>
                  <EmptyState
                    title="لا توجد قياسات للمقطع المحدد بعد"
                    description="لا نعرض زوايا أو تتبعًا جاهزًا. تبدأ النتائج بعد استدلال النموذج على إطارات هذا الفيديو وحفظها."
                  />
                  <p className="helper">
                    الزوايا غير المرئية أو منخفضة الثقة تُعرض باعتبارها غير
                    قابلة للقياس. سرعة الكرة والتقييم العام والزوايا ثلاثية
                    الأبعاد المعايرة غير متاحة في هذا المحرك.
                  </p>
                </Panel>
              </div>
            )}
            {history.length > 0 && (
              <Panel title="سجل النتائج المحفوظة" icon={FileVideo}>
                <div className="analysis-history-list">
                  {history.map(item => (
                    <div className="analysis-history-item" key={item.id}>
                      <div>
                        <strong>
                          {item.skill} ·{" "}
                          {item.isDemo
                            ? "مثال سابق تجريبي"
                            : "تتبع فعلي من الفيديو"}
                        </strong>
                        <span>
                          {item.videoId
                            ? videos.find(video => video.id === item.videoId)
                                ?.title || `فيديو #${item.videoId}`
                            : "غير مرتبط بمقطع — ليس قياس فيديو"}
                        </span>
                        <small>
                          {new Date(item.createdAt).toLocaleString("ar-SA")}
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (item.isDemo) setLegacy(item);
                          else if (item.videoId) {
                            selectVideo(item.videoId);
                            setSkill(item.skill);
                            setSelectedSession(item.id);
                            setContext(
                              item.context
                                ? { ...item.context }
                                : { ...EMPTY_ANALYSIS_CONTEXT }
                            );
                          }
                        }}
                        disabled={
                          working ||
                          (!item.isDemo &&
                            !videos.some(video => video.id === item.videoId))
                        }
                      >
                        {item.isDemo
                          ? "تفاصيل المثال القديم"
                          : "عرض التتبع المحفوظ"}
                      </button>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
            <div className="analysis-footer-links">
              <DemoBadge />
              {player && (
                <div>
                  <TextLink href={`/players/${player.id}`}>
                    العودة إلى ملف اللاعب
                  </TextLink>
                  <TextLink href={`/reports?player=${player.id}`}>
                    عرض تقرير اللاعب
                  </TextLink>
                </div>
              )}
            </div>
          </>
        )}
      </section>
      {upload && playerId > 0 && (
        <UploadModal
          playerId={playerId}
          onClose={() => setUpload(false)}
          onComplete={video => {
            setUpload(false);
            setSelectedVideo(video.id);
            setSkill(video.skill);
            setSaved(null);
            clearPreview();
          }}
        />
      )}
      {legacy && (
        <Modal title="مثال تجريبي محفوظ سابقًا" onClose={() => setLegacy(null)}>
          <div className="section-stack">
            <p className="privacy-note">
              {DEMO_LABEL}. أُبقي هذا السجل للحفاظ على البيانات السابقة، ولا
              يُستخدم لتوليد نتائج المقطع المرفوع أو لإظهار تتبع حقيقي.
            </p>
            {legacy.metrics.map(metric => (
              <p key={metric.name}>
                {metric.name}:{" "}
                <strong dir="ltr">
                  {metric.value} {metric.unit}
                </strong>
              </p>
            ))}
            {legacy.exercises.map(item => (
              <button
                type="button"
                className="exercise-row"
                key={item.title}
                onClick={() => setExercise(item)}
              >
                <Dumbbell size={20} />
                <span>{item.title}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {exercise && (
        <Modal title={exercise.title} onClose={() => setExercise(null)}>
          <div className="section-stack">
            <p>{exercise.description}</p>
            <p className="privacy-note">
              تمرين توضيحي قديم، وليس توصية مستخرجة من الفيديو أو خطة علاجية.
            </p>
            <TextLink href={`/training?player=${playerId}`}>
              فتح قائمة التدريب
            </TextLink>
          </div>
        </Modal>
      )}
    </>
  );
}
