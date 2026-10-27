import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import {
  Router,
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import express from "express";
import { z, type ZodType } from "zod";
import {
  accessGrants,
  accessRequests,
  analyses,
  auditEvents,
  demoSessions,
  exercisePlans,
  favorites,
  memberships,
  notes,
  organizations,
  players,
  videoChunks,
  videos,
} from "../../drizzle/schema";
import {
  DEMO_LABEL,
  MAX_VIDEO_BYTES,
  type Membership,
  type Report,
  type VideoSource,
} from "../../shared/athlete";
import type { PoseResult } from "../../shared/pose";
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  NotFoundError,
} from "../../shared/_core/errors";
import { getDb } from "../db";
import { type AuthenticatedUser } from "../_core/sdk";
import {
  actorDisplayName,
  actorUserId,
  asMembership,
  demoCookieName,
  demoTokenHash,
  DEMO_SESSION_MAX_AGE_MS,
  getGuestActor,
  getGuestActorForToken,
  isGuestActor,
  optionalUser,
  requireActor,
  requireUser,
  type Actor,
  type OrganizationMembership,
} from "./actor";
import {
  canManageOrganization,
  canManagePlayer,
  canReadFullPlayer,
  isAcademy,
  isClub,
  isDemoWorkspace,
  isValidRequestTransition,
  nextRequestStatus,
  type OrganizationContext,
} from "./policy";
import {
  evaluationForActualAnalysis,
  historyPoints,
  serializeAccessRequest,
  serializeAnalysis,
  serializeExercisePlan,
  serializeNote,
  serializePlayer,
  serializePlayerCard,
  serializeVideo,
  type VideoAnalysisState,
} from "./serializers";
import { demoPlayersForSeed } from "./seed";
import { normalizePoseResult } from "./poseNormalization";
import {
  exportVerifiedReportCsv,
  exportVerifiedReportHtml,
} from "./verifiedReportExport";
import {
  analysisInputSchema,
  exercisePlanInputSchema,
  exercisePlanPatchSchema,
  exportQuerySchema,
  maxVideoBytes,
  noteInputSchema,
  notePatchSchema,
  organizationInputSchema,
  organizationPatchSchema,
  playerInputSchema,
  positiveId,
  reportQuerySchema,
  requestActionSchema,
  requestInputSchema,
  videoQuerySchema,
} from "./validation";
import {
  evaluateSession,
  summarizePlayerEvaluation,
} from "../../shared/evaluation";
import type { EvaluationSessionInput } from "../../shared/evaluation-types";

const ONE_MIB = 1024 * 1024;
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function arabicError(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof z.ZodError)
    return error.issues[0]?.message ?? "البيانات المرسلة غير صالحة";
  return "تعذر إتمام الطلب، يرجى المحاولة مجددًا";
}

function statusFor(error: unknown): number {
  if (error instanceof HttpError) return error.statusCode;
  if (error instanceof z.ZodError) return 400;
  const parserStatus = (error as { status?: unknown } | null)?.status;
  if (
    typeof parserStatus === "number" &&
    parserStatus >= 400 &&
    parserStatus < 600
  )
    return parserStatus;
  return 500;
}

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

function athleteError(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) return;
  if (statusFor(error) >= 500)
    console.error(
      "[Athlete API]",
      error instanceof Error ? error.message : error
    );
  res.status(statusFor(error)).json({ error: arabicError(error) });
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw BadRequestError(
      result.error.issues[0]?.message ?? "البيانات المرسلة غير صالحة"
    );
  return result.data;
}

function queryObject(
  req: Request,
  keys: string[]
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = req.query[key];
    result[key] = typeof value === "string" ? value : undefined;
  }
  return result;
}

async function database(): Promise<Database> {
  const db = await getDb();
  if (!db) throw new HttpError(503, "قاعدة البيانات غير متاحة حاليًا");
  return db;
}

function insertId(result: unknown): number {
  const first = Array.isArray(result) ? result[0] : result;
  const id = Number((first as { insertId?: unknown } | undefined)?.insertId);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("Database insert did not return a valid identifier");
  return id;
}

function requestedOrganizationId(req: Request): number {
  const header = req.header("X-Organization-Id");
  if (!header || !/^\d+$/.test(header))
    throw BadRequestError("أرسل معرّف المؤسسة في X-Organization-Id");
  const id = Number(header);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw BadRequestError("معرّف المؤسسة غير صالح");
  return id;
}

async function requireOrganization(
  req: Request,
  actor: Actor
): Promise<OrganizationMembership> {
  const organizationId = requestedOrganizationId(req);
  if (isGuestActor(actor)) {
    const membership = actor.memberships.find(
      item => item.organizationId === organizationId
    );
    if (!membership)
      throw ForbiddenError("المؤسسة المحددة ليست ضمن مساحة العرض الخاصة بك");
    return membership;
  }
  const user = actor.user;
  const db = await database();
  const rows = await db
    .select({
      organizationId: memberships.organizationId,
      userId: memberships.userId,
      role: memberships.role,
      name: organizations.name,
      type: organizations.type,
      region: organizations.region,
      isDemo: organizations.isDemo,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, user.id)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw ForbiddenError("لا تملك عضوية في المؤسسة المحددة");
  return {
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    name: row.name,
    type: row.type,
    region: row.region,
    isDemo: Boolean(row.isDemo),
    actorKind: "member",
  };
}

async function listMemberships(userId: number): Promise<Membership[]> {
  const db = await database();
  const rows = await db
    .select({
      organizationId: memberships.organizationId,
      name: organizations.name,
      type: organizations.type,
      role: memberships.role,
      region: organizations.region,
      isDemo: organizations.isDemo,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(organizations.name));
  return rows.map(asMembership);
}

async function playerWithAcademy(db: Database, id: number) {
  const rows = await db
    .select({ player: players, academyName: organizations.name })
    .from(players)
    .innerJoin(organizations, eq(players.academyId, organizations.id))
    .where(eq(players.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw NotFoundError("اللاعب غير موجود");
  return row;
}

async function hasActiveGrant(
  db: Database,
  playerId: number,
  clubId: number
): Promise<boolean> {
  const rows = await db
    .select({ id: accessGrants.id })
    .from(accessGrants)
    .where(
      and(
        eq(accessGrants.playerId, playerId),
        eq(accessGrants.clubId, clubId),
        eq(accessGrants.active, true)
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}

async function requireFullPlayerAccess(
  db: Database,
  context: OrganizationContext,
  playerId: number
): Promise<{ player: typeof players.$inferSelect; academyName: string }> {
  const row = await playerWithAcademy(db, playerId);
  if (
    isDemoWorkspace(context) &&
    row.player.academyId !== context.workspaceAcademyId
  ) {
    throw ForbiddenError("اللاعب ليس ضمن مساحة العرض الخاصة بك");
  }
  const grant = isClub(context)
    ? isDemoWorkspace(context)
      ? false
      : await hasActiveGrant(db, row.player.id, context.organizationId)
    : false;
  if (!canReadFullPlayer(context, row.player.academyId, grant)) {
    throw ForbiddenError("لا تملك صلاحية الاطلاع على الملف الكامل للاعب");
  }
  return row;
}

async function writeAudit(
  db: Database | any,
  input: {
    organizationId: number | null;
    actorUserId: number | null;
    entityType: string;
    entityId?: number | null;
    action: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    metadata: input.metadata,
  });
}

function demoHistoryForAnalysis(
  history: unknown,
  skill: string,
  score: number,
  at: Date
) {
  const current = Array.isArray(history) ? history : [];
  const next = [
    ...current,
    {
      date: at.toISOString(),
      label: at.toISOString().slice(0, 7),
      score,
      skill,
    },
  ];
  return next.slice(-24);
}

function poseAnalysisPayload(pose: PoseResult): {
  score: null;
  metrics: { name: string; value: number; unit: string; rating: string }[];
  jointAngles: { name: string; angle: number }[];
  observations: {
    type: "good" | "warning" | "info";
    title: string;
    detail: string;
  }[];
  exercises: { title: string; description: string }[];
} {
  const measuredJoints = pose.joints.filter(
    (joint): joint is typeof joint & { mean: number } => joint.mean !== null
  );
  const source = "تقدير ثنائي الأبعاد من رؤية الحاسوب";
  const observations: {
    type: "good" | "warning" | "info";
    title: string;
    detail: string;
  }[] = [
    {
      type: "info",
      title: "تغطية الرصد",
      detail: `تم رصد وضعية في ${pose.detectedFrames} من ${pose.totalFrames} عينة عند عتبة ثقة ${pose.confidenceThreshold}.`,
    },
    {
      type: "info",
      title: "حدود القياس",
      detail:
        pose.limitations.length > 0
          ? pose.limitations.join(" ")
          : "هذه الزوايا تقدير ثنائي الأبعاد ولا تمثل تقييمًا رياضيًا أو طبيًا.",
    },
  ];
  return {
    score: null,
    metrics: measuredJoints.map(joint => ({
      name: joint.label,
      value: joint.mean,
      unit: "درجة",
      rating: source,
    })),
    jointAngles: measuredJoints.map(joint => ({
      name: joint.label,
      angle: joint.mean,
    })),
    observations,
    exercises: [],
  };
}

function evaluationSessionInput(
  analysis: Record<string, unknown>
): EvaluationSessionInput | null {
  const evaluation = evaluationForActualAnalysis(analysis);
  if (
    !evaluation ||
    !analysis.poseResult ||
    typeof analysis.poseResult !== "object"
  )
    return null;
  const createdAt =
    analysis.createdAt instanceof Date
      ? analysis.createdAt.toISOString()
      : typeof analysis.createdAt === "string"
        ? analysis.createdAt
        : "";
  return {
    id: Number(analysis.id),
    playerId: Number(analysis.playerId),
    videoId:
      analysis.videoId === null || analysis.videoId === undefined
        ? null
        : Number(analysis.videoId),
    skill: String(analysis.skill),
    createdAt,
    isDemo: false,
    pose: analysis.poseResult as PoseResult,
    context: evaluation.context,
  };
}

function playerEvaluationSummary(
  analysisRows: readonly Record<string, unknown>[]
) {
  return summarizePlayerEvaluation(
    analysisRows.flatMap(analysis => {
      const session = evaluationSessionInput(analysis);
      return session ? [session] : [];
    })
  );
}

function automaticRecordingAction(pose: PoseResult): string {
  if (pose.limitations.length > 0)
    return "راجع وضوح التصوير وثبات الكاميرا ووثّق ظروف الالتقاط قبل مقارنة جلسات الفيديو.";
  return "وثّق زاوية الكاميرا وظروف التسجيل عند تكرار الالتقاط للمقارنة.";
}

function mimeFromRequest(req: Request): "video/mp4" | "video/webm" {
  const type = (req.headers["content-type"] ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (type === "video/mp4" || type === "video/webm") return type;
  throw BadRequestError("نوع الفيديو يجب أن يكون video/mp4 أو video/webm");
}

function hasExpectedMagic(
  buffer: Buffer,
  mime: "video/mp4" | "video/webm"
): boolean {
  if (mime === "video/mp4")
    return (
      buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp"
    );
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  );
}

function parseRange(
  value: string | undefined,
  size: number
): { start: number; end: number } | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) throw new HttpError(416, "نطاق الفيديو غير صالح");
  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) throw new HttpError(416, "نطاق الفيديو غير صالح");
  let start: number;
  let end: number;
  if (!startRaw) {
    const length = Number(endRaw);
    if (!Number.isSafeInteger(length) || length <= 0)
      throw new HttpError(416, "نطاق الفيديو غير صالح");
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    throw new HttpError(416, "نطاق الفيديو خارج الحجم المتاح");
  }
  return { start, end: Math.min(end, size - 1) };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function csvCell(value: unknown): string {
  let text = String(value ?? "").replace(/\r?\n/g, " ");
  if (/^[\t ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function videoSourceFromUpload(input: {
  sourceURL?: string;
  sourceCredit?: string;
  sourceLicense?: string;
  sourceDescription?: string;
}): VideoSource | null {
  if (!input.sourceURL) return null;
  return {
    url: input.sourceURL,
    credit: input.sourceCredit ?? "",
    license: input.sourceLicense ?? "",
    description: input.sourceDescription ?? "",
  };
}

function hasSavedPoseResult(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function savedPoseStates(
  videoRows: readonly (typeof videos.$inferSelect)[],
  analysisRows: readonly (typeof analyses.$inferSelect)[]
): Map<number, VideoAnalysisState> {
  const playerByVideo = new Map(
    videoRows.map(video => [video.id, video.playerId])
  );
  const stateByVideo = new Map<number, VideoAnalysisState>();
  for (const analysis of analysisRows) {
    if (
      analysis.videoId === null ||
      analysis.isDemo ||
      !hasSavedPoseResult(analysis.poseResult) ||
      playerByVideo.get(analysis.videoId) !== analysis.playerId
    ) {
      continue;
    }
    const at = new Date(analysis.createdAt).getTime();
    if (!Number.isFinite(at)) continue;
    const current = stateByVideo.get(analysis.videoId);
    const currentAt = current
      ? new Date(current.analysisAt as Date | string).getTime()
      : Number.NEGATIVE_INFINITY;
    if (
      !current ||
      at > currentAt ||
      (at === currentAt && analysis.id > current.latestAnalysisId)
    ) {
      stateByVideo.set(analysis.videoId, {
        latestAnalysisId: analysis.id,
        latestAnalysisMethod: "pose",
        analysisAt: analysis.createdAt,
      });
    }
  }
  return stateByVideo;
}

function serializeVideosWithSavedPoseState(
  videoRows: readonly (typeof videos.$inferSelect)[],
  analysisRows: readonly (typeof analyses.$inferSelect)[]
) {
  const stateByVideo = savedPoseStates(videoRows, analysisRows);
  return videoRows.map(video =>
    serializeVideo(video, stateByVideo.get(video.id))
  );
}

async function savedAnalysesForVideos(
  db: Database,
  videoRows: readonly (typeof videos.$inferSelect)[]
): Promise<(typeof analyses.$inferSelect)[]> {
  const videoIds = videoRows.map(video => video.id);
  if (!videoIds.length) return [];
  return db
    .select()
    .from(analyses)
    .where(and(inArray(analyses.videoId, videoIds), eq(analyses.isDemo, false)))
    .orderBy(desc(analyses.createdAt));
}

function poseSummary(analysis: Report["analyses"][number]): string {
  if (analysis.isDemo || analysis.method !== "pose" || !analysis.pose)
    return "لا توجد بيانات وضعية فعلية محفوظة";
  const pose = analysis.pose;
  return `وضعية محفوظة: ${pose.detectedFrames}/${pose.totalFrames} عينة مرصودة، مدة ${pose.duration} ثانية`;
}

function videoSourceSummary(video: Report["videos"][number]): string {
  if (!video.source) return "لم يُرفق مصدر مرخّص للفيديو";
  const details = [
    video.source.url,
    video.source.license,
    video.source.credit,
    video.source.description,
  ].filter(Boolean);
  return details.join(" — ");
}

function reportRange(query: { from?: string; to?: string; skill?: string }) {
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date("1970-01-01T00:00:00.000Z");
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : new Date();
  return { from, to, skill: query.skill ?? "" };
}

async function buildReport(
  db: Database,
  context: OrganizationMembership,
  playerId: number,
  query: { from?: string; to?: string; skill?: string }
): Promise<Report> {
  const row = await playerWithAcademy(db, playerId);
  const range = reportRange(query);
  const analysisWhere = [
    eq(analyses.playerId, playerId),
    gte(analyses.createdAt, range.from),
    lte(analyses.createdAt, range.to),
  ];
  const videoWhere = [
    eq(videos.playerId, playerId),
    gte(videos.recordedAt, range.from),
    lte(videos.recordedAt, range.to),
  ];
  if (range.skill) {
    analysisWhere.push(eq(analyses.skill, range.skill));
    videoWhere.push(eq(videos.skill, range.skill));
  }
  const noteWhere = [
    eq(notes.playerId, playerId),
    gte(notes.createdAt, range.from),
    lte(notes.createdAt, range.to),
  ];
  if (isDemoWorkspace(context)) {
    noteWhere.push(
      inArray(notes.organizationId, [
        context.workspaceAcademyId!,
        context.workspaceClubId!,
      ])
    );
  }
  if (isClub(context)) noteWhere.push(eq(notes.visibility, "shared"));
  const [analysisRows, videoRows, noteRows] = await Promise.all([
    db
      .select()
      .from(analyses)
      .where(and(...analysisWhere))
      .orderBy(desc(analyses.createdAt)),
    db
      .select()
      .from(videos)
      .where(and(...videoWhere))
      .orderBy(desc(videos.recordedAt)),
    db
      .select()
      .from(notes)
      .where(and(...noteWhere))
      .orderBy(asc(notes.source), desc(notes.createdAt)),
  ]);
  const visibleNoteRows = isClub(context)
    ? noteRows.filter(note => note.visibility === "shared")
    : noteRows;
  const videoAnalysisRows = await savedAnalysesForVideos(db, videoRows);
  const storedHistory = Array.isArray(row.player.history)
    ? row.player.history
    : [];
  const comparisonStart = new Date(
    range.from.getTime() - (range.to.getTime() - range.from.getTime() + 1)
  );
  const comparisonHistory = storedHistory.filter(point => {
    if (!point || typeof point !== "object") return false;
    const value = point as { date?: unknown; skill?: unknown };
    const at = typeof value.date === "string" ? new Date(value.date) : null;
    return Boolean(
      at &&
        !Number.isNaN(at.getTime()) &&
        at >= comparisonStart &&
        at <= range.to &&
        (!range.skill || value.skill === range.skill)
    );
  });
  const history = comparisonHistory.filter(
    point => new Date((point as { date: string }).date) >= range.from
  );
  const player = serializePlayer(
    { ...row.player, history },
    row.academyName,
    Boolean(context.isDemo)
  );
  return {
    player,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    skill: range.skill,
    analyses: analysisRows.map(analysis => serializeAnalysis(analysis)),
    videos: serializeVideosWithSavedPoseState(videoRows, videoAnalysisRows),
    notes: visibleNoteRows.map(note => serializeNote(note, row.player.name)),
    comparisonHistory: historyPoints(comparisonHistory),
    isDemo: true,
  };
}

function legacyReportHtmlArchive(report: Report): string {
  const analysisRows = report.analyses
    .map(
      analysis =>
        `<tr><td>${escapeHtml(analysis.createdAt.slice(0, 10))}</td><td>${escapeHtml(analysis.skill)}</td><td>${escapeHtml(analysis.score ?? "غير مقاس")}</td><td>${escapeHtml(analysis.isDemo ? DEMO_LABEL : "تقدير رؤية حاسوبية ثنائي الأبعاد")}</td><td>${escapeHtml(poseSummary(analysis))}</td></tr>`
    )
    .join("");
  const videoRows = report.videos
    .map(
      video =>
        `<tr><td>${escapeHtml(video.recordedAt.slice(0, 10))}</td><td>${escapeHtml(video.title)}</td><td>${escapeHtml(video.skill)}</td><td>${escapeHtml(video.size)}</td><td>${escapeHtml(video.analysisStatus === "completed" ? "تحليل وضعية محفوظ" : "غير محلل بوضعية محفوظة")}</td><td>${escapeHtml(videoSourceSummary(video))}</td></tr>`
    )
    .join("");
  const timelineRows = (report.comparisonHistory ?? [])
    .map(
      point =>
        `<tr><td>${escapeHtml(point.date.slice(0, 10))}</td><td>${escapeHtml(point.label)}</td><td>${escapeHtml(point.score)}</td></tr>`
    )
    .join("");
  const notes = report.notes
    .map(
      note =>
        `<li>${escapeHtml(note.createdAt.slice(0, 10))}: ${escapeHtml(note.text)}</li>`
    )
    .join("");
  const demoNotice = report.analyses.some(analysis => analysis.isDemo)
    ? `<p class="demo">يتضمن التقرير أمثلة سابقة افتراضية ليست قياسات فيديو. مصدر كل سجل موضح في الجدول؛ القياسات الحاسوبية تقديرات ثنائية الأبعاد غير معايرة.</p>`
    : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير ${escapeHtml(report.player.name)}</title><style>body{font-family:Tahoma,Arial,sans-serif;margin:2rem;color:#15251d}h1{color:#087443}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #cbd5d1;padding:.55rem;text-align:right}.demo{background:#fef3c7;padding:.8rem;border-radius:.5rem}@media print{body{margin:1cm}.no-print{display:none}}</style></head><body><h1>ATHLETE AI — تقرير أداء</h1>${demoNotice}<h2>${escapeHtml(report.player.name)}</h2><p>الفترة: ${escapeHtml(report.from.slice(0, 10))} إلى ${escapeHtml(report.to.slice(0, 10))}${report.skill ? ` — المهارة: ${escapeHtml(report.skill)}` : ""}</p><h3>التحليلات</h3><table><thead><tr><th>التاريخ</th><th>المهارة</th><th>النتيجة</th><th>المصدر</th><th>ملخص الوضعية</th></tr></thead><tbody>${analysisRows || '<tr><td colspan="5">لا توجد بيانات ضمن الفترة.</td></tr>'}</tbody></table><h3>الفيديوهات الخاصة</h3><table><thead><tr><th>التاريخ</th><th>الاسم</th><th>المهارة</th><th>الحجم (بايت)</th><th>الحالة</th><th>مصدر الفيديو</th></tr></thead><tbody>${videoRows || '<tr><td colspan="6">لا توجد فيديوهات ضمن الفترة.</td></tr>'}</tbody></table><h3>السلسلة الزمنية المحفوظة</h3><p>هذه قيم محفوظة فقط وليست درجة رياضية أو تحليل وضعية جديدًا.</p><table><thead><tr><th>التاريخ</th><th>التسمية</th><th>القيمة المحفوظة</th></tr></thead><tbody>${timelineRows || '<tr><td colspan="3">لا توجد سلسلة زمنية محفوظة ضمن الفترة.</td></tr>'}</tbody></table><h3>الملاحظات</h3><ul>${notes || "<li>لا توجد ملاحظات ضمن الفترة.</li>"}</ul></body></html>`;
}

function legacyReportCsvArchive(report: Report): string {
  const rows: unknown[][] = [
    [
      "ATHLETE AI",
      "مصدر كل سجل موضح أدناه؛ القياسات الحاسوبية تقديرات ثنائية الأبعاد وليست تقييمًا رياضيًا عامًا",
    ],
    ["اللاعب", report.player.name],
    ["من", report.from],
    ["إلى", report.to],
    ["المهارة", report.skill || "الكل"],
    [],
    [
      "نوع السجل",
      "التاريخ",
      "المهارة",
      "العنوان",
      "النتيجة/الحجم",
      "المصدر/رابط المصدر",
      "الترخيص",
      "النسبة",
      "الوصف",
      "ملخص الوضعية/الحالة",
    ],
    ...report.analyses.map(analysis => [
      "تحليل",
      analysis.createdAt,
      analysis.skill,
      "تحليل أداء",
      analysis.score ?? "غير مقاس",
      analysis.isDemo ? DEMO_LABEL : "تقدير رؤية حاسوبية ثنائي الأبعاد",
      "",
      "",
      "",
      poseSummary(analysis),
    ]),
    ...report.videos.map(video => [
      "فيديو",
      video.recordedAt,
      video.skill,
      video.title,
      video.size,
      video.source?.url ?? "فيديو خاص بلا مصدر مرفق",
      video.source?.license ?? "",
      video.source?.credit ?? "",
      video.source?.description ?? "",
      video.analysisStatus === "completed"
        ? "تحليل وضعية محفوظ"
        : "غير محلل بوضعية محفوظة",
    ]),
    ...report.notes.map(note => [
      "ملاحظة",
      note.createdAt,
      "",
      note.text,
      "",
      "",
      "",
      "",
      "",
      "",
    ]),
    ["السلسلة الزمنية المحفوظة", "التاريخ", "التسمية", "القيمة المحفوظة"],
    ...(report.comparisonHistory ?? []).map(point => [
      "سلسلة زمنية",
      point.date,
      point.label,
      point.score,
    ]),
  ];
  return `\ufeff${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const reportHtml = exportVerifiedReportHtml;
const reportCsv = exportVerifiedReportCsv;

async function createOrganizationForUser(
  user: AuthenticatedUser,
  input: { name: string; type: "academy" | "club"; region: string },
  demo: boolean = false
): Promise<Membership> {
  const db = await database();
  const result = await db.transaction(async tx => {
    const orgResult = await tx.insert(organizations).values({
      name: input.name,
      type: input.type,
      region: input.region,
      isDemo: demo,
      demoOwnerUserId: demo ? user.id : null,
    });
    const organizationId = insertId(orgResult);
    await tx
      .insert(memberships)
      .values({ organizationId, userId: user.id, role: "owner" });
    await writeAudit(tx, {
      organizationId,
      actorUserId: user.id,
      entityType: "organization",
      entityId: organizationId,
      action: demo ? "organization.demo_created" : "organization.created",
    });
    return {
      organizationId,
      name: input.name,
      type: input.type,
      role: "owner" as const,
      region: input.region,
      isDemo: demo,
    };
  });
  return asMembership(result);
}

/** Adds only the unmeasured demo record and leaves every existing player intact. */
async function seedTruthfulDemoPlayers(
  tx: any,
  academyId: number,
  now: Date
): Promise<number> {
  let inserted = 0;
  for (const seed of demoPlayersForSeed(now)) {
    const existing = await tx
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.academyId, academyId), eq(players.name, seed.name)))
      .limit(1)
      .for("update");
    if (existing[0]) continue;
    await tx.insert(players).values({
      academyId,
      name: seed.name,
      age: seed.age,
      nationality: seed.nationality,
      position: seed.position,
      foot: seed.foot,
      height: seed.height,
      weight: seed.weight,
      region: seed.region,
      birthDate: seed.birthDate,
      jersey: seed.jersey,
      photoKey: "",
      overall: 0,
      improvement: 0,
      discoverable: false,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
      demoArchived: false,
      lastAnalysisAt: null,
      createdAt: now,
    });
    inserted += 1;
  }
  return inserted;
}

async function ensureDemoSetup(user: AuthenticatedUser): Promise<void> {
  const db = await database();
  await db.transaction(async tx => {
    const ensure = async (
      type: "academy" | "club",
      name: string,
      region: string
    ) => {
      const existing = await tx
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.demoOwnerUserId, user.id),
            eq(organizations.type, type)
          )
        )
        .limit(1)
        .for("update");
      if (existing[0]) return existing[0];
      const created = await tx.insert(organizations).values({
        name,
        type,
        region,
        isDemo: true,
        demoOwnerUserId: user.id,
      });
      const id = insertId(created);
      await tx
        .insert(memberships)
        .values({ organizationId: id, userId: user.id, role: "owner" });
      await writeAudit(tx, {
        organizationId: id,
        actorUserId: user.id,
        entityType: "organization",
        entityId: id,
        action: "organization.demo_created",
      });
      const rows = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, id))
        .limit(1);
      if (!rows[0]) throw new Error("Demo organization was not created");
      return rows[0];
    };

    const academy = await ensure(
      "academy",
      "أكاديمية ATHLETE AI التجريبية",
      "الرياض"
    );
    await ensure("club", "نادي ATHLETE AI التجريبي", "الرياض");
    const now = new Date();
    const playerCount = await seedTruthfulDemoPlayers(tx, academy.id, now);
    await tx
      .update(organizations)
      .set({ demoSeededAt: now })
      .where(eq(organizations.id, academy.id));
    await writeAudit(tx, {
      organizationId: academy.id,
      actorUserId: user.id,
      entityType: "organization",
      entityId: academy.id,
      action: "organization.demo_seeded",
      metadata: { playerCount, source: "unmeasured_messi_only" },
    });
  });
}

function demoSessionResponse(guest: Awaited<ReturnType<typeof getGuestActor>>) {
  if (!guest)
    throw new Error("Demo session capability was not available after creation");
  return {
    user: null,
    mode: "demo" as const,
    demoToken: guest.token,
    memberships: guest.memberships.map(asMembership),
  };
}

function setDemoCookie(res: Response, token: string): void {
  res.cookie(demoCookieName(), token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: DEMO_SESSION_MAX_AGE_MS,
    path: "/api/athlete",
  });
}

/** Creates no User or Membership row: the capability itself is guest authority. */
async function createDemoSession(): Promise<{ token: string }> {
  const db = await database();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEMO_SESSION_MAX_AGE_MS);
  await db.transaction(async tx => {
    const academyResult = await tx.insert(organizations).values({
      name: "أكاديمية ATHLETE AI التجريبية",
      type: "academy",
      region: "الرياض",
      isDemo: true,
      demoOwnerUserId: null,
      demoSeededAt: now,
    });
    const academyId = insertId(academyResult);
    const clubResult = await tx.insert(organizations).values({
      name: "نادي ATHLETE AI التجريبي",
      type: "club",
      region: "الرياض",
      isDemo: true,
      demoOwnerUserId: null,
      demoSeededAt: now,
    });
    const clubId = insertId(clubResult);
    const playerCount = await seedTruthfulDemoPlayers(tx, academyId, now);
    await tx.insert(demoSessions).values({
      tokenHash: demoTokenHash(token),
      academyId,
      clubId,
      expiresAt,
      lastSeenAt: now,
      createdAt: now,
    });
    await writeAudit(tx, {
      organizationId: academyId,
      actorUserId: null,
      entityType: "demo_session",
      entityId: null,
      action: "demo_session.created",
      metadata: {
        academyId,
        clubId,
        playerCount,
        source: "unmeasured_messi_only",
      },
    });
  });
  return { token };
}

/** Registers the private ATHLETE AI REST endpoints. This function is intentionally called before global JSON parsing. */
export function registerAthleteRoutes(app: Express): void {
  // This must precede the global JSON parser: only this route accepts raw video bytes.
  app.post(
    "/api/athlete/videos",
    express.raw({ type: "*/*", limit: maxVideoBytes() }),
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("رفع الفيديو متاح للأكاديمية فقط");
      const input = parse(
        videoQuerySchema,
        queryObject(req, [
          "playerId",
          "skill",
          "name",
          "recordedAt",
          "sourceURL",
          "sourceCredit",
          "sourceLicense",
          "sourceDescription",
        ])
      );
      const mime = mimeFromRequest(req);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0)
        throw BadRequestError("أرسل ملف فيديو صالحًا");
      if (req.body.length > MAX_VIDEO_BYTES)
        throw new HttpError(413, "حجم الفيديو يتجاوز الحد الأقصى 10 ميغابايت");
      if (!hasExpectedMagic(req.body, mime))
        throw BadRequestError("محتوى الفيديو لا يطابق نوع الملف المعلن");
      const db = await database();
      const player = await playerWithAcademy(db, input.playerId);
      if (!canManagePlayer(context, player.player.academyId))
        throw ForbiddenError("لا تملك صلاحية رفع فيديو لهذا اللاعب");
      const now = new Date();
      const recordedAt = input.recordedAt ? new Date(input.recordedAt) : now;
      if (Number.isNaN(recordedAt.getTime()))
        throw BadRequestError("تاريخ تسجيل الفيديو غير صالح");
      if (recordedAt > now)
        throw BadRequestError(
          "تاريخ تسجيل الفيديو لا يمكن أن يكون في المستقبل"
        );
      const chunks = Array.from(
        { length: Math.ceil(req.body.length / ONE_MIB) },
        (_, index) => ({
          chunkIndex: index,
          data: req.body.subarray(
            index * ONE_MIB,
            Math.min((index + 1) * ONE_MIB, req.body.length)
          ),
        })
      );
      const source = videoSourceFromUpload(input);
      const result = await db.transaction(async tx => {
        const created = await tx.insert(videos).values({
          playerId: player.player.id,
          title: input.name ?? `فيديو ${input.skill}`,
          skill: input.skill ?? "التسديد",
          recordedAt,
          size: req.body.length,
          mime,
          source,
          createdAt: now,
        });
        const videoId = insertId(created);
        await tx
          .insert(videoChunks)
          .values(chunks.map(chunk => ({ ...chunk, videoId })));
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "video",
          entityId: videoId,
          action: "video.private_uploaded",
          metadata: {
            playerId: player.player.id,
            size: req.body.length,
            mime,
            hasSource: Boolean(source),
          },
        });
        const rows = await tx
          .select()
          .from(videos)
          .where(eq(videos.id, videoId))
          .limit(1);
        if (!rows[0]) throw new Error("Video metadata missing after insert");
        return rows[0];
      });
      res.status(201).json(serializeVideo(result));
    })
  );

  const router = Router();

  router.get(
    "/session",
    asyncRoute(async (req, res) => {
      if (req.header("X-Demo-Token") !== undefined) {
        const actor = await requireActor(req);
        if (!isGuestActor(actor)) throw ForbiddenError("جلسة العرض غير صالحة");
        setDemoCookie(res, actor.token);
        res.json(demoSessionResponse(actor));
        return;
      }
      const user = await optionalUser(req);
      if (user) {
        const result = await listMemberships(user.id);
        res.json({
          user: { id: user.id, name: user.name, email: user.email },
          mode: "member",
          memberships: result,
        });
        return;
      }
      const guest = await getGuestActor(req);
      if (!guest) return void res.json({ user: null, memberships: [] });
      setDemoCookie(res, guest.token);
      res.json(demoSessionResponse(guest));
    })
  );

  router.post(
    "/demo-session",
    asyncRoute(async (req, res) => {
      const existing = await getGuestActor(req);
      if (existing) {
        setDemoCookie(res, existing.token);
        res.json(demoSessionResponse(existing));
        return;
      }
      const created = await createDemoSession();
      const guest = await getGuestActorForToken(created.token);
      if (!guest)
        throw new Error("Demo session could not be read after creation");
      setDemoCookie(res, created.token);
      res.status(201).json(demoSessionResponse(guest));
    })
  );

  router.post(
    "/setup-demo",
    asyncRoute(async (req, res) => {
      const user = await requireUser(req);
      await ensureDemoSetup(user);
      res.json({
        user: { id: user.id, name: user.name, email: user.email },
        memberships: await listMemberships(user.id),
      });
    })
  );

  router.post(
    "/organizations",
    asyncRoute(async (req, res) => {
      const user = await requireUser(req);
      const input = parse(organizationInputSchema, req.body);
      res.status(201).json(await createOrganizationForUser(user, input));
    })
  );

  router.patch(
    "/organizations/current",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!canManageOrganization(context))
        throw ForbiddenError("تعديل المؤسسة متاح للمالك فقط");
      const input = parse(organizationPatchSchema, req.body);
      if (isGuestActor(actor) && input.region !== undefined)
        throw ForbiddenError("يمكن لجلسة العرض تعديل اسم المؤسسة فقط");
      const patch = isGuestActor(actor) ? { name: input.name } : input;
      const db = await database();
      await db.transaction(async tx => {
        await tx
          .update(organizations)
          .set(patch)
          .where(eq(organizations.id, context.organizationId));
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "organization",
          entityId: context.organizationId,
          action: "organization.updated",
        });
      });
      res.json({
        organizationId: context.organizationId,
        name: patch.name ?? context.name,
        type: context.type,
        role: context.role,
        region: patch.region ?? context.region,
        isDemo: context.isDemo,
      });
    })
  );

  router.get(
    "/players",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const db = await database();
      const query = queryObject(req, ["discovery", "search"]);
      const discovery = query.discovery === "true";
      const conditions = isDemoWorkspace(context)
        ? [
            eq(players.academyId, context.workspaceAcademyId!),
            eq(players.demoArchived, false),
          ]
        : isAcademy(context)
          ? [
              eq(players.academyId, context.organizationId),
              eq(players.demoArchived, false),
            ]
          : [eq(players.discoverable, true), eq(players.demoArchived, false)];
      const rows = await db
        .select({ player: players, academyName: organizations.name })
        .from(players)
        .innerJoin(organizations, eq(players.academyId, organizations.id))
        .where(and(...conditions))
        .orderBy(desc(players.lastAnalysisAt), asc(players.name));
      const sessionRows = rows.length
        ? await db
            .select()
            .from(analyses)
            .where(
              inArray(
                analyses.playerId,
                rows.map(row => row.player.id)
              )
            )
        : [];
      const search = query.search?.trim().toLocaleLowerCase("ar") ?? "";
      const cards = rows
        .map(row => {
          const summary = playerEvaluationSummary(
            sessionRows.filter(a => a.playerId === row.player.id)
          );
          const limitedSummary =
            isClub(context) && !isDemoWorkspace(context)
              ? { ...summary, strengths: [], development: [] }
              : summary;
          return serializePlayerCard(
            row.player,
            row.academyName,
            context.isDemo,
            limitedSummary
          );
        })
        .filter(
          card =>
            !search ||
            `${card.name} ${card.position} ${card.region}`
              .toLocaleLowerCase("ar")
              .includes(search)
        );
      // Clubs always receive cards only; discovery=true is accepted explicitly for discovery views.
      res.json(discovery || isClub(context) || isAcademy(context) ? cards : []);
    })
  );

  router.get(
    "/players/:id",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const db = await database();
      const row = await requireFullPlayerAccess(
        db,
        context,
        parse(positiveId, req.params.id)
      );
      const actualAnalysisRows = await db
        .select()
        .from(analyses)
        .where(eq(analyses.playerId, row.player.id));
      res.json(
        serializePlayer(
          row.player,
          row.academyName,
          context.isDemo,
          playerEvaluationSummary(actualAnalysisRows)
        )
      );
    })
  );

  router.post(
    "/players",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("إضافة اللاعبين متاحة للأكاديمية فقط");
      const input = parse(playerInputSchema, req.body);
      const db = await database();
      const now = new Date();
      const result = await db.transaction(async tx => {
        const created = await tx.insert(players).values({
          academyId: context.organizationId,
          ...input,
          strengths: [],
          weaknesses: [],
          skills: [],
          physicalTests: [],
          overall: 0,
          improvement: 0,
          photoKey: "",
          history: [],
          demoArchived: false,
          lastAnalysisAt: null,
          createdAt: now,
        });
        const playerId = insertId(created);
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "player",
          entityId: playerId,
          action: "player.created",
        });
        const row = await tx
          .select()
          .from(players)
          .where(eq(players.id, playerId))
          .limit(1);
        if (!row[0]) throw new Error("Player missing after insert");
        return row[0];
      });
      res.status(201).json(serializePlayer(result, context.name));
    })
  );

  router.put(
    "/players/:id",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("تعديل اللاعبين متاح للأكاديمية فقط");
      const playerId = parse(positiveId, req.params.id);
      const input = parse(playerInputSchema, req.body);
      const db = await database();
      const existing = await playerWithAcademy(db, playerId);
      if (!canManagePlayer(context, existing.player.academyId))
        throw ForbiddenError("لا تملك صلاحية تعديل هذا اللاعب");
      await db.transaction(async tx => {
        await tx
          .update(players)
          .set({
            ...input,
            strengths: input.strengths ?? existing.player.strengths,
            weaknesses: input.weaknesses ?? existing.player.weaknesses,
            skills: input.skills ?? existing.player.skills,
            physicalTests: input.physicalTests ?? existing.player.physicalTests,
          })
          .where(eq(players.id, playerId));
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "player",
          entityId: playerId,
          action: "player.updated",
        });
      });
      const updated = await playerWithAcademy(db, playerId);
      res.json(
        serializePlayer(updated.player, updated.academyName, context.isDemo)
      );
    })
  );

  router.get(
    "/requests",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const db = await database();
      const requestScope = isAcademy(context)
        ? eq(accessRequests.academyId, context.organizationId)
        : eq(accessRequests.clubId, context.organizationId);
      const workspaceScope = isDemoWorkspace(context)
        ? isAcademy(context)
          ? eq(accessRequests.clubId, context.workspaceClubId!)
          : eq(accessRequests.academyId, context.workspaceAcademyId!)
        : undefined;
      const requestRows = await db
        .select()
        .from(accessRequests)
        .where(
          workspaceScope ? and(requestScope, workspaceScope) : requestScope
        )
        .orderBy(desc(accessRequests.updatedAt));
      if (!requestRows.length) {
        res.json([]);
        return;
      }
      const playerIds = [...new Set(requestRows.map(row => row.playerId))];
      const organizationIds = [
        ...new Set(requestRows.flatMap(row => [row.academyId, row.clubId])),
      ];
      const [playerRows, organizationRows] = await Promise.all([
        db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(inArray(players.id, playerIds)),
        db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(inArray(organizations.id, organizationIds)),
      ]);
      const playerNames = new Map(playerRows.map(row => [row.id, row.name]));
      const organizationNames = new Map(
        organizationRows.map(row => [row.id, row.name])
      );
      res.json(
        requestRows.map(row =>
          serializeAccessRequest(
            row,
            playerNames.get(row.playerId) ?? "لاعب محذوف",
            organizationNames.get(row.academyId) ?? "أكاديمية",
            organizationNames.get(row.clubId) ?? "نادي"
          )
        )
      );
    })
  );

  router.post(
    "/requests",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isClub(context))
        throw ForbiddenError("إرسال طلب الاطلاع متاح للنادي فقط");
      const input = parse(requestInputSchema, req.body);
      const db = await database();
      const result = await db.transaction(async tx => {
        const target = await tx
          .select()
          .from(players)
          .where(eq(players.id, input.playerId))
          .limit(1)
          .for("update");
        const player = target[0];
        if (!player) throw NotFoundError("اللاعب غير موجود");
        if (
          isDemoWorkspace(context) &&
          player.academyId !== context.workspaceAcademyId
        )
          throw ForbiddenError("اللاعب ليس ضمن مساحة العرض الخاصة بك");
        if (!player.discoverable && !isDemoWorkspace(context))
          throw ForbiddenError("هذا اللاعب غير متاح للاكتشاف حاليًا");
        const duplicate = await tx
          .select({ id: accessRequests.id })
          .from(accessRequests)
          .where(
            and(
              eq(accessRequests.playerId, player.id),
              eq(accessRequests.clubId, context.organizationId),
              inArray(accessRequests.status, ["pending", "approved"])
            )
          )
          .limit(1)
          .for("update");
        if (duplicate[0])
          throw new HttpError(409, "يوجد طلب نشط لهذا اللاعب بالفعل");
        const created = await tx.insert(accessRequests).values({
          playerId: player.id,
          academyId: player.academyId,
          clubId: context.organizationId,
          message: input.message,
          status: "pending",
        });
        const requestId = insertId(created);
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "access_request",
          entityId: requestId,
          action: "access_request.created",
          metadata: { playerId: player.id, academyId: player.academyId },
        });
        const request = await tx
          .select()
          .from(accessRequests)
          .where(eq(accessRequests.id, requestId))
          .limit(1);
        if (!request[0]) throw new Error("Request missing after insert");
        return { request: request[0], playerName: player.name };
      });
      const academy = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, result.request.academyId))
        .limit(1);
      res
        .status(201)
        .json(
          serializeAccessRequest(
            result.request,
            result.playerName,
            academy[0]?.name ?? "أكاديمية",
            context.name
          )
        );
    })
  );

  router.patch(
    "/requests/:id",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError(
          "إدارة طلبات الاطلاع متاحة للأكاديمية المالكة فقط"
        );
      if (!canManageOrganization(context))
        throw ForbiddenError(
          "الموافقة والرفض وإلغاء الوصول متاحة لمالك الأكاديمية فقط"
        );
      const requestId = parse(positiveId, req.params.id);
      const input = parse(requestActionSchema, req.body);
      const db = await database();
      const updated = await db.transaction(async tx => {
        const requestRows = await tx
          .select()
          .from(accessRequests)
          .where(eq(accessRequests.id, requestId))
          .limit(1)
          .for("update");
        const request = requestRows[0];
        if (!request) throw NotFoundError("طلب الاطلاع غير موجود");
        if (request.academyId !== context.organizationId)
          throw ForbiddenError("لا تملك صلاحية إدارة هذا الطلب");
        if (
          isDemoWorkspace(context) &&
          request.clubId !== context.workspaceClubId
        )
          throw ForbiddenError("الطلب ليس ضمن مساحة العرض الخاصة بك");
        if (!isValidRequestTransition(request.status, input.action))
          throw new HttpError(
            409,
            "لا يمكن تنفيذ هذا الإجراء على حالة الطلب الحالية"
          );
        const status = nextRequestStatus(input.action);
        const playerRows = await tx
          .select({ academyId: players.academyId })
          .from(players)
          .where(eq(players.id, request.playerId))
          .limit(1)
          .for("update");
        if (
          !playerRows[0] ||
          playerRows[0].academyId !== context.organizationId
        )
          throw new HttpError(409, "بيانات ملكية اللاعب لم تعد متسقة");
        await tx
          .update(accessRequests)
          .set({ status, reason: input.reason ?? null })
          .where(eq(accessRequests.id, request.id));
        if (input.action === "approve") {
          const grant = await tx
            .select()
            .from(accessGrants)
            .where(
              and(
                eq(accessGrants.playerId, request.playerId),
                eq(accessGrants.clubId, request.clubId)
              )
            )
            .limit(1)
            .for("update");
          if (grant[0]) {
            await tx
              .update(accessGrants)
              .set({
                active: true,
                accessRequestId: request.id,
                grantedAt: new Date(),
                revokedAt: null,
              })
              .where(eq(accessGrants.id, grant[0].id));
          } else {
            await tx.insert(accessGrants).values({
              playerId: request.playerId,
              clubId: request.clubId,
              accessRequestId: request.id,
              active: true,
            });
          }
        } else if (input.action === "revoke") {
          await tx
            .update(accessGrants)
            .set({ active: false, revokedAt: new Date() })
            .where(
              and(
                eq(accessGrants.playerId, request.playerId),
                eq(accessGrants.clubId, request.clubId)
              )
            );
        }
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "access_request",
          entityId: request.id,
          action: `access_request.${input.action}`,
          metadata: {
            playerId: request.playerId,
            clubId: request.clubId,
            reason: input.reason ?? null,
          },
        });
        const rows = await tx
          .select()
          .from(accessRequests)
          .where(eq(accessRequests.id, request.id))
          .limit(1);
        if (!rows[0]) throw new Error("Request missing after update");
        return rows[0];
      });
      const [player, club] = await Promise.all([
        db
          .select({ name: players.name })
          .from(players)
          .where(eq(players.id, updated.playerId))
          .limit(1),
        db
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, updated.clubId))
          .limit(1),
      ]);
      res.json(
        serializeAccessRequest(
          updated,
          player[0]?.name ?? "لاعب",
          context.name,
          club[0]?.name ?? "نادي"
        )
      );
    })
  );

  router.get(
    "/favorites",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isClub(context)) throw ForbiddenError("المفضلة متاحة للنادي فقط");
      const db = await database();
      const ownPlayerIds = isDemoWorkspace(context)
        ? (
            await db
              .select({ id: players.id })
              .from(players)
              .where(eq(players.academyId, context.workspaceAcademyId!))
          ).map(player => player.id)
        : null;
      if (ownPlayerIds && ownPlayerIds.length === 0) return void res.json([]);
      const rows = await db
        .select({ playerId: favorites.playerId })
        .from(favorites)
        .where(
          ownPlayerIds
            ? and(
                eq(favorites.clubId, context.organizationId),
                inArray(favorites.playerId, ownPlayerIds)
              )
            : eq(favorites.clubId, context.organizationId)
        );
      res.json(rows.map(row => row.playerId));
    })
  );

  router.post(
    "/favorites/:id",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isClub(context)) throw ForbiddenError("المفضلة متاحة للنادي فقط");
      const playerId = parse(positiveId, req.params.id);
      const db = await database();
      const target = await playerWithAcademy(db, playerId);
      if (
        isDemoWorkspace(context) &&
        target.player.academyId !== context.workspaceAcademyId
      )
        throw ForbiddenError("اللاعب ليس ضمن مساحة العرض الخاصة بك");
      if (!target.player.discoverable && !isDemoWorkspace(context))
        throw ForbiddenError("هذا اللاعب غير متاح للاكتشاف حاليًا");
      const favorite = await db.transaction(async tx => {
        const existing = await tx
          .select()
          .from(favorites)
          .where(
            and(
              eq(favorites.clubId, context.organizationId),
              eq(favorites.playerId, playerId)
            )
          )
          .limit(1)
          .for("update");
        if (existing[0]) {
          await tx.delete(favorites).where(eq(favorites.id, existing[0].id));
          return false;
        }
        await tx
          .insert(favorites)
          .values({ clubId: context.organizationId, playerId });
        return true;
      });
      res.json({ favorite });
    })
  );

  router.get(
    "/videos",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const input = parse(
        z.object({ playerId: positiveId }),
        queryObject(req, ["playerId"])
      );
      const db = await database();
      await requireFullPlayerAccess(db, context, input.playerId);
      const rows = await db
        .select()
        .from(videos)
        .where(eq(videos.playerId, input.playerId))
        .orderBy(desc(videos.recordedAt));
      const analysisRows = await savedAnalysesForVideos(db, rows);
      res.json(serializeVideosWithSavedPoseState(rows, analysisRows));
    })
  );

  router.get(
    "/videos/:id/content",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const videoId = parse(positiveId, req.params.id);
      const db = await database();
      const videoRows = await db
        .select()
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);
      const video = videoRows[0];
      if (!video) throw NotFoundError("الفيديو غير موجود");
      await requireFullPlayerAccess(db, context, video.playerId);
      const chunks = await db
        .select()
        .from(videoChunks)
        .where(eq(videoChunks.videoId, video.id))
        .orderBy(asc(videoChunks.chunkIndex));
      const body = Buffer.concat(chunks.map(chunk => Buffer.from(chunk.data)));
      if (body.length !== video.size)
        throw new Error("Private video chunk size mismatch");
      const range = parseRange(req.headers.range, video.size);
      res.set({
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
        "Content-Type": video.mime,
        "Content-Disposition": `inline; filename="video-${video.id}${video.mime === "video/mp4" ? ".mp4" : ".webm"}"`,
      });
      if (range) {
        const fragment = body.subarray(range.start, range.end + 1);
        res
          .status(206)
          .set({
            "Content-Range": `bytes ${range.start}-${range.end}/${video.size}`,
            "Content-Length": String(fragment.length),
          })
          .send(fragment);
        return;
      }
      res.set("Content-Length", String(body.length)).send(body);
    })
  );

  router.get(
    "/videos/:id",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const videoId = parse(positiveId, req.params.id);
      const db = await database();
      const rows = await db
        .select()
        .from(videos)
        .where(eq(videos.id, videoId))
        .limit(1);
      const video = rows[0];
      if (!video) throw NotFoundError("الفيديو غير موجود");
      await requireFullPlayerAccess(db, context, video.playerId);
      const analysisRows = await savedAnalysesForVideos(db, [video]);
      res.json(serializeVideosWithSavedPoseState([video], analysisRows)[0]);
    })
  );

  router.get(
    "/analyses",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const input = parse(
        z.object({ playerId: positiveId }),
        queryObject(req, ["playerId"])
      );
      const db = await database();
      await requireFullPlayerAccess(db, context, input.playerId);
      const rows = await db
        .select()
        .from(analyses)
        .where(eq(analyses.playerId, input.playerId))
        .orderBy(desc(analyses.createdAt));
      res.json(rows.map(analysis => serializeAnalysis(analysis)));
    })
  );

  router.post(
    "/analyses",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("إنشاء تحليل الوضعية متاح للأكاديمية فقط");
      const input = parse(analysisInputSchema, req.body);
      const db = await database();
      const target = await playerWithAcademy(db, input.playerId);
      if (!canManagePlayer(context, target.player.academyId))
        throw ForbiddenError("لا تملك صلاحية تحليل هذا اللاعب");
      const videoRows = await db
        .select()
        .from(videos)
        .where(eq(videos.id, input.videoId))
        .limit(1);
      const video = videoRows[0];
      if (!video) throw NotFoundError("الفيديو المحدد غير موجود");
      if (video.playerId !== target.player.id)
        throw ForbiddenError("الفيديو المحدد لا يخص هذا اللاعب");
      const now = new Date();
      const pose = normalizePoseResult(input.pose);
      const payload = poseAnalysisPayload(pose);
      const result = await db.transaction(async tx => {
        const created = await tx.insert(analyses).values({
          playerId: target.player.id,
          videoId: input.videoId,
          skill: input.skill,
          isDemo: false,
          poseResult: pose,
          context: input.context,
          evaluationSnapshot: null,
          ...payload,
          createdAt: now,
        });
        const analysisId = insertId(created);
        const evaluationSnapshot = evaluateSession({
          id: analysisId,
          playerId: target.player.id,
          videoId: input.videoId,
          skill: input.skill,
          createdAt: now.toISOString(),
          isDemo: false,
          pose,
          context: input.context,
        });
        await tx
          .update(analyses)
          .set({ evaluationSnapshot })
          .where(eq(analyses.id, analysisId));
        const recordingAction = automaticRecordingAction(pose);
        if (payload.observations.length) {
          await tx.insert(notes).values(
            payload.observations.map(observation => ({
              playerId: target.player.id,
              organizationId: context.organizationId,
              authorUserId: null,
              analysisId,
              source: "automatic" as const,
              authorName: "تحليل آلي — ليس مدربًا",
              text: `${observation.title}: ${observation.detail}`,
              originalText: `${observation.title}: ${observation.detail}`,
              requiredAction: recordingAction,
              visibility: "shared" as const,
              revisions: [],
              createdAt: now,
              updatedAt: now,
            }))
          );
        }
        await tx
          .update(players)
          .set({ lastAnalysisAt: now })
          .where(eq(players.id, target.player.id));
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "analysis",
          entityId: analysisId,
          action: "analysis.pose_created",
          metadata: {
            playerId: target.player.id,
            videoId: input.videoId,
            skill: input.skill,
            detectedFrames: input.pose.detectedFrames,
            totalFrames: input.pose.totalFrames,
            context: input.context,
            automaticObservationCount: payload.observations.length,
          },
        });
        const rows = await tx
          .select()
          .from(analyses)
          .where(eq(analyses.id, analysisId))
          .limit(1);
        if (!rows[0]) throw new Error("Analysis missing after insert");
        return rows[0];
      });
      res.status(201).json(serializeAnalysis(result));
    })
  );

  router.get(
    "/exercise-plans",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const input = parse(
        z.object({ playerId: positiveId }),
        queryObject(req, ["playerId"])
      );
      const db = await database();
      await requireFullPlayerAccess(db, context, input.playerId);
      const rows = await db
        .select()
        .from(exercisePlans)
        .where(eq(exercisePlans.playerId, input.playerId))
        .orderBy(desc(exercisePlans.updatedAt));
      res.json(rows.map(plan => serializeExercisePlan(plan)));
    })
  );

  router.post(
    "/exercise-plans",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("إنشاء خطط التطوير متاح للأكاديمية فقط");
      const input = parse(exercisePlanInputSchema, req.body);
      const db = await database();
      const player = await playerWithAcademy(db, input.playerId);
      if (!canManagePlayer(context, player.player.academyId))
        throw ForbiddenError("لا تملك صلاحية إنشاء خطة لهذا اللاعب");
      const now = new Date();
      const result = await db.transaction(async tx => {
        const analysisRows = await tx
          .select()
          .from(analyses)
          .where(eq(analyses.id, input.analysisId))
          .limit(1)
          .for("update");
        const analysis = analysisRows[0];
        if (!analysis || analysis.playerId !== player.player.id)
          throw BadRequestError("التحليل المحدد لا يخص اللاعب نفسه");
        const evaluation = evaluationForActualAnalysis(
          analysis as Record<string, unknown>
        );
        if (
          !evaluation?.development.some(item => item.id === input.developmentId)
        )
          throw BadRequestError(
            "لا يوجد جانب تطوير موثق بهذا المعرّف في تقييم التحليل المحدد"
          );
        const created = await tx.insert(exercisePlans).values({
          ...input,
          authorName: actorDisplayName(actor),
          createdAt: now,
          updatedAt: now,
        });
        const planId = insertId(created);
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "exercise_plan",
          entityId: planId,
          action: "exercise_plan.created",
          metadata: {
            playerId: input.playerId,
            analysisId: input.analysisId,
            developmentId: input.developmentId,
          },
        });
        const rows = await tx
          .select()
          .from(exercisePlans)
          .where(eq(exercisePlans.id, planId))
          .limit(1);
        if (!rows[0]) throw new Error("Exercise plan missing after insert");
        return rows[0];
      });
      res.status(201).json(serializeExercisePlan(result));
    })
  );

  router.patch(
    "/exercise-plans/:id",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("تعديل خطط التطوير متاح للأكاديمية فقط");
      const planId = parse(positiveId, req.params.id);
      const input = parse(exercisePlanPatchSchema, req.body);
      const db = await database();
      const result = await db.transaction(async tx => {
        const planRows = await tx
          .select()
          .from(exercisePlans)
          .where(eq(exercisePlans.id, planId))
          .limit(1)
          .for("update");
        const existing = planRows[0];
        if (!existing) throw NotFoundError("خطة التطوير غير موجودة");
        const playerRows = await tx
          .select()
          .from(players)
          .where(eq(players.id, existing.playerId))
          .limit(1)
          .for("update");
        const player = playerRows[0];
        if (!player || !canManagePlayer(context, player.academyId))
          throw ForbiddenError("لا تملك صلاحية تعديل هذه الخطة");
        const analysisId = input.analysisId ?? existing.analysisId;
        const developmentId = input.developmentId ?? existing.developmentId;
        const analysisRows = await tx
          .select()
          .from(analyses)
          .where(eq(analyses.id, analysisId))
          .limit(1);
        const analysis = analysisRows[0];
        if (!analysis || analysis.playerId !== existing.playerId)
          throw BadRequestError("التحليل المحدد لا يخص اللاعب نفسه");
        const evaluation = evaluationForActualAnalysis(
          analysis as Record<string, unknown>
        );
        if (!evaluation?.development.some(item => item.id === developmentId))
          throw BadRequestError(
            "لا يوجد جانب تطوير موثق بهذا المعرّف في تقييم التحليل المحدد"
          );
        const now = new Date();
        await tx
          .update(exercisePlans)
          .set({ ...input, updatedAt: now })
          .where(eq(exercisePlans.id, existing.id));
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "exercise_plan",
          entityId: existing.id,
          action: "exercise_plan.updated",
          metadata: { playerId: existing.playerId, analysisId, developmentId },
        });
        const rows = await tx
          .select()
          .from(exercisePlans)
          .where(eq(exercisePlans.id, existing.id))
          .limit(1);
        if (!rows[0]) throw new Error("Exercise plan missing after update");
        return rows[0];
      });
      res.json(serializeExercisePlan(result));
    })
  );

  router.get(
    "/reports/:playerId",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const playerId = parse(positiveId, req.params.playerId);
      const query = parse(
        reportQuerySchema,
        queryObject(req, ["from", "to", "skill"])
      );
      const db = await database();
      await requireFullPlayerAccess(db, context, playerId);
      res.json(await buildReport(db, context, playerId, query));
    })
  );

  router.get(
    "/reports/:playerId/export",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!canManageOrganization(context) || !isAcademy(context))
        throw ForbiddenError(
          "تصدير التقرير متاح لمالك الأكاديمية؛ إذن النادي للمشاهدة لا يمنحه التنزيل"
        );
      const playerId = parse(positiveId, req.params.playerId);
      const query = parse(
        exportQuerySchema,
        queryObject(req, ["format", "from", "to", "skill"])
      );
      const db = await database();
      await requireFullPlayerAccess(db, context, playerId);
      const report = await buildReport(db, context, playerId, query);
      res.set({
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="athlete-report-${playerId}.${query.format}"`,
      });
      if (query.format === "html") {
        res.type("text/html; charset=utf-8").send(reportHtml(report));
        return;
      }
      res.type("text/csv; charset=utf-8").send(reportCsv(report));
    })
  );

  router.get(
    "/notes",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      const playerIdRaw = queryObject(req, ["playerId"]).playerId;
      const playerId =
        playerIdRaw === undefined ? undefined : parse(positiveId, playerIdRaw);
      const db = await database();
      const workspaceNoteScope = isDemoWorkspace(context)
        ? inArray(notes.organizationId, [
            context.workspaceAcademyId!,
            context.workspaceClubId!,
          ])
        : undefined;
      const clubVisibilityScope = isClub(context)
        ? eq(notes.visibility, "shared")
        : undefined;
      if (playerId !== undefined) {
        const access = await requireFullPlayerAccess(db, context, playerId);
        const scope = [eq(notes.playerId, playerId)];
        if (workspaceNoteScope) scope.push(workspaceNoteScope);
        if (clubVisibilityScope) scope.push(clubVisibilityScope);
        const rows = await db
          .select()
          .from(notes)
          .where(and(...scope))
          .orderBy(asc(notes.source), desc(notes.createdAt));
        const visibleRows = isClub(context)
          ? rows.filter(note => note.visibility === "shared")
          : rows;
        res.json(
          visibleRows.map(note => serializeNote(note, access.player.name))
        );
        return;
      }
      if (isAcademy(context) || isDemoWorkspace(context)) {
        const own = await db
          .select({ id: players.id, name: players.name })
          .from(players)
          .where(
            eq(
              players.academyId,
              isDemoWorkspace(context)
                ? context.workspaceAcademyId!
                : context.organizationId
            )
          );
        if (!own.length) {
          res.json([]);
          return;
        }
        const names = new Map(own.map(player => [player.id, player.name]));
        const scope = [
          inArray(
            notes.playerId,
            own.map(player => player.id)
          ),
        ];
        if (workspaceNoteScope) scope.push(workspaceNoteScope);
        if (clubVisibilityScope) scope.push(clubVisibilityScope);
        const rows = await db
          .select()
          .from(notes)
          .where(and(...scope))
          .orderBy(asc(notes.source), desc(notes.createdAt));
        const visibleRows = isClub(context)
          ? rows.filter(note => note.visibility === "shared")
          : rows;
        res.json(
          visibleRows.map(note =>
            serializeNote(note, names.get(note.playerId) ?? "لاعب")
          )
        );
        return;
      }
      const grants = await db
        .select({ playerId: accessGrants.playerId })
        .from(accessGrants)
        .where(
          and(
            eq(accessGrants.clubId, context.organizationId),
            eq(accessGrants.active, true)
          )
        );
      if (!grants.length) {
        res.json([]);
        return;
      }
      const ids = grants.map(grant => grant.playerId);
      const playerRows = await db
        .select({ id: players.id, name: players.name })
        .from(players)
        .where(inArray(players.id, ids));
      const names = new Map(playerRows.map(player => [player.id, player.name]));
      const rows = await db
        .select()
        .from(notes)
        .where(
          and(inArray(notes.playerId, ids), eq(notes.visibility, "shared"))
        )
        .orderBy(asc(notes.source), desc(notes.createdAt));
      const visibleRows = rows.filter(note => note.visibility === "shared");
      res.json(
        visibleRows.map(note =>
          serializeNote(note, names.get(note.playerId) ?? "لاعب")
        )
      );
    })
  );

  router.post(
    "/notes",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("إضافة الملاحظات متاحة للأكاديمية فقط");
      const input = parse(noteInputSchema, req.body);
      const db = await database();
      const target = await playerWithAcademy(db, input.playerId);
      if (!canManagePlayer(context, target.player.academyId))
        throw ForbiddenError("لا تملك صلاحية إضافة ملاحظة لهذا اللاعب");
      if (input.analysisId) {
        const analysisRows = await db
          .select()
          .from(analyses)
          .where(eq(analyses.id, input.analysisId))
          .limit(1);
        const linkedAnalysis = analysisRows[0];
        if (!linkedAnalysis || linkedAnalysis.playerId !== target.player.id)
          throw BadRequestError("التحليل المحدد لا يخص اللاعب نفسه");
      }
      const now = new Date();
      const authorName = actorDisplayName(actor);
      const result = await db.transaction(async tx => {
        const created = await tx.insert(notes).values({
          playerId: target.player.id,
          organizationId: context.organizationId,
          authorUserId: actorUserId(actor),
          analysisId: input.analysisId ?? null,
          source: "coach",
          authorName,
          text: input.text,
          originalText: input.text,
          requiredAction: input.requiredAction ?? "",
          visibility: input.visibility ?? "academy_internal",
          revisions: [],
          createdAt: now,
          updatedAt: now,
        });
        const noteId = insertId(created);
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "note",
          entityId: noteId,
          action: "note.created",
          metadata: {
            playerId: target.player.id,
            analysisId: input.analysisId ?? null,
            visibility: input.visibility ?? "academy_internal",
          },
        });
        const rows = await tx
          .select()
          .from(notes)
          .where(eq(notes.id, noteId))
          .limit(1);
        if (!rows[0]) throw new Error("Note missing after insert");
        return rows[0];
      });
      res.status(201).json(serializeNote(result, target.player.name));
    })
  );

  router.patch(
    "/notes/:id",
    asyncRoute(async (req, res) => {
      const actor = await requireActor(req);
      const context = await requireOrganization(req, actor);
      if (!isAcademy(context))
        throw ForbiddenError("تعديل الملاحظات متاح للأكاديمية فقط");
      const noteId = parse(positiveId, req.params.id);
      const input = parse(notePatchSchema, req.body);
      const db = await database();
      const result = await db.transaction(async tx => {
        const noteRows = await tx
          .select()
          .from(notes)
          .where(eq(notes.id, noteId))
          .limit(1)
          .for("update");
        const note = noteRows[0];
        if (!note) throw NotFoundError("الملاحظة غير موجودة");
        const playerRows = await tx
          .select()
          .from(players)
          .where(eq(players.id, note.playerId))
          .limit(1)
          .for("update");
        const player = playerRows[0];
        if (!player || !canManagePlayer(context, player.academyId))
          throw ForbiddenError("لا تملك صلاحية تعديل هذه الملاحظة");
        if (note.source === "automatic" && note.visibility === "shared") {
          throw ForbiddenError(
            "لا يمكن تعديل ملاحظة الرصد الآلي المشتركة؛ أضف ملاحظة مدرب داخلية مستقلة"
          );
        }
        const now = new Date();
        const authorName = actorDisplayName(actor);
        const text = input.text ?? note.text;
        const requiredAction =
          input.requiredAction ?? note.requiredAction ?? "";
        const revisions = Array.isArray(note.revisions) ? note.revisions : [];
        const revision = {
          text,
          requiredAction,
          authorName,
          editedAt: now.toISOString(),
        };
        await tx
          .update(notes)
          .set({
            text,
            requiredAction,
            revisions: [...revisions, revision],
            updatedAt: now,
          })
          .where(eq(notes.id, note.id));
        await writeAudit(tx, {
          organizationId: context.organizationId,
          actorUserId: actorUserId(actor),
          entityType: "note",
          entityId: note.id,
          action: "note.updated",
          metadata: { playerId: note.playerId, source: note.source ?? "coach" },
        });
        const rows = await tx
          .select()
          .from(notes)
          .where(eq(notes.id, note.id))
          .limit(1);
        if (!rows[0]) throw new Error("Note missing after update");
        return { note: rows[0], playerName: player.name };
      });
      res.json(serializeNote(result.note, result.playerName));
    })
  );

  app.use("/api/athlete", express.json({ limit: "1mb" }), router);
  app.use("/api/athlete", athleteError);
}
